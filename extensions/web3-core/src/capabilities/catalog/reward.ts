/**
 * Reward capability descriptors.
 */
import type { Web3PluginConfig } from "../../config.js";
import type { CapabilityDescriptor } from "../types.js";
import { availability } from "./shared.js";

export function rewardCapabilities(config: Web3PluginConfig): CapabilityDescriptor[] {
  const rewardsEnabled = config.rewards?.enabled !== false;

  return [
    {
      name: "web3.reward.get",
      summary: "Get reward grant details by ID.",
      kind: "gateway",
      group: "reward",
      availability: availability(rewardsEnabled),
      paramsSchema: {
        type: "object",
        required: ["rewardId"],
        properties: {
          rewardId: { type: "string", description: "Reward grant unique identifier" },
        },
      },
      returns: "Reward grant details.",
      risk: { level: "low" },
    },
    {
      name: "web3.reward.list",
      summary: "List reward grants for the current user or a specific recipient.",
      kind: "gateway",
      group: "reward",
      availability: availability(rewardsEnabled),
      paramsSchema: {
        type: "object",
        properties: {
          recipient: { type: "string", description: "Optional recipient address filter" },
          limit: { type: "number", minimum: 1, maximum: 100 },
        },
      },
      returns: "List of reward grants and count.",
      risk: { level: "low" },
    },
    {
      name: "web3.reward.claim",
      summary: "Issue a claim signature for an EVM reward grant.",
      kind: "gateway",
      group: "reward",
      availability: availability(rewardsEnabled),
      paramsSchema: {
        type: "object",
        required: ["rewardId"],
        properties: {
          rewardId: { type: "string", description: "Reward grant ID to claim" },
        },
      },
      returns: "Signed claim payload (EIP-712) for on-chain submission.",
      risk: { level: "low" },
    },
    {
      name: "web3.reward.updateStatus",
      summary: "Update the on-chain status of a reward grant.",
      kind: "gateway",
      group: "reward",
      availability: availability(rewardsEnabled),
      paramsSchema: {
        type: "object",
        required: ["rewardId", "status"],
        properties: {
          rewardId: { type: "string", description: "Reward grant ID" },
          status: {
            type: "string",
            enum: ["onchain_submitted", "onchain_confirmed", "onchain_failed"],
            description: "New status",
          },
          txHash: { type: "string", description: "Transaction hash" },
          error: { type: "string", description: "Error message (if failed)" },
        },
      },
      returns: "Updated reward grant details.",
      risk: { level: "low" },
    },
  ];
}
