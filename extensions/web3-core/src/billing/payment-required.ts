import { randomUUID } from "node:crypto";
import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import { hashPayload } from "../audit/canonicalize.js";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import { ErrorCode } from "../errors/codes.js";
import { loadCallGateway, normalizeGatewayResult } from "../market/proxy-utils.js";
import type { Web3StateStore } from "../state/store.js";
import type {
  BillingPaymentReceipt,
  PaymentRequiredInvoice,
  PaymentResumeToken,
  PaymentTraceRef,
} from "./types.js";

export class PaymentRequiredError extends Error {
  readonly status = 402;
  readonly invoice?: string;
  readonly wwwAuthenticate?: string;

  constructor(message: string, params?: { invoice?: string; wwwAuthenticate?: string }) {
    super(message);
    this.name = "PaymentRequiredError";
    this.invoice = params?.invoice;
    this.wwwAuthenticate = params?.wwwAuthenticate;
  }
}

type PaymentRequiredInput = {
  invoice?: unknown;
  idempotencyKey?: unknown;
  requestId?: unknown;
  tool?: unknown;
};

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`E_INVALID_ARGUMENT: ${field} is required`);
  }
  return value.trim();
}

function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new Error(`E_INVALID_ARGUMENT: ${field} is invalid`);
}

function requireNumericString(value: unknown, field: string): string {
  const raw = requireString(value, field);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`E_INVALID_ARGUMENT: ${field} must be integer string`);
  }
  return raw;
}

function requireIsoDate(value: unknown, field: string): string {
  const raw = requireString(value, field);
  if (Number.isNaN(Date.parse(raw))) {
    throw new Error(`E_INVALID_ARGUMENT: ${field} must be ISO timestamp`);
  }
  return raw;
}

function parseInvoice(encoded: string): PaymentRequiredInvoice {
  let payload: unknown;
  try {
    const raw = Buffer.from(encoded, "base64").toString("utf8");
    payload = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("E_INVALID_ARGUMENT: invoice must be base64 JSON");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("E_INVALID_ARGUMENT: invoice payload must be object");
  }
  const record = payload as Record<string, unknown>;
  return {
    invoiceId: requireString(record.invoiceId, "invoice.invoiceId"),
    provider: requireString(record.provider, "invoice.provider"),
    chain: requireEnum(record.chain, "invoice.chain", ["evm", "ton"]),
    asset: requireString(record.asset, "invoice.asset"),
    amount: requireNumericString(record.amount, "invoice.amount"),
    payTo: requireString(record.payTo, "invoice.payTo"),
    nonce: requireString(record.nonce, "invoice.nonce"),
    expiresAt: requireIsoDate(record.expiresAt, "invoice.expiresAt"),
    idempotencyKey:
      typeof record.idempotencyKey === "string" ? record.idempotencyKey.trim() : undefined,
  };
}

