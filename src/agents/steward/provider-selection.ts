import { clampCandidateCount, normalizeSelectionStrategy, parseMoneyValue } from "./shared.js";
import type {
  MarketStewardCandidate,
  StewardSelectionDecision,
  StewardSelectionPolicy,
} from "./types.js";

function candidateAmount(candidate: MarketStewardCandidate): number {
  return (
    parseMoneyValue(candidate.estimatedTotal) ??
    parseMoneyValue(candidate.priceAmount) ??
    Number.POSITIVE_INFINITY
  );
}

function candidatePriority(candidate: MarketStewardCandidate, preferProof: boolean): number {
  return preferProof && candidate.proofRequired ? 1 : 0;
}

function compareCandidates(
  left: MarketStewardCandidate,
  right: MarketStewardCandidate,
  strategy: "best_score" | "lowest_price" | "proof_first",
  preferProof: boolean,
) {
  const leftPriority = candidatePriority(left, preferProof);
  const rightPriority = candidatePriority(right, preferProof);
  if (leftPriority !== rightPriority) {
    return rightPriority - leftPriority;
  }

  if (strategy === "lowest_price") {
    const priceDelta = candidateAmount(left) - candidateAmount(right);
    if (priceDelta !== 0) {
      return priceDelta;
    }
  }

  if (strategy === "proof_first") {
    const proofDelta = Number(Boolean(right.proofRequired)) - Number(Boolean(left.proofRequired));
    if (proofDelta !== 0) {
      return proofDelta;
    }
  }

  const scoreDelta = (right.score ?? 0) - (left.score ?? 0);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const amountDelta = candidateAmount(left) - candidateAmount(right);
  if (amountDelta !== 0) {
    return amountDelta;
  }

  return left.resourceId.localeCompare(right.resourceId);
}

export function selectStewardCandidate(params: {
  candidates: MarketStewardCandidate[];
  requestedResourceId?: string;
  policy?: StewardSelectionPolicy;
}): StewardSelectionDecision {
  const strategy = normalizeSelectionStrategy(params.policy?.strategy);
  const maxCandidates = clampCandidateCount(params.policy?.maxCandidates, 5);
  const preferProof = params.policy?.preferProof === true;
  const trimmedResourceId = params.requestedResourceId?.trim();
  const normalizedCandidates = params.candidates.filter(
    (candidate) => candidate.resourceId.trim().length > 0,
  );

  if (normalizedCandidates.length === 0) {
    return {
      ok: false,
      reason: "no_candidates",
      strategy,
      selectedCandidate: null,
      consideredCandidates: [],
    };
  }

  const sorted = normalizedCandidates.toSorted((left, right) =>
    compareCandidates(left, right, strategy, preferProof),
  );

  if (trimmedResourceId) {
    const selectedCandidate =
      sorted.find((candidate) => candidate.resourceId === trimmedResourceId) ?? null;
    return {
      ok: Boolean(selectedCandidate),
      reason: selectedCandidate ? "selected" : "requested_resource_missing",
      strategy,
      selectedCandidate,
      consideredCandidates: sorted.slice(0, maxCandidates),
    };
  }

  return {
    ok: true,
    reason: "selected",
    strategy,
    selectedCandidate: sorted[0] ?? null,
    consideredCandidates: sorted.slice(0, maxCandidates),
  };
}
