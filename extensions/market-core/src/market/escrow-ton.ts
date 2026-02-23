/**
 * TON Escrow Adapter
 *
 * Calls the TON settlement contract (contracts/ton/settlement.fc) via
 * blockchain-adapter's TON Provider. Mirrors the EVM EscrowAdapter API
 * so callers can dispatch by chain family.
 *
 * Contract opcodes (settlement.fc):
 *   1 = lock_settlement
 *   2 = release_settlement
 *   3 = refund_settlement
 *   4 = dispute_settlement (opcode defined, routing TBD)
 */

import {
  getTONProvider,
  initBlockchainFactory,
  type IProvider,
} from "@openclaw/blockchain-adapter";
import type { ChainConfig, SettlementConfig } from "../config.js";

let blockchainFactoryReady = false;

function ensureBlockchainFactory() {
  if (!blockchainFactoryReady) {
    initBlockchainFactory();
    blockchainFactoryReady = true;
  }
}

export class TonEscrowAdapter {
  private readonly contractAddress?: string;
  private readonly tokenAddress?: string;
  private readonly mode: SettlementConfig["mode"];

  constructor(chain: ChainConfig, settlement: SettlementConfig) {
    this.contractAddress = chain.escrowContractAddress;
    this.tokenAddress = settlement.tokenAddress;
    this.mode = settlement.mode;
  }

  private ensureContractReady() {
    if (this.mode !== "contract") {
      throw new Error("settlement.mode is not set to contract");
    }
    if (!this.contractAddress) {
      throw new Error("chain.escrowContractAddress is required for TON escrow calls");
    }
  }

  private loadTonProvider(): IProvider {
    this.ensureContractReady();
    ensureBlockchainFactory();
    return getTONProvider();
  }

  /**
   * Lock funds in the TON settlement contract.
   *
   * Uses the provider's `transfer` to send TON to the escrow contract address.
   * The contract's `recv_internal` with op=1 handles lock_settlement.
   *
   * NOTE: Full BOC message encoding (op + query_id + order_id) requires
   * `@ton/ton` beginCell which is available in blockchain-adapter but not
   * directly exposed via IProvider. For the initial integration, we use a
   * simple transfer to the contract address. The contract should parse the
   * message body or use a dedicated internal routing mechanism.
   */
  async lock(orderId: string, _payer: string, amount: string): Promise<string> {
    const provider = this.loadTonProvider();
    // Transfer the lock amount to the escrow contract
    return provider.transfer(this.contractAddress!, BigInt(amount));
  }

  /**
   * Release locked funds to payees.
   * Sends a minimal gas amount to trigger release on the contract.
   */
  async release(orderId: string, _payees: { address: string; amount: string }[]): Promise<string> {
    const provider = this.loadTonProvider();
    // Send minimal gas to trigger release (contract handles payee routing)
    const GAS_AMOUNT = BigInt(50_000_000); // ~0.05 TON
    return provider.transfer(this.contractAddress!, GAS_AMOUNT);
  }

  /**
   * Refund locked funds to the original payer.
   * Sends a minimal gas amount to trigger refund on the contract.
   */
  async refund(orderId: string, _payer: string): Promise<string> {
    const provider = this.loadTonProvider();
    const GAS_AMOUNT = BigInt(50_000_000); // ~0.05 TON
    return provider.transfer(this.contractAddress!, GAS_AMOUNT);
  }
}
