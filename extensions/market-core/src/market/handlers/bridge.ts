import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import type {
  BridgeRoute,
  BridgeRouteFilter,
  BridgeStatus,
  BridgeTransfer,
  BridgeTransferFilter,
  CrossChainAsset,
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
} from "./_shared.js";

const CHAINS = ["ton", "evm"] as const;

/** Valid state transitions for bridge transfers (finite state machine). */
const VALID_TRANSITIONS: Record<BridgeStatus, readonly BridgeStatus[]> = {
  bridge_requested: ["bridge_in_flight", "bridge_failed"],
  bridge_in_flight: ["bridge_completed", "bridge_failed"],
  bridge_completed: [], // terminal state
  bridge_failed: ["bridge_requested"], // allow retry
};

const DEFAULT_CROSS_CHAIN_ASSETS: CrossChainAsset[] = [
  {
    assetId: "ton",
    symbol: "TON",
    decimals: 9,
    chains: ["ton"],
  },
  {
    assetId: "usdc",
    symbol: "USDC",
    decimals: 6,
    chains: ["ton", "evm"],
  },
];

const DEFAULT_BRIDGE_ROUTES: BridgeRoute[] = [
  {
    routeId: "ton-evm-usdc",
    fromChain: "ton",
    toChain: "evm",
    assetSymbol: "USDC",
    feeBps: 30,
    estimatedSeconds: 300,
    provider: "bridge",
  },
  {
    routeId: "evm-ton-usdc",
    fromChain: "evm",
    toChain: "ton",
    assetSymbol: "USDC",
    feeBps: 30,
    estimatedSeconds: 300,
    provider: "bridge",
  },
];

function filterRoutes(filter: BridgeRouteFilter): BridgeRoute[] {
  return DEFAULT_BRIDGE_ROUTES.filter((route) => {
    if (filter.fromChain && route.fromChain !== filter.fromChain) return false;
    if (filter.toChain && route.toChain !== filter.toChain) return false;
    if (filter.assetSymbol && route.assetSymbol !== filter.assetSymbol) return false;
    return true;
  });
}

function resolveBridgeTarget(
  store: MarketStateStore,
  input: Record<string, unknown>,
): { orderId?: string; settlementId?: string } {
  const orderId = typeof input.orderId === "string" ? input.orderId : undefined;
  const settlementId = typeof input.settlementId === "string" ? input.settlementId : undefined;
  if (!orderId && !settlementId) {
    throw new Error("orderId or settlementId is required");
  }
  if (settlementId) {
    const settlement = store.getSettlement(settlementId);
    if (!settlement) throw new Error("settlement not found");
    return { settlementId, orderId: settlement.orderId };
  }
  const order = orderId ? store.getOrder(orderId) : undefined;
  if (!order) throw new Error("order not found");
  return { orderId };
}

