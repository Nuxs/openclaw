/**
 * Dispute resolution handlers.
 * Core logic for opening, submitting evidence, and resolving disputes.
 */

import { createHash, randomBytes } from "node:crypto";
import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayError, formatWeb3GatewayErrorResponse } from "../errors.js";
import { ErrorCode } from "../errors/codes.js";
import type { Web3StateStore } from "../state/store.js";
import {
  DEFAULT_DISPUTE_CONFIG,
  type DisputeEvidence,
  type DisputeRecord,
  type DisputeResolution,
  type DisputeRuling,
  type DisputeStatus,
} from "./types.js";

/**
 * Generate unique dispute ID
 */
function generateDisputeId(): string {
  return `dispute_${randomBytes(8).toString("hex")}`;
}

/**
 * Generate unique evidence ID
 */
function generateEvidenceId(): string {
  return `evidence_${randomBytes(6).toString("hex")}`;
}

/**
 * Calculate content hash for evidence
 */
function calculateContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Check if resources are enabled
 */
function requireResourcesEnabled(config: Web3PluginConfig): void {
  if (!config.resources?.enabled) {
    throw new Error(ErrorCode.E_UNAVAILABLE);
  }
}

/**
 * Create handler for web3.dispute.open
 * Opens a new dispute for an order/lease
 */
export function createDisputeOpenHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      requireResourcesEnabled(config);

      const input = (params ?? {}) as Record<string, unknown>;
      const orderId = typeof input.orderId === "string" ? input.orderId.trim() : undefined;
      const reason = typeof input.reason === "string" ? input.reason.trim() : undefined;
      const resourceId = typeof input.resourceId === "string" ? input.resourceId.trim() : undefined;
      const consumerId = typeof input.consumerId === "string" ? input.consumerId.trim() : undefined;
      const providerId = typeof input.providerId === "string" ? input.providerId.trim() : undefined;

      if (!orderId || !reason || !resourceId || !consumerId || !providerId) {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_INVALID_ARGUMENT),
          message: "Missing required fields: orderId, reason, resourceId, consumerId, providerId",
        });
      }

      if (reason.length < 10 || reason.length > 500) {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_INVALID_ARGUMENT),
          message: "Reason must be between 10 and 500 characters",
        });
      }

      // Check if dispute already exists for this order
      const existingDisputes = store.getDisputes().filter((d) => d.orderId === orderId);
      const openDisputes = existingDisputes.filter((d) => d.status === "open");
      if (openDisputes.length > 0) {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_CONFLICT),
          message: "An open dispute already exists for this order",
        });
      }

      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + DEFAULT_DISPUTE_CONFIG.timeoutMs).toISOString();

      const dispute: DisputeRecord = {
        disputeId: generateDisputeId(),
        orderId,
        resourceId,
        providerId,
        consumerId,
        reason,
        status: "open",
        evidences: [],
        openedAt: now,
        expiresAt,
        updatedAt: now,
      };

      store.upsertDispute(dispute);

      respond(true, {
        disputeId: dispute.disputeId,
        status: dispute.status,
        expiresAt: dispute.expiresAt,
      });
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}

/**
 * Create handler for web3.dispute.submitEvidence
 * Submits evidence for an existing dispute
 */
export function createDisputeSubmitEvidenceHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      requireResourcesEnabled(config);

      const input = (params ?? {}) as Record<string, unknown>;
      const disputeId = typeof input.disputeId === "string" ? input.disputeId.trim() : undefined;
      const submittedBy =
        typeof input.submittedBy === "string" ? input.submittedBy.trim() : undefined;
      const type = typeof input.type === "string" ? input.type.trim() : "other";
      const description =
        typeof input.description === "string" ? input.description.trim() : undefined;
      const data = typeof input.data === "object" && input.data !== null ? input.data : undefined;

      if (!disputeId || !submittedBy || !description) {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_INVALID_ARGUMENT),
          message: "Missing required fields: disputeId, submittedBy, description",
        });
      }

      const dispute = store.getDispute(disputeId);
      if (!dispute) {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_NOT_FOUND),
          message: "Dispute not found",
        });
      }

      if (dispute.status !== "open" && dispute.status !== "evidence_submitted") {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_INVALID_ARGUMENT),
          message: `Cannot submit evidence for dispute with status: ${dispute.status}`,
        });
      }

      // Check if submitter is involved in the dispute
      if (submittedBy !== dispute.providerId && submittedBy !== dispute.consumerId) {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_FORBIDDEN),
          message: "Only provider or consumer can submit evidence",
        });
      }

      // Check evidence count limit per party
      const partyEvidenceCount = dispute.evidences.filter(
        (e) => e.submittedBy === submittedBy,
      ).length;
      if (partyEvidenceCount >= DEFAULT_DISPUTE_CONFIG.maxEvidencePerParty) {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_QUOTA_EXCEEDED),
          message: `Maximum ${DEFAULT_DISPUTE_CONFIG.maxEvidencePerParty} evidence per party`,
        });
      }

      // Check data size
      if (data) {
        const dataSize = JSON.stringify(data).length;
        if (dataSize > DEFAULT_DISPUTE_CONFIG.maxEvidenceDataSize) {
          return respond(false, {
            error: formatWeb3GatewayError(ErrorCode.E_INVALID_ARGUMENT),
            message: `Evidence data size exceeds ${DEFAULT_DISPUTE_CONFIG.maxEvidenceDataSize} bytes`,
          });
        }
      }

      const evidence: DisputeEvidence = {
        evidenceId: generateEvidenceId(),
        submittedBy,
        type: type as DisputeEvidence["type"],
        contentHash: calculateContentHash(JSON.stringify({ description, data })),
        description,
        submittedAt: new Date().toISOString(),
        data: data as Record<string, unknown>,
      };

      const updatedDispute: DisputeRecord = {
        ...dispute,
        evidences: [...dispute.evidences, evidence],
        status: "evidence_submitted",
        updatedAt: new Date().toISOString(),
      };

      store.upsertDispute(updatedDispute);

      respond(true, {
        evidenceId: evidence.evidenceId,
        contentHash: evidence.contentHash,
        submittedAt: evidence.submittedAt,
      });
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}

/**
 * Create handler for web3.dispute.resolve
 * Resolves a dispute with a ruling
 */
export function createDisputeResolveHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      requireResourcesEnabled(config);

      const input = (params ?? {}) as Record<string, unknown>;
      const disputeId = typeof input.disputeId === "string" ? input.disputeId.trim() : undefined;
      const ruling = typeof input.ruling === "string" ? input.ruling.trim() : undefined;
      const reason = typeof input.reason === "string" ? input.reason.trim() : undefined;
      const refundAmount =
        typeof input.refundAmount === "string" ? input.refundAmount.trim() : undefined;
      const resolvedBy = typeof input.resolvedBy === "string" ? input.resolvedBy.trim() : "system";

      if (!disputeId || !ruling || !reason) {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_INVALID_ARGUMENT),
          message: "Missing required fields: disputeId, ruling, reason",
        });
      }

      const validRulings: DisputeRuling[] = ["provider_wins", "consumer_wins", "split", "timeout"];
      if (!validRulings.includes(ruling as DisputeRuling)) {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_INVALID_ARGUMENT),
          message: `Invalid ruling. Must be one of: ${validRulings.join(", ")}`,
        });
      }

      const dispute = store.getDispute(disputeId);
      if (!dispute) {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_NOT_FOUND),
          message: "Dispute not found",
        });
      }

      if (dispute.status === "resolved" || dispute.status === "rejected") {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_CONFLICT),
          message: `Dispute already ${dispute.status}`,
        });
      }

      const resolution: DisputeResolution = {
        ruling: ruling as DisputeRuling,
        reason,
        refundAmount,
        resolvedAt: new Date().toISOString(),
        resolvedBy,
      };

      const updatedDispute: DisputeRecord = {
        ...dispute,
        status: "resolved",
        resolution,
        updatedAt: new Date().toISOString(),
      };

      store.upsertDispute(updatedDispute);

      respond(true, {
        disputeId: updatedDispute.disputeId,
        status: updatedDispute.status,
        resolution: updatedDispute.resolution,
      });
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}

