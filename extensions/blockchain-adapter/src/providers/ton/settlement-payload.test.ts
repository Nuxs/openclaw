import { Address } from "@ton/core";
import { describe, expect, it } from "vitest";
import {
  TON_SETTLEMENT_OP,
  decodeBocBase64ToCell,
  encodeTonSettlementLockPayload,
  encodeTonSettlementRefundPayload,
  encodeTonSettlementReleasePayload,
} from "./settlement-payload.js";

describe("ton settlement payload", () => {
  it("encodes lock payload with expected fields", () => {
    const orderHash = `0x${"11".repeat(32)}`;
    const payee = "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N";
    const amount = 123n;

    const boc = encodeTonSettlementLockPayload({ orderHash, amount, payee, queryId: 7n });
    const cell = decodeBocBase64ToCell(boc);
    const slice = cell.beginParse();

    expect(slice.loadUint(32)).toBe(TON_SETTLEMENT_OP.lock);
    expect(slice.loadUintBig(64)).toBe(7n);
    expect(slice.loadUintBig(256)).toBe(BigInt(orderHash));
    expect(slice.loadCoins()).toBe(amount);
    expect(slice.loadAddress().toString()).toBe(Address.parse(payee).toString());
  });

  it("encodes refund payload with expected fields", () => {
    const orderHash = `0x${"22".repeat(32)}`;

    const boc = encodeTonSettlementRefundPayload({ orderHash, queryId: 0n });
    const cell = decodeBocBase64ToCell(boc);
    const slice = cell.beginParse();

    expect(slice.loadUint(32)).toBe(TON_SETTLEMENT_OP.refund);
    expect(slice.loadUintBig(64)).toBe(0n);
    expect(slice.loadUintBig(256)).toBe(BigInt(orderHash));
    expect(slice.remainingBits).toBe(0);
  });

  it("encodes release payload with fixed 512-bit signature", () => {
    const orderHash = `0x${"33".repeat(32)}`;
    const actualAmount = 999n;

    const boc = encodeTonSettlementReleasePayload({ orderHash, actualAmount, queryId: 1n });
    const cell = decodeBocBase64ToCell(boc);
    const slice = cell.beginParse();

    expect(slice.loadUint(32)).toBe(TON_SETTLEMENT_OP.release);
    expect(slice.loadUintBig(64)).toBe(1n);
    expect(slice.loadUintBig(256)).toBe(BigInt(orderHash));
    expect(slice.loadCoins()).toBe(actualAmount);

    const sigBits = slice.loadBits(512);
    expect(sigBits.length).toBe(512);
  });
});
