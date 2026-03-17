import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import {
  summarizeProviderReputation,
  type ProviderReputationSnapshot,
} from "../provider-reputation.js";
import { buildAgentReputation } from "../reputation-engine.js";
import { requireOptionalIsoTimestamp, requireLimit } from "../validators.js";
import { assertAccess, formatGatewayErrorResponse, requireOptionalAddress } from "./_shared.js";

type ReputationInput = {
  providerActorId?: string;
  resourceId?: string;
  since?: string;
  until?: string;
  limit?: number;
};

type ReputationSummary = {
  providerActorId?: string;
  resourceId?: string;
  score: number;
  signals: string[];
  leases: {
    total: number;
    byStatus: ProviderReputationSnapshot["leaseCounts"];
  };
  disputes: {
    total: number;
    byStatus: Record<string, number>;
    resolvedAgainstProvider: number;
  };
  ledger: {
    totalCost: string;
    currency: string;
  };
  policy: {
    riskBand: "low" | "medium" | "high";
    autoPurchaseEligible: boolean;
    requiresManualReview: boolean;
  };
  agentReputation: ReturnType<typeof buildAgentReputation>;
};

function deriveRiskBand(score: number): "low" | "medium" | "high" {
  if (score >= 80) return "low";
  if (score >= 60) return "medium";
  return "high";
}

export function createReputationSummaryHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown> & ReputationInput;
      const providerActorId = requireOptionalAddress(input, "providerActorId");
      const resourceId = typeof input.resourceId === "string" ? input.resourceId.trim() : undefined;
      const since = requireOptionalIsoTimestamp(input, "since");
      const until = requireOptionalIsoTimestamp(input, "until");
      const limit = requireLimit(input, "limit", 200, 1000);

      const snapshot = summarizeProviderReputation({
        store,
        providerActorId,
        resourceId,
        since,
        until,
        limit,
      });
      const totalLeases = Object.values(snapshot.leaseCounts).reduce(
        (sum, count) => sum + count,
        0,
      );
      const riskBand = deriveRiskBand(snapshot.score);

      const summary: ReputationSummary = {
        providerActorId,
        resourceId,
        score: snapshot.score,
        signals: snapshot.signals,
        leases: {
          total: totalLeases,
          byStatus: snapshot.leaseCounts,
        },
        disputes: {
          total: snapshot.disputes.length,
          byStatus: snapshot.disputeCounts,
          resolvedAgainstProvider: snapshot.providerLosses,
        },
        ledger: {
          totalCost: snapshot.ledgerSummary.totalCost,
          currency: snapshot.ledgerSummary.currency,
        },
        policy: {
          riskBand,
          autoPurchaseEligible:
            snapshot.score >= 75 && !snapshot.signals.includes("provider_penalized"),
          requiresManualReview:
            riskBand !== "low" || snapshot.signals.includes("high_dispute_rate"),
        },
        agentReputation: buildAgentReputation({
          providerActorId,
          resources: snapshot.matchedResources,
          proofs: snapshot.proofs,
          totalJobs: totalLeases,
          completedJobs: snapshot.completedJobs,
          disputedJobs: snapshot.disputes.length,
          score: snapshot.score,
          lastUpdated: snapshot.lastUpdated,
        }),
      };

      respond(true, summary);
    } catch (err) {
      respond(
        false,
        formatGatewayErrorResponse(err, undefined, {
          cause: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  };
}
