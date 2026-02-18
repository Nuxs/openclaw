/**
 * Audit event types — canonical representations of LLM/tool/session events
 * that get hashed, optionally archived, and anchored on-chain.
 */

export type AuditEventKind =
  | "llm_input"
  | "llm_output"
  | "tool_call"
  | "tool_result"
  | "session_end"
  | "dapp_request";

export type AuditEvent = {
  /** Unique event id */
  id: string;
  kind: AuditEventKind;
  /** ISO timestamp */
  timestamp: string;
  /** Hashed session identifier (never raw) */
  sessionIdHash: string;
  /** Sequence number within session (for ordering & idempotency) */
  seq: number;
  /** Anchor idempotency key */
  anchorId?: string;
  /** Canonical payload hash (SHA-256 of redacted + sorted JSON) */
  payloadHash: string;
  /** Optional: redacted payload for local storage/archive */
  payload?: unknown;
  /** Optional: pointer to archived content */
  archivePointer?: { cid?: string; uri?: string };
  /** Optional: on-chain anchor reference */
  chainRef?: { network: string; tx: string; block?: number };
};

export type AuditAnchor = {
  anchorId: string;
  payloadHash: string;
  pointer?: { cid?: string; uri?: string };
  chainRef?: { network: string; tx: string; block?: number };
  createdAt: string;
};
