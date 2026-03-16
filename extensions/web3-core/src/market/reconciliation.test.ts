import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import { Web3StateStore } from "../state/store.js";
import { createMarketReconciliationSummaryHandler } from "./reconciliation.js";

type GatewayResponse = {
  ok: boolean;
  result?: unknown;
  error?: string;
};

type GatewayRequest = {
  method: string;
  params?: Record<string, unknown>;
  timeoutMs?: number;
};

const mockCallGateway = vi.fn<(request: GatewayRequest) => Promise<GatewayResponse>>();

vi.mock("./proxy-utils.js", async () => {
  const actual = (await vi.importActual("./proxy-utils.js")) as Record<string, unknown>;
  return {
    ...actual,
    loadCallGateway: async () => mockCallGateway,
  };
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

function buildDefaultGatewayResponse(request: GatewayRequest): GatewayResponse {
  switch (request.method) {
    case "market.settlement.status":
      return {
        ok: true,
        result: {
          orderId: "order-1",
          settlementId: "settlement-1",
          status: "locked",
          amount: "10",
          paymentChain: "ton",
          paymentNetwork: "ton-testnet",
          paymentReceiptId: "receipt-1",
          paymentIntentId: "intent-1",
          treasuryRouteId: "route-1",
          confirmationStatus: "confirmed",
        },
      };
    case "market.dispute.list":
      return {
        ok: true,
        result: {
          disputes: [{ status: "open" }],
        },
      };
    case "market.service.proof.list":
      return {
        ok: true,
        result: {
          proofs: [
            {
              status: "submitted",
              submittedAt: "2026-03-16T00:02:00.000Z",
              proof: { artifactHash: `sha256:${"a".repeat(64)}` },
            },
          ],
        },
      };
    case "market.ledger.summary":
      return {
        ok: true,
        result: {
          summary: {
            totalCost: "10",
            byUnit: {
              token: {
                quantity: "2",
                cost: "10",
              },
            },
          },
        },
      };
    default:
      return { ok: false, error: `unexpected method: ${request.method}` };
  }
}

function seedTrackedPaymentRecord(store: Web3StateStore) {
  const createdAt = new Date().toISOString();
  const updatedAt = new Date(Date.now() + 1_000).toISOString();
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const quoteExpiresAt = new Date(Date.now() + 60 * 60_000).toISOString();

  store.savePaymentRequired({
    idempotencyKey: "idem-1",
    requestId: "request-1",
    toolName: "tools_invoke_payment_required",
    invoiceHash: "invoice-hash-1",
    createdAt,
    updatedAt,
    amount: "10",
    asset: "TON",
    provider: "provider-1",
    payTo: "EQC_PAY_TO",
    status: "settlement_pending",
    reused: false,
    confirmationStatus: "confirmed",
    settlement: {
      orderId: "order-1",
      settlementId: "settlement-1",
      payer: "payer-1",
      actorId: "actor-1",
    },
    fxQuote: {
      quoteId: "quote-1",
      fromAsset: "TON",
      toAsset: "USDC",
      rate: "5",
      source: "manual",
      expiresAt: quoteExpiresAt,
      quotedAt: createdAt,
      fromAmount: "2",
      toAmount: "10",
      chain: "ton",
    },
    treasuryRoute: {
      routeId: "route-1",
      sourceChain: "ton",
      settlementChain: "evm",
      sourceAsset: "TON",
      settlementAsset: "USDC",
      strategy: "bridge",
    },
    paymentIntent: {
      intentId: "intent-1",
      chain: "ton",
      asset: "TON",
      amount: "2",
      currency: "USDC",
      orderId: "order-1",
      requestId: "request-1",
      idempotencyKey: "idem-1",
      provider: "provider-1",
      payTo: "EQC_PAY_TO",
      payer: "payer-1",
      network: "ton-testnet",
      mode: "live",
      quoteId: "quote-1",
      treasuryRouteId: "route-1",
      createdAt,
    },
    resumeToken: {
      invoiceId: "inv-1",
      paymentReceiptId: "receipt-1",
      txHash: "0xtonhash",
      chain: "ton",
      issuedAt: createdAt,
      expiresAt,
      network: "ton-testnet",
      asset: "TON",
      amount: "10",
      payTo: "EQC_PAY_TO",
      payer: "payer-1",
      orderId: "order-1",
      settlementId: "settlement-1",
      quoteId: "quote-1",
      intentId: "intent-1",
    },
  });
}

describe("web3.market.reconciliation.summary", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-web3-reconciliation-test-"));
    mockCallGateway.mockReset();
    mockCallGateway.mockImplementation(async (request) => buildDefaultGatewayResponse(request));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("hydrates payment trace, archive, and anchor evidence from stored payment context", async () => {
    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({});
    const handler = createMarketReconciliationSummaryHandler(store, config);

    seedTrackedPaymentRecord(store);
    store.saveArchiveReceipt({
      cid: "bafy1234",
      uri: "ipfs://bafy1234",
      updatedAt: "2026-03-16T00:03:00.000Z",
    });
    store.saveAnchorReceipt({
      anchorId: "anchor-1",
      tx: "0xanchor",
      network: "base",
      block: 42,
      updatedAt: "2026-03-16T00:04:00.000Z",
    });

    const responder = createResponder();
    await handler({
      params: { orderId: "order-1" },
      respond: responder.respond,
    } as never);

    expect(responder.result()?.ok).toBe(true);
    expect(responder.result()?.payload).toMatchObject({
      orderId: "order-1",
      settlementId: "settlement-1",
      paymentIntent: {
        intentId: "intent-1",
        quoteId: "quote-1",
        treasuryRouteId: "route-1",
      },
      paymentReceipt: {
        receiptId: "receipt-1",
        orderId: "order-1",
        settlementId: "settlement-1",
        treasuryRouteId: "route-1",
        txHash: "0xtonhash",
      },
      fxQuote: {
        quoteId: "quote-1",
        fromAsset: "TON",
        toAsset: "USDC",
      },
      treasuryRoute: {
        routeId: "route-1",
        sourceChain: "ton",
        settlementChain: "evm",
      },
      paymentTrace: {
        requestId: "request-1",
        idempotencyKey: "idem-1",
        invoiceId: "inv-1",
        paymentReceiptId: "receipt-1",
        txHash: "0xtonhash",
        toolName: "tools_invoke_payment_required",
        chain: "ton",
        network: "ton-testnet",
        amount: "10",
        status: "settlement_pending",
        confirmationStatus: "confirmed",
        intentId: "intent-1",
        fxQuoteId: "quote-1",
        treasuryRouteId: "route-1",
      },
      settlement: {
        status: "locked",
        confirmationStatus: "confirmed",
      },
      disputes: {
        total: 1,
      },
      serviceProofs: {
        total: 1,
      },
      archiveReceipt: {
        cid: "bafy1234",
      },
      anchorReceipt: {
        tx: "0xanchor",
        network: "base",
      },
    });
  });

  it("includes ledger summary when leaseId is requested", async () => {
    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({});
    const handler = createMarketReconciliationSummaryHandler(store, config);

    seedTrackedPaymentRecord(store);

    const responder = createResponder();
    await handler({
      params: { orderId: "order-1", leaseId: "lease-1", includeLedger: true },
      respond: responder.respond,
    } as never);

    expect(responder.result()?.ok).toBe(true);
    expect(responder.result()?.payload).toMatchObject({
      ledgerSummary: {
        totalCost: "10",
        byUnit: {
          token: "[REDACTED]",
        },
      },
    });
  });

  it("degrades gracefully when auxiliary market queries fail", async () => {
    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({});
    const handler = createMarketReconciliationSummaryHandler(store, config);

    seedTrackedPaymentRecord(store);
    mockCallGateway.mockImplementation(async (request) => {
      if (request.method === "market.dispute.list") {
        return { ok: false, error: "dispute backend unavailable" };
      }
      if (request.method === "market.service.proof.list") {
        return { ok: false, error: "proof backend unavailable" };
      }
      if (request.method === "market.ledger.summary") {
        return { ok: false, error: "ledger backend unavailable" };
      }
      return buildDefaultGatewayResponse(request);
    });

    const responder = createResponder();
    await handler({
      params: { orderId: "order-1", leaseId: "lease-1", includeLedger: true },
      respond: responder.respond,
    } as never);

    expect(responder.result()?.ok).toBe(true);
    expect(responder.result()?.payload).toMatchObject({
      orderId: "order-1",
      settlementId: "settlement-1",
      paymentReceipt: {
        receiptId: "receipt-1",
      },
    });
    expect(responder.result()?.payload.disputes).toBeUndefined();
    expect(responder.result()?.payload.serviceProofs).toBeUndefined();
    expect(responder.result()?.payload.ledgerSummary).toBeUndefined();
  });
});
