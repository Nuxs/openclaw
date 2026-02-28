/**
 * TON Escrow Adapter
 *
 * Calls the TON settlement contract (contracts/ton/settlement.fc) via
 * `@openclaw/blockchain-adapter`.
 *
 * IMPORTANT:
 * - `settlement.fc` ignores empty message bodies, so we MUST include a payload.
 * - `lock_settlement` requires a `payee` address in the payload.
 */

import {
  encodeTonSettlementLockPayload,
  encodeTonSettlementReleasePayload,
  encodeTonSettlementRefundPayload,
  signTonSettlementReleasePayload,
  getProvider,
  initBlockchainFactory,
  isProviderTON,
  normalizeTonAddress,
  type IProvider,
  type IProviderTON,
} from "@openclaw/blockchain-adapter";
import type { ChainConfig, SettlementConfig } from "../config.js";

let blockchainFactoryReady = false;

function ensureBlockchainFactory() {
  if (!blockchainFactoryReady) {
    initBlockchainFactory();
    blockchainFactoryReady = true;
  }
}

function requireTonMnemonic(chain: ChainConfig): string {
  if (!chain.tonMnemonic || chain.tonMnemonic.trim().length === 0) {
    throw new Error("chain.tonMnemonic is required for TON escrow contract calls");
  }
  return chain.tonMnemonic;
}

function requireContractAddress(address: string | undefined): string {
  if (!address || address.trim().length === 0) {
    throw new Error("chain.escrowContractAddress is required for TON escrow calls");
  }
  return address.trim();
}

function requirePayee(payee: string | undefined): string {
  if (!payee || payee.trim().length === 0) {
    throw new Error("payee is required for TON settlement lock");
  }
  return payee.trim();
}

export class TonEscrowAdapter {
  private readonly chain: ChainConfig;
  private readonly contractAddress: string;
  private readonly mode: SettlementConfig["mode"];

  constructor(chain: ChainConfig, settlement: SettlementConfig) {
    this.chain = chain;
    this.contractAddress = requireContractAddress(chain.escrowContractAddress);
    this.mode = settlement.mode;
  }

  private ensureContractReady() {
    if (this.mode !== "contract") {
      throw new Error("settlement.mode is not set to contract");
    }
  }

  private async loadTonProvider(): Promise<IProviderTON> {
    this.ensureContractReady();
    ensureBlockchainFactory();

    const provider: IProvider = getProvider(this.chain.network);
    if (!isProviderTON(provider)) {
      throw new Error(`Expected TON provider for ${this.chain.network}, got ${provider.chainType}`);
    }

    if (!provider.isConnected) {
      await provider.connect({
        rpcUrl: this.chain.rpcUrl,
        tonMnemonic: requireTonMnemonic(this.chain),
        tonWorkchain: this.chain.tonWorkchain,
      });
    }

    return provider;
  }

  async lock(orderId: string, _payer: string, amount: string, payee?: string): Promise<string> {
    const provider = await this.loadTonProvider();

    const normalizedPayee = normalizeTonAddress(requirePayee(payee));
    const lockAmount = BigInt(amount);

    // Keep a small extra balance on the contract for fees (contract uses send_raw_message(..., 1)).
    const GAS_TOPUP = 50_000_000n; // ~0.05 TON

    const payload = encodeTonSettlementLockPayload({
      orderHash: orderId,
      amount: lockAmount,
      payee: normalizedPayee,
      queryId: 0n,
    });

    return provider.transfer(this.contractAddress, lockAmount + GAS_TOPUP, { payload });
  }

  async release(orderId: string, payees: { address: string; amount: string }[]): Promise<string> {
    const provider = await this.loadTonProvider();

    if (payees.length !== 1) {
      throw new Error("TON settlement contract currently supports exactly 1 payee");
    }

    const actualAmount = BigInt(payees[0].amount);

    // 64-bit queryId nonce for signature domain separation and tracing.
    const { randomBytes } = await import("node:crypto");
    const queryId = BigInt(`0x${randomBytes(8).toString("hex")}`);

    const signature = await signTonSettlementReleasePayload({
      orderHash: orderId,
      actualAmount,
      queryId,
      tonMnemonic: requireTonMnemonic(this.chain),
    });

    const payload = encodeTonSettlementReleasePayload({
      orderHash: orderId,
      actualAmount,
      signature,
      queryId,
    });

    const GAS_TRIGGER = 50_000_000n; // ~0.05 TON
    return provider.transfer(this.contractAddress, GAS_TRIGGER, { payload });
  }

  async refund(orderId: string, _payer: string): Promise<string> {
    const provider = await this.loadTonProvider();

    const payload = encodeTonSettlementRefundPayload({
      orderHash: orderId,
      queryId: 0n,
    });

    const GAS_TRIGGER = 50_000_000n; // ~0.05 TON
    return provider.transfer(this.contractAddress, GAS_TRIGGER, { payload });
  }
}