export function createBridgeRoutesHandler(
  _store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const fromChain = requireOptionalEnum(input, "fromChain", CHAINS);
      const toChain = requireOptionalEnum(input, "toChain", CHAINS);
      const assetSymbol =
        typeof input.assetSymbol === "string" ? input.assetSymbol.trim() : undefined;
      const filter: BridgeRouteFilter = {
        fromChain: fromChain?.toString(),
        toChain: toChain?.toString(),
        assetSymbol,
      };
      const routes = filterRoutes(filter);
      const assets = DEFAULT_CROSS_CHAIN_ASSETS.filter((asset) => {
        if (assetSymbol && asset.symbol !== assetSymbol) return false;
        if (fromChain && !asset.chains.includes(fromChain)) return false;
        if (toChain && !asset.chains.includes(toChain)) return false;
        return true;
      });
      respond(true, { assets, routes });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createBridgeRequestHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const fromChain = requireEnum(input, "fromChain", CHAINS);
      const toChain = requireEnum(input, "toChain", CHAINS);
      const assetSymbol = requireString(input.assetSymbol, "assetSymbol");
      const amount = requireBigNumberishString(input, "amount");
      const target = resolveBridgeTarget(store, input);

      const route = DEFAULT_BRIDGE_ROUTES.find(
        (entry) =>
          entry.fromChain === fromChain &&
          entry.toChain === toChain &&
          entry.assetSymbol === assetSymbol,
      );
      if (!route) {
        throw new Error("bridge route not found");
      }

      const now = nowIso();
      const transfer: BridgeTransfer = {
        bridgeId: randomUUID(),
        orderId: target.orderId,
        settlementId: target.settlementId,
        routeId: route.routeId,
        fromChain,
        toChain,
        assetSymbol,
        amount,
        status: "bridge_requested",
        requestedAt: now,
        updatedAt: now,
      };

      store.saveBridgeTransfer(transfer);
      recordAudit(store, "bridge_requested", transfer.bridgeId, undefined, actorId, {
        orderId: target.orderId,
        settlementId: target.settlementId,
        routeId: route.routeId,
        amount,
        assetSymbol,
        fromChain,
        toChain,
      });

      respond(true, transfer);
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createBridgeUpdateHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const bridgeId = requireString(input.bridgeId, "bridgeId");
      const status = requireOptionalEnum(input, "status", [
        "bridge_requested",
        "bridge_in_flight",
        "bridge_completed",
        "bridge_failed",
      ] as const);
      const txHash = typeof input.txHash === "string" ? input.txHash.trim() : undefined;
      const failureReason =
        typeof input.failureReason === "string" && input.failureReason.trim().length > 0
          ? input.failureReason.trim()
          : undefined;

      if (!status && !txHash && !failureReason) {
        throw new Error("status, txHash, or failureReason is required");
      }

      const transfer = store.getBridgeTransfer(bridgeId);
      if (!transfer) throw new Error("bridge transfer not found");

      const nextStatus = (status ?? transfer.status) as BridgeStatus;

      // Enforce state machine: reject invalid transitions
      if (status && status !== transfer.status) {
        const allowed = VALID_TRANSITIONS[transfer.status];
        if (!allowed.includes(status)) {
          throw new Error(`invalid bridge status transition: ${transfer.status} → ${status}`);
        }
      }

      const nextTransfer: BridgeTransfer = {
        ...transfer,
        status: nextStatus,
        txHash: txHash ?? transfer.txHash,
        failureReason: failureReason ?? transfer.failureReason,
        updatedAt: nowIso(),
      };

      store.saveBridgeTransfer(nextTransfer);
      if (status && status !== transfer.status) {
        recordAudit(store, status, bridgeId, undefined, actorId, {
          orderId: transfer.orderId,
          settlementId: transfer.settlementId,
          routeId: transfer.routeId,
          txHash: txHash ?? transfer.txHash,
          failureReason: failureReason ?? transfer.failureReason,
        });
      }

      respond(true, nextTransfer);
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createBridgeStatusHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const bridgeId = typeof input.bridgeId === "string" ? input.bridgeId : undefined;
      if (bridgeId) {
        const transfer = store.getBridgeTransfer(bridgeId);
        if (!transfer) throw new Error("bridge transfer not found");
        respond(true, transfer);
        return;
      }

      const target = resolveBridgeTarget(store, input);
      const transfers = store.listBridgeTransfers({
        orderId: target.orderId,
        settlementId: target.settlementId,
      });
      // Explicit maxBy(updatedAt) — does not rely on store sort order
      const transfer = transfers.reduce<BridgeTransfer | undefined>((best, entry) => {
        if (!best) return entry;
        return Date.parse(entry.updatedAt) > Date.parse(best.updatedAt) ? entry : best;
      }, undefined);
      if (!transfer) throw new Error("bridge transfer not found");
      respond(true, transfer);
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createBridgeListHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const status = requireOptionalEnum(input, "status", [
        "bridge_requested",
        "bridge_in_flight",
        "bridge_completed",
        "bridge_failed",
      ] as const);
      const limit = requireOptionalPositiveInt(input, "limit", { min: 1, max: 1000 });
      const filter: BridgeTransferFilter = {
        orderId: typeof input.orderId === "string" ? input.orderId : undefined,
        settlementId: typeof input.settlementId === "string" ? input.settlementId : undefined,
        fromChain: typeof input.fromChain === "string" ? input.fromChain : undefined,
        toChain: typeof input.toChain === "string" ? input.toChain : undefined,
        assetSymbol: typeof input.assetSymbol === "string" ? input.assetSymbol : undefined,
        status: status as BridgeStatus | undefined,
        limit,
      };
      respond(true, store.listBridgeTransfers(filter));
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
