import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { GatewayRequestHandlerOptions } from "openclaw/plugin-sdk/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentWalletConfig } from "./config.js";

const mockTonProvider = {
  chainType: "ton",
  isConnected: true,
  connect: vi.fn(async () => undefined),
  transfer: vi.fn(async () => "0xtonhash"),
  getBalance: vi.fn(async () => 0n),
};

const mockTonWallet = {
  address: "EQC_TON_TEST_ADDRESS",
  publicKey: "ton_pub",
  mnemonic: "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12",
};

vi.mock("@openclaw/blockchain-adapter", () => ({
  initBlockchainFactory: vi.fn(),
  getProvider: vi.fn(() => mockTonProvider),
  isProviderTON: vi.fn(() => true),
}));

vi.mock("./ton-wallet.js", () => ({
  loadOrCreateTonWallet: vi.fn(async () => mockTonWallet),
}));

function buildHandlerOptions(
  params: Record<string, unknown>,
  respond: GatewayRequestHandlerOptions["respond"],
): GatewayRequestHandlerOptions {
  return {
    req: {
      v: 1,
      id: "req-ton-1",
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

describe("ton handlers policy guard", () => {
  let tmpDir: string;

  function buildConfig(overrides?: Partial<AgentWalletConfig>): AgentWalletConfig {
    return {
      enabled: true,
      chain: { network: "ton-testnet" },
      policy: {
        enabled: true,
        statePath: path.join(tmpDir, "policy-state.json"),
        inlinePolicy: {
          version: "v1",
          budget: {
            dailyCap: "1000",
            perTxCap: "300",
            currency: "TON",
          },
          scope: {
            allowedContracts: [mockTonWallet.address],
            allowedMethods: ["ton_transfer"],
            allowedTools: ["agent-wallet.send"],
            allowedChains: ["ton"],
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

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-wallet-ton-handler-policy-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("rejects send when amount exceeds cap", async () => {
    const { createTonWalletSendHandler } = await import("./ton-handlers.js");
    const handler = createTonWalletSendHandler(buildConfig());

    let ok = true;
    let payload: unknown;
    await handler(
      buildHandlerOptions(
        {
          to: mockTonWallet.address,
          amount: "500",
        },
        (resultOk, resultPayload) => {
          ok = resultOk;
          payload = resultPayload;
        },
      ),
    );

    expect(ok).toBe(false);
    expect(payload).toMatchObject({ error: "E_FORBIDDEN" });
    expect(mockTonProvider.transfer).not.toHaveBeenCalled();
  });

  it("allows send for valid amount", async () => {
    const { createTonWalletSendHandler } = await import("./ton-handlers.js");
    const handler = createTonWalletSendHandler(buildConfig());

    let ok = false;
    let payload: unknown;
    await handler(
      buildHandlerOptions(
        {
          to: mockTonWallet.address,
          amount: "100",
        },
        (resultOk, resultPayload) => {
          ok = resultOk;
          payload = resultPayload;
        },
      ),
    );

    expect(ok).toBe(true);
    expect(payload).toMatchObject({ txHash: "0xtonhash", chain: "ton" });
    expect(mockTonProvider.transfer).toHaveBeenCalledWith(mockTonWallet.address, 100n);
  });

  it("rejects second send when daily cap is exceeded", async () => {
    const { createTonWalletSendHandler } = await import("./ton-handlers.js");
    const baseConfig = buildConfig();
    const basePolicy = baseConfig.policy.inlinePolicy!;
    const handler = createTonWalletSendHandler(
      buildConfig({
        policy: {
          ...baseConfig.policy,
          inlinePolicy: {
            ...basePolicy,
            budget: {
              ...basePolicy.budget,
              dailyCap: "150",
              perTxCap: "150",
            },
          },
        },
      }),
    );

    let firstOk = false;
    await handler(
      buildHandlerOptions(
        {
          to: mockTonWallet.address,
          amount: "100",
        },
        (resultOk) => {
          firstOk = resultOk;
        },
      ),
    );

    let secondOk = true;
    let secondPayload: unknown;
    await handler(
      buildHandlerOptions(
        {
          to: mockTonWallet.address,
          amount: "100",
        },
        (resultOk, resultPayload) => {
          secondOk = resultOk;
          secondPayload = resultPayload;
        },
      ),
    );

    expect(firstOk).toBe(true);
    expect(secondOk).toBe(false);
    expect(secondPayload).toMatchObject({ error: "E_FORBIDDEN" });
    expect(mockTonProvider.transfer).toHaveBeenCalledTimes(1);
  });

  it("enforces TON autopay policy under high-frequency small payments", async () => {
    const { createTonWalletAutopayHandler } = await import("./ton-handlers.js");
    const baseConfig = buildConfig();
    const basePolicy = baseConfig.policy.inlinePolicy!;
    const handler = createTonWalletAutopayHandler(
      buildConfig({
        policy: {
          ...baseConfig.policy,
          inlinePolicy: {
            ...basePolicy,
            budget: {
              ...basePolicy.budget,
              dailyCap: "100",
              perTxCap: "100",
            },
            scope: {
              ...basePolicy.scope,
              allowedTools: ["agent-wallet.autopay"],
            },
            autoPay: {
              enabled: true,
              maxRetries: 2,
            },
          },
        },
      }),
    );

    let firstOk = false;
    let firstPayload: unknown;
    await handler(
      buildHandlerOptions(
        {
          to: mockTonWallet.address,
          amount: "60",
        },
        (resultOk, resultPayload) => {
          firstOk = resultOk;
          firstPayload = resultPayload;
        },
      ),
    );

    let secondOk = true;
    let secondPayload: unknown;
    await handler(
      buildHandlerOptions(
        {
          to: mockTonWallet.address,
          amount: "60",
        },
        (resultOk, resultPayload) => {
          secondOk = resultOk;
          secondPayload = resultPayload;
        },
      ),
    );

    expect(firstOk).toBe(true);
    expect(firstPayload).toMatchObject({
      txHash: "0xtonhash",
      chain: "ton",
      policyAutoPayMaxRetries: 2,
    });
    expect(secondOk).toBe(false);
    expect(secondPayload).toMatchObject({ error: "E_FORBIDDEN" });
    expect(mockTonProvider.transfer).toHaveBeenCalledTimes(1);
  });

  it("accepts value alias for TON autopay", async () => {
    const { createTonWalletAutopayHandler } = await import("./ton-handlers.js");
    const baseConfig = buildConfig();
    const basePolicy = baseConfig.policy.inlinePolicy!;
    const handler = createTonWalletAutopayHandler(
      buildConfig({
        policy: {
          ...baseConfig.policy,
          inlinePolicy: {
            ...basePolicy,
            scope: {
              ...basePolicy.scope,
              allowedTools: ["agent-wallet.autopay"],
            },
            autoPay: {
              enabled: true,
              maxRetries: 1,
            },
          },
        },
      }),
    );

    let ok = false;
    let payload: unknown;
    await handler(
      buildHandlerOptions(
        {
          to: mockTonWallet.address,
          value: "50",
        },
        (resultOk, resultPayload) => {
          ok = resultOk;
          payload = resultPayload;
        },
      ),
    );

    expect(ok).toBe(true);
    expect(payload).toMatchObject({
      txHash: "0xtonhash",
      chain: "ton",
      policyAutoPayMaxRetries: 1,
    });
  });
});
