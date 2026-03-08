import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import type { TaskBid, TaskOrder, TaskReceipt, TaskResult } from "../types.js";
import {
  createTaskBidPlaceHandler,
  createTaskBidListHandler,
  createTaskBidAwardHandler,
} from "./task-bid.js";
import {
  createTaskPublishHandler,
  createTaskGetHandler,
  createTaskListHandler,
  createTaskCancelHandler,
  createTaskExpireSweepHandler,
} from "./task-order.js";
import {
  createTaskResultSubmitHandler,
  createTaskResultReviewHandler,
  createTaskReceiptGetHandler,
  createTaskReceiptListHandler,
} from "./task-result.js";

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
    connect: {
      client: { id: "test-client" },
      role: "operator",
      scopes,
    },
  };
}

async function withStoreModes(
  tempDir: string,
  run: (input: {
    mode: "file" | "sqlite";
    store: MarketStateStore;
    config: ReturnType<typeof resolveConfig>;
  }) => Promise<void>,
) {
  for (const mode of ["file", "sqlite"] as const) {
    const modeDir = path.join(tempDir, mode);
    await fs.mkdir(modeDir, { recursive: true });
    const config = resolveConfig({
      store: { mode },
      settlement: { mode: "anchor_only" },
      access: { mode: "open", requireActor: true, requireActorMatch: true },
    });
    const store = new MarketStateStore(modeDir, config);
    await run({ mode, store, config });
  }
}

const FUTURE = new Date(Date.now() + 86400_000 * 30).toISOString();
const PAST = new Date(Date.now() - 86400_000).toISOString();

