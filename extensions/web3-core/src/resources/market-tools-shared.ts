/**
 * Shared utilities for market tool implementations.
 *
 * This module extracts common patterns from market-provider-tools and market-execution-tools
 * to avoid code duplication and ensure consistent behavior across all market tools.
 *
 * Key responsibilities:
 * - Gateway call abstraction with timing and trace ID support
 * - Result formatting with redaction
 * - Input validation helpers
 */

import type { Web3PluginConfig } from "../config.js";
import { loadCallGateway, normalizeGatewayResult } from "../core-imports.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import { ErrorCode } from "../errors/codes.js";
import { redactUnknown } from "../utils/redact.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AgentToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
};

export type GatewayCallSuccess = {
  ok: true;
  result?: unknown;
  error?: string;
};

export type GatewayCallFailure = {
  ok: false;
  error: unknown;
};

export type GatewayCallResult = GatewayCallSuccess | GatewayCallFailure;

// ─────────────────────────────────────────────────────────────────────────────
// Result formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

export function jsonResult(payload: unknown): AgentToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

export function safeResult(payload: unknown): AgentToolResult {
  return jsonResult(redactUnknown(payload));
}

export function errorResult(err: unknown, details?: Record<string, unknown>): AgentToolResult {
  return safeResult(formatWeb3GatewayErrorResponse(err, ErrorCode.E_INTERNAL, details));
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway call abstraction
// ─────────────────────────────────────────────────────────────────────────────

export interface GatewayCallOptions {
  /** Method name for observability and logging */
  method: string;
  /** Optional trace ID for distributed tracing (if not provided, will be auto-generated) */
  traceId?: string;
  /** Whether to log timing information (default: false in production) */
  logTiming?: boolean;
}

/**
 * Calls a gateway method with consistent error handling and optional observability.
 *
 * Future extension points:
 * - OpenTelemetry span creation/propagation
 * - Performance metrics emission
 * - Request/response logging with redaction
 */
export async function callGatewayMethod(
  config: Web3PluginConfig,
  method: string,
  params?: unknown,
  options?: GatewayCallOptions,
): Promise<GatewayCallResult> {
  const startTime = options?.logTiming ? performance.now() : undefined;
  const traceId = options?.traceId ?? generateTraceId();

  try {
    const callGateway = await loadCallGateway();

    // TODO: Future observability hook point
    // - Inject traceId into gateway call context
    // - Create OpenTelemetry span if available
    // - Emit custom metrics for APM integration

    const response = await callGateway({
      method,
      params,
      timeoutMs: config.brain.timeoutMs,
    });

    const normalized = normalizeGatewayResult(response);

    if (!normalized.ok) {
      return {
        ok: false,
        error: formatWeb3GatewayErrorResponse(normalized.error),
      };
    }

    // TODO: Future observability hook point
    // - Record success metric
    // - Close span with success status

    return {
      ok: true,
      result: normalized.result,
      error: normalized.error,
    };
  } finally {
    // Log timing if requested
    if (startTime !== undefined) {
      const duration = performance.now() - startTime;
      // TODO: Future observability hook point
      // - Emit timing metric to APM
      // - Log slow calls (> threshold)
      if (options?.logTiming) {
        console.debug(
          `[market-tools] ${method} completed in ${duration.toFixed(2)}ms (traceId: ${traceId})`,
        );
      }
    }
  }
}

/**
 * Generates a simple trace ID for observability.
 *
 * Format: <timestamp>-<random>
 * This is intentionally simple; in production, this would be replaced with
 * a proper distributed tracing context (e.g., W3C traceparent).
 */
function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input validation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that a string is non-empty after trimming.
 * Returns the trimmed value if valid, throws otherwise.
 */
export function requireTrimmedString(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  return trimmed;
}

/**
 * Validates that at least one of the provided values is a non-empty string.
 */
export function requireOneOf(values: Array<string | undefined>, fields: string[]): void {
  if (values.some((value) => typeof value === "string" && value.trim().length > 0)) {
    return;
  }
  throw new Error(`one of ${fields.join(", ")} is required`);
}

/**
 * Trims actorId if present in params.
 * Useful for buyer-side tools where actorId is optional but should be trimmed when provided.
 */
export function withTrimmedActor<T extends { actorId?: string }>(params: T): T {
  return typeof params.actorId === "string" && params.actorId.trim().length > 0
    ? { ...params, actorId: params.actorId.trim() }
    : params;
}
