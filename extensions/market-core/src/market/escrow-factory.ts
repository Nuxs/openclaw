/**
 * Unified Escrow Factory — dispatches to EVM or TON adapter based on chain config.
 *
 * Usage:
 *   const escrow = createEscrowAdapter(chain, settlement);
 *   await escrow.lock(orderId, payer, amount);
 */

import type { ChainConfig, SettlementConfig } from "../config.js";
import { TonEscrowAdapter } from "./escrow-ton.js";
import { EscrowAdapter } from "./escrow.js";

/** Minimal interface shared by both EVM and TON escrow adapters. */
export interface IEscrowAdapter {
  lock(orderId: string, payer: string, amount: string): Promise<string>;
  release(orderId: string, payees: { address: string; amount: string }[]): Promise<string>;
  refund(orderId: string, payer: string): Promise<string>;
}

/**
 * Create the appropriate escrow adapter based on the chain network.
 * TON networks ("ton-mainnet", "ton-testnet") → TonEscrowAdapter
 * Everything else → EVM EscrowAdapter
 */
export function createEscrowAdapter(
  chain: ChainConfig,
  settlement: SettlementConfig,
): IEscrowAdapter {
  if (chain.network.startsWith("ton-")) {
    return new TonEscrowAdapter(chain, settlement);
  }
  return new EscrowAdapter(chain, settlement);
}
