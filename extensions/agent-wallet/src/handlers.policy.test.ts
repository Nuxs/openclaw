import type { GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentWalletConfig } from "./config.js";

const mockProvider = {
  isConnected: true,
  connect: vi.fn(async () => undefined),
  signMessage: vi.fn(async () => "0xsigned"),
  sendTransaction: vi.fn(async () => "0xtxhash"),
  getBalance: vi.fn(async () => 0n),
  nativeToken: { symbol: "ETH" },
};

const mockWallet = {
  address: "0x123400000000000000000000000000000000abcd",
  publicKey: "0xpub",
  privateKey: "0x1111111111111111111111111111111111111111111111111111111111111111" as `0x${string}`,
};

vi.mock("@openclaw/blockchain-adapter", () => ({
  initBlockchainFactory: vi.fn(),
  getEVMProvider: vi.fn(() => mockProvider),
  assertProviderEVM: vi.fn(),
}));

vi.mock("./wallet.js", () => ({
  loadOrCreateWallet: vi.fn(async () => mockWallet),
}));

function buildConfig(overrides?: Partial<AgentWalletConfig>): AgentWalletConfig {
  return {
    enabled: true,
    chain: { network: "base" },
    policy: {
      enabled: true,
      inlinePolicy: {
        version: "v1",
        budget: {
          dailyCap: "1000",
          perTxCap: "500",
          currency: "USDC",
        },
        scope: {
          allowedContracts: [mockWallet.address],
          allowedMethods: ["0xa9059cbb", "sign_message"],
          allowedTools: ["agent-wallet.send", "agent-wallet.sign"],
          allowedChains: ["evm"],
        },
        autoPay: {
          enabled: false,
          maxRetries: 1,
        },
      },
    },
    ...overrides,
  };
}

function buildHandlerOptions(
  params: Record<string, unknown>,
  respond: GatewayRequestHandlerOptions["respond"],
): GatewayRequestHandlerOptions {
  return {
    req: {
      v: 1,
      id: "req-1",
      type: "req",
      method: "agent-wallet.send",
      params,
    },
    params,
    client: null,
    isWebchatConnect: () => false,
    respond,
    context: {} as GatewayRequestHandlerOptions["context"],
  } as GatewayRequestHandlerOptions;
}

describe("agent-wallet handlers policy guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects send when per-tx cap is exceeded", async () => {
    const { createAgentWalletSendHandler } = await import("./handlers.js");
    const handler = createAgentWalletSendHandler(buildConfig());

    let ok = true;
    let payload: unknown;
    await handler(
      buildHandlerOptions(
        {
          to: mockWallet.address,
          value: "900",
          data: "0xa9059cbb0000000000000000000000000000000000000000000000000000000000000001",
        },
        (resultOk, resultPayload) => {
          ok = resultOk;
          payload = resultPayload;
        },
      ),
    );

    expect(ok).toBe(false);
    expect(payload).toMatchObject({ error: "E_FORBIDDEN" });
    expect(mockProvider.sendTransaction).not.toHaveBeenCalled();
  });

  it("allows send when request matches policy", async () => {
    const { createAgentWalletSendHandler } = await import("./handlers.js");
    const handler = createAgentWalletSendHandler(buildConfig());

    let ok = false;
    let payload: unknown;
    await handler(
      buildHandlerOptions(
        {
          to: mockWallet.address,
          value: "100",
          data: "0xa9059cbb0000000000000000000000000000000000000000000000000000000000000001",
        },
        (resultOk, resultPayload) => {
          ok = resultOk;
          payload = resultPayload;
        },
      ),
    );

    expect(ok).toBe(true);
    expect(payload).toMatchObject({ txHash: "0xtxhash" });
    expect(mockProvider.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("allows sign when policy permits sign_message", async () => {
    const { createAgentWalletSignHandler } = await import("./handlers.js");
    const handler = createAgentWalletSignHandler(buildConfig());

    let ok = false;
    let payload: unknown;
    await handler(
      buildHandlerOptions({ message: "hello" }, (resultOk, resultPayload) => {
        ok = resultOk;
        payload = resultPayload;
      }),
    );

    expect(ok).toBe(true);
    expect(payload).toMatchObject({ signature: "0xsigned" });
    expect(mockProvider.signMessage).toHaveBeenCalledWith("hello");
  });
});
