import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { rewardCanonicalHash } from "../reward/canonical.js";
import { EvmRewardClaimAdapter } from "../reward/evm-claim.js";
import { assertRewardTransition } from "../state-machine.js";
import type { RewardAsset, RewardChainFamily, RewardGrant, RewardNonceRecord } from "../types.js";
import { requireString } from "../validators.js";
import {
  assertAccess,
  formatGatewayErrorResponse,
  nowIso,
  randomBytes,
  randomUUID,
  recordAuditWithAnchor,
  requireActorId,
} from "./_shared.js";

function inferChainFamily(network: string): RewardChainFamily {
  return network.startsWith("ton-") ? "ton" : "evm";
}

function normalizeRecipient(chainFamily: RewardChainFamily, recipient: string): string {
  const trimmed = recipient.trim();
  if (chainFamily === "evm") return trimmed.toLowerCase();
  return trimmed;
}

function buildNonceId(input: {
  chainFamily: RewardChainFamily;
  network: string;
  recipient: string;
  nonce: string;
}): string {
  return `${input.chainFamily}:${input.network}:${input.recipient}:${input.nonce}`;
}

function requireRewardAsset(
  input: Record<string, unknown>,
  chainFamily: RewardChainFamily,
): RewardAsset {
  const asset = input.asset;
  if (!asset || typeof asset !== "object") {
    throw new Error("asset is required");
  }
  const a = asset as Record<string, unknown>;
  const type = requireString(a.type, "asset.type");
  if (chainFamily === "evm") {
    if (type !== "erc20") throw new Error("asset.type must be erc20 for evm rewards");
    const tokenAddress = requireString(a.tokenAddress, "asset.tokenAddress");
    return { type: "erc20", tokenAddress };
  }
  if (type !== "ton") throw new Error("asset.type must be ton for ton rewards");
  return { type: "ton", asset: "ton" };
}

function assertRewardsEnabled(config: MarketPluginConfig) {
  if (config.rewards?.enabled === false) {
    throw new Error("E_UNAVAILABLE: rewards are disabled");
  }
}

