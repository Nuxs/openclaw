/**
 * Dispute types and data structures.
 * Dispute resolution mechanism for resource marketplace.
 */

/**
 * Dispute status lifecycle
 */
export type DisputeStatus = "open" | "evidence_submitted" | "resolved" | "rejected" | "expired";

/**
 * Dispute ruling outcomes
 */
export type DisputeRuling = "provider_wins" | "consumer_wins" | "split" | "timeout";

/**
 * Evidence submitted by parties
 */
export type DisputeEvidence = {
  /** Unique evidence ID */
  evidenceId: string;
  /** Submitter (provider or consumer actorId) */
  submittedBy: string;
  /** Evidence type */
  type: "usage_log" | "screenshot" | "api_response" | "other";
  /** Evidence content hash (SHA256) */
  contentHash: string;
  /** Human-readable description */
  description: string;
  /** Submission timestamp */
  submittedAt: string;
  /** Optional evidence data (limited size) */
  data?: Record<string, unknown>;
};

/**
 * Dispute resolution decision
 */
export type DisputeResolution = {
  /** Ruling outcome */
  ruling: DisputeRuling;
  /** Reason for the ruling */
  reason: string;
  /** Refund amount if applicable (decimal string) */
  refundAmount?: string;
  /** Resolved timestamp */
  resolvedAt: string;
  /** Resolver (system or admin actorId) */
  resolvedBy: string;
};

/**
 * Complete dispute record
 */
export type DisputeRecord = {
  /** Unique dispute ID */
  disputeId: string;
  /** Associated order/lease ID */
  orderId: string;
  /** Resource ID involved */
  resourceId: string;
  /** Provider actor ID */
  providerId: string;
  /** Consumer actor ID */
  consumerId: string;
  /** Dispute reason (from consumer) */
  reason: string;
  /** Current status */
  status: DisputeStatus;
  /** Evidence submitted by both parties */
  evidences: DisputeEvidence[];
  /** Resolution (if resolved) */
  resolution?: DisputeResolution;
  /** Dispute opened timestamp */
  openedAt: string;
  /** Dispute expiry timestamp (auto-resolve if not handled) */
  expiresAt: string;
  /** Last updated timestamp */
  updatedAt: string;
};

/**
 * Dispute configuration
 */
export type DisputeConfig = {
  /** Dispute timeout in milliseconds (default: 7 days) */
  timeoutMs: number;
  /** Max evidence per party (default: 5) */
  maxEvidencePerParty: number;
  /** Max evidence data size in bytes (default: 10KB) */
  maxEvidenceDataSize: number;
};

/**
 * Default dispute configuration
 */
export const DEFAULT_DISPUTE_CONFIG: DisputeConfig = {
  timeoutMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxEvidencePerParty: 5,
  maxEvidenceDataSize: 10 * 1024, // 10KB
};