function buildPaymentAuthorization(resumeToken: PaymentResumeToken): string {
  const encoded = Buffer.from(JSON.stringify(resumeToken)).toString("base64");
  return `OpenClaw-PayFi ${encoded}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeRetryBudget(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.floor(value));
}

function buildPaymentTraceRef(params: {
  requestId?: string;
  idempotencyKey: string;
  resumeToken: PaymentResumeToken;
  toolName?: string;
  createdAt: string;
}): PaymentTraceRef {
  return {
    requestId: params.requestId,
    idempotencyKey: params.idempotencyKey,
    invoiceId: params.resumeToken.invoiceId,
    paymentReceiptId: params.resumeToken.paymentReceiptId,
    txHash: params.resumeToken.txHash,
    toolName: params.toolName,
    createdAt: params.createdAt,
  };
}

function resolveInvoiceChain(value: unknown, fallback: "evm" | "ton"): "evm" | "ton" {
  if (value === "evm" || value === "ton") {
    return value;
  }
  return fallback;
}

function buildBillingPaymentReceipt(params: {
  resumeToken: PaymentResumeToken;
  amount: string;
  confirmedAt: string;
  network?: string;
}): BillingPaymentReceipt {
  return {
    receiptId: params.resumeToken.paymentReceiptId,
    chain: params.resumeToken.chain,
    network: params.network,
    txHash: params.resumeToken.txHash,
    amount: params.amount,
    confirmedAt: params.confirmedAt,
    mode: "live",
  };
}

export function createBillingHandlePaymentRequiredHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      const input = (params ?? {}) as PaymentRequiredInput;
      const invoiceRaw = requireString(input.invoice, "invoice");
      const invoice = parseInvoice(invoiceRaw);
      const requestId = optionalString(input.requestId);
      const toolName = optionalString(input.tool);
      const idempotencyKey =
        typeof input.idempotencyKey === "string" && input.idempotencyKey.trim().length > 0
          ? input.idempotencyKey.trim()
          : invoice.idempotencyKey;

      if (!idempotencyKey) {
        respond(
          false,
          formatWeb3GatewayErrorResponse("E_INVALID_ARGUMENT: idempotencyKey is required"),
        );
        return;
      }

      if (config.x402?.autopay?.enabled === false) {
        respond(
          false,
          formatWeb3GatewayErrorResponse(
            "E_FORBIDDEN: x402 autopay disabled",
            ErrorCode.E_FORBIDDEN,
          ),
        );
        return;
      }

      if (Date.parse(invoice.expiresAt) <= Date.now()) {
        store.removePaymentRequired(idempotencyKey);
        respond(
          false,
          formatWeb3GatewayErrorResponse("E_EXPIRED: invoice expired", ErrorCode.E_EXPIRED),
        );
        return;
      }

      const invoiceHash = hashPayload(invoice);
      const existing = store.getPaymentRequired(idempotencyKey);
      if (existing) {
        if (existing.invoiceHash !== invoiceHash) {
          respond(
            false,
            formatWeb3GatewayErrorResponse(
              "E_CONFLICT: idempotency key reused",
              ErrorCode.E_CONFLICT,
            ),
          );
          return;
        }

        if (Date.parse(existing.resumeToken.expiresAt) <= Date.now()) {
          store.removePaymentRequired(idempotencyKey);
          respond(
            false,
            formatWeb3GatewayErrorResponse("E_EXPIRED: invoice expired", ErrorCode.E_EXPIRED),
          );
          return;
        }

        respond(true, {
          idempotencyKey,
          invoiceId: invoice.invoiceId,
          resumeToken: existing.resumeToken,
          authorization: buildPaymentAuthorization(existing.resumeToken),
          paymentReceipt: buildBillingPaymentReceipt({
            resumeToken: existing.resumeToken,
            amount: invoice.amount,
            confirmedAt: existing.createdAt,
            network: existing.network,
          }),
          maxRetries: normalizeRetryBudget(existing.maxRetries),
          trace: buildPaymentTraceRef({
            requestId: existing.requestId ?? requestId,
            idempotencyKey,
            resumeToken: existing.resumeToken,
            toolName: existing.toolName,
            createdAt: existing.createdAt,
          }),
          reused: true,
        });
        return;
      }

      const callGateway = await loadCallGateway();
      const paymentResponse = await callGateway({
        method: "agent-wallet.autopay",
        params: {
          chain: invoice.chain,
          to: invoice.payTo,
          // Compat layer: send both `value` (EVM convention) and `amount` (TON
          // convention) so either handler resolves via `input.value ?? input.amount`.
          // Target: unify to `amount` once all handlers are migrated.
          value: invoice.amount,
          amount: invoice.amount,
          tool: toolName,
        },
        timeoutMs: config.brain.timeoutMs,
      });
      const normalized = normalizeGatewayResult(paymentResponse);
      if (!normalized.ok) {
        throw new Error(normalized.error ?? "autopay failed");
      }

      const payload = (normalized.result ?? {}) as Record<string, unknown>;
      const txHash = typeof payload.txHash === "string" ? payload.txHash : undefined;
      const network = typeof payload.network === "string" ? payload.network : undefined;
      const resolvedChain = resolveInvoiceChain(payload.chain, invoice.chain);
      const maxRetries = normalizeRetryBudget(payload.policyAutoPayMaxRetries);
      const issuedAt = nowIso();
      const resumeToken: PaymentResumeToken = {
        invoiceId: invoice.invoiceId,
        paymentReceiptId: randomUUID(),
        txHash,
        chain: resolvedChain,
        issuedAt,
        expiresAt: invoice.expiresAt,
      };

      store.savePaymentRequired({
        idempotencyKey,
        requestId,
        toolName,
        invoiceHash,
        resumeToken,
        createdAt: issuedAt,
        maxRetries,
        network,
      });

      respond(true, {
        idempotencyKey,
        invoiceId: invoice.invoiceId,
        resumeToken,
        authorization: buildPaymentAuthorization(resumeToken),
        paymentReceipt: buildBillingPaymentReceipt({
          resumeToken,
          amount: invoice.amount,
          confirmedAt: issuedAt,
          network,
        }),
        maxRetries,
        trace: buildPaymentTraceRef({
          requestId,
          idempotencyKey,
          resumeToken,
          toolName,
          createdAt: issuedAt,
        }),
        reused: false,
      });
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}
