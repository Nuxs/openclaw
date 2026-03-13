import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWeb3WalletAutopayHandler,
  createWeb3WalletBalanceHandler,
  createWeb3WalletCreateHandler,
  createWeb3WalletSendHandler,
  createWeb3WalletSignHandler,
} from "./handlers.js";

const callGatewayMock = vi.fn();

vi.mock("../core-imports.js", () => ({
  loadCallGateway:
    async () =>
    (...args: unknown[]) =>
      callGatewayMock(...args),
  normalizeGatewayResult: (payload: unknown) => {
    if (payload && typeof payload === "object") {
      const r = payload as { ok?: boolean; error?: string; result?: unknown };
      if (r.ok === false) return { ok: false, error: r.error ?? "gateway call failed" };
      return { ok: true, result: "result" in r ? r.result : payload };
    }
    return { ok: true, result: payload };
  },
}));

type HandlerResult = { ok: boolean; payload: Record<string, unknown> };

async function invoke(handler: ReturnType<typeof createWeb3WalletCreateHandler>, params?: unknown) {
  let result!: HandlerResult;
  await handler({
    params,
    respond: (ok: boolean, payload: Record<string, unknown>) => {
      result = { ok, payload };
    },
  } as any);
  return result;
}

describe("web3 wallet proxy handlers", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
  });

  it("proxies web3.wallet.create to agent-wallet.create", async () => {
    callGatewayMock.mockResolvedValueOnce({ ok: true, result: { address: "0xabc" } });
    const result = await invoke(createWeb3WalletCreateHandler(), {});

    expect(result.ok).toBe(true);
    expect(result.payload).toEqual({ address: "0xabc" });
    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: "agent-wallet.create", params: {} }),
    );
  });

  it("proxies wallet method params for sign/send/balance/autopay", async () => {
    callGatewayMock
      .mockResolvedValueOnce({ ok: true, result: { balance: "10" } })
      .mockResolvedValueOnce({ ok: true, result: { signature: "0xsig" } })
      .mockResolvedValueOnce({ ok: true, result: { txHash: "0xtx1" } })
      .mockResolvedValueOnce({ ok: true, result: { txHash: "0xtx2" } });

    await invoke(createWeb3WalletBalanceHandler(), { address: "0x123" });
    await invoke(createWeb3WalletSignHandler(), { message: "hello" });
    await invoke(createWeb3WalletSendHandler(), { to: "0x456", value: "1" });
    await invoke(createWeb3WalletAutopayHandler(), { to: "0x789", value: "2" });

    expect(callGatewayMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ method: "agent-wallet.balance", params: { address: "0x123" } }),
    );
    expect(callGatewayMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: "agent-wallet.sign", params: { message: "hello" } }),
    );
    expect(callGatewayMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ method: "agent-wallet.send", params: { to: "0x456", value: "1" } }),
    );
    expect(callGatewayMock).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        method: "agent-wallet.autopay",
        params: { to: "0x789", value: "2" },
      }),
    );
  });

  it("maps gateway error payload to standardized error response", async () => {
    callGatewayMock.mockResolvedValueOnce({ ok: false, error: "wallet disabled" });

    const result = await invoke(createWeb3WalletCreateHandler(), {});

    expect(result.ok).toBe(false);
    expect(result.payload).toMatchObject({ error: "E_FORBIDDEN" });
  });
});
