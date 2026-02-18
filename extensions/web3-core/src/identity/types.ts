/**
 * Wallet identity types — SIWE (EIP-4361) challenge/verify flow.
 */

export type WalletBinding = {
  address: string;
  chainId: number;
  /** ISO timestamp of last successful SIWE verification */
  verifiedAt: string;
  /** Optional ENS name resolved at bind time */
  ensName?: string;
  siweDomain?: string;
  siweUri?: string;
  siweStatement?: string;
};

export type SiweChallenge = {
  /** EIP-4361 message to be signed */
  message: string;
  /** Server-generated nonce */
  nonce: string;
  /** Wallet address bound to the challenge */
  address: string;
  /** SIWE domain */
  domain: string;
  /** SIWE URI */
  uri: string;
  /** Optional statement */
  statement?: string;
  /** Issued at timestamp */
  issuedAt: string;
  /** Expiry timestamp */
  expiresAt: string;
};

export type SiweVerifyInput = {
  message: string;
  signature: string;
};

export type SiweVerifyResult = {
  ok: boolean;
  address?: string;
  chainId?: number;
  ensName?: string;
  error?: string;
};
