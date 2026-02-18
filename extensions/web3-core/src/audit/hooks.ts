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
import type { Web3StateStore } from "../state/store.js";
import { archiveContent } from "../storage/archive.js";
import { IpfsStorageAdapter } from "../storage/ipfs-adapter.js";
import { hashPayload, hashString, redactPayload } from "./canonicalize.js";
import type { AuditEvent, AuditEventKind } from "./types.js";

// Per-session sequence counter (in-memory; resets on process restart)
const seqCounters = new Map<string, number>();

function nextSeq(sessionHash: string): number {
  const cur = seqCounters.get(sessionHash) ?? 0;
  seqCounters.set(sessionHash, cur + 1);
  return cur + 1;
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

async function maybeArchiveEvent(
  auditEvent: AuditEvent,
  store: Web3StateStore,
  config: Web3PluginConfig,
): Promise<void> {
  if (config.storage.provider !== "ipfs") return;
  if (!config.storage.pinataJwt) return;

  const adapter = new IpfsStorageAdapter({
    pinataJwt: config.storage.pinataJwt,
    gateway: config.storage.gateway,
  });

  const bytes = new TextEncoder().encode(JSON.stringify(auditEvent));
  const encryptionKey = config.privacy.archiveEncryption ? store.getArchiveKey() : undefined;

  const result = await archiveContent(bytes, "application/json", adapter, {
    encrypt: config.privacy.archiveEncryption,
    encryptionKey,
    name: `audit-${auditEvent.kind}-${auditEvent.seq}.json`,
  });

  auditEvent.archivePointer = { cid: result.cid, uri: result.uri };
}

async function maybeAnchorEvent(
  auditEvent: AuditEvent,
  store: Web3StateStore,
  config: Web3PluginConfig,
): Promise<void> {
  const anchorId = hashString(`${auditEvent.sessionIdHash}:${auditEvent.kind}:${auditEvent.seq}`);

  if (!config.chain.privateKey) {
    const pending = store.getPendingTxs();
    pending.push({
      anchorId,
      payloadHash: auditEvent.payloadHash,
      createdAt: auditEvent.timestamp,
    });
    store.savePendingTxs(pending);
    return;
  }

  const chain = new EvmChainAdapter(config.chain);
  const result = await chain.anchorHash({ anchorId, payloadHash: auditEvent.payloadHash });
  auditEvent.chainRef = { network: result.network, tx: result.tx, block: result.block };
}

async function handleAuditEvent(
  kind: AuditEventKind,
  sessionId: string | undefined,
  payload: unknown,
  store: Web3StateStore,
  config: Web3PluginConfig,
): Promise<void> {
  const auditEvent = buildEvent(kind, sessionId, payload, config.privacy.redactFields);

  try {
    await maybeArchiveEvent(auditEvent, store, config);
  } catch {
    // Archive failures should not block the main flow; event is still logged locally.
  }

  try {
    await maybeAnchorEvent(auditEvent, store, config);
  } catch {
    const pending = store.getPendingTxs();
    pending.push({
      anchorId: hashString(`${auditEvent.sessionIdHash}:${auditEvent.kind}:${auditEvent.seq}`),
      payloadHash: auditEvent.payloadHash,
      createdAt: auditEvent.timestamp,
    });
    store.savePendingTxs(pending);
  }

  store.appendAuditEvent(auditEvent);
}

export function createAuditHooks(store: Web3StateStore, config: Web3PluginConfig) {
  const onLlmInput = async (event: PluginHookLlmInputEvent, ctx: PluginHookAgentContext) => {
    await handleAuditEvent(
      "llm_input",
      ctx.sessionId,
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
      ctx.sessionId,
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
      ctx.sessionKey,
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
    await handleAuditEvent(
      "session_end",
      ctx.sessionId,
      {
        messageCount: event.messageCount,
        durationMs: event.durationMs,
      },
      store,
      config,
    );
  };

  return { onLlmInput, onLlmOutput, onAfterToolCall, onSessionEnd };
}
