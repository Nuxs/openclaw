/**
 * Chain adapter interface — abstract over EVM / Solana / Cosmos.
 * Default implementation: EVM via viem.
 */

export type AnchorInput = {
  /** Locally-generated idempotency key: hash(sessionIdHash, eventType, seq) */
  anchorId: string;
  /** SHA-256 of the canonical audit payload */
  payloadHash: string;
  /** Optional metadata to store alongside the anchor (subject to privacy policy) */
  meta?: Record<string, string>;
};

export type AnchorResult = {
  tx: string;
  block?: number;
  network: string;
};

export type VerifyResult = {
  ok: boolean;
  anchorId?: string;
  block?: number;
  timestamp?: number;
};

export interface ChainAdapter {
  readonly networkId: string;
  anchorHash(input: AnchorInput): Promise<AnchorResult>;
  verifyAnchor(input: { payloadHash: string; tx: string }): Promise<VerifyResult>;
  getBalance(): Promise<{ balance: string; symbol: string }>;
}
