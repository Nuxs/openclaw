import { proofFamilyFromExecutionProof, isVerifiedExecutionProof } from "./proof-types.js";
import type { MarketResource } from "./resources.js";
import type { ProofFamily } from "./service-wrapper.js";
import type { ServiceProof } from "./types.js";

export type ProofSummary = {
  type: ProofFamily;
  count: number;
  verifiedRate: number;
};

export type AttestationSummary = {
  attesterRole: string;
  count: number;
  averageConfidence: number;
};

export type AgentReputation = {
  agentDid: string;
  profile: {
    totalJobs: number;
    completedJobs: number;
    disputedJobs: number;
    averageRating: number | null;
    specializations: string[];
  };
  proofs: ProofSummary[];
  attestations: AttestationSummary[];
  lastUpdated: string;
  derivedScore: number;
  source: "market_derived";
};

function uniqueSpecializations(resources: MarketResource[]): string[] {
  const set = new Set<string>();
  for (const resource of resources) {
    for (const tag of resource.tags ?? []) {
      if (tag.trim().length > 0) {
        set.add(tag.trim());
      }
    }
    if (resource.kind === "service" && resource.serviceWrapper?.category) {
      set.add(resource.serviceWrapper.category);
    }
  }
  return [...set].sort((left, right) => left.localeCompare(right));
}

function buildProofSummaries(proofs: ServiceProof[]): ProofSummary[] {
  const buckets = new Map<ProofFamily, { count: number; verifiedCount: number }>();
  for (const proof of proofs) {
    const family = proofFamilyFromExecutionProof(proof.proof);
    const current = buckets.get(family) ?? { count: 0, verifiedCount: 0 };
    current.count += 1;
    if (isVerifiedExecutionProof(proof.proof)) {
      current.verifiedCount += 1;
    }
    buckets.set(family, current);
  }
  return [...buckets.entries()].map(([type, bucket]) => ({
    type,
    count: bucket.count,
    verifiedRate: bucket.count === 0 ? 0 : Number((bucket.verifiedCount / bucket.count).toFixed(4)),
  }));
}

function buildAttestationSummaries(proofs: ServiceProof[]): AttestationSummary[] {
  const buckets = new Map<string, { count: number; confidenceSum: number }>();
  for (const proof of proofs) {
    if (proof.proof.type !== "human_attestation") {
      continue;
    }
    const attesterRole =
      typeof proof.proof.metadata?.attesterRole === "string" &&
      proof.proof.metadata.attesterRole.trim().length > 0
        ? proof.proof.metadata.attesterRole.trim()
        : "unknown";
    const confidence =
      typeof proof.proof.metadata?.confidence === "number" &&
      Number.isFinite(proof.proof.metadata.confidence)
        ? proof.proof.metadata.confidence
        : 1;
    const current = buckets.get(attesterRole) ?? { count: 0, confidenceSum: 0 };
    current.count += 1;
    current.confidenceSum += confidence;
    buckets.set(attesterRole, current);
  }
  return [...buckets.entries()].map(([attesterRole, bucket]) => ({
    attesterRole,
    count: bucket.count,
    averageConfidence: Number((bucket.confidenceSum / bucket.count).toFixed(4)),
  }));
}

export function buildAgentReputation(params: {
  providerActorId?: string;
  resources: MarketResource[];
  proofs: ServiceProof[];
  totalJobs: number;
  completedJobs: number;
  disputedJobs: number;
  score: number;
  lastUpdated: string;
}): AgentReputation | null {
  if (!params.providerActorId) {
    return null;
  }
  return {
    agentDid: params.providerActorId,
    profile: {
      totalJobs: params.totalJobs,
      completedJobs: params.completedJobs,
      disputedJobs: params.disputedJobs,
      averageRating: null,
      specializations: uniqueSpecializations(params.resources),
    },
    proofs: buildProofSummaries(params.proofs),
    attestations: buildAttestationSummaries(params.proofs),
    lastUpdated: params.lastUpdated,
    derivedScore: params.score,
    source: "market_derived",
  };
}
