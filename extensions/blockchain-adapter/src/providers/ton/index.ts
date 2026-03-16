/**
 * TON Blockchain Provider Implementation
 *
 * Supports two modes:
 * - TonConnect (interactive): requires `manifestUrl`
 * - Headless (server/agent): requires `tonMnemonic`
 */

import { Address, Cell, internal, type ContractProvider } from "@ton/core";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { TonClient, WalletContractV4 } from "@ton/ton";
import { TonConnect } from "@tonconnect/sdk";
import { TonError, NotConnectedError, ErrorCode } from "../../types/error.js";
import type {
  IProviderTON,
  ChainId,
  TxHash,
  Address as ProviderAddress,
  Wallet,
  ConnectionConfig,
  TxReceipt,
  TokenInfo,
  EventCallback,
  Unsubscribe,
  TransferOptions,
} from "../../types/provider.js";
import { splitTonMnemonic } from "./mnemonic.js";
import { decodeBocBase64ToCell } from "./settlement-payload.js";

export interface TONProviderConfig {
  chainId?: string;
  rpcUrl?: string;
  explorerUrl?: string;
}

interface TONProviderOptions {
  testnet?: boolean;
  rpcUrl?: string;
  apiKey?: string;
  config?: TONProviderConfig;
}

type HeadlessWallet = {
  workchain: number;
  keyPair: { publicKey: Buffer; secretKey: Buffer };
  wallet: WalletContractV4;
  provider: ContractProvider;
};

type TonTransaction = {
  hash(): Buffer;
  lt: bigint;
  inMessage?: { hash(): Buffer };
};

export class TONProvider implements IProviderTON {
  readonly chainType: "ton" = "ton";
  readonly chainId: ChainId;
  readonly chainName: string = "TON Network";
  readonly nativeToken: TokenInfo = {
    symbol: "TON",
    name: "Toncoin",
    decimals: 9,
  };

  get isConnected(): boolean {
    return this.connectedWallet !== undefined;
  }

  get wallet(): Wallet | undefined {
    return this.connectedWallet;
  }

  async getChainId(): Promise<number> {
    return this.chainId === "ton-mainnet" ? -239 : -3;
  }

  private client: TonClient;
  private tonConnect?: TonConnect;
  private headless?: HeadlessWallet;
  private connectedWallet?: Wallet;
  private config: TONProviderConfig;
  private eventListeners = new Map<string, Set<EventCallback>>();
  private lastSeenTransactionLt = new Map<string, bigint>();
  private pollingInterval?: NodeJS.Timeout;

  constructor(options: TONProviderOptions = {}) {
    this.chainId = options.testnet ? "ton-testnet" : "ton-mainnet";

    if (options.config && options.config.chainId !== this.chainId) {
      throw new TonError(
        `TONProvider config chainId mismatch: expected ${this.chainId}, got ${options.config.chainId}`,
        ErrorCode.INVALID_PARAMS,
      );
    }

    const rpcUrl =
      options.rpcUrl ||
      options.config?.rpcUrl ||
      (options.testnet
        ? "https://testnet.toncenter.com/api/v2/jsonRPC"
        : "https://toncenter.com/api/v2/jsonRPC");

    this.client = new TonClient({
      endpoint: rpcUrl,
      apiKey: options.apiKey,
    });

    this.config = options.config
      ? {
          ...options.config,
          chainId: this.chainId,
          rpcUrl,
        }
      : this.loadConfig();
  }

  private loadConfig(): TONProviderConfig {
    return {
      chainId: this.chainId as string,
      rpcUrl: this.client.parameters.endpoint,
      explorerUrl:
        this.chainId === "ton-testnet" ? "https://testnet.tonscan.org" : "https://tonscan.org",
    };
  }

  private reconfigureClient(config: ConnectionConfig): void {
    if (typeof config.rpcUrl === "string" && config.rpcUrl.trim().length > 0) {
      const endpoint = config.rpcUrl.trim();
      if (endpoint !== this.client.parameters.endpoint) {
        this.client = new TonClient({ endpoint, apiKey: config.apiKey });
        this.config = { ...this.config, rpcUrl: endpoint };
      }
    }
  }

  private async listRecentTransactions(address: Address, limit = 20): Promise<TonTransaction[]> {
    return (
      (
        this.client as unknown as {
          getTransactions(addr: typeof address, opts: { limit: number }): Promise<TonTransaction[]>;
        }
      ).getTransactions(address, { limit }) ?? []
    );
  }

  private deriveTransactionCandidates(txHash: string): Set<string> {
    const candidates = new Set<string>();
    const trimmed = txHash.trim();
    if (trimmed.length > 0) {
      candidates.add(trimmed);
    }
    try {
      const cell = decodeBocBase64ToCell(trimmed);
      candidates.add(cell.hash().toString("hex"));
      candidates.add(cell.hash().toString("base64"));
    } catch {
      // Not a base64 BOC identifier; keep exact-match candidates only.
    }
    return candidates;
  }

