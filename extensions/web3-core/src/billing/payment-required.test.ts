import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import { Web3StateStore } from "../state/store.js";
import { createBillingHandlePaymentRequiredHandler } from "./payment-required.js";

type BillingGatewayResponse =
  | {
      ok: true;
      result: {
        txHash: string;
        chain?: "evm" | "ton";
        network?: string;
        policyAutoPayMaxRetries?: number;
      };
    }
  | {
      ok: false;
      error: string;
    };

const mockCallGateway = vi.fn<() => Promise<BillingGatewayResponse>>(async () => ({
  ok: true,
  result: { txHash: "0xtxhash" },
}));

vi.mock("../market/proxy-utils.js", async () => {
  const actual = (await vi.importActual("../market/proxy-utils.js")) as Record<string, unknown>;
  return {
    ...actual,
    loadCallGateway: async () => mockCallGateway,
  };
});

type HandlerResult = { ok: boolean; payload: Record<string, unknown> } | undefined;

type Invoice = {
  invoiceId: string;
  provider: string;
  chain: "evm" | "ton";
  asset: string;
  amount: string;
  payTo: string;
  nonce: string;
  expiresAt: string;
  idempotencyKey: string;
};

function encodeInvoice(invoice: Invoice): string {
  return Buffer.from(JSON.stringify(invoice)).toString("base64");
}

function createResponder() {
  let result: HandlerResult;
  return {
    respond: (ok: boolean, payload: Record<string, unknown>) => {
      result = { ok, payload };
    },
    result: () => result,
  };
}

