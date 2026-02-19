/**
 * Hook handlers for audit trail generation.
 * Listens to llm_input, llm_output, after_tool_call, session_end
 * and produces AuditEvent records → local log + optional archive + optional anchor.
 */

import { randomUUID } from "node:crypto";
import type {
  PluginHookLlmInputEvent,
  PluginHookLlmOutputEvent,
  PluginHookAfterToolCallEvent,
  PluginHookSessionEndEvent,
  PluginHookAgentContext,
  PluginHookToolContext,
  PluginHookSessionContext,
} from "openclaw/plugin-sdk";
import { EvmChainAdapter } from "../chain/evm/adapter.js";
import type { Web3PluginConfig } from "../config.js";
import type { PendingArchive, PendingAnchor, Web3StateStore } from "../state/store.js";
import { createStorageAdapter } from "../storage/adapter.js";
import { archiveContent } from "../storage/archive.js";
import { hashPayload, hashString, redactPayload } from "./canonicalize.js";
import type { AuditEvent, AuditEventKind } from "./types.js";

// Per-session sequence counter (in-memory; resets on process restart)
const seqCounters = new Map<string, number>();

function nextSeq(sessionHash: string): number {
  const cur = seqCounters.get(sessionHash) ?? 0;
  seqCounters.set(sessionHash, cur + 1);
  return cur + 1;
}

function resolveSessionIdentity(input: { sessionKey?: string; sessionId?: string }) {
  return input.sessionKey ?? input.sessionId;
}

function queuePendingSettlement(
  store: Web3StateStore,
  config: Web3PluginConfig,
  sessionId: string | undefined,
  settlementContext?: {
    orderId?: string;
    payer?: string;
    amount?: string;
    actorId?: string;
  },
) {
  if (!config.billing.enabled) {
    return;
  }
  const sessionIdHash = hashString(sessionId ?? "unknown");

  // Resolve settlement fields from explicit context or usage records
  const usage = store.getUsage(sessionIdHash);
  const orderId = settlementContext?.orderId;
  const payer = settlementContext?.payer ?? settlementContext?.actorId;

  if (!orderId || !payer) {
    return;
  }

  const amount = settlementContext?.amount ?? (usage ? String(usage.creditsUsed) : "0");
  const actorId = settlementContext?.actorId ?? payer;

  const existing = store
    .getPendingSettlements()
    .find((entry) => entry.sessionIdHash === sessionIdHash);
  store.upsertPendingSettlement({
    sessionIdHash,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    orderId: orderId ?? existing?.orderId,
    payer: payer ?? existing?.payer,
    amount: amount ?? existing?.amount,
    actorId: actorId ?? existing?.actorId,
    attempts: existing?.attempts,
    lastError: existing?.lastError,
  });
}

function buildEvent(
  kind: AuditEventKind,
  sessionId: string | undefined,
  payload: unknown,
  redactFields: string[],
): AuditEvent {
  const sessionIdHash = hashString(sessionId ?? "unknown");
  const redactedPayload = redactPayload(payload, redactFields);
  return {
    id: randomUUID(),
    kind,
    timestamp: new Date().toISOString(),
    sessionIdHash,
    seq: nextSeq(sessionIdHash),
    payloadHash: hashPayload(payload, redactFields),
    payload: redactedPayload,
  };
}

function resolveAnchorId(auditEvent: AuditEvent): string {
  return (
    auditEvent.anchorId ??
    hashString(`${auditEvent.sessionIdHash}:${auditEvent.kind}:${auditEvent.seq}`)
  );
}

function queuePendingArchive(store: Web3StateStore, auditEvent: AuditEvent, error?: unknown) {
  const existing = store.getPendingArchives().find((entry) => entry.event.id === auditEvent.id);
  const attempts = (existing?.attempts ?? 0) + (error ? 1 : 0);
  const entry: PendingArchive = {
    event: auditEvent,
    createdAt: existing?.createdAt ?? auditEvent.timestamp,
    attempts,
    lastError: error ? String(error) : existing?.lastError,
  };
  store.upsertPendingArchive(entry);
}

function queuePendingAnchor(store: Web3StateStore, auditEvent: AuditEvent, error?: unknown) {
  const anchorId = resolveAnchorId(auditEvent);
  auditEvent.anchorId = anchorId;
  const existing = store.getPendingTxs().find((entry) => entry.anchorId === anchorId);
  const attempts = (existing?.attempts ?? 0) + (error ? 1 : 0);
  const entry: PendingAnchor = {
    anchorId,
    payloadHash: auditEvent.payloadHash,
    createdAt: existing?.createdAt ?? auditEvent.timestamp,
    attempts,
    lastError: error ? String(error) : existing?.lastError,
  };
  store.upsertPendingTx(entry);
}

async function maybeArchiveEvent(
  auditEvent: AuditEvent,
  store: Web3StateStore,
  config: Web3PluginConfig,
): Promise<void> {
  const adapter = createStorageAdapter(config);
  if (!adapter) return;

  const bytes = new TextEncoder().encode(JSON.stringify(auditEvent));
  const encryptionKey = config.privacy.archiveEncryption ? store.getArchiveKey() : undefined;

  const result = await archiveContent(bytes, "application/json", adapter, {
    encrypt: config.privacy.archiveEncryption,
    encryptionKey,
    name: `audit-${auditEvent.kind}-${auditEvent.seq}.json`,
  });

  auditEvent.archivePointer = { cid: result.cid, uri: result.uri };
  store.saveArchiveReceipt({ cid: result.cid, uri: result.uri, updatedAt: auditEvent.timestamp });
  store.removePendingArchive(auditEvent.id);
}

