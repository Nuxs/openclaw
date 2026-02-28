/**
 * Reward canonical hash — deterministic, domain-separated hash for audit anchoring.
 *
 * Mirrors the pattern in `../hash.ts` but scoped to reward grants so that
 * the canonical payload is stable and independent of transient fields.
 */

import { hashCanonical } from "../hash.js";

/**
 * Build the canonical hash input for a reward grant.
 *
 * Only fields that affect the *economic identity* of the reward are included.
 * Transient metadata (status, timestamps, attempt count) are excluded so the
 * hash remains stable across state transitions.
 */
export function rewardCanonicalHash(input: {
  rewardId: string;
  chainFamily: string;
  network: string;
  recipient: string;
  amount: string;
  asset: Record<string, unknown>;
  nonce: string;
  deadline: string;
  eventHash: string;
}): string {
  return hashCanonical({
    domain: "reward",
    rewardId: input.rewardId,
    chainFamily: input.chainFamily,
    network: input.network,
    recipient: input.recipient,
    amount: input.amount,
    asset: input.asset,
    nonce: input.nonce,
    deadline: input.deadline,
    eventHash: input.eventHash,
  });
}