describe("task market handlers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-task-market-test-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  // ── TaskOrder: publish / get / list / cancel / expire ──

  describe("task.publish", () => {
    it("creates a task order with valid params", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const handler = createTaskPublishHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: {
            actorId: "creator-1",
            title: "Translate docs",
            requirements: ["fluent English"],
            budget: { amount: "100", currency: "USDC" },
            expiryAt: FUTURE,
          },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.taskId).toBeDefined();
        expect(result()?.payload.status).toBe("task_open");
        expect(result()?.payload.taskHash).toBeDefined();

        // verify persisted
        const task = store.getTask(result()!.payload.taskId as string);
        expect(task).toBeDefined();
        expect(task!.title).toBe("Translate docs");
        expect(task!.budget.amount).toBe("100");
      });
    });

    it("rejects missing title", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const handler = createTaskPublishHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: {
            actorId: "creator-1",
            requirements: ["general"],
            budget: { amount: "100", currency: "USDC" },
            expiryAt: FUTURE,
          },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(false);
      });
    });

    it("rejects invalid expiryAt", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const handler = createTaskPublishHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: {
            actorId: "creator-1",
            title: "Test",
            requirements: ["one"],
            budget: { amount: "50", currency: "USDC" },
            expiryAt: "not-a-date",
          },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(false);
      });
    });
  });

  describe("task.get", () => {
    it("retrieves published task", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        // publish first
        const pub = createTaskPublishHandler(store, config);
        const { respond: r1, result: res1 } = createResponder();
        await pub({
          params: {
            actorId: "creator-1",
            title: "Get test",
            requirements: ["r1"],
            budget: { amount: "200", currency: "USDC" },
            expiryAt: FUTURE,
          },
          respond: r1,
          client: createClient(),
        } as any);
        const taskId = res1()!.payload.taskId as string;

        const handler = createTaskGetHandler(store, config);
        const { respond, result } = createResponder();
        handler({
          params: { taskId },
          respond,
          client: createClient(["operator.read"]),
        } as any);
        expect(result()?.ok).toBe(true);
        expect((result()?.payload.task as TaskOrder).taskId).toBe(taskId);
      });
    });

    it("returns error for unknown taskId", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const handler = createTaskGetHandler(store, config);
        const { respond, result } = createResponder();
        handler({
          params: { taskId: "nonexistent" },
          respond,
          client: createClient(["operator.read"]),
        } as any);
        expect(result()?.ok).toBe(false);
      });
    });
  });

  describe("task.list", () => {
    it("lists tasks visible to creator", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const pub = createTaskPublishHandler(store, config);
        for (const title of ["A", "B", "C"]) {
          const { respond } = createResponder();
          await pub({
            params: {
              actorId: "creator-1",
              title,
              requirements: ["general"],
              budget: { amount: "10", currency: "USDC" },
              expiryAt: FUTURE,
            },
            respond,
            client: createClient(),
          } as any);
        }
        const handler = createTaskListHandler(store, config);
        const { respond, result } = createResponder();
        handler({
          params: { actorId: "creator-1" },
          respond,
          client: createClient(["operator.read"]),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.count).toBe(3);
      });
    });
  });

  describe("task.cancel", () => {
    it("cancels an open task", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const pub = createTaskPublishHandler(store, config);
        const { respond: r1, result: res1 } = createResponder();
        await pub({
          params: {
            actorId: "creator-1",
            title: "Cancel me",
            requirements: ["general"],
            budget: { amount: "10", currency: "USDC" },
            expiryAt: FUTURE,
          },
          respond: r1,
          client: createClient(),
        } as any);
        const taskId = res1()!.payload.taskId as string;

        const handler = createTaskCancelHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: { actorId: "creator-1", taskId, reason: "changed mind" },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.status).toBe("task_cancelled");

        const task = store.getTask(taskId)!;
        expect(task.status).toBe("task_cancelled");
        expect(task.cancellationReason).toBe("changed mind");
      });
    });

    it("rejects cancel by non-creator", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const pub = createTaskPublishHandler(store, config);
        const { respond: r1, result: res1 } = createResponder();
        await pub({
          params: {
            actorId: "creator-1",
            title: "Not yours",
            requirements: ["general"],
            budget: { amount: "10", currency: "USDC" },
            expiryAt: FUTURE,
          },
          respond: r1,
          client: createClient(),
        } as any);
        const taskId = res1()!.payload.taskId as string;

        const handler = createTaskCancelHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: { actorId: "other-actor", taskId },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(false);
      });
    });
  });

  describe("task.expireSweep", () => {
    it("expires overdue open tasks", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const pub = createTaskPublishHandler(store, config);
        // Publish with past expiry
        const { respond: r1, result: res1 } = createResponder();
        await pub({
          params: {
            actorId: "creator-1",
            title: "Expired",
            requirements: ["general"],
            budget: { amount: "10", currency: "USDC" },
            expiryAt: PAST,
          },
          respond: r1,
          client: createClient(),
        } as any);
        expect(res1()?.ok).toBe(true);

        // Also publish a future task that should NOT expire
        const { respond: r2 } = createResponder();
        await pub({
          params: {
            actorId: "creator-1",
            title: "Active",
            requirements: ["general"],
            budget: { amount: "10", currency: "USDC" },
            expiryAt: FUTURE,
          },
          respond: r2,
          client: createClient(),
        } as any);

        const handler = createTaskExpireSweepHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: {},
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.expiredCount).toBe(1);
      });
    });
  });

  // ── TaskBid: place / list / award ──

  describe("task.bid.place", () => {
    it("places a bid on an open task", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const { taskId } = await publishTask(store, config);

        const handler = createTaskBidPlaceHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: {
            actorId: "bidder-1",
            taskId,
            price: "80",
            currency: "USDC",
            etaHours: 48,
          },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.bidId).toBeDefined();
        expect(result()?.payload.status).toBe("bid_submitted");
      });
    });

    it("rejects bid with mismatched currency", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const { taskId } = await publishTask(store, config);

        const handler = createTaskBidPlaceHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: { actorId: "bidder-1", taskId, price: "80", currency: "ETH" },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(false);
      });
    });

    it("rejects bid on non-open task", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const { taskId } = await publishTask(store, config);
        // Cancel the task first
        const cancel = createTaskCancelHandler(store, config);
        const { respond: r1 } = createResponder();
        await cancel({
          params: { actorId: "creator-1", taskId },
          respond: r1,
          client: createClient(),
        } as any);

        const handler = createTaskBidPlaceHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: { actorId: "bidder-1", taskId, price: "80", currency: "USDC" },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(false);
      });
    });
  });

  describe("task.bid.list", () => {
    it("lists bids for a task", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const { taskId } = await publishTask(store, config);
        const handler = createTaskBidPlaceHandler(store, config);
        for (const bidder of ["bidder-1", "bidder-2"]) {
          const { respond } = createResponder();
          await handler({
            params: { actorId: bidder, taskId, price: "50", currency: "USDC" },
            respond,
            client: createClient(),
          } as any);
        }

        const list = createTaskBidListHandler(store, config);
        const { respond, result } = createResponder();
        list({
          params: { actorId: "creator-1", taskId },
          respond,
          client: createClient(["operator.read"]),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.count).toBe(2);
      });
    });
  });

  describe("task.bid.award", () => {
    it("awards a bid, creates order + settlement, rejects other bids", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const { taskId } = await publishTask(store, config);

        // Place two bids
        const bidPlace = createTaskBidPlaceHandler(store, config);
        const { respond: r1, result: res1 } = createResponder();
        await bidPlace({
          params: { actorId: "bidder-1", taskId, price: "80", currency: "USDC" },
          respond: r1,
          client: createClient(),
        } as any);
        const winBidId = res1()!.payload.bidId as string;

        const { respond: r2, result: res2 } = createResponder();
        await bidPlace({
          params: { actorId: "bidder-2", taskId, price: "90", currency: "USDC" },
          respond: r2,
          client: createClient(),
        } as any);
        const loseBidId = res2()!.payload.bidId as string;

        // Award
        const award = createTaskBidAwardHandler(store, config);
        const { respond, result } = createResponder();
        await award({
          params: { actorId: "creator-1", bidId: winBidId },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.status).toBe("task_awarded");
        expect(result()?.payload.orderId).toBeDefined();
        expect(result()?.payload.settlementId).toBeDefined();

        // Verify task state
        const task = store.getTask(taskId)!;
        expect(task.status).toBe("task_awarded");
        expect(task.awardedBidId).toBe(winBidId);

        // Verify losing bid rejected
        const loseBid = store.getTaskBid(loseBidId)!;
        expect(loseBid.status).toBe("bid_rejected");

        // Verify winning bid accepted
        const winBid = store.getTaskBid(winBidId)!;
        expect(winBid.status).toBe("bid_accepted");
      });
    });

    it("rejects award by non-creator", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const { taskId } = await publishTask(store, config);
        const bidPlace = createTaskBidPlaceHandler(store, config);
        const { respond: r1, result: res1 } = createResponder();
        await bidPlace({
          params: { actorId: "bidder-1", taskId, price: "80", currency: "USDC" },
          respond: r1,
          client: createClient(),
        } as any);

        const award = createTaskBidAwardHandler(store, config);
        const { respond, result } = createResponder();
        await award({
          params: { actorId: "wrong-actor", bidId: res1()!.payload.bidId as string },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(false);
      });
    });
  });

  // ── TaskResult: submit / review (accept + reject) / receipt ──

  describe("task.result.submit", () => {
    it("submits a result for an awarded task", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const ctx = await publishAndAward(store, config);

        const handler = createTaskResultSubmitHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: {
            actorId: "bidder-1",
            taskId: ctx.taskId,
            artifacts: ["https://example.com/artifact"],
            summary: "Done",
          },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.resultId).toBeDefined();
        expect(result()?.payload.status).toBe("result_submitted");
      });
    });

    it("rejects submission by non-deliverer", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const ctx = await publishAndAward(store, config);

        const handler = createTaskResultSubmitHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: {
            actorId: "wrong-actor",
            taskId: ctx.taskId,
            artifacts: ["https://example.com/artifact"],
          },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(false);
      });
    });
  });

  describe("task.result.review (accept)", () => {
    it("accepts result → closes task, creates settled receipt", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const ctx = await publishAwardAndSubmit(store, config);

        const handler = createTaskResultReviewHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: {
            actorId: "creator-1",
            resultId: ctx.resultId,
            decision: "accept",
          },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.status).toBe("result_accepted");
        expect(result()?.payload.receiptStatus).toBe("receipt_settled");

        // Verify task closed
        const task = store.getTask(ctx.taskId)!;
        expect(task.status).toBe("task_closed");
        expect(task.closedAt).toBeDefined();

        // Verify receipt persisted
        const receiptId = result()!.payload.receiptId as string;
        const receipt = store.getTaskReceipt(receiptId)!;
        expect(receipt.status).toBe("receipt_settled");
        expect(receipt.settledAt).toBeDefined();
      });
    });
  });

  describe("task.result.review (reject)", () => {
    it("rejects result → creates disputed receipt + opens dispute", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const ctx = await publishAwardAndSubmit(store, config);

        const handler = createTaskResultReviewHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: {
            actorId: "creator-1",
            resultId: ctx.resultId,
            decision: "reject",
            note: "quality too low",
          },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.status).toBe("result_rejected");
        expect(result()?.payload.receiptStatus).toBe("receipt_disputed");
        expect(result()?.payload.disputeId).toBeDefined();
      });
    });
  });

  describe("task.receipt.get / list", () => {
    it("gets and lists receipts after acceptance", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const ctx = await publishAwardAndSubmit(store, config);

        // Accept
        const review = createTaskResultReviewHandler(store, config);
        const { respond: r1, result: res1 } = createResponder();
        await review({
          params: { actorId: "creator-1", resultId: ctx.resultId, decision: "accept" },
          respond: r1,
          client: createClient(),
        } as any);
        const receiptId = res1()!.payload.receiptId as string;

        // Get
        const getH = createTaskReceiptGetHandler(store, config);
        const { respond: r2, result: res2 } = createResponder();
        getH({
          params: { receiptId },
          respond: r2,
          client: createClient(["operator.read"]),
        } as any);
        expect(res2()?.ok).toBe(true);
        expect((res2()?.payload.receipt as TaskReceipt).receiptId).toBe(receiptId);

        // List
        const listH = createTaskReceiptListHandler(store, config);
        const { respond: r3, result: res3 } = createResponder();
        listH({
          params: { taskId: ctx.taskId },
          respond: r3,
          client: createClient(["operator.read"]),
        } as any);
        expect(res3()?.ok).toBe(true);
        expect(res3()?.payload.count).toBe(1);
      });
    });
  });

  // ── Full lifecycle: publish → bid → award → submit → accept ──

  describe("full lifecycle", () => {
    it("runs the complete happy path in both store modes", async () => {
      await withStoreModes(tempDir, async ({ mode, store, config }) => {
        // 1. Publish
        const pub = createTaskPublishHandler(store, config);
        const { respond: r1, result: res1 } = createResponder();
        await pub({
          params: {
            actorId: "creator-1",
            title: `Lifecycle ${mode}`,
            requirements: ["req-a"],
            budget: { amount: "500", currency: "USDC" },
            expiryAt: FUTURE,
          },
          respond: r1,
          client: createClient(),
        } as any);
        expect(res1()?.ok).toBe(true);
        const taskId = res1()!.payload.taskId as string;

        // 2. Bid
        const bidH = createTaskBidPlaceHandler(store, config);
        const { respond: r2, result: res2 } = createResponder();
        await bidH({
          params: { actorId: "bidder-1", taskId, price: "400", currency: "USDC" },
          respond: r2,
          client: createClient(),
        } as any);
        expect(res2()?.ok).toBe(true);
        const bidId = res2()!.payload.bidId as string;

        // 3. Award
        const awardH = createTaskBidAwardHandler(store, config);
        const { respond: r3, result: res3 } = createResponder();
        await awardH({
          params: { actorId: "creator-1", bidId },
          respond: r3,
          client: createClient(),
        } as any);
        expect(res3()?.ok).toBe(true);
        expect(res3()?.payload.status).toBe("task_awarded");

        // 4. Submit result
        const submitH = createTaskResultSubmitHandler(store, config);
        const { respond: r4, result: res4 } = createResponder();
        await submitH({
          params: {
            actorId: "bidder-1",
            taskId,
            artifacts: ["https://example.com/result.zip"],
          },
          respond: r4,
          client: createClient(),
        } as any);
        expect(res4()?.ok).toBe(true);
        const resultId = res4()!.payload.resultId as string;

        // 5. Accept
        const reviewH = createTaskResultReviewHandler(store, config);
        const { respond: r5, result: res5 } = createResponder();
        await reviewH({
          params: { actorId: "creator-1", resultId, decision: "accept" },
          respond: r5,
          client: createClient(),
        } as any);
        expect(res5()?.ok).toBe(true);
        expect(res5()?.payload.status).toBe("result_accepted");

        // Final state checks
        const task = store.getTask(taskId)!;
        expect(task.status).toBe("task_closed");
        const receipts = store.listTaskReceipts({ taskId });
        expect(receipts).toHaveLength(1);
        expect(receipts[0].status).toBe("receipt_settled");
      });
    });
  });
});

