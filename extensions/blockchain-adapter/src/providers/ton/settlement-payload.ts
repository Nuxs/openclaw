import { Address, beginCell, Cell } from "@ton/core";
import { sign } from "@ton/crypto";
import { deriveTonKeyPairFromMnemonic } from "./mnemonic.js";

export const TON_SETTLEMENT_OP = {
  lock: 1,
  release: 2,
  refund: 3,
} as const;

export type TonSettlementOp = (typeof TON_SETTLEMENT_OP)[keyof typeof TON_SETTLEMENT_OP];

function requireOrderHashUint256(orderHashHex: string): bigint {
  const raw = orderHashHex.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("orderHash must be a 0x-prefixed 32-byte hex string");
  }
  const value = BigInt(raw);
  if (value < 0n) {
    throw new Error("orderHash must be non-negative");
  }
  // max = 2^256 - 1
  const max = (1n << 256n) - 1n;
  if (value > max) {
    throw new Error("orderHash is out of uint256 range");
  }
  return value;
}

function toBocBase64(cell: Cell): string {
  return cell.toBoc().toString("base64");
}

export function decodeBocBase64ToCell(bocBase64: string): Cell {
  const decoded = Buffer.from(bocBase64, "base64");
  const cells = Cell.fromBoc(decoded);
  if (cells.length === 0) {
    throw new Error("invalid BOC payload: empty");
  }
  return cells[0];
}

export function encodeTonSettlementLockPayload(args: {
  orderHash: string;
  amount: bigint;
  payee: string;
  queryId?: bigint;
}): string {
  const orderHash = requireOrderHashUint256(args.orderHash);
  const queryId = args.queryId ?? 0n;

  const cell = beginCell()
    .storeUint(TON_SETTLEMENT_OP.lock, 32)
    .storeUint(queryId, 64)
    .storeUint(orderHash, 256)
    .storeCoins(args.amount)
    .storeAddress(Address.parse(args.payee))
    .endCell();

  return toBocBase64(cell);
}

export function encodeTonSettlementReleasePayload(args: {
  orderHash: string;
  actualAmount: bigint;
  signature?: Buffer;
  queryId?: bigint;
}): string {
  const orderHash = requireOrderHashUint256(args.orderHash);
  const queryId = args.queryId ?? 0n;
  const signature = args.signature ?? Buffer.alloc(64);
  if (signature.length !== 64) {
    throw new Error("signature must be 64 bytes (512 bits)");
  }

  const cell = beginCell()
    .storeUint(TON_SETTLEMENT_OP.release, 32)
    .storeUint(queryId, 64)
    .storeUint(orderHash, 256)
    .storeCoins(args.actualAmount)
    .storeBuffer(signature)
    .endCell();

  return toBocBase64(cell);
}

export function encodeTonSettlementRefundPayload(args: {
  orderHash: string;
  queryId?: bigint;
}): string {
  const orderHash = requireOrderHashUint256(args.orderHash);
  const queryId = args.queryId ?? 0n;

  const cell = beginCell()
    .storeUint(TON_SETTLEMENT_OP.refund, 32)
    .storeUint(queryId, 64)
    .storeUint(orderHash, 256)
    .endCell();

  return toBocBase64(cell);
}

/**
 * Build the canonical signing cell for settlement release authorization.
 *
 * IMPORTANT: This must match the FunC contract's signature verification logic.
 */
export function buildTonSettlementReleaseSigningCell(args: {
  orderHash: string;
  actualAmount: bigint;
  queryId: bigint;
}): Cell {
  const orderHash = requireOrderHashUint256(args.orderHash);
  return beginCell()
    .storeUint(orderHash, 256)
    .storeCoins(args.actualAmount)
    .storeUint(args.queryId, 64)
    .endCell();
}

export function hashTonSettlementReleaseSigningCell(args: {
  orderHash: string;
  actualAmount: bigint;
  queryId: bigint;
}): Buffer {
  const cell = buildTonSettlementReleaseSigningCell(args);
  return cell.hash();
}

export async function signTonSettlementReleasePayload(args: {
  orderHash: string;
  actualAmount: bigint;
  queryId: bigint;
  tonMnemonic: string;
}): Promise<Buffer> {
  const hash = hashTonSettlementReleaseSigningCell(args);
  const keyPair = await deriveTonKeyPairFromMnemonic(args.tonMnemonic);
  return Buffer.from(sign(hash, keyPair.secretKey));
}
