import { describe, expect, it } from "vitest";
import { buildAgentReputation } from "./reputation-engine.js";
import type { MarketResource } from "./resources.js";
import type { ServiceProof } from "./types.js";

describe("buildAgentReputation", () => {
  it("derives specializations and proof summaries from current market data", () => {
    const resources: MarketResource[] = [
      {
        resourceId: "resource-1",
        kind: "service",
        status: "resource_published",
        providerActorId: "0xprovider",
        offerId: "offer-1",
        label: "Secure review",
        tags: ["security", "review"],
        price: { unit: "call", amount: "2", currency: "USDC" },
        serviceSchema: { inputs: ["repo"], outputs: ["report"] },
        serviceWrapper: {
          version: "v1",
          category: "digital",
          acceptance: { mode: "human", reviewWindowHours: 48 },
          proof: { families: ["tlsnotary"], required: true },
        },
        version: 1,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
    ];
    const proofs: ServiceProof[] = [
      {
        proofId: "proof-1",
        orderId: "order-1",
        actorId: "0xprovider",
        proof: {
          type: "tlsnotary",
          artifactHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          issuedAt: "2026-03-01T00:00:00.000Z",
          verifier: "notary-v1",
        },
        proofHash: "proof-hash-1",
        submittedAt: "2026-03-01T00:00:00.000Z",
        status: "proof_submitted",
      },
    ];

    const reputation = buildAgentReputation({
      providerActorId: "0xprovider",
      resources,
      proofs,
      totalJobs: 4,
      completedJobs: 3,
      disputedJobs: 1,
      score: 88,
      lastUpdated: "2026-03-01T00:00:00.000Z",
    });

    expect(reputation?.agentDid).toBe("0xprovider");
    expect(reputation?.profile.specializations).toEqual(["digital", "review", "security"]);
    expect(reputation?.proofs).toEqual([{ type: "tlsnotary", count: 1, verifiedRate: 1 }]);
    expect(reputation?.derivedScore).toBe(88);
  });
});