// ── Helper: publish a task ──

async function publishTask(
  store: MarketStateStore,
  config: ReturnType<typeof resolveConfig>,
): Promise<{ taskId: string }> {
  const handler = createTaskPublishHandler(store, config);
  const { respond, result } = createResponder();
  await handler({
    params: {
      actorId: "creator-1",
      title: "Test task",
      requirements: ["req-1"],
      budget: { amount: "100", currency: "USDC" },
      expiryAt: FUTURE,
    },
    respond,
    client: createClient(),
  } as any);
  if (!result()?.ok) throw new Error("publishTask failed");
  return { taskId: result()!.payload.taskId as string };
}

// ── Helper: publish + bid + award ──

async function publishAndAward(
  store: MarketStateStore,
  config: ReturnType<typeof resolveConfig>,
): Promise<{ taskId: string; bidId: string; orderId: string; settlementId: string }> {
  const { taskId } = await publishTask(store, config);

  const bidH = createTaskBidPlaceHandler(store, config);
  const { respond: r1, result: res1 } = createResponder();
  await bidH({
    params: { actorId: "bidder-1", taskId, price: "80", currency: "USDC" },
    respond: r1,
    client: createClient(),
  } as any);
  if (!res1()?.ok) throw new Error("bid failed");
  const bidId = res1()!.payload.bidId as string;

  const awardH = createTaskBidAwardHandler(store, config);
  const { respond: r2, result: res2 } = createResponder();
  await awardH({
    params: { actorId: "creator-1", bidId },
    respond: r2,
    client: createClient(),
  } as any);
  if (!res2()?.ok) throw new Error("award failed");
  return {
    taskId,
    bidId,
    orderId: res2()!.payload.orderId as string,
    settlementId: res2()!.payload.settlementId as string,
  };
}

// ── Helper: publish + bid + award + submit result ──

async function publishAwardAndSubmit(
  store: MarketStateStore,
  config: ReturnType<typeof resolveConfig>,
): Promise<{
  taskId: string;
  bidId: string;
  resultId: string;
  orderId: string;
  settlementId: string;
}> {
  const ctx = await publishAndAward(store, config);

  const submitH = createTaskResultSubmitHandler(store, config);
  const { respond, result } = createResponder();
  await submitH({
    params: {
      actorId: "bidder-1",
      taskId: ctx.taskId,
      artifacts: ["https://example.com/artifact.zip"],
    },
    respond,
    client: createClient(),
  } as any);
  if (!result()?.ok) throw new Error("submit result failed");
  return {
    ...ctx,
    resultId: result()!.payload.resultId as string,
  };
}
