import { ErrorCode, ERROR_CODE_DESCRIPTIONS, type ErrorResponse } from "./errors/codes.js";

const VALID_ERROR_CODES: ReadonlySet<string> = new Set(Object.values(ErrorCode));

/**
 * Redact sensitive information from error messages to prevent information leakage.
 * Removes: file paths, URLs with tokens/endpoints, environment variables
 */
function redactSensitiveInfo(message: string): string {
  let redacted = message;

  // Redact absolute file paths with at least two segments (Unix and Windows)
  redacted = redacted.replace(/\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.\-/]+/g, "[PATH]");
  redacted = redacted.replace(/[A-Z]:\\[a-zA-Z0-9_\-.\\]+/g, "[PATH]");

  // Redact URLs with potential sensitive data
  redacted = redacted.replace(/https?:\/\/[^\s]+/g, "[URL]");

  // Redact environment variable patterns
  redacted = redacted.replace(/[A-Z_]+=[^\s]+/g, "[ENV]");

  // Redact hex addresses that might be endpoints
  redacted = redacted.replace(/0x[a-fA-F0-9]{40,}/g, "[ADDRESS]");

  // Redact JWT-like tokens
  redacted = redacted.replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[TOKEN]");

  // Redact bearer tokens and access tokens (requires tok_ prefix with underscore)
  redacted = redacted.replace(/\bBearer\s+[^\s]+/gi, "Bearer [REDACTED]");
  redacted = redacted.replace(/\btok_[\w-]+\b/gi, "tok_***");

  return redacted;
}

export function formatWeb3GatewayError(err: unknown, fallback = ErrorCode.E_INTERNAL): ErrorCode {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const safeMessage = message.length > 0 ? message : "unknown error";

  // Redact sensitive information from the message
  const redactedMessage = redactSensitiveInfo(safeMessage);

  if (redactedMessage.startsWith("E_")) {
    // Extract the error code token and validate against known ErrorCode values
    const match = redactedMessage.match(/^(E_[A-Z_]+)/);
    if (match && VALID_ERROR_CODES.has(match[1])) {
      return match[1] as ErrorCode;
    }
  }

  const normalized = redactedMessage.toLowerCase();

  if (normalized.includes("actorid is required")) {
    return ErrorCode.E_AUTH_REQUIRED;
  }
  if (normalized.includes("disabled")) {
    return ErrorCode.E_FORBIDDEN;
  }
  if (
    normalized.includes("access denied") ||
    normalized.includes("forbidden") ||
    normalized.includes("not allowed") ||
    normalized.includes("does not match") ||
    normalized.includes("mismatch")
  ) {
    return ErrorCode.E_FORBIDDEN;
  }
  if (normalized.includes("not found")) {
    return ErrorCode.E_NOT_FOUND;
  }
  if (normalized.includes("expired")) {
    return ErrorCode.E_EXPIRED;
  }
  if (normalized.includes("revoked")) {
    return ErrorCode.E_REVOKED;
  }
  if (
    normalized.includes("conflict") ||
    normalized.includes("already") ||
    normalized.includes("not published") ||
    normalized.includes("transition")
  ) {
    return ErrorCode.E_CONFLICT;
  }
  if (
    normalized.includes("invalid") ||
    normalized.includes("must") ||
    normalized.includes("required") ||
    normalized.includes("missing") ||
    normalized.includes("exceeds")
  ) {
    return ErrorCode.E_INVALID_ARGUMENT;
  }
  if (normalized.includes("quota") || normalized.includes("limit")) {
    return ErrorCode.E_QUOTA_EXCEEDED;
  }
  if (normalized.includes("timeout")) {
    return ErrorCode.E_TIMEOUT;
  }
  if (normalized.includes("unavailable") || normalized.includes("unreachable")) {
    return ErrorCode.E_UNAVAILABLE;
  }
  return fallback;
}

export function formatWeb3GatewayErrorResponse(
  err: unknown,
  fallback = ErrorCode.E_INTERNAL,
  details?: Record<string, unknown>,
): ErrorResponse {
  const code = formatWeb3GatewayError(err, fallback);
  const message = ERROR_CODE_DESCRIPTIONS[code] ?? "An internal error occurred.";
  if (details && Object.keys(details).length > 0) {
    return { error: code, message, details };
  }
  return { error: code, message };
}
