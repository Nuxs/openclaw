export type AgentWalletErrorCode =
  | "E_INTERNAL"
  | "E_FORBIDDEN"
  | "E_INVALID_ARGUMENT"
  | "E_NOT_FOUND"
  | "E_NOT_CONFIGURED"
  | "E_UNAVAILABLE";

export type AgentWalletErrorResponse = {
  error: AgentWalletErrorCode;
  message: string;
};

const ERROR_CODE_DESCRIPTIONS: Record<AgentWalletErrorCode, string> = {
  E_INTERNAL: "An internal error occurred.",
  E_FORBIDDEN: "Access denied.",
  E_INVALID_ARGUMENT: "Invalid request parameters.",
  E_NOT_FOUND: "Not found.",
  E_NOT_CONFIGURED: "Agent wallet is not configured.",
  E_UNAVAILABLE: "Service unavailable.",
};

const VALID_ERROR_CODES: ReadonlySet<AgentWalletErrorCode> = new Set([
  "E_INTERNAL",
  "E_FORBIDDEN",
  "E_INVALID_ARGUMENT",
  "E_NOT_FOUND",
  "E_NOT_CONFIGURED",
  "E_UNAVAILABLE",
]);

/**
 * Redact sensitive information from error messages to prevent information leakage.
 * This is intentionally conservative: it favors operator safety over debuggability.
 */
export function redactAgentWalletSensitiveInfo(message: string): string {
  let redacted = message;

  // Absolute file paths with at least two segments (Unix and Windows)
  redacted = redacted.replace(/\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.\-/]+/g, "[PATH]");
  redacted = redacted.replace(/[A-Z]:\\[a-zA-Z0-9_\-.\\]+/g, "[PATH]");

  // URLs (endpoints, query strings, embedded credentials)
  redacted = redacted.replace(/https?:\/\/[^\s]+/g, "[URL]");

  // Environment variable patterns
  redacted = redacted.replace(/[A-Z_]+=[^\s]+/g, "[ENV]");

  // EVM-like hex strings (addresses, tx hashes) — treat as potentially sensitive context
  redacted = redacted.replace(/0x[a-fA-F0-9]{40,}/g, "[HEX]");

  // JWT-like tokens
  redacted = redacted.replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[TOKEN]");

  // Bearer tokens and access tokens
  redacted = redacted.replace(/\bBearer\s+[^\s]+/gi, "Bearer [REDACTED]");
  redacted = redacted.replace(/\btok_[\w-]+\b/gi, "tok_***");

  return redacted;
}

export function formatAgentWalletErrorCode(
  err: unknown,
  fallback: AgentWalletErrorCode = "E_INTERNAL",
): AgentWalletErrorCode {
  const rawMessage = err instanceof Error ? err.message : String(err ?? "");
  const safeMessage = rawMessage.length > 0 ? rawMessage : "unknown error";
  const redactedMessage = redactAgentWalletSensitiveInfo(safeMessage);

  if (redactedMessage.startsWith("E_")) {
    const match = redactedMessage.match(/^(E_[A-Z_]+)/);
    if (match && VALID_ERROR_CODES.has(match[1] as AgentWalletErrorCode)) {
      return match[1] as AgentWalletErrorCode;
    }
  }

  const normalized = redactedMessage.toLowerCase();

  if (normalized.includes("disabled")) {
    return "E_FORBIDDEN";
  }

  if (normalized.includes("encryptionkey") || normalized.includes("encryption key")) {
    return "E_NOT_CONFIGURED";
  }

  if (normalized.includes("not found")) {
    return "E_NOT_FOUND";
  }

  if (
    normalized.includes("invalid") ||
    normalized.includes("must") ||
    normalized.includes("required") ||
    normalized.includes("missing")
  ) {
    return "E_INVALID_ARGUMENT";
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("unavailable") ||
    normalized.includes("unreachable")
  ) {
    return "E_UNAVAILABLE";
  }

  return fallback;
}

export function formatAgentWalletGatewayErrorResponse(
  err: unknown,
  fallback: AgentWalletErrorCode = "E_INTERNAL",
): AgentWalletErrorResponse {
  const code = formatAgentWalletErrorCode(err, fallback);
  return {
    error: code,
    message: ERROR_CODE_DESCRIPTIONS[code] ?? ERROR_CODE_DESCRIPTIONS.E_INTERNAL,
  };
}
