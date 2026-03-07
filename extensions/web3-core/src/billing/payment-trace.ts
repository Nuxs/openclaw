import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/compat";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import type { Web3StateStore } from "../state/store.js";

type PaymentTraceQueryInput = {
  requestId?: unknown;
  idempotencyKey?: unknown;
  limit?: unknown;
};

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 20;
  }
  return Math.min(100, Math.max(1, Math.floor(value)));
}

export function createBillingPaymentTraceQueryHandler(
  store: Web3StateStore,
): GatewayRequestHandler {
  return ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      const input = (params ?? {}) as PaymentTraceQueryInput;
      const requestId = normalizeOptionalString(input.requestId);
      const idempotencyKey = normalizeOptionalString(input.idempotencyKey);
      const limit = normalizeLimit(input.limit);

      if (!requestId && !idempotencyKey) {
        throw new Error("E_INVALID_ARGUMENT: requestId or idempotencyKey is required");
      }

      const records = store
        .listPaymentTraceRefs(limit)
        .filter((record) => {
          if (idempotencyKey && record.idempotencyKey !== idempotencyKey) {
            return false;
          }
          if (requestId && record.requestId !== requestId) {
            return false;
          }
          return true;
        })
        .slice(0, limit);

      respond(true, {
        count: records.length,
        records,
      });
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}
