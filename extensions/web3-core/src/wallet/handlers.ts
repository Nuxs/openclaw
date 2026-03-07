import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/compat";
import { formatWeb3GatewayErrorResponse } from "../errors.js";

type CallGatewayFn = (opts: {
  method: string;
  params?: unknown;
  timeoutMs?: number;
}) => Promise<unknown>;

type GatewayResult = {
  ok?: boolean;
  result?: unknown;
  error?: string;
};

async function loadCallGateway(): Promise<CallGatewayFn> {
  try {
    const mod = await import("../../../../src/gateway/call.ts");
    if (typeof mod.callGateway === "function") {
      return mod.callGateway as CallGatewayFn;
    }
  } catch {
    // ignore
  }

  // @ts-expect-error — dist fallback only exists after build; unreachable when src import succeeds
  const mod = await import("../../../../dist/gateway/call.js");
  if (typeof mod.callGateway !== "function") {
    throw new Error("callGateway is not available");
  }
  return mod.callGateway as CallGatewayFn;
}

function normalizeResult(payload: unknown): { ok: true; result: unknown } {
  if (payload && typeof payload === "object") {
    const gatewayResult = payload as GatewayResult;
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
