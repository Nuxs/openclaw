import type { StewardApproval, StewardRiskLevel, StewardSelectionStrategy } from "./types.js";

const RISK_RANK: Record<StewardRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const KNOWN_SELECTION_STRATEGIES = new Set<StewardSelectionStrategy>([
  "best_score",
  "lowest_price",
  "proof_first",
]);

export function parseMoneyValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function resolveApprovalStatus(approval?: StewardApproval, now = new Date()) {
  if (!approval) {
    return { approved: false, expired: false };
  }
  if (approval.expiresAt) {
    const expiresAtMs = Date.parse(approval.expiresAt);
    if (!Number.isNaN(expiresAtMs) && expiresAtMs <= now.getTime()) {
      return { approved: false, expired: true };
    }
  }
  return { approved: approval.approved, expired: false };
}

export function compareRiskLevel(left: StewardRiskLevel, right: StewardRiskLevel) {
  return RISK_RANK[left] - RISK_RANK[right];
}

export function clampCandidateCount(value: number | undefined, fallback = 5) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(20, Math.floor(value)));
}

export function normalizeSelectionStrategy(value: string | undefined): StewardSelectionStrategy {
  if (value && KNOWN_SELECTION_STRATEGIES.has(value as StewardSelectionStrategy)) {
    return value as StewardSelectionStrategy;
  }
  return "best_score";
}