export function createRewardCreateHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      assertRewardsEnabled(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);

      const rewardId =
        typeof input.rewardId === "string" && input.rewardId.trim().length > 0
          ? input.rewardId.trim()
          : randomUUID();

      const network =
        typeof input.network === "string" && input.network.trim().length > 0
          ? input.network.trim()
          : config.chain.network;
      const chainFamily = inferChainFamily(network);

      const recipient = normalizeRecipient(
        chainFamily,
        requireString(input.recipient, "recipient"),
      );
      const amount = requireString(input.amount, "amount");
      const eventHash = requireString(input.eventHash, "eventHash");

      const nonce =
        typeof input.nonce === "string" && input.nonce.trim().length > 0
          ? input.nonce.trim()
          : randomBytes(16).toString("hex");

      const deadline =
        typeof input.deadline === "string" && input.deadline.trim().length > 0
          ? input.deadline.trim()
          : new Date(Date.now() + 10 * 60_000).toISOString();

      const asset = requireRewardAsset(input, chainFamily);

      const existing = store.getReward(rewardId);
      if (existing) {
        respond(true, existing);
        return;
      }

      const nonceId = buildNonceId({ chainFamily, network, recipient, nonce });
      if (store.getRewardNonce(nonceId)) {
        throw new Error("E_CONFLICT: nonce already used");
      }

      const now = nowIso();
      const reward: RewardGrant = {
        rewardId,
        chainFamily,
        network,
        recipient,
        amount,
        asset,
        nonce,
        deadline,
        eventHash,
        status: "reward_created",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      };

      const nonceRecord: RewardNonceRecord = {
        nonceId,
        rewardId,
        chainFamily,
        network,
        recipient,
        nonce,
        expiresAt: deadline,
        createdAt: now,
      };

      const canonicalHash = rewardCanonicalHash({
        rewardId,
        chainFamily,
        network,
        recipient,
        amount,
        asset: asset as unknown as Record<string, unknown>,
        nonce,
        deadline,
        eventHash,
      });

      await store.runInTransaction(() => {
        store.saveReward(reward);
        store.saveRewardNonce(nonceRecord);
      });

      await recordAuditWithAnchor({
        store,
        config,
        kind: "reward_created",
        refId: rewardId,
        hash: canonicalHash,
        anchorId: `reward:${rewardId}`,
        actor: actorId,
        details: {
          rewardId,
          chainFamily,
          network,
          recipient,
          amount,
          asset,
          nonce,
          deadline,
          eventHash,
        },
      });

      respond(true, reward);
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createRewardGetHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const rewardId = requireString(input.rewardId, "rewardId");
      const reward = store.getReward(rewardId);
      if (!reward) throw new Error("reward not found");
      respond(true, reward);
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createRewardListHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const recipientInput =
        typeof input.recipient === "string" && input.recipient.trim().length > 0
          ? input.recipient.trim()
          : undefined;
      const statusInput =
        typeof input.status === "string" && input.status.trim().length > 0
          ? input.status.trim()
          : undefined;
      const limit = typeof input.limit === "number" ? Math.min(Math.max(1, input.limit), 500) : 50;
      const offset = typeof input.offset === "number" ? Math.max(0, input.offset) : 0;

      const rewards = store.listRewards();
      let filtered = rewards;

      if (recipientInput) {
        filtered = filtered.filter(
          (r) => r.recipient === recipientInput || r.recipient === recipientInput.toLowerCase(),
        );
      }

      if (statusInput) {
        filtered = filtered.filter((r) => r.status === statusInput);
      }

      // Sort by newest first
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const totalCount = filtered.length;
      const paginated = filtered.slice(offset, offset + limit);

      respond(true, {
        rewards: paginated,
        count: paginated.length,
        totalCount,
        limit,
        offset,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createRewardIssueClaimHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      assertRewardsEnabled(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const rewardId = requireString(input.rewardId, "rewardId");
      const reward = store.getReward(rewardId);
      if (!reward) throw new Error("reward not found");

      // P1 Fix: Server-side deadline validation
      if (new Date(reward.deadline) < new Date()) {
        throw new Error(`E_EXPIRED: reward deadline ${reward.deadline} has passed`);
      }

      if (reward.status !== "reward_created" && reward.status !== "onchain_failed") {
        throw new Error(`E_CONFLICT: cannot issue claim from status ${reward.status}`);
      }

      if (reward.chainFamily !== "evm") {
        throw new Error(
          "E_UNAVAILABLE: reward claim issuance is only implemented for evm right now",
        );
      }

      if (reward.asset.type !== "erc20") {
        throw new Error("E_INVALID_ARGUMENT: evm reward asset must be erc20");
      }

      const adapter = new EvmRewardClaimAdapter(config.chain);
      const claimResult = await adapter.signClaim({
        recipient: reward.recipient,
        tokenAddress: reward.asset.tokenAddress,
        amount: reward.amount,
        nonce: reward.nonce,
        deadline: reward.deadline,
        eventHash: reward.eventHash,
      });

      assertRewardTransition(reward.status, "claim_issued");

      const now = nowIso();
      const updated: RewardGrant = {
        ...reward,
        status: "claim_issued",
        claim: {
          payload: {
            domain: claimResult.domain,
            types: claimResult.types,
            primaryType: claimResult.primaryType,
            message: claimResult.message,
            distributorAddress: claimResult.distributorAddress,
          },
          signature: claimResult.signature,
          issuedAt: now,
        },
        updatedAt: now,
        attempts: reward.attempts + 1,
        lastError: undefined,
      };

      await store.runInTransaction(() => {
        store.saveReward(updated);
      });

      const canonicalHash = rewardCanonicalHash({
        rewardId,
        chainFamily: reward.chainFamily,
        network: reward.network,
        recipient: reward.recipient,
        amount: reward.amount,
        asset: reward.asset as unknown as Record<string, unknown>,
        nonce: reward.nonce,
        deadline: reward.deadline,
        eventHash: reward.eventHash,
      });

      await recordAuditWithAnchor({
        store,
        config,
        kind: "reward_claim_issued",
        refId: rewardId,
        hash: canonicalHash,
        anchorId: `reward-claim:${rewardId}`,
        actor: actorId,
        details: {
          rewardId,
          status: updated.status,
          chainFamily: reward.chainFamily,
          network: reward.network,
        },
      });

      respond(true, updated);
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

/**
 * Handle on-chain status updates for a reward.
 * P1 Implementation: Lifecycle closure for rewards.
 */
export function createRewardUpdateStatusHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const rewardId = requireString(input.rewardId, "rewardId");
      const statusInput = requireString(input.status, "status");
      const txHash = typeof input.txHash === "string" ? input.txHash : undefined;
      const error = typeof input.error === "string" ? input.error : undefined;

      const reward = store.getReward(rewardId);
      if (!reward) throw new Error("reward not found");

      // Cast and validate status
      const status = statusInput as RewardGrant["status"];
      assertRewardTransition(reward.status, status);

      const now = nowIso();
      const resolvedTxHash = txHash ?? reward.onchain?.txHash;
      const resolvedSubmittedAt =
        status === "onchain_submitted" ? now : (reward.onchain?.submittedAt ?? now);
      const resolvedConfirmedAt =
        status === "onchain_confirmed" ? now : reward.onchain?.confirmedAt;

      const updated: RewardGrant = {
        ...reward,
        status,
        onchain: resolvedTxHash
          ? {
              txHash: resolvedTxHash,
              submittedAt: resolvedSubmittedAt,
              confirmedAt: resolvedConfirmedAt,
            }
          : reward.onchain,
        lastError: error || (status === "onchain_failed" ? "transaction failed" : undefined),
        updatedAt: now,
      };

      await store.runInTransaction(() => {
        store.saveReward(updated);
      });

      const details: Record<string, unknown> = {
        rewardId,
        prevStatus: reward.status,
        newStatus: status,
      };
      if (resolvedTxHash) details.txHash = resolvedTxHash;
      if (updated.lastError) details.error = updated.lastError;

      await recordAuditWithAnchor({
        store,
        config,
        kind: "reward_status_updated",
        refId: rewardId,
        hash: rewardId,
        anchorId: `reward:${rewardId}`,
        actor: actorId,
        details,
      });

      respond(true, updated);
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
