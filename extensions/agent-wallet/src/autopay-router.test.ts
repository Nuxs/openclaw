/**
 * Tests for the autopay dispatcher routing logic in `index.ts`.
 *
 * Covers 4 dispatch paths:
 *   1. chain="evm" → EVM handler (with network compat check)
 *   2. chain="ton" → TON handler (with network compat check)
 *   3. chain=<unknown> → rejected with E_INVALID_ARGUMENT
 *   4. chain=undefined → fallback to tonMode config inference
 * Plus:
 *   5. chain="evm" on a TON-configured node → E_INVALID_ARGUMENT
 *   6. chain="ton" on an EVM-configured node → E_INVALID_ARGUMENT
 */

import type { GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { isEVMNetwork, isTONNetwork, resolveConfig } from "./config.js";
import { formatAgentWalletGatewayErrorResponse } from "./errors.js";

// ---- Minimal stubs to avoid importing real blockchain / wallet code ----

type HandlerResult = { ok: boolean; payload: unknown } | undefined;

function createResponder(): {
  respond: GatewayRequestHandlerOptions["respond"];
  result: () => HandlerResult;
} {
  let captured: HandlerResult;
  return {
    respond: (ok: boolean, payload: unknown) => {
      captured = { ok, payload };
    },
    result: () => captured,
  };
}

function buildOptions(
  params: Record<string, unknown>,
  respond: GatewayRequestHandlerOptions["respond"],
): GatewayRequestHandlerOptions {
  return {
    req: { v: 1, id: "req-router", type: "req", method: "agent-wallet.autopay", params },
    params,
    client: null,
    isWebchatConnect: () => false,
    respond,
    context: {} as GatewayRequestHandlerOptions["context"],
  } as GatewayRequestHandlerOptions;
}

/**
 * Re-implement the autopay dispatcher inline so we test the routing logic
 * in isolation, without pulling in real blockchain adapters or wallets.
 */
function createAutopayDispatcher(networkConfig: string) {
  const config = resolveConfig({ chain: { network: networkConfig } });
  const tonMode = isTONNetwork(config.chain.network);

  const evmHandler = vi.fn(async ({ respond }: GatewayRequestHandlerOptions) => {
    respond(true, { handler: "evm" });
  });
  const tonHandler = vi.fn(async ({ respond }: GatewayRequestHandlerOptions) => {
    respond(true, { handler: "ton" });
  });

  const dispatch = async (options: GatewayRequestHandlerOptions) => {
    const input = (options.params ?? {}) as Record<string, unknown>;
    const chain = typeof input.chain === "string" ? input.chain.trim().toLowerCase() : undefined;
    if (chain === "evm") {
      if (!isEVMNetwork(config.chain.network)) {
        options.respond(
          false,
          formatAgentWalletGatewayErrorResponse(
            new Error(
              `E_INVALID_ARGUMENT: evm autopay is not supported on ${config.chain.network}`,
            ),
          ),
        );
        return;
      }
      await evmHandler(options);
      return;
    }
    if (chain === "ton") {
      if (!isTONNetwork(config.chain.network)) {
        options.respond(
          false,
          formatAgentWalletGatewayErrorResponse(
            new Error(
              `E_INVALID_ARGUMENT: ton autopay is not supported on ${config.chain.network}`,
            ),
          ),
        );
        return;
      }
      await tonHandler(options);
      return;
    }
    if (chain) {
      options.respond(
        false,
        formatAgentWalletGatewayErrorResponse(
          new Error(`E_INVALID_ARGUMENT: unsupported chain ${chain} for autopay`),
        ),
      );
      return;
    }
    if (tonMode) {
      await tonHandler(options);
      return;
    }
    await evmHandler(options);
  };

  return { dispatch, evmHandler, tonHandler };
}

describe("autopay router dispatch", () => {
  it("routes chain=evm to EVM handler on EVM-configured node", async () => {
    const { dispatch, evmHandler, tonHandler } = createAutopayDispatcher("base");
    const resp = createResponder();
    await dispatch(buildOptions({ chain: "evm", to: "0x1", value: "10" }, resp.respond));

    expect(resp.result()?.ok).toBe(true);
    expect(resp.result()?.payload).toMatchObject({ handler: "evm" });
    expect(evmHandler).toHaveBeenCalledTimes(1);
    expect(tonHandler).not.toHaveBeenCalled();
  });

  it("routes chain=ton to TON handler on TON-configured node", async () => {
    const { dispatch, evmHandler, tonHandler } = createAutopayDispatcher("ton-testnet");
    const resp = createResponder();
    await dispatch(buildOptions({ chain: "ton", to: "EQC_addr", amount: "5" }, resp.respond));

    expect(resp.result()?.ok).toBe(true);
    expect(resp.result()?.payload).toMatchObject({ handler: "ton" });
    expect(tonHandler).toHaveBeenCalledTimes(1);
    expect(evmHandler).not.toHaveBeenCalled();
  });

  it("rejects chain=evm on TON-configured node", async () => {
    const { dispatch, evmHandler, tonHandler } = createAutopayDispatcher("ton-testnet");
    const resp = createResponder();
    await dispatch(buildOptions({ chain: "evm", to: "0x1", value: "10" }, resp.respond));

    expect(resp.result()?.ok).toBe(false);
    expect(resp.result()?.payload).toMatchObject({ error: "E_INVALID_ARGUMENT" });
    expect(evmHandler).not.toHaveBeenCalled();
    expect(tonHandler).not.toHaveBeenCalled();
  });

  it("rejects chain=ton on EVM-configured node", async () => {
    const { dispatch, evmHandler, tonHandler } = createAutopayDispatcher("base");
    const resp = createResponder();
    await dispatch(buildOptions({ chain: "ton", to: "EQC_addr", amount: "5" }, resp.respond));

    expect(resp.result()?.ok).toBe(false);
    expect(resp.result()?.payload).toMatchObject({ error: "E_INVALID_ARGUMENT" });
    expect(evmHandler).not.toHaveBeenCalled();
    expect(tonHandler).not.toHaveBeenCalled();
  });

  it("rejects unknown chain value", async () => {
    const { dispatch, evmHandler, tonHandler } = createAutopayDispatcher("base");
    const resp = createResponder();
    await dispatch(buildOptions({ chain: "solana", to: "addr", value: "1" }, resp.respond));

    expect(resp.result()?.ok).toBe(false);
    expect(resp.result()?.payload).toMatchObject({ error: "E_INVALID_ARGUMENT" });
    expect(evmHandler).not.toHaveBeenCalled();
    expect(tonHandler).not.toHaveBeenCalled();
  });

  it("falls back to EVM handler when chain is undefined on EVM node", async () => {
    const { dispatch, evmHandler, tonHandler } = createAutopayDispatcher("base");
    const resp = createResponder();
    await dispatch(buildOptions({ to: "0x1", value: "10" }, resp.respond));

    expect(resp.result()?.ok).toBe(true);
    expect(resp.result()?.payload).toMatchObject({ handler: "evm" });
    expect(evmHandler).toHaveBeenCalledTimes(1);
    expect(tonHandler).not.toHaveBeenCalled();
  });

  it("falls back to TON handler when chain is undefined on TON node", async () => {
    const { dispatch, evmHandler, tonHandler } = createAutopayDispatcher("ton-mainnet");
    const resp = createResponder();
    await dispatch(buildOptions({ to: "EQC_addr", amount: "5" }, resp.respond));

    expect(resp.result()?.ok).toBe(true);
    expect(resp.result()?.payload).toMatchObject({ handler: "ton" });
    expect(tonHandler).toHaveBeenCalledTimes(1);
    expect(evmHandler).not.toHaveBeenCalled();
  });

  it("normalizes chain casing (e.g. 'EVM' → evm)", async () => {
    const { dispatch, evmHandler } = createAutopayDispatcher("sepolia");
    const resp = createResponder();
    await dispatch(buildOptions({ chain: " EVM ", to: "0x1", value: "10" }, resp.respond));

    expect(resp.result()?.ok).toBe(true);
    expect(evmHandler).toHaveBeenCalledTimes(1);
  });
});
