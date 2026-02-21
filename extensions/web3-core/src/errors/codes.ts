/**
 * Standard error codes for Web3 Market extension.
 * All Gateway methods must return these stable error codes.
 *
 * @see docs/plugins/web3-core-dev.md#error-handling
 */

/**
 * Stable error codes enum.
 * These codes are part of the public API contract and should never change.
 */
export enum ErrorCode {
  /**
   * Invalid input parameters (400 Bad Request equivalent)
   * Examples:
   * - Missing required field
   * - Invalid format (e.g., malformed address)
   * - Value out of range
   * - Type mismatch
   */
  E_INVALID_ARGUMENT = "E_INVALID_ARGUMENT",

  /**
   * Authentication required but not provided (401 Unauthorized equivalent)
   * Examples:
   * - actorId missing
   * - No wallet bound
   * - Session expired
   */
  E_AUTH_REQUIRED = "E_AUTH_REQUIRED",

  /**
   * Permission denied (403 Forbidden equivalent)
   * Examples:
   * - User doesn't own the resource
   * - Resource is disabled
   * - Operation not allowed in current state
   */
  E_FORBIDDEN = "E_FORBIDDEN",

  /**
   * Resource not found (404 Not Found equivalent)
   * Examples:
   * - Resource ID doesn't exist
   * - Lease not found
   * - Settlement not found
   */
  E_NOT_FOUND = "E_NOT_FOUND",

  /**
   * State conflict (409 Conflict equivalent)
   * Examples:
   * - Resource already published
   * - Lease already finalized
   * - Invalid state transition
   * - Concurrent modification
   */
  E_CONFLICT = "E_CONFLICT",

  /**
   * Quota or limit exceeded (429 Too Many Requests equivalent)
   * Examples:
   * - Session credits exhausted
   * - Rate limit exceeded
   * - Storage quota exceeded
   */
  E_QUOTA_EXCEEDED = "E_QUOTA_EXCEEDED",

  /**
   * Resource expired (410 Gone equivalent)
   * Examples:
   * - Lease expired
   * - Offer expired
   * - Signature expired
   */
  E_EXPIRED = "E_EXPIRED",

  /**
   * Resource revoked (410 Gone equivalent)
   * Examples:
   * - Resource unpublished
   * - Lease cancelled
   * - Permission revoked
   */
  E_REVOKED = "E_REVOKED",

  /**
   * Internal server error (500 Internal Server Error equivalent)
   * Examples:
   * - Unexpected exception
   * - Storage failure
   * - Chain interaction failed
   */
  E_INTERNAL = "E_INTERNAL",

  /**
   * Service unavailable (503 Service Unavailable equivalent)
   * Examples:
   * - Anchor service down
   * - IPFS node unreachable
   * - Database locked
   */
  E_UNAVAILABLE = "E_UNAVAILABLE",

  /**
   * Operation timeout (504 Gateway Timeout equivalent)
   * Examples:
   * - Chain transaction timeout
   * - IPFS upload timeout
   * - Lock acquisition timeout
   */
  E_TIMEOUT = "E_TIMEOUT",
}

/**
 * Standard error response structure.
 * All Gateway methods should return errors in this format.
 */
export interface ErrorResponse {
  /** Stable error code from ErrorCode enum */
  error: ErrorCode;

  /** Human-readable error message (should not contain sensitive info) */
  message: string;

  /** Optional additional context (e.g., field name, constraint values) */
  details?: Record<string, unknown>;
}

/**
 * Map of ErrorCode to HTTP status code equivalents.
 * Useful for documentation and integration with web services.
 */
export const ERROR_CODE_HTTP_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.E_INVALID_ARGUMENT]: 400,
  [ErrorCode.E_AUTH_REQUIRED]: 401,
  [ErrorCode.E_FORBIDDEN]: 403,
  [ErrorCode.E_NOT_FOUND]: 404,
  [ErrorCode.E_CONFLICT]: 409,
  [ErrorCode.E_QUOTA_EXCEEDED]: 429,
  [ErrorCode.E_EXPIRED]: 410,
  [ErrorCode.E_REVOKED]: 410,
  [ErrorCode.E_INTERNAL]: 500,
  [ErrorCode.E_UNAVAILABLE]: 503,
  [ErrorCode.E_TIMEOUT]: 504,
};

/**
 * User-friendly error messages for each error code.
 * Can be used in UI to provide better error explanations.
 */
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
