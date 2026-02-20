export function formatWeb3GatewayError(err: unknown, fallback = "E_INTERNAL"): string {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const safeMessage = message.length > 0 ? message : "unknown error";

  if (safeMessage.startsWith("E_")) {
    return safeMessage;
  }

  const normalized = safeMessage.toLowerCase();

  if (normalized.includes("actorid is required")) {
    return `E_AUTH_REQUIRED: ${safeMessage}`;
  }
  if (normalized.includes("disabled")) {
    return `E_FORBIDDEN: ${safeMessage}`;
  }
  if (
    normalized.includes("access denied") ||
    normalized.includes("forbidden") ||
    normalized.includes("not allowed") ||
    normalized.includes("does not match") ||
    normalized.includes("mismatch")
  ) {
    return `E_FORBIDDEN: ${safeMessage}`;
  }
  if (normalized.includes("not found")) {
    return `E_NOT_FOUND: ${safeMessage}`;
  }
  if (normalized.includes("expired")) {
    return `E_EXPIRED: ${safeMessage}`;
  }
  if (normalized.includes("revoked")) {
    return `E_REVOKED: ${safeMessage}`;
  }
  if (
    normalized.includes("conflict") ||
    normalized.includes("already") ||
    normalized.includes("not published") ||
    normalized.includes("transition")
  ) {
    return `E_CONFLICT: ${safeMessage}`;
  }
  if (
    normalized.includes("invalid") ||
    normalized.includes("must") ||
    normalized.includes("required") ||
    normalized.includes("missing") ||
    normalized.includes("exceeds")
  ) {
    return `E_INVALID_ARGUMENT: ${safeMessage}`;
  }
  return `${fallback}: ${safeMessage}`;
}