/**
 * Create handler for web3.dispute.reject
 * Rejects a dispute (closes without ruling)
 */
export function createDisputeRejectHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      requireResourcesEnabled(config);

      const input = (params ?? {}) as Record<string, unknown>;
      const disputeId = typeof input.disputeId === "string" ? input.disputeId.trim() : undefined;
      const reason = typeof input.reason === "string" ? input.reason.trim() : "Rejected";

      if (!disputeId) {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_INVALID_ARGUMENT),
          message: "Missing required field: disputeId",
        });
      }

      const dispute = store.getDispute(disputeId);
      if (!dispute) {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_NOT_FOUND),
          message: "Dispute not found",
        });
      }

      if (dispute.status === "resolved" || dispute.status === "rejected") {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_CONFLICT),
          message: `Dispute already ${dispute.status}`,
        });
      }

      const updatedDispute: DisputeRecord = {
        ...dispute,
        status: "rejected",
        updatedAt: new Date().toISOString(),
      };

      store.upsertDispute(updatedDispute);

      respond(true, {
        disputeId: updatedDispute.disputeId,
        status: updatedDispute.status,
        reason,
      });
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}

/**
 * Create handler for web3.dispute.get
 * Retrieves a single dispute record
 */
export function createDisputeGetHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      requireResourcesEnabled(config);

      const input = (params ?? {}) as Record<string, unknown>;
      const disputeId = typeof input.disputeId === "string" ? input.disputeId.trim() : undefined;

      if (!disputeId) {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_INVALID_ARGUMENT),
          message: "Missing required field: disputeId",
        });
      }

      const dispute = store.getDispute(disputeId);
      if (!dispute) {
        return respond(false, {
          error: formatWeb3GatewayError(ErrorCode.E_NOT_FOUND),
          message: "Dispute not found",
        });
      }

      respond(true, { dispute });
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}

/**
 * Create handler for web3.dispute.list
 * Lists disputes with optional filtering
 */
export function createDisputeListHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      requireResourcesEnabled(config);

      const input = (params ?? {}) as Record<string, unknown>;
      const orderId = typeof input.orderId === "string" ? input.orderId.trim() : undefined;
      const status =
        typeof input.status === "string" ? (input.status.trim() as DisputeStatus) : undefined;
      const limit = typeof input.limit === "number" ? Math.min(Math.max(input.limit, 1), 100) : 20;

      let disputes = store.getDisputes();

      if (orderId) {
        disputes = disputes.filter((d) => d.orderId === orderId);
      }

      if (status) {
        disputes = disputes.filter((d) => d.status === status);
      }

      // Sort by most recent first
      disputes = disputes.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      // Apply limit
      const total = disputes.length;
      disputes = disputes.slice(0, limit);

      respond(true, {
        disputes,
        total,
        returned: disputes.length,
      });
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}

/**
 * Check for expired disputes and auto-resolve them
 * This should be called periodically by a background service
 */
export function checkDisputeTimeouts(store: Web3StateStore): {
  resolved: number;
  errors: string[];
} {
  const now = Date.now();
  const disputes = store.getDisputes();
  const expired = disputes.filter(
    (d) => d.status === "open" && new Date(d.expiresAt).getTime() < now,
  );

  const errors: string[] = [];
  let resolved = 0;

  for (const dispute of expired) {
    try {
      const resolution: DisputeResolution = {
        ruling: "timeout",
        reason: "Dispute expired without resolution",
        resolvedAt: new Date().toISOString(),
        resolvedBy: "system",
      };

      const updatedDispute: DisputeRecord = {
        ...dispute,
        status: "expired",
        resolution,
        updatedAt: new Date().toISOString(),
      };

      store.upsertDispute(updatedDispute);
      resolved++;
    } catch (err) {
      errors.push(`Failed to resolve dispute ${dispute.disputeId}: ${err}`);
    }
  }

  return { resolved, errors };
}