describe("web3.billing.handlePaymentRequired", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-web3-billing-test-"));
    mockCallGateway.mockClear();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("stores idempotency and reuses resume token", async () => {
    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({});
    const handler = createBillingHandlePaymentRequiredHandler(store, config);
    const invoice: Invoice = {
      invoiceId: "inv-1",
      provider: "provider-1",
      chain: "evm",
      asset: "ETH",
      amount: "10",
      payTo: "0x0000000000000000000000000000000000000002",
      nonce: "nonce-1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: "idem-1",
    };

    const firstResponder = createResponder();
    await handler({
      params: {
        invoice: encodeInvoice(invoice),
        requestId: "req-store-1",
        tool: "tools_invoke_payment_required",
      },
      respond: firstResponder.respond,
    } as any);

    expect(firstResponder.result()?.ok).toBe(true);
    const firstPayload = firstResponder.result()?.payload ?? {};
    expect(firstPayload.reused).toBe(false);
    expect(firstPayload.resumeToken).toMatchObject({ invoiceId: "inv-1", chain: "evm" });
    expect(firstPayload.paymentReceipt).toMatchObject({
      chain: "evm",
      mode: "live",
      txHash: "0xtxhash",
      amount: "10",
    });
    expect(firstPayload.trace).toMatchObject({
      requestId: "req-store-1",
      idempotencyKey: "idem-1",
      invoiceId: "inv-1",
      toolName: "tools_invoke_payment_required",
    });
    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "agent-wallet.autopay",
        params: expect.objectContaining({
          chain: "evm",
          value: "10",
          amount: "10",
        }),
      }),
    );

    const secondResponder = createResponder();
    await handler({
      params: { invoice: encodeInvoice(invoice) },
      respond: secondResponder.respond,
    } as any);

    expect(secondResponder.result()?.ok).toBe(true);
    const secondPayload = secondResponder.result()?.payload ?? {};
    expect(secondPayload.reused).toBe(true);
    expect(secondPayload.resumeToken).toMatchObject({ invoiceId: "inv-1", chain: "evm" });
    expect(secondPayload.paymentReceipt).toMatchObject({
      chain: "evm",
      mode: "live",
      txHash: "0xtxhash",
      amount: "10",
    });
    expect(secondPayload.trace).toMatchObject({
      requestId: "req-store-1",
      idempotencyKey: "idem-1",
      invoiceId: "inv-1",
      toolName: "tools_invoke_payment_required",
    });
  });

  it("preserves network in reused payment receipt for TON invoice", async () => {
    mockCallGateway.mockResolvedValueOnce({
      ok: true,
      result: { txHash: "0xtonhash", chain: "ton", network: "ton-testnet" },
    });

    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({});
    const handler = createBillingHandlePaymentRequiredHandler(store, config);
    const invoice: Invoice = {
      invoiceId: "inv-reuse-net",
      provider: "provider-reuse-net",
      chain: "ton",
      asset: "TON",
      amount: "7",
      payTo: "EQC_REUSE_ADDRESS",
      nonce: "nonce-reuse-net",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: "idem-reuse-net",
    };

    const firstResponder = createResponder();
    await handler({
      params: { invoice: encodeInvoice(invoice) },
      respond: firstResponder.respond,
    } as any);

    expect(firstResponder.result()?.ok).toBe(true);
    const firstPayload = firstResponder.result()?.payload ?? {};
    expect(firstPayload.paymentReceipt).toMatchObject({
      chain: "ton",
      network: "ton-testnet",
    });

    const secondResponder = createResponder();
    await handler({
      params: { invoice: encodeInvoice(invoice) },
      respond: secondResponder.respond,
    } as any);

    expect(secondResponder.result()?.ok).toBe(true);
    const secondPayload = secondResponder.result()?.payload ?? {};
    expect(secondPayload.reused).toBe(true);
    expect(secondPayload.paymentReceipt).toMatchObject({
      chain: "ton",
      network: "ton-testnet",
      txHash: "0xtonhash",
      amount: "7",
      mode: "live",
    });
  });

  it("blocks autopay when x402 kill switch is disabled", async () => {
    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({ x402: { autopay: { enabled: false } } });
    const handler = createBillingHandlePaymentRequiredHandler(store, config);
    const invoice: Invoice = {
      invoiceId: "inv-2",
      provider: "provider-2",
      chain: "evm",
      asset: "ETH",
      amount: "10",
      payTo: "0x0000000000000000000000000000000000000003",
      nonce: "nonce-2",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: "idem-2",
    };

    const responder = createResponder();
    await handler({
      params: { invoice: encodeInvoice(invoice) },
      respond: responder.respond,
    } as any);

    expect(responder.result()?.ok).toBe(false);
    expect(responder.result()?.payload).toMatchObject({ error: "E_FORBIDDEN" });
    expect(mockCallGateway).not.toHaveBeenCalled();
  });

  it("rejects expired invoice", async () => {
    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({});
    const handler = createBillingHandlePaymentRequiredHandler(store, config);
    const invoice: Invoice = {
      invoiceId: "inv-expired",
      provider: "provider-expired",
      chain: "evm",
      asset: "ETH",
      amount: "10",
      payTo: "0x0000000000000000000000000000000000000009",
      nonce: "nonce-expired",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      idempotencyKey: "idem-expired",
    };

    const responder = createResponder();
    await handler({
      params: { invoice: encodeInvoice(invoice) },
      respond: responder.respond,
    } as any);

    expect(responder.result()?.ok).toBe(false);
    expect(responder.result()?.payload).toMatchObject({ error: "E_EXPIRED" });
  });

  it("returns timeout error when autopay backend times out", async () => {
    mockCallGateway.mockResolvedValueOnce({ ok: false, error: "timeout" });

    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({});
    const handler = createBillingHandlePaymentRequiredHandler(store, config);
    const invoice: Invoice = {
      invoiceId: "inv-timeout",
      provider: "provider-timeout",
      chain: "evm",
      asset: "ETH",
      amount: "10",
      payTo: "0x0000000000000000000000000000000000000008",
      nonce: "nonce-timeout",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: "idem-timeout",
    };

    const responder = createResponder();
    await handler({
      params: { invoice: encodeInvoice(invoice) },
      respond: responder.respond,
    } as any);

    expect(responder.result()?.ok).toBe(false);
    expect(responder.result()?.payload).toMatchObject({ error: "E_TIMEOUT" });
  });

  it("returns wallet policy retry budget in payment-required response", async () => {
    mockCallGateway.mockResolvedValueOnce({
      ok: true,
      result: { txHash: "0xtxhash", policyAutoPayMaxRetries: 2 },
    });

    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({});
    const handler = createBillingHandlePaymentRequiredHandler(store, config);
    const invoice: Invoice = {
      invoiceId: "inv-3",
      provider: "provider-3",
      chain: "evm",
      asset: "ETH",
      amount: "10",
      payTo: "0x0000000000000000000000000000000000000004",
      nonce: "nonce-3",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: "idem-3",
    };

    const firstResponder = createResponder();
    await handler({
      params: { invoice: encodeInvoice(invoice) },
      respond: firstResponder.respond,
    } as any);

    expect(firstResponder.result()?.ok).toBe(true);
    expect(firstResponder.result()?.payload).toMatchObject({ maxRetries: 2, reused: false });

    const secondResponder = createResponder();
    await handler({
      params: { invoice: encodeInvoice(invoice) },
      respond: secondResponder.respond,
    } as any);

    expect(secondResponder.result()?.ok).toBe(true);
    expect(secondResponder.result()?.payload).toMatchObject({ maxRetries: 2, reused: true });
  });

  it("routes TON invoice to autopay with chain and amount alias", async () => {
    mockCallGateway.mockResolvedValueOnce({
      ok: true,
      result: { txHash: "0xtonhash", chain: "ton", network: "ton-testnet" },
    });

    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({});
    const handler = createBillingHandlePaymentRequiredHandler(store, config);
    const invoice: Invoice = {
      invoiceId: "inv-ton-1",
      provider: "provider-ton",
      chain: "ton",
      asset: "TON",
      amount: "12",
      payTo: "EQC_TON_TEST_ADDRESS",
      nonce: "nonce-ton-1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: "idem-ton-1",
    };

    const responder = createResponder();
    await handler({
      params: { invoice: encodeInvoice(invoice) },
      respond: responder.respond,
    } as any);

    expect(responder.result()?.ok).toBe(true);
    expect(responder.result()?.payload).toMatchObject({
      reused: false,
      resumeToken: { chain: "ton" },
      paymentReceipt: {
        chain: "ton",
        network: "ton-testnet",
        txHash: "0xtonhash",
        amount: "12",
        mode: "live",
      },
    });
    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "agent-wallet.autopay",
        params: expect.objectContaining({
          chain: "ton",
          value: "12",
          amount: "12",
        }),
      }),
    );
  });

  it("rejects idempotency key reuse with different invoice", async () => {
    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({});
    const handler = createBillingHandlePaymentRequiredHandler(store, config);
    const invoice: Invoice = {
      invoiceId: "inv-2",
      provider: "provider-2",
      chain: "evm",
      asset: "ETH",
      amount: "10",
      payTo: "0x0000000000000000000000000000000000000003",
      nonce: "nonce-2",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: "idem-2",
    };

    const firstResponder = createResponder();
    await handler({
      params: { invoice: encodeInvoice(invoice) },
      respond: firstResponder.respond,
    } as any);

    const secondResponder = createResponder();
    await handler({
      params: { invoice: encodeInvoice({ ...invoice, amount: "20" }) },
      respond: secondResponder.respond,
    } as any);

    expect(secondResponder.result()?.ok).toBe(false);
    expect(secondResponder.result()?.payload).toMatchObject({ error: "E_CONFLICT" });
  });
});
