import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import type {
  TokenEconomyPolicy,
  TokenEconomyState,
  TokenEconomyStatus,
  TokenGovernancePolicy,
} from "../types.js";
import {
  requireBigNumberishString,
  requireEnum,
  requireOptionalEnum,
  requireOptionalPositiveInt,
} from "../validators.js";
import { requireString } from "../validators.js";
import {
  assertAccess,
  formatGatewayErrorResponse,
  nowIso,
  randomUUID,
  recordAudit,
  requireActorId,
  requireOptionalAddress,
} from "./_shared.js";

type TokenEconomyConfigureInput = {
  status?: TokenEconomyStatus;
  policy?: Record<string, unknown>;
};

type TokenEconomyMintBurnInput = {
  amount?: string;
  reason?: string;
};

type TokenEconomyGovernanceInput = {
  governance?: Record<string, unknown>;
  reason?: string;
};

function ensureConfigured(state: TokenEconomyState | undefined): TokenEconomyState {
  if (!state) {
    throw new Error("token economy is not configured");
  }
  return state;
}

function ensureActive(state: TokenEconomyState) {
  if (state.status !== "token_active") {
    throw new Error("token economy is not active");
  }
}

function optionalBigNumberish(params: Record<string, unknown>, key: string) {
  const raw = params[key];
  if (raw === undefined || raw === null || raw === "") return undefined;
  return requireBigNumberishString(params, key, { allowZero: true });
}

function parseGovernancePolicy(input: Record<string, unknown>): TokenGovernancePolicy {
  return {
    quorumBps: requireOptionalPositiveInt(input, "quorumBps", { min: 0, max: 10000 }),
    votingPeriodDays: requireOptionalPositiveInt(input, "votingPeriodDays", { min: 1, max: 365 }),
    proposalThreshold: optionalBigNumberish(input, "proposalThreshold"),
  };
}

function parseTokenPolicy(input: Record<string, unknown>): TokenEconomyPolicy {
  const symbol = requireString(input.symbol, "policy.symbol");
  const name = typeof input.name === "string" ? input.name.trim() : undefined;
  const decimals = requireOptionalPositiveInt(input, "decimals", { min: 0, max: 30 });
  const chain = typeof input.chain === "string" ? input.chain.trim() : undefined;
  const tokenAddress = requireOptionalAddress(input, "tokenAddress");

  let emission: TokenEconomyPolicy["emission"];
  if (input.emission && typeof input.emission === "object") {
    const emissionInput = input.emission as Record<string, unknown>;
    emission = {
      rate: requireBigNumberishString(emissionInput, "rate"),
      period: requireEnum(emissionInput, "period", ["day", "week", "month"] as const),
      cap: optionalBigNumberish(emissionInput, "cap"),
    };
  }

  let burn: TokenEconomyPolicy["burn"];
  if (input.burn && typeof input.burn === "object") {
    const burnInput = input.burn as Record<string, unknown>;
    burn = {
      burnRateBps: requireOptionalPositiveInt(burnInput, "burnRateBps", { min: 0, max: 10000 }),
    };
  }

  let governance: TokenGovernancePolicy | undefined;
  if (input.governance && typeof input.governance === "object") {
    governance = parseGovernancePolicy(input.governance as Record<string, unknown>);
  }

  return {
    symbol,
    name: name?.length ? name : undefined,
    decimals,
    chain: chain?.length ? chain : undefined,
    tokenAddress,
    emission,
    burn,
    governance,
  };
}

function buildDefaultState(
  policy: TokenEconomyPolicy,
  status?: TokenEconomyStatus,
): TokenEconomyState {
  return {
    status: status ?? "token_draft",
    policy,
    totals: {
      minted: "0",
      burned: "0",
      totalSupply: "0",
      circulating: "0",
    },
    updatedAt: nowIso(),
  };
}

