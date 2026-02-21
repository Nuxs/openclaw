/**
 * Market Core Facade
 *
 * Provides simplified, stable API for market-core capabilities.
 * This is the ONLY interface that external consumers (like web3-core) should use.
 *
 * Design Principles:
 * - Single entry point for all market operations
 * - Stable contract (semantic versioning)
 * - Hide internal complexity (state machine, storage, etc.)
 * - Provide clear error codes and messages
 */

import type { MarketPluginConfig } from "./config.js";
import type { MarketStateStore } from "./state/store.js";

/**
 * Facade interface for market operations
 */
export interface MarketFacade {
  // Resource operations
  publishResource(params: PublishResourceParams): Promise<PublishResourceResult>;
  unpublishResource(params: UnpublishResourceParams): Promise<UnpublishResourceResult>;
  getResource(params: GetResourceParams): Promise<GetResourceResult>;
  listResources(params: ListResourcesParams): Promise<ListResourcesResult>;

  // Lease operations
  issueLease(params: IssueLeaseParams): Promise<IssueLeaseResult>;
  revokeLease(params: RevokeLeaseParams): Promise<RevokeLeaseResult>;
  getLease(params: GetLeaseParams): Promise<GetLeaseResult>;
  listLeases(params: ListLeasesParams): Promise<ListLeasesResult>;
  expireLeases(params: ExpireLeasesParams): Promise<ExpireLeasesResult>;

  // Ledger operations
  listLedger(params: ListLedgerParams): Promise<ListLedgerResult>;
  getLedgerSummary(params: GetLedgerSummaryParams): Promise<GetLedgerSummaryResult>;

  // Dispute operations
  openDispute(params: OpenDisputeParams): Promise<OpenDisputeResult>;
  submitEvidence(params: SubmitEvidenceParams): Promise<SubmitEvidenceResult>;
  resolveDispute(params: ResolveDisputeParams): Promise<ResolveDisputeResult>;
  rejectDispute(params: RejectDisputeParams): Promise<RejectDisputeResult>;
  getDispute(params: GetDisputeParams): Promise<GetDisputeResult>;
  listDisputes(params: ListDisputesParams): Promise<ListDisputesResult>;

  // Status operations
  getMetricsSnapshot(params: GetMetricsParams): Promise<GetMetricsResult>;
  getStatusSummary(params: GetStatusParams): Promise<GetStatusResult>;
}

// ---- Parameter types ----

export interface PublishResourceParams {
  resourceId: string;
  metadata: Record<string, unknown>;
  provider?: string;
}

export interface UnpublishResourceParams {
  resourceId: string;
}

export interface GetResourceParams {
  resourceId: string;
}

export interface ListResourcesParams {
  provider?: string;
  offset?: number;
  limit?: number;
}

export interface IssueLeaseParams {
  resourceId: string;
  consumer: string;
  durationSec: number;
  metadata?: Record<string, unknown>;
}

export interface RevokeLeaseParams {
  leaseId: string;
}

export interface GetLeaseParams {
  leaseId: string;
}

export interface ListLeasesParams {
  resourceId?: string;
  consumer?: string;
  offset?: number;
  limit?: number;
}

export interface ExpireLeasesParams {
  beforeTimestamp?: string;
}

export interface ListLedgerParams {
  offset?: number;
  limit?: number;
}

export interface GetLedgerSummaryParams {
  // Empty for now
}

export interface OpenDisputeParams {
  leaseId: string;
  reason: string;
  evidence?: Record<string, unknown>;
}

export interface SubmitEvidenceParams {
  disputeId: string;
  evidence: Record<string, unknown>;
}

export interface ResolveDisputeParams {
  disputeId: string;
  resolution: string;
}

export interface RejectDisputeParams {
  disputeId: string;
  reason: string;
}

export interface GetDisputeParams {
  disputeId: string;
}

export interface ListDisputesParams {
  status?: string;
  offset?: number;
  limit?: number;
}

export interface GetMetricsParams {
  // Empty for now
}

export interface GetStatusParams {
  // Empty for now
}

// ---- Result types ----

export interface PublishResourceResult {
  success: boolean;
  resourceId: string;
  error?: string;
}

export interface UnpublishResourceResult {
  success: boolean;
  error?: string;
}

export interface GetResourceResult {
  success: boolean;
  resource?: Record<string, unknown>;
  error?: string;
}

export interface ListResourcesResult {
  success: boolean;
  resources: Array<Record<string, unknown>>;
  total: number;
  error?: string;
}

export interface IssueLeaseResult {
  success: boolean;
  leaseId?: string;
  error?: string;
}

export interface RevokeLeaseResult {
  success: boolean;
  error?: string;
}

export interface GetLeaseResult {
  success: boolean;
  lease?: Record<string, unknown>;
  error?: string;
}

export interface ListLeasesResult {
  success: boolean;
  leases: Array<Record<string, unknown>>;
  total: number;
  error?: string;
}

export interface ExpireLeasesResult {
  success: boolean;
  expired: number;
  error?: string;
}

