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
  TonError,
  ErrorCode,
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
    throw new TonError(
      "chain.tonMnemonic is required for TON escrow contract calls",
      ErrorCode.INVALID_PARAMS,
    );
  }
  return chain.tonMnemonic;
}

function requireContractAddress(address: string | undefined): string {
  if (!address || address.trim().length === 0) {
    throw new TonError(
      "chain.escrowContractAddress is required for TON escrow calls",
      ErrorCode.INVALID_PARAMS,
    );
  }
  return address.trim();
}

function requirePayee(payee: string | undefined): string {
  if (!payee || payee.trim().length === 0) {
    throw new TonError("payee is required for TON settlement lock", ErrorCode.INVALID_PARAMS);
  }
  return payee.trim();
}

function positiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
}

function nonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.floor(value);
  return normalized >= 0 ? normalized : fallback;
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("socket hang up") ||
    msg.includes("network") ||
    msg.includes("lite server") ||
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("504")
  );
}

async function deterministicQueryId(seed: string): Promise<bigint> {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(seed).digest();
  return hash.readBigUInt64BE(0);
}

function timeoutError(label: string, orderId: string, timeoutMs: number, step: string): TonError {
  return new TonError(
    `${label} ${step} timed out after ${timeoutMs}ms (orderId=${orderId})`,
    ErrorCode.SETTLEMENT_TIMEOUT,
    { orderId, step, timeoutMs },
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => TonError,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TonEscrowAdapter {
  private readonly chain: ChainConfig;
  private readonly contractAddress: string;
  private readonly mode: SettlementConfig["mode"];
  private readonly transferTimeoutMs: number;
  private readonly confirmationTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly confirmations: number;

  constructor(chain: ChainConfig, settlement: SettlementConfig) {
    this.chain = chain;
    this.contractAddress = requireContractAddress(chain.escrowContractAddress);
    this.mode = settlement.mode;

    this.transferTimeoutMs = positiveInt(settlement.transferTimeoutMs, 30_000);
    this.confirmationTimeoutMs = positiveInt(settlement.confirmationTimeoutMs, 60_000);
    this.maxRetries = nonNegativeInt(settlement.maxRetries, 2);
    this.retryBaseDelayMs = positiveInt(settlement.retryBaseDelayMs, 1_000);
    this.retryMaxDelayMs = positiveInt(settlement.retryMaxDelayMs, 8_000);
    this.confirmations = nonNegativeInt(settlement.confirmations, 1);
  }

  private ensureContractReady() {
    if (this.mode !== "contract") {
      throw new TonError("settlement.mode is not set to contract", ErrorCode.INVALID_PARAMS);
    }
  }

  private async loadTonProvider(): Promise<IProviderTON> {
    this.ensureContractReady();
    ensureBlockchainFactory();

    const provider: IProvider = getProvider(this.chain.network);
    if (!isProviderTON(provider)) {
      throw new TonError(
        `Expected TON provider for ${this.chain.network}, got ${provider.chainType}`,
        ErrorCode.INVALID_PARAMS,
      );
    }

    if (!provider.isConnected) {
      try {
        await provider.connect({
          rpcUrl: this.chain.rpcUrl,
          tonMnemonic: requireTonMnemonic(this.chain),
          tonWorkchain: this.chain.tonWorkchain,
        });
      } catch (err) {
        throw new TonError(
          `TON provider connection failed for ${this.chain.network}: ${err instanceof Error ? err.message : String(err)}`,
          ErrorCode.CONNECTION_FAILED,
          { cause: err instanceof Error ? err.message : String(err) },
        );
      }
    }

    return provider;
  }

  private async waitForConfirmation(
    provider: IProviderTON,
    orderId: string,
    txHash: string,
    label: string,
  ) {
    if (this.confirmations <= 0) {
      return;
    }

    try {
      await withTimeout(
        provider.waitForTransaction(txHash, this.confirmations),
        this.confirmationTimeoutMs,
        () => timeoutError(label, orderId, this.confirmationTimeoutMs, "confirmation"),
      );
    } catch (err) {
      if (err instanceof TonError) {
        throw err;
      }
      throw new TonError(
        `${label} confirmation failed: ${err instanceof Error ? err.message : String(err)}`,
        ErrorCode.TRANSACTION_FAILED,
        { orderId, txHash, confirmations: this.confirmations },
      );
    }
  }

  private async withRetry<T>(
    label: string,
    orderId: string,
    fn: () => Promise<T>,
    maxRetries = this.maxRetries,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (raw) {
        const err =
          raw instanceof Error
            ? raw
            : new TonError(`${label} failed: ${String(raw)}`, ErrorCode.UNKNOWN);

        if (
          !isRetryable(err) &&
          !(err instanceof TonError && err.code === ErrorCode.SETTLEMENT_TIMEOUT)
        ) {
          throw err instanceof TonError
            ? err
            : new TonError(
                `${label} failed permanently: ${err.message}`,
                ErrorCode.SETTLEMENT_FAILED,
                {
                  orderId,
                  attempt,
                  cause: err.message,
                },
              );
        }

        lastError =
          err instanceof TonError
            ? err
            : new TonError(
                `${label} transient failure: ${err.message}`,
                ErrorCode.TRANSACTION_FAILED,
                {
                  orderId,
                  attempt,
                  cause: err.message,
                },
              );
      }

      if (attempt < maxRetries) {
        const delay = Math.min(this.retryBaseDelayMs * 2 ** attempt, this.retryMaxDelayMs);
        const jitter = Math.floor(delay * 0.2 * Math.random());
        await sleep(delay + jitter);
      }
    }

    throw (
      lastError ??
      new TonError(
        `${label} failed after ${maxRetries + 1} attempts`,
        ErrorCode.SETTLEMENT_FAILED,
        {
          orderId,
        },
      )
    );
  }

  private async transferWithPolicy(
    provider: IProviderTON,
    orderId: string,
    label: string,
    transfer: () => Promise<string>,
  ): Promise<string> {
    return this.withRetry(label, orderId, async () => {
      let txHash: string;
      try {
        txHash = await withTimeout(transfer(), this.transferTimeoutMs, () =>
          timeoutError(label, orderId, this.transferTimeoutMs, "transfer"),
        );
      } catch (err) {
        if (err instanceof TonError) {
          throw err;
        }
        throw new TonError(
          `${label} transfer failed: ${err instanceof Error ? err.message : String(err)}`,
          ErrorCode.TRANSACTION_FAILED,
          { orderId },
        );
      }

      await this.waitForConfirmation(provider, orderId, txHash, label);
      return txHash;
    });
  }

  async lock(
    orderId: string,
    _payer: string,
    amount: string,
    payee?: string,
    options?: { idempotencyKey?: string },
  ): Promise<string> {
    const provider = await this.loadTonProvider();

    const normalizedPayee = normalizeTonAddress(requirePayee(payee));
    const lockAmount = BigInt(amount);
    const queryId = await deterministicQueryId(options?.idempotencyKey ?? `lock:${orderId}`);

    const GAS_TOPUP = 50_000_000n;

    const payload = encodeTonSettlementLockPayload({
      orderHash: orderId,
      amount: lockAmount,
      payee: normalizedPayee,
      queryId,
    });

    return this.transferWithPolicy(provider, orderId, "escrow.lock", async () => {
      return provider.transfer(this.contractAddress, lockAmount + GAS_TOPUP, { payload });
    });
  }

  async release(
    orderId: string,
    payees: { address: string; amount: string }[],
    options?: { idempotencyKey?: string },
  ): Promise<string> {
    const provider = await this.loadTonProvider();

    if (payees.length !== 1) {
      throw new TonError(
        "TON settlement contract currently supports exactly 1 payee",
        ErrorCode.INVALID_PARAMS,
      );
    }

    const actualAmount = BigInt(payees[0].amount);

    return this.transferWithPolicy(provider, orderId, "escrow.release", async () => {
      const queryId = options?.idempotencyKey
        ? await deterministicQueryId(options.idempotencyKey)
        : BigInt(`0x${(await import("node:crypto")).randomBytes(8).toString("hex")}`);

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

      const GAS_TRIGGER = 50_000_000n;
      return provider.transfer(this.contractAddress, GAS_TRIGGER, { payload });
    });
  }

  async refund(
    orderId: string,
    _payer: string,
    options?: { idempotencyKey?: string },
  ): Promise<string> {
    const provider = await this.loadTonProvider();
    const queryId = await deterministicQueryId(options?.idempotencyKey ?? `refund:${orderId}`);

    const payload = encodeTonSettlementRefundPayload({
      orderHash: orderId,
      queryId,
    });

    const GAS_TRIGGER = 50_000_000n;

    return this.transferWithPolicy(provider, orderId, "escrow.refund", async () => {
      return provider.transfer(this.contractAddress, GAS_TRIGGER, { payload });
    });
  }
}