export function createTokenEconomySummaryHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const state = store.getTokenEconomy();
      respond(true, state ?? null);
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createTokenEconomyConfigureHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown> & TokenEconomyConfigureInput;
      const actorId = requireActorId(opts, config, input);
      const policyInput = input.policy;
      if (!policyInput || typeof policyInput !== "object") {
        throw new Error("policy is required");
      }
      const policy = parseTokenPolicy(policyInput as Record<string, unknown>);
      const status = requireOptionalEnum(input, "status", [
        "token_draft",
        "token_active",
        "token_paused",
      ] as const);

      const existing = store.getTokenEconomy();
      const nextState: TokenEconomyState = {
        ...(existing ?? buildDefaultState(policy, status)),
        policy,
        status: status ?? existing?.status ?? "token_draft",
        updatedAt: nowIso(),
      };

      store.saveTokenEconomy(nextState);
      recordAudit(store, "token_economy_configured", randomUUID(), undefined, actorId, {
        status: nextState.status,
        symbol: nextState.policy.symbol,
      });

      respond(true, nextState);
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createTokenEconomyMintHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown> & TokenEconomyMintBurnInput;
      const actorId = requireActorId(opts, config, input);
      const amount = BigInt(requireBigNumberishString(input, "amount"));
      const reason = typeof input.reason === "string" ? input.reason.trim() : undefined;

      const state = ensureConfigured(store.getTokenEconomy());
      ensureActive(state);

      // totalSupply = minted - burned (net on-chain supply)
      // circulating = totalSupply - locked - staked (currently equals totalSupply; locked/staked not yet implemented)
      const minted = BigInt(state.totals.minted) + amount;
      const totalSupply = BigInt(state.totals.totalSupply) + amount;
      const circulating = BigInt(state.totals.circulating) + amount;

      const nextState: TokenEconomyState = {
        ...state,
        totals: {
          minted: minted.toString(),
          burned: state.totals.burned,
          totalSupply: totalSupply.toString(),
          circulating: circulating.toString(),
        },
        updatedAt: nowIso(),
      };

      store.saveTokenEconomy(nextState);
      recordAudit(store, "token_minted", randomUUID(), undefined, actorId, {
        amount: amount.toString(),
        reason,
      });

      respond(true, nextState);
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createTokenEconomyBurnHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown> & TokenEconomyMintBurnInput;
      const actorId = requireActorId(opts, config, input);
      const amount = BigInt(requireBigNumberishString(input, "amount"));
      const reason = typeof input.reason === "string" ? input.reason.trim() : undefined;

      const state = ensureConfigured(store.getTokenEconomy());
      ensureActive(state);

      const circulating = BigInt(state.totals.circulating);
      if (amount > circulating) {
        throw new Error("burn amount exceeds circulating supply");
      }

      // Burn reduces both totalSupply and circulating equally (no locked/staked deduction yet)
      const burned = BigInt(state.totals.burned) + amount;
      const totalSupply = BigInt(state.totals.totalSupply) - amount;
      const nextCirculating = circulating - amount;

      const nextState: TokenEconomyState = {
        ...state,
        totals: {
          minted: state.totals.minted,
          burned: burned.toString(),
          totalSupply: totalSupply.toString(),
          circulating: nextCirculating.toString(),
        },
        updatedAt: nowIso(),
      };

      store.saveTokenEconomy(nextState);
      recordAudit(store, "token_burned", randomUUID(), undefined, actorId, {
        amount: amount.toString(),
        reason,
      });

      respond(true, nextState);
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createTokenEconomyGovernanceUpdateHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown> & TokenEconomyGovernanceInput;
      const actorId = requireActorId(opts, config, input);
      const governanceInput = input.governance;
      if (!governanceInput || typeof governanceInput !== "object") {
        throw new Error("governance is required");
      }

      const state = ensureConfigured(store.getTokenEconomy());
      const governance = parseGovernancePolicy(governanceInput as Record<string, unknown>);
      const reason = typeof input.reason === "string" ? input.reason.trim() : undefined;

      const nextState: TokenEconomyState = {
        ...state,
        policy: {
          ...state.policy,
          governance,
        },
        updatedAt: nowIso(),
      };

      store.saveTokenEconomy(nextState);
      recordAudit(store, "token_governance_updated", randomUUID(), undefined, actorId, {
        reason,
      });

      respond(true, nextState);
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
