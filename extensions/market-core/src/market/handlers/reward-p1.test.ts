import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveConfig, type MarketPluginConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import {
  createRewardCreateHandler,
  createRewardIssueClaimHandler,
  createRewardUpdateStatusHandler,
} from "./reward.js";

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
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reward-p1-test-"));
  config = resolveConfig({ access: { mode: "open" } });
  store = new MarketStateStore(tempDir, config);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("P1 Fix: Server-side deadline validation", () => {
  it("rejects issueClaim if reward deadline has passed", async () => {
    const createHandler = createRewardCreateHandler(store, config);
    const issueHandler = createRewardIssueClaimHandler(store, config);

    const r1 = createResponder();
    const pastDeadline = new Date(Date.now() - 3600_000).toISOString(); // 1 hour ago

    await createHandler({
      params: {
        rewardId: "expired-reward",
        network: "sepolia",
        recipient: "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01",
        amount: "1000",
        eventHash: "0x" + "aa".repeat(32),
        deadline: pastDeadline,
        asset: { type: "erc20", tokenAddress: "0x1234567890123456789012345678901234567890" },
      },
      respond: r1.respond,
      client: createClient(),
    } as any);
    expect(r1.result()!.ok).toBe(true);

    const r2 = createResponder();
    await issueHandler({
      params: { rewardId: "expired-reward" },
      respond: r2.respond,
      client: createClient(),
    } as any);

    expect(r2.result()!.ok).toBe(false);
    expect((r2.result()!.payload as any).error).toBe("E_EXPIRED");
  });
});

describe("P1 Fix: createRewardUpdateStatusHandler", () => {
  it("updates reward status and records audit with txHash", async () => {
    const createHandler = createRewardCreateHandler(store, config);
    const updateHandler = createRewardUpdateStatusHandler(store, config);

    // 1. Create reward
    const r1 = createResponder();
    await createHandler({
      params: {
        rewardId: "status-update-test",
        recipient: "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01",
        amount: "1000",
        eventHash: "0x" + "bb".repeat(32),
        asset: { type: "erc20", tokenAddress: "0x1234567890123456789012345678901234567890" },
      },
      respond: r1.respond,
      client: createClient(),
    } as any);

    // 1.5 Manually transition to claim_issued (simulating what issueClaimHandler would do if it had keys)
    const reward = store.getReward("status-update-test")!;
    store.saveReward({ ...reward, status: "claim_issued" });

    // 2. Update to onchain_submitted
    const r2 = createResponder();
    await updateHandler({
      params: {
        rewardId: "status-update-test",
        status: "onchain_submitted",
        txHash: "0xhash123",
      },
      respond: r2.respond,
      client: createClient(),
    } as any);
    expect(r2.result()!.ok).toBe(true);
    let updated = r2.result()!.payload as any;
    expect(updated.status).toBe("onchain_submitted");
    expect(updated.onchain.txHash).toBe("0xhash123");

    // 3. Update to onchain_confirmed
    const r3 = createResponder();
    await updateHandler({
      params: {
        rewardId: "status-update-test",
        status: "onchain_confirmed",
      },
      respond: r3.respond,
      client: createClient(),
    } as any);
    expect(r3.result()!.ok).toBe(true);
    updated = r3.result()!.payload as any;
    expect(updated.status).toBe("onchain_confirmed");
    expect(updated.onchain.confirmedAt).toBeDefined();

    // 4. Verify audit trail
    const auditEvents = store.readAuditEvents();
    const updateEvent = auditEvents
      .filter((e) => e.kind === "reward_status_updated" && e.refId === "status-update-test")
      .at(-1);
    expect(updateEvent).toBeDefined();
    expect((updateEvent!.details as any).newStatus).toBe("onchain_confirmed");
  });

  it("rejects invalid transitions", async () => {
    const createHandler = createRewardCreateHandler(store, config);
    const updateHandler = createRewardUpdateStatusHandler(store, config);

    await createHandler({
      params: {
        rewardId: "invalid-transition-test",
        recipient: "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01",
        amount: "1000",
        eventHash: "0x" + "cc".repeat(32),
        asset: { type: "erc20", tokenAddress: "0x1234567890123456789012345678901234567890" },
      },
      respond: () => {},
      client: createClient(),
    } as any);

    const r = createResponder();
    // Cannot jump from reward_created straight to onchain_confirmed (must be submitted or claim_issued first depending on flow)
    // Actually, check state-machine.ts for allowed transitions.
    // Usually: reward_created -> claim_issued -> onchain_submitted -> onchain_confirmed
    await updateHandler({
      params: {
        rewardId: "invalid-transition-test",
        status: "onchain_confirmed",
      },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
    expect((r.result()!.payload as any).error).toBe("E_INVALID_ARGUMENT");
  });
});
