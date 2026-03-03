import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Web3StateStore } from "../state/store.js";
import { createBillingPaymentTraceQueryHandler } from "./payment-trace.js";

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

describe("web3.billing.paymentTrace.query", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-web3-payment-trace-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("queries payment trace by requestId and idempotencyKey", () => {
    const store = new Web3StateStore(tempDir);
    const queryHandler = createBillingPaymentTraceQueryHandler(store);

    store.savePaymentRequired({
      idempotencyKey: "idem-trace-1",
      requestId: "req-trace-1",
      toolName: "tools_invoke_payment_required",
      invoiceHash: "invoice-hash-1",
      createdAt: new Date().toISOString(),
      resumeToken: {
        invoiceId: "trace-inv-1",
        paymentReceiptId: "receipt-trace-1",
        txHash: "0xtxtrace1",
        chain: "evm",
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    const queryByRequestResponder = createResponder();
    queryHandler({
      params: { requestId: "req-trace-1" },
      respond: queryByRequestResponder.respond,
    } as any);

    expect(queryByRequestResponder.result()?.ok).toBe(true);
    expect(queryByRequestResponder.result()?.payload).toMatchObject({
      count: 1,
      records: [
        {
          requestId: "req-trace-1",
          idempotencyKey: "idem-trace-1",
          invoiceId: "trace-inv-1",
          toolName: "tools_invoke_payment_required",
        },
      ],
    });

    const queryByIdempotencyResponder = createResponder();
    queryHandler({
      params: { idempotencyKey: "idem-trace-1" },
      respond: queryByIdempotencyResponder.respond,
    } as any);

    expect(queryByIdempotencyResponder.result()?.ok).toBe(true);
    expect(queryByIdempotencyResponder.result()?.payload).toMatchObject({
      count: 1,
      records: [{ requestId: "req-trace-1", idempotencyKey: "idem-trace-1" }],
    });
  });

  it("requires requestId or idempotencyKey", () => {
    const store = new Web3StateStore(tempDir);
    const queryHandler = createBillingPaymentTraceQueryHandler(store);
    const responder = createResponder();

    queryHandler({ params: {}, respond: responder.respond } as any);

    expect(responder.result()?.ok).toBe(false);
    expect(responder.result()?.payload).toMatchObject({ error: "E_INVALID_ARGUMENT" });
  });
});