export interface ListLedgerResult {
  success: boolean;
  entries: Array<Record<string, unknown>>;
  total: number;
  error?: string;
}

export interface GetLedgerSummaryResult {
  success: boolean;
  summary?: Record<string, unknown>;
  error?: string;
}

export interface OpenDisputeResult {
  success: boolean;
  disputeId?: string;
  error?: string;
}

export interface SubmitEvidenceResult {
  success: boolean;
  error?: string;
}

export interface ResolveDisputeResult {
  success: boolean;
  error?: string;
}

export interface RejectDisputeResult {
  success: boolean;
  error?: string;
}

export interface GetDisputeResult {
  success: boolean;
  dispute?: Record<string, unknown>;
  error?: string;
}

export interface ListDisputesResult {
  success: boolean;
  disputes: Array<Record<string, unknown>>;
  total: number;
  error?: string;
}

export interface GetMetricsResult {
  success: boolean;
  metrics?: Record<string, unknown>;
  error?: string;
}

export interface GetStatusResult {
  success: boolean;
  status?: Record<string, unknown>;
  error?: string;
}

/**
 * Create a market facade instance
 */
export function createMarketFacade(
  store: MarketStateStore,
  config: MarketPluginConfig,
): MarketFacade {
  // Import handlers lazily to avoid circular dependencies
  const handlers = import("./market/handlers.js");

  return {
    async publishResource(params) {
      const { createResourcePublishHandler } = await handlers;
      const handler = createResourcePublishHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as PublishResourceResult);
          },
        });
      });
    },

    async unpublishResource(params) {
      const { createResourceUnpublishHandler } = await handlers;
      const handler = createResourceUnpublishHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as UnpublishResourceResult);
          },
        });
      });
    },

    async getResource(params) {
      const { createResourceGetHandler } = await handlers;
      const handler = createResourceGetHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as GetResourceResult);
          },
        });
      });
    },

    async listResources(params) {
      const { createResourceListHandler } = await handlers;
      const handler = createResourceListHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as ListResourcesResult);
          },
        });
      });
    },

    async issueLease(params) {
      const { createLeaseIssueHandler } = await handlers;
      const handler = createLeaseIssueHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as IssueLeaseResult);
          },
        });
      });
    },

    async revokeLease(params) {
      const { createLeaseRevokeHandler } = await handlers;
      const handler = createLeaseRevokeHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as RevokeLeaseResult);
          },
        });
      });
    },

    async getLease(params) {
      const { createLeaseGetHandler } = await handlers;
      const handler = createLeaseGetHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as GetLeaseResult);
          },
        });
      });
    },

    async listLeases(params) {
      const { createLeaseListHandler } = await handlers;
      const handler = createLeaseListHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as ListLeasesResult);
          },
        });
      });
    },

    async expireLeases(params) {
      const { createLeaseExpireSweepHandler } = await handlers;
      const handler = createLeaseExpireSweepHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as ExpireLeasesResult);
          },
        });
      });
    },

    async listLedger(params) {
      const { createLedgerListHandler } = await handlers;
      const handler = createLedgerListHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as ListLedgerResult);
          },
        });
      });
    },

    async getLedgerSummary(params) {
      const { createLedgerSummaryHandler } = await handlers;
      const handler = createLedgerSummaryHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as GetLedgerSummaryResult);
          },
        });
      });
    },

    async openDispute(params) {
      const { createDisputeOpenHandler } = await handlers;
      const handler = createDisputeOpenHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as OpenDisputeResult);
          },
        });
      });
    },

    async submitEvidence(params) {
      const { createDisputeEvidenceHandler } = await handlers;
      const handler = createDisputeEvidenceHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as SubmitEvidenceResult);
          },
        });
      });
    },

    async resolveDispute(params) {
      const { createDisputeResolveHandler } = await handlers;
      const handler = createDisputeResolveHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as ResolveDisputeResult);
          },
        });
      });
    },

    async rejectDispute(params) {
      const { createDisputeRejectHandler } = await handlers;
      const handler = createDisputeRejectHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as RejectDisputeResult);
          },
        });
      });
    },

    async getDispute(params) {
      const { createDisputeGetHandler } = await handlers;
      const handler = createDisputeGetHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as GetDisputeResult);
          },
        });
      });
    },

    async listDisputes(params) {
      const { createDisputeListHandler } = await handlers;
      const handler = createDisputeListHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as ListDisputesResult);
          },
        });
      });
    },

    async getMetricsSnapshot(params) {
      const { createMarketMetricsSnapshotHandler } = await handlers;
      const handler = createMarketMetricsSnapshotHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as GetMetricsResult);
          },
        });
      });
    },

    async getStatusSummary(params) {
      const { createMarketStatusSummaryHandler } = await handlers;
      const handler = createMarketStatusSummaryHandler(store, config);
      return new Promise((resolve) => {
        handler({
          params,
          respond: (success, data) => {
            resolve({ success, ...data } as GetStatusResult);
          },
        });
      });
    },
  };
}
