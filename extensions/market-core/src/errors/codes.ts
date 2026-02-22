/**
 * Standard error codes for Market Core.
 * These codes match web3-core error codes for consistency across the extension.
 *
 * @see ../web3-core/src/errors/codes.ts
 */

/**
 * Stable error codes enum.
 * These codes are part of the public API contract and should never change.
 */
export enum ErrorCode {
  E_INVALID_ARGUMENT = "E_INVALID_ARGUMENT",
  E_AUTH_REQUIRED = "E_AUTH_REQUIRED",
  E_FORBIDDEN = "E_FORBIDDEN",
  E_NOT_FOUND = "E_NOT_FOUND",
  E_CONFLICT = "E_CONFLICT",
  E_QUOTA_EXCEEDED = "E_QUOTA_EXCEEDED",
  E_EXPIRED = "E_EXPIRED",
  E_REVOKED = "E_REVOKED",
  E_INTERNAL = "E_INTERNAL",
  E_UNAVAILABLE = "E_UNAVAILABLE",
  E_TIMEOUT = "E_TIMEOUT",
}

/**
 * Standard error response structure.
 */
export interface ErrorResponse {
  error: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export const ERROR_CODE_DESCRIPTIONS: Record<ErrorCode, string> = {
  [ErrorCode.E_INVALID_ARGUMENT]:
    "The request contains invalid or missing parameters. Please check your input and try again.",
  [ErrorCode.E_AUTH_REQUIRED]:
    "Authentication is required. Please bind a wallet or start a session first.",
  [ErrorCode.E_FORBIDDEN]:
    "You don't have permission to perform this action. The resource may be disabled or you're not the owner.",
  [ErrorCode.E_NOT_FOUND]:
    "The requested resource could not be found. It may have been deleted or doesn't exist.",
  [ErrorCode.E_CONFLICT]:
    "The operation conflicts with the current state. The resource may already exist or be in use.",
  [ErrorCode.E_QUOTA_EXCEEDED]:
    "You have exceeded your quota or rate limit. Please try again later or upgrade your plan.",
  [ErrorCode.E_EXPIRED]: "The resource has expired and is no longer available.",
  [ErrorCode.E_REVOKED]: "The resource has been revoked or cancelled and is no longer available.",
  [ErrorCode.E_INTERNAL]:
    "An internal error occurred. Please try again later. If the problem persists, contact support.",
  [ErrorCode.E_UNAVAILABLE]: "The service is temporarily unavailable. Please try again later.",
  [ErrorCode.E_TIMEOUT]:
    "The operation timed out. Please try again or check your network connection.",
};
