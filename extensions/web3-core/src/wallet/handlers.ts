import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import { loadCallGateway, type GatewayCallResult } from "../core-imports.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";

function normalizeResult(payload: unknown): { ok: true; result: unknown } {
  if (payload && typeof payload === "object") {
    const gatewayResult = payload as GatewayCallResult;
    if (gatewayResult.ok === false) {
      throw new Error(gatewayResult.error || "wallet gateway call failed");
    }
    if (gatewayResult.ok === true && "result" in gatewayResult) {
      return { ok: true, result: gatewayResult.result ?? {} };
    }
  }
  return { ok: true, result: payload ?? {} };
}

function createWalletProxyHandler(method: string): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      const callGateway = await loadCallGateway();
      const payload = await callGateway({
        method,
        params: (params ?? {}) as Record<string, unknown>,
      });
      const normalized = normalizeResult(payload);
      respond(normalized.ok, normalized.result as Record<string, unknown>);
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}

export function createWeb3WalletCreateHandler(): GatewayRequestHandler {
  return createWalletProxyHandler("agent-wallet.create");
}

export function createWeb3WalletBalanceHandler(): GatewayRequestHandler {
  return createWalletProxyHandler("agent-wallet.balance");
}

export function createWeb3WalletSignHandler(): GatewayRequestHandler {
  return createWalletProxyHandler("agent-wallet.sign");
}

export function createWeb3WalletSendHandler(): GatewayRequestHandler {
  return createWalletProxyHandler("agent-wallet.send");
}

export function createWeb3WalletAutopayHandler(): GatewayRequestHandler {
  return createWalletProxyHandler("agent-wallet.autopay");
}
