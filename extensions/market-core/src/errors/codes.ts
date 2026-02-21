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