  private buildReceiptFromTransaction(tx: TonTransaction, from: string): TxReceipt {
    return {
      status: "success",
      blockNumber: Number(tx.lt),
      txHash: tx.hash().toString("hex"),
      from,
      logs: [],
    };
  }

  private async primeEventCursor(contract: string): Promise<void> {
    if (this.lastSeenTransactionLt.has(contract)) {
      return;
    }
    try {
      const latest = (await this.listRecentTransactions(Address.parse(contract), 1))[0];
      if (latest) {
        this.lastSeenTransactionLt.set(contract, latest.lt);
      }
    } catch (err) {
      console.error(`TON event cursor prime failed for ${contract}:`, err);
    }
  }

  async connect(config: ConnectionConfig): Promise<Wallet> {
    this.reconfigureClient(config);

    if (config.manifestUrl) {
      this.tonConnect = new TonConnect({ manifestUrl: config.manifestUrl });
      await this.tonConnect.connect();

      const walletInfo = this.tonConnect.wallet;
      if (!walletInfo) {
        throw new TonError("Failed to connect wallet via TonConnect", ErrorCode.CONNECTION_FAILED);
      }

      this.headless = undefined;
      this.connectedWallet = {
        address: walletInfo.account.address,
        publicKey: walletInfo.account.publicKey,
        chainId: await this.getChainId(),
      };

      return this.connectedWallet;
    }

    if (!config.tonMnemonic) {
      throw new TonError(
        "TON headless connect requires tonMnemonic (or manifestUrl for TonConnect)",
        ErrorCode.INVALID_PARAMS,
      );
    }

    const words = splitTonMnemonic(config.tonMnemonic);
    const keyPair = await mnemonicToPrivateKey(words);
    const workchain = typeof config.tonWorkchain === "number" ? config.tonWorkchain : 0;

    const wallet = WalletContractV4.create({
      workchain,
      publicKey: Buffer.from(keyPair.publicKey),
    });
    const provider = this.client.provider(wallet.address, wallet.init);

    this.tonConnect = undefined;
    this.headless = {
      workchain,
      keyPair: {
        publicKey: Buffer.from(keyPair.publicKey),
        secretKey: Buffer.from(keyPair.secretKey),
      },
      wallet,
      provider,
    };

    this.connectedWallet = {
      address: wallet.address.toString(),
      publicKey: Buffer.from(keyPair.publicKey).toString("hex"),
      chainId: await this.getChainId(),
    };

    return this.connectedWallet;
  }

  async disconnect(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
    this.eventListeners.clear();
    this.lastSeenTransactionLt.clear();

    if (this.tonConnect) {
      await this.tonConnect.disconnect();
      this.tonConnect = undefined;
    }

    this.headless = undefined;
    this.connectedWallet = undefined;
  }

  async getAddress(): Promise<ProviderAddress> {
    if (!this.connectedWallet) {
      throw new NotConnectedError("ton");
    }
    return this.connectedWallet.address;
  }

  async getPublicKey(): Promise<string | undefined> {
    return this.connectedWallet?.publicKey;
  }

  async getBalance(address: ProviderAddress): Promise<bigint> {
    return this.client.getBalance(Address.parse(address));
  }

  async transfer(to: ProviderAddress, amount: bigint, options?: TransferOptions): Promise<TxHash> {
    if (this.tonConnect) {
      const message: Record<string, unknown> = {
        address: to,
        amount: amount.toString(),
      };
      if (options?.payload) {
        message.payload = options.payload;
      }

      const result = await this.tonConnect.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [message],
      });

