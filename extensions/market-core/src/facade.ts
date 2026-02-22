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

import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "./config.js";
import { formatGatewayErrorResponse } from "./market/handlers/_shared.js";
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

  const invoke = async <T>(handler: GatewayRequestHandler, params: unknown): Promise<T> => {
    return new Promise((resolve) => {
      const respond: GatewayRequestHandlerOptions["respond"] = (ok, payload) => {
        const record =
          payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        resolve({ success: ok, ...record } as T);
      };

      const opts: GatewayRequestHandlerOptions = {
        req: {} as unknown as GatewayRequestHandlerOptions["req"],
        params: (params ?? {}) as unknown as Record<string, unknown>,
        client: null,
        isWebchatConnect: () => false,
        respond,
        context: {} as unknown as GatewayRequestHandlerOptions["context"],
      };

      Promise.resolve(handler(opts)).catch((err: unknown) => {
        respond(false, formatGatewayErrorResponse(err));
      });
    });
  };

  return {
    async publishResource(params) {
      const { createResourcePublishHandler } = await handlers;
      return await invoke<PublishResourceResult>(
        createResourcePublishHandler(store, config),
        params,
      );
    },

    async unpublishResource(params) {
      const { createResourceUnpublishHandler } = await handlers;
      return await invoke<UnpublishResourceResult>(
        createResourceUnpublishHandler(store, config),
        params,
      );
    },

    async getResource(params) {
      const { createResourceGetHandler } = await handlers;
      return await invoke<GetResourceResult>(createResourceGetHandler(store, config), params);
    },

    async listResources(params) {
      const { createResourceListHandler } = await handlers;
      return await invoke<ListResourcesResult>(createResourceListHandler(store, config), params);
    },

    async issueLease(params) {
      const { createLeaseIssueHandler } = await handlers;
      return await invoke<IssueLeaseResult>(createLeaseIssueHandler(store, config), params);
    },

    async revokeLease(params) {
      const { createLeaseRevokeHandler } = await handlers;
      return await invoke<RevokeLeaseResult>(createLeaseRevokeHandler(store, config), params);
    },

    async getLease(params) {
      const { createLeaseGetHandler } = await handlers;
      return await invoke<GetLeaseResult>(createLeaseGetHandler(store, config), params);
    },

    async listLeases(params) {
      const { createLeaseListHandler } = await handlers;
      return await invoke<ListLeasesResult>(createLeaseListHandler(store, config), params);
    },

    async expireLeases(params) {
      const { createLeaseExpireSweepHandler } = await handlers;
      return await invoke<ExpireLeasesResult>(createLeaseExpireSweepHandler(store, config), params);
    },

    async listLedger(params) {
      const { createLedgerListHandler } = await handlers;
      return await invoke<ListLedgerResult>(createLedgerListHandler(store, config), params);
    },

    async getLedgerSummary(params) {
      const { createLedgerSummaryHandler } = await handlers;
      return await invoke<GetLedgerSummaryResult>(
        createLedgerSummaryHandler(store, config),
        params,
      );
    },

    async openDispute(params) {
      const { createDisputeOpenHandler } = await handlers;
      return await invoke<OpenDisputeResult>(createDisputeOpenHandler(store, config), params);
    },

    async submitEvidence(params) {
      const { createDisputeEvidenceHandler } = await handlers;
      return await invoke<SubmitEvidenceResult>(
        createDisputeEvidenceHandler(store, config),
        params,
      );
    },

    async resolveDispute(params) {
      const { createDisputeResolveHandler } = await handlers;
      return await invoke<ResolveDisputeResult>(createDisputeResolveHandler(store, config), params);
    },

    async rejectDispute(params) {
      const { createDisputeRejectHandler } = await handlers;
      return await invoke<RejectDisputeResult>(createDisputeRejectHandler(store, config), params);
    },

    async getDispute(params) {
      const { createDisputeGetHandler } = await handlers;
      return await invoke<GetDisputeResult>(createDisputeGetHandler(store, config), params);
    },

    async listDisputes(params) {
      const { createDisputeListHandler } = await handlers;
      return await invoke<ListDisputesResult>(createDisputeListHandler(store, config), params);
    },

    async getMetricsSnapshot(params) {
      const { createMarketMetricsSnapshotHandler } = await handlers;
      return await invoke<GetMetricsResult>(
        createMarketMetricsSnapshotHandler(store, config),
        params,
      );
    },

    async getStatusSummary(params) {
      const { createMarketStatusSummaryHandler } = await handlers;
      return await invoke<GetStatusResult>(createMarketStatusSummaryHandler(store, config), params);
    },
  };
}
