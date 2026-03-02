import { getProvider } from "@openclaw/blockchain-adapter";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { nowIso, recordAuditWithAnchor } from "../handlers/_shared.js";
import type { RewardGrant } from "../types.js";

/**
 * Periodically check for on-chain confirmation of submitted rewards.
 */
export async function flushPendingRewards(
  store: MarketStateStore,
  config: MarketPluginConfig,
): Promise<void> {
  if (config.rewards?.enabled === false) return;

  const rewards = store.listRewards().filter((r) => r.status === "onchain_submitted");
  if (rewards.length === 0) return;

  for (const reward of rewards) {
    const txHash = reward.onchain?.txHash;
    if (!txHash) continue;

    try {
      const provider = getProvider(reward.network as any);

      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) {
        const now = nowIso();
        let updated: RewardGrant | undefined;

        if (receipt.status === "success") {
          updated = {
            ...reward,
            status: "onchain_confirmed",
            onchain: {
              ...reward.onchain!,
              confirmedAt: now,
            },
            updatedAt: now,
          };
        } else if (receipt.status === "failure") {
          updated = {
            ...reward,
            status: "onchain_failed",
            lastError: "transaction failed on-chain",
            updatedAt: now,
          };
        }

        if (updated) {
          await store.runInTransaction(() => {
            store.saveReward(updated!);
          });

          // Record system audit event
          await recordAuditWithAnchor({
            store,
            config,
            kind: "reward_status_updated",
            refId: reward.rewardId,
            hash: reward.rewardId,
            anchorId: `reward:${reward.rewardId}`,
            actor: "system:reward-poller",
            details: {
              rewardId: reward.rewardId,
              prevStatus: reward.status,
              newStatus: updated.status,
              txHash,
              receipt: {
                blockNumber: receipt.blockNumber,
                status: receipt.status,
              },
            },
          });
        }
      }
    } catch (err) {
      // Best effort
      console.warn(`[RewardPoller] Failed to check status for ${reward.rewardId}:`, err);
    }
  }
}
