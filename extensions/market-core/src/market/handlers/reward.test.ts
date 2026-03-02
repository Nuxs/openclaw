import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveConfig, type MarketPluginConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import {
  createRewardCreateHandler,
  createRewardGetHandler,
  createRewardIssueClaimHandler,
  createRewardListHandler,
} from "./reward.js";

// Mock viem for EIP-712 signing tests
vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return { ...actual };
});
vi.mock("viem/accounts", async () => {
  const actual = await vi.importActual<typeof import("viem/accounts")>("viem/accounts");
  return { ...actual };
});

type HandlerResult = { ok: boolean; payload: Record<string, unknown> } | undefined;

function createResponder() {
  let result: HandlerResult;
  return {
    respond: (ok: boolean, payload: Record<string, unknown>) => {
      result = { ok, payload };
    },
    result: () => result,
  };
}

function createClient(scopes = ["operator.write"]) {
  return {
    connect: { client: { id: "gateway-client" }, role: "operator", scopes },
  };
}

let tempDir: string;
let store: MarketStateStore;
let config: MarketPluginConfig;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reward-test-"));
  config = resolveConfig({ access: { mode: "open" } });
  store = new MarketStateStore(tempDir, config);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("createRewardCreateHandler", () => {
  it("creates a reward grant with all fields", async () => {
    const handler = createRewardCreateHandler(store, config);
    const r = createResponder();
    await handler({
      params: {
        rewardId: "reward-1",
        network: "sepolia",
        recipient: "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01",
        amount: "1000000",
        eventHash: "0x" + "ab".repeat(32),
        nonce: "0xdeadbeef",
        deadline: new Date(Date.now() + 600_000).toISOString(),
        asset: { type: "erc20", tokenAddress: "0x1234567890123456789012345678901234567890" },
      },
      respond: r.respond,
      client: createClient(),
    } as any);

    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as any;
    expect(payload.rewardId).toBe("reward-1");
    expect(payload.chainFamily).toBe("evm");
    expect(payload.status).toBe("reward_created");
    // Recipient should be lowercased for EVM
    expect(payload.recipient).toBe("0xabcdef0123456789abcdef0123456789abcdef01");
  });

  it("returns existing reward on idempotent create (same rewardId)", async () => {
    const handler = createRewardCreateHandler(store, config);
    const params = {
      rewardId: "reward-idempotent",
      recipient: "0xabcdef0123456789abcdef0123456789abcdef01",
      amount: "5000",
      eventHash: "0x" + "cc".repeat(32),
      asset: { type: "erc20", tokenAddress: "0x1234567890123456789012345678901234567890" },
    };

    const r1 = createResponder();
    await handler({ params, respond: r1.respond, client: createClient() } as any);
    expect(r1.result()!.ok).toBe(true);

    // Second call with same rewardId should return same reward
    const r2 = createResponder();
    await handler({ params, respond: r2.respond, client: createClient() } as any);
    expect(r2.result()!.ok).toBe(true);
    expect((r2.result()!.payload as any).rewardId).toBe("reward-idempotent");
  });

  it("rejects duplicate nonce", async () => {
    const handler = createRewardCreateHandler(store, config);
    const baseParams = {
      recipient: "0xabcdef0123456789abcdef0123456789abcdef01",
      amount: "5000",
      eventHash: "0x" + "dd".repeat(32),
      nonce: "0xfixednonce",
      asset: { type: "erc20", tokenAddress: "0x1234567890123456789012345678901234567890" },
    };

    const r1 = createResponder();
    await handler({
      params: { ...baseParams, rewardId: "r1" },
      respond: r1.respond,
      client: createClient(),
    } as any);
    expect(r1.result()!.ok).toBe(true);

    // Different rewardId but same nonce for same recipient → conflict
    const r2 = createResponder();
    await handler({
      params: { ...baseParams, rewardId: "r2" },
      respond: r2.respond,
      client: createClient(),
    } as any);
    expect(r2.result()!.ok).toBe(false);
    expect((r2.result()!.payload as any).error).toBe("E_CONFLICT");
  });

  it("rejects when rewards are disabled", async () => {
    const disabledConfig = resolveConfig({
      access: { mode: "open" },
      rewards: { enabled: false },
    });
    const handler = createRewardCreateHandler(store, disabledConfig);
    const r = createResponder();
    await handler({
      params: {
        recipient: "0xabcdef0123456789abcdef0123456789abcdef01",
        amount: "5000",
        eventHash: "0x" + "ee".repeat(32),
        asset: { type: "erc20", tokenAddress: "0x1234567890123456789012345678901234567890" },
      },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
    expect((r.result()!.payload as any).error).toBe("E_UNAVAILABLE");
  });

  it("infers TON chain family from network prefix", async () => {
    const handler = createRewardCreateHandler(store, config);
    const r = createResponder();
    await handler({
      params: {
        network: "ton-testnet",
        recipient: "EQC1234567890",
        amount: "1000000000",
        eventHash: "0x" + "ff".repeat(32),
        asset: { type: "ton" },
      },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(true);
    expect((r.result()!.payload as any).chainFamily).toBe("ton");
  });
});

describe("createRewardGetHandler", () => {
  it("retrieves a stored reward", async () => {
    // Seed a reward via create handler
    const createHandler = createRewardCreateHandler(store, config);
    const cr = createResponder();
    await createHandler({
      params: {
        rewardId: "get-test",
        recipient: "0xabcdef0123456789abcdef0123456789abcdef01",
        amount: "100",
        eventHash: "0x" + "aa".repeat(32),
        asset: { type: "erc20", tokenAddress: "0x1234567890123456789012345678901234567890" },
      },
      respond: cr.respond,
      client: createClient(),
    } as any);
    expect(cr.result()!.ok).toBe(true);

    const getHandler = createRewardGetHandler(store, config);
    const r = createResponder();
    getHandler({
      params: { rewardId: "get-test" },
      respond: r.respond,
      client: createClient(["operator.read"]),
    } as any);
    expect(r.result()!.ok).toBe(true);
    expect((r.result()!.payload as any).rewardId).toBe("get-test");
  });

  it("returns not found for missing reward", () => {
    const handler = createRewardGetHandler(store, config);
    const r = createResponder();
    handler({
      params: { rewardId: "does-not-exist" },
      respond: r.respond,
      client: createClient(["operator.read"]),
    } as any);
    expect(r.result()!.ok).toBe(false);
    expect((r.result()!.payload as any).error).toBe("E_NOT_FOUND");
  });
});

describe("createRewardListHandler", () => {
  it("lists rewards filtered by recipient", async () => {
    const createHandler = createRewardCreateHandler(store, config);
    const addr = "0xabcdef0123456789abcdef0123456789abcdef01";

    for (let i = 0; i < 3; i++) {
      const r = createResponder();
      await createHandler({
        params: {
          rewardId: `list-${i}`,
          recipient: addr,
          amount: String(100 * (i + 1)),
          eventHash: `0x${"0".repeat(63)}${i}`,
          asset: { type: "erc20", tokenAddress: "0x1234567890123456789012345678901234567890" },
        },
        respond: r.respond,
        client: createClient(),
      } as any);
    }

    const listHandler = createRewardListHandler(store, config);
    const r = createResponder();
    listHandler({
      params: { recipient: addr },
      respond: r.respond,
      client: createClient(["operator.read"]),
    } as any);
    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as any;
    expect(payload.count).toBe(3);
    expect(payload.rewards.length).toBe(3);
  });
});

describe("createRewardIssueClaimHandler", () => {
  it("rejects claim for non-existent reward", async () => {
    const handler = createRewardIssueClaimHandler(store, config);
    const r = createResponder();
    await handler({
      params: { rewardId: "missing" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
    expect((r.result()!.payload as any).error).toBe("E_NOT_FOUND");
  });

  it("rejects claim for reward in wrong status (already claimed)", async () => {
    // Create reward
    const createHandler = createRewardCreateHandler(store, config);
    const cr = createResponder();
    await createHandler({
      params: {
        rewardId: "status-test",
        recipient: "0xabcdef0123456789abcdef0123456789abcdef01",
        amount: "500",
        eventHash: "0x" + "bb".repeat(32),
        nonce: "0xdeadbeef01",
        asset: { type: "erc20", tokenAddress: "0x1234567890123456789012345678901234567890" },
      },
      respond: cr.respond,
      client: createClient(),
    } as any);

    // Manually update status to claim_issued
    const reward = store.getReward("status-test")!;
    store.saveReward({ ...reward, status: "claim_issued" });

    const handler = createRewardIssueClaimHandler(store, config);
    const r = createResponder();
    await handler({
      params: { rewardId: "status-test" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
    expect((r.result()!.payload as any).error).toBe("E_CONFLICT");
  });

  it("rejects claim for TON chain family (not yet implemented)", async () => {
    const createHandler = createRewardCreateHandler(store, config);
    const cr = createResponder();
    await createHandler({
      params: {
        rewardId: "ton-claim-test",
        network: "ton-testnet",
        recipient: "EQC1234567890",
        amount: "1000000000",
        eventHash: "0x" + "cc".repeat(32),
        asset: { type: "ton" },
      },
      respond: cr.respond,
      client: createClient(),
    } as any);

    const handler = createRewardIssueClaimHandler(store, config);
    const r = createResponder();
    await handler({
      params: { rewardId: "ton-claim-test" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
    expect((r.result()!.payload as any).error).toBe("E_UNAVAILABLE");
  });

  it("rejects when rewards are disabled", async () => {
    // Create with enabled config, then try to issue claim with disabled
    const createHandler = createRewardCreateHandler(store, config);
    const cr = createResponder();
    await createHandler({
      params: {
        rewardId: "disabled-claim",
        recipient: "0xabcdef0123456789abcdef0123456789abcdef01",
        amount: "100",
        eventHash: "0x" + "dd".repeat(32),
        asset: { type: "erc20", tokenAddress: "0x1234567890123456789012345678901234567890" },
      },
      respond: cr.respond,
      client: createClient(),
    } as any);

    const disabledConfig = resolveConfig({
      access: { mode: "open" },
      rewards: { enabled: false },
    });
    const handler = createRewardIssueClaimHandler(store, disabledConfig);
    const r = createResponder();
    await handler({
      params: { rewardId: "disabled-claim" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
    expect((r.result()!.payload as any).error).toBe("E_UNAVAILABLE");
  });

  it("rejects claim when privateKey is missing", async () => {
    const createHandler = createRewardCreateHandler(store, config);
    const cr = createResponder();
    await createHandler({
      params: {
        rewardId: "no-key",
        recipient: "0xabcdef0123456789abcdef0123456789abcdef01",
        amount: "100",
        eventHash: "0x" + "ee".repeat(32),
        asset: { type: "erc20", tokenAddress: "0x1234567890123456789012345678901234567890" },
      },
      respond: cr.respond,
      client: createClient(),
    } as any);

    // Config without privateKey
    const noKeyConfig = resolveConfig({ access: { mode: "open" } });
    const handler = createRewardIssueClaimHandler(store, noKeyConfig);
    const r = createResponder();
    await handler({
      params: { rewardId: "no-key" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
    expect((r.result()!.payload as any).error).toBe("E_INVALID_ARGUMENT");
  });
});

describe("state machine transitions", () => {
  it("allows retry from onchain_failed back to claim_issued", async () => {
    // Create and manually set to onchain_failed
    const createHandler = createRewardCreateHandler(store, config);
    const cr = createResponder();
    await createHandler({
      params: {
        rewardId: "retry-test",
        recipient: "0xabcdef0123456789abcdef0123456789abcdef01",
        amount: "100",
        eventHash: "0x" + "ff".repeat(32),
        nonce: "0xdeadbeef02",
        asset: { type: "erc20", tokenAddress: "0x1234567890123456789012345678901234567890" },
      },
      respond: cr.respond,
      client: createClient(),
    } as any);

    // Simulate failed on-chain submission → set to onchain_failed
    const reward = store.getReward("retry-test")!;
    store.saveReward({ ...reward, status: "onchain_failed" });

    // issueClaim should allow retry from onchain_failed (but will fail due to no privateKey)
    const noKeyConfig = resolveConfig({ access: { mode: "open" } });
    const handler = createRewardIssueClaimHandler(store, noKeyConfig);
    const r = createResponder();
    await handler({
      params: { rewardId: "retry-test" },
      respond: r.respond,
      client: createClient(),
    } as any);
    // Should fail at privateKey check, not at status check
    expect(r.result()!.ok).toBe(false);
    expect((r.result()!.payload as any).error).toBe("E_INVALID_ARGUMENT");
  });
});

describe("audit anchoring", () => {
  it("records audit events with canonical hash on create", async () => {
    const handler = createRewardCreateHandler(store, config);
    const r = createResponder();
    await handler({
      params: {
        rewardId: "audit-test",
        recipient: "0xabcdef0123456789abcdef0123456789abcdef01",
        amount: "100",
        eventHash: "0x" + "11".repeat(32),
        asset: { type: "erc20", tokenAddress: "0x1234567890123456789012345678901234567890" },
      },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(true);

    // Verify audit event was recorded
    const events = store.readAuditEvents();
    const rewardEvent = events.find((e) => e.kind === "reward_created" && e.refId === "audit-test");
    expect(rewardEvent).toBeDefined();
    expect(rewardEvent!.hash).toBeDefined();
    // Canonical hash should be a 0x-prefixed SHA-256 string
    expect(rewardEvent!.hash!.startsWith("0x")).toBe(true);
    expect(rewardEvent!.hash!.length).toBe(66);
  });
});