async function maybeAnchorEvent(
  auditEvent: AuditEvent,
  store: Web3StateStore,
  config: Web3PluginConfig,
): Promise<void> {
  const anchorId = resolveAnchorId(auditEvent);
  auditEvent.anchorId = anchorId;

  if (!config.chain.privateKey) {
    queuePendingAnchor(store, auditEvent);
    return;
  }

  const chain = new EvmChainAdapter(config.chain);
  const result = await chain.anchorHash({ anchorId, payloadHash: auditEvent.payloadHash });
  auditEvent.chainRef = { network: result.network, tx: result.tx, block: result.block };
  store.saveAnchorReceipt({
    anchorId,
    tx: result.tx,
    block: result.block,
    network: result.network,
    updatedAt: new Date().toISOString(),
  });
  store.removePendingTx(anchorId);
}

async function handleAuditEvent(
  kind: AuditEventKind,
  sessionId: string | undefined,
  payload: unknown,
  store: Web3StateStore,
  config: Web3PluginConfig,
): Promise<void> {
  const auditEvent = buildEvent(kind, sessionId, payload, config.privacy.redactFields);
  auditEvent.anchorId = resolveAnchorId(auditEvent);

  try {
    await maybeArchiveEvent(auditEvent, store, config);
  } catch (err) {
    queuePendingArchive(store, auditEvent, err);
  }

  try {
    await maybeAnchorEvent(auditEvent, store, config);
  } catch (err) {
    queuePendingAnchor(store, auditEvent, err);
  }

  store.appendAuditEvent(auditEvent);
}

export async function flushPendingArchives(store: Web3StateStore, config: Web3PluginConfig) {
  const adapter = createStorageAdapter(config);
  if (!adapter) return;

  const pending = store.getPendingArchives();
  if (pending.length === 0) return;

  const remaining: PendingArchive[] = [];

  for (const entry of pending) {
    const auditEvent = entry.event;
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(auditEvent));
      const encryptionKey = config.privacy.archiveEncryption ? store.getArchiveKey() : undefined;
      const result = await archiveContent(bytes, "application/json", adapter, {
        encrypt: config.privacy.archiveEncryption,
        encryptionKey,
        name: `audit-${auditEvent.kind}-${auditEvent.seq}.json`,
      });
      auditEvent.archivePointer = { cid: result.cid, uri: result.uri };
      store.saveArchiveReceipt({
        cid: result.cid,
        uri: result.uri,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      remaining.push({
        ...entry,
        attempts: (entry.attempts ?? 0) + 1,
        lastError: String(err),
      });
    }
  }

  store.savePendingArchives(remaining);
}

export async function flushPendingAnchors(store: Web3StateStore, config: Web3PluginConfig) {
  if (!config.chain.privateKey) return;

  const pending = store.getPendingTxs();
  if (pending.length === 0) return;

  const chain = new EvmChainAdapter(config.chain);
  const remaining: PendingAnchor[] = [];

  for (const entry of pending) {
    if (store.getAnchorReceipt(entry.anchorId)) {
      continue;
    }
    try {
      const result = await chain.anchorHash({
        anchorId: entry.anchorId,
        payloadHash: entry.payloadHash,
      });
      store.saveAnchorReceipt({
        anchorId: entry.anchorId,
        tx: result.tx,
        block: result.block,
        network: result.network,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      remaining.push({
        ...entry,
        attempts: (entry.attempts ?? 0) + 1,
        lastError: String(err),
      });
    }
  }

  store.savePendingTxs(remaining);
}

export function createAuditHooks(store: Web3StateStore, config: Web3PluginConfig) {
  const onLlmInput = async (event: PluginHookLlmInputEvent, ctx: PluginHookAgentContext) => {
    await handleAuditEvent(
      "llm_input",
      resolveSessionIdentity(ctx),
      {
        provider: event.provider,
        model: event.model,
        promptLength: event.prompt.length,
        imagesCount: event.imagesCount,
      },
      store,
      config,
    );
  };

  const onLlmOutput = async (event: PluginHookLlmOutputEvent, ctx: PluginHookAgentContext) => {
    await handleAuditEvent(
      "llm_output",
      resolveSessionIdentity(ctx),
      {
        provider: event.provider,
        model: event.model,
        usage: event.usage,
        responseFragments: event.assistantTexts.length,
      },
      store,
      config,
    );
  };

  const onAfterToolCall = async (
    event: PluginHookAfterToolCallEvent,
    ctx: PluginHookToolContext,
  ) => {
    await handleAuditEvent(
      "tool_call",
      resolveSessionIdentity(ctx),
      {
        toolName: event.toolName,
        durationMs: event.durationMs,
        hasError: !!event.error,
      },
      store,
      config,
    );
  };

  const onSessionEnd = async (event: PluginHookSessionEndEvent, ctx: PluginHookSessionContext) => {
    const sessionIdentity = resolveSessionIdentity(ctx);
    await handleAuditEvent(
      "session_end",
      sessionIdentity,
      {
        messageCount: event.messageCount,
        durationMs: event.durationMs,
      },
      store,
      config,
    );
    // Pass settlement context from event metadata (orderId/payer/amount
    // are populated by billing guard or resource lease during the session)
    const settlementCtx = (event as Record<string, unknown>).settlement as
      | { orderId?: string; payer?: string; amount?: string; actorId?: string }
      | undefined;
    queuePendingSettlement(store, config, sessionIdentity, settlementCtx);
  };

  return { onLlmInput, onLlmOutput, onAfterToolCall, onSessionEnd };
}

export async function recordExternalAuditEvent(params: {
  kind: AuditEventKind;
  sessionId?: string;
  payload: unknown;
  store: Web3StateStore;
  config: Web3PluginConfig;
}): Promise<void> {
  await handleAuditEvent(
    params.kind,
    params.sessionId,
    params.payload,
    params.store,
    params.config,
  );
}