      return result.boc;
    }

    if (!this.headless) {
      throw new NotConnectedError("ton");
    }

    const { wallet, provider, keyPair } = this.headless;

    const body: Cell | undefined = options?.payload
      ? decodeBocBase64ToCell(options.payload)
      : undefined;

    const message = internal({
      to: Address.parse(to),
      value: amount,
      body,
      bounce: typeof options?.bounce === "boolean" ? options.bounce : undefined,
    });

    const seqno = await wallet.getSeqno(provider);
    const transfer = wallet.createTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [message],
    });

    await wallet.send(provider, transfer);

    // NOTE: TON does not return a chain tx hash from send(); we return the
    // signed external message BOC as a stable identifier. Downstream code
    // should be aware this is NOT a chain tx hash (see TxHash type docs).
    return transfer.toBoc().toString("base64");
  }

  async callContract(address: string, method: string, args: unknown[]): Promise<unknown> {
    const contractAddress = Address.parse(address);
    const result = await this.client.runMethod(contractAddress, method, args);
    return result.stack;
  }

  async estimateGas(): Promise<bigint> {
    return 50_000_000n; // ~0.05 TON
  }

  async subscribeEvents(
    contract: string,
    eventName: string,
    callback: EventCallback,
  ): Promise<Unsubscribe> {
    const key = `${contract}:${eventName}`;

    if (!this.eventListeners.has(key)) {
      this.eventListeners.set(key, new Set());
    }

    this.eventListeners.get(key)!.add(callback);
    await this.primeEventCursor(contract);

    if (!this.pollingInterval) {
      this.startEventPolling();
    }

    return () => {
      this.eventListeners.get(key)?.delete(callback);
      if (this.eventListeners.get(key)?.size === 0) {
        this.eventListeners.delete(key);
      }
      if (![...this.eventListeners.keys()].some((entry) => entry.startsWith(`${contract}:`))) {
        this.lastSeenTransactionLt.delete(contract);
      }

      if (this.eventListeners.size === 0 && this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = undefined;
      }
    };
  }

  private startEventPolling() {
    let lastBlockNumber = 0;

    this.pollingInterval = setInterval(async () => {
      try {
        const currentBlock = await this.getBlockNumber();
        if (currentBlock > lastBlockNumber) {
          await this.checkNewTransactions();
          lastBlockNumber = currentBlock;
        }
      } catch (error) {
        // Best-effort polling
        console.error("TON event polling error:", error);
      }
    }, 5000);
  }

  private async checkNewTransactions(): Promise<void> {
    const watchedContracts = new Set(
      [...this.eventListeners.keys()].map((key) => key.slice(0, key.indexOf(":"))),
    );

    for (const contract of watchedContracts) {
      if (!contract) {
        continue;
      }
      const address = Address.parse(contract);
      const previousLt = this.lastSeenTransactionLt.get(contract) ?? 0n;
      const transactions = await this.listRecentTransactions(address, 20);
      const fresh = transactions
        .filter((tx) => tx.lt > previousLt)
        .sort((left, right) => (left.lt < right.lt ? -1 : left.lt > right.lt ? 1 : 0));
      if (fresh.length === 0) {
        continue;
      }

      let maxLt = previousLt;
      for (const tx of fresh) {
        if (tx.lt > maxLt) {
          maxLt = tx.lt;
        }
        const receipt = this.buildReceiptFromTransaction(tx, contract);
        const messageHash = tx.inMessage?.hash().toString("hex");
        for (const [key, listeners] of this.eventListeners.entries()) {
          if (!key.startsWith(`${contract}:`)) {
            continue;
          }
          const eventName = key.slice(contract.length + 1);
          for (const listener of listeners) {
            listener({
              contract,
              eventName,
              txHash: receipt.txHash,
              lt: tx.lt.toString(),
              messageHash,
              receipt,
            });
          }
        }
      }

      this.lastSeenTransactionLt.set(contract, maxLt);
    }
  }

  async waitForTransaction(txHash: TxHash, confirmations = 1): Promise<TxReceipt> {
    let attempts = 0;
    let firstSeenBlock: number | undefined;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      const receipt = await this.getTransactionReceipt(txHash);
      if (receipt) {
        if (confirmations <= 1) {
          return receipt;
        }
        const currentBlock = await this.getBlockNumber();
        firstSeenBlock ??= currentBlock;
        if (currentBlock >= firstSeenBlock + confirmations - 1) {
          return receipt;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new TonError("Transaction confirmation timeout", ErrorCode.SETTLEMENT_TIMEOUT);
  }

  async getBlockNumber(): Promise<number> {
    const masterchain = await this.client.getMasterchainInfo();
    return masterchain.latestSeqno;
  }

  async getTransactionReceipt(txHash: string): Promise<TxReceipt | undefined> {
    if (!this.connectedWallet) return undefined;
    const address = Address.parse(this.connectedWallet.address);
    const candidates = this.deriveTransactionCandidates(txHash);

    try {
      const txs = await this.listRecentTransactions(address, 20);
      for (const tx of txs) {
        if (
          candidates.has(tx.hash().toString("base64")) ||
          candidates.has(tx.hash().toString("hex")) ||
          candidates.has(tx.inMessage?.hash().toString("base64") ?? "") ||
          candidates.has(tx.inMessage?.hash().toString("hex") ?? "")
        ) {
          return this.buildReceiptFromTransaction(tx, this.connectedWallet.address);
        }
      }
    } catch (err) {
      console.error("TON getTransactionReceipt error:", err);
    }
    return undefined;
  }

  getExplorerUrl(txHash: TxHash | string): string {
    return `${this.config.explorerUrl}/tx/${txHash}`;
  }
}
