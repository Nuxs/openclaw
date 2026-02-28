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
  private pollingInterval?: NodeJS.Timeout;

  constructor(options: TONProviderOptions = {}) {
    this.chainId = options.testnet ? "ton-testnet" : "ton-mainnet";

    if (options.config && options.config.chainId !== this.chainId) {
      throw new Error(
        `TONProvider config chainId mismatch: expected ${this.chainId}, got ${options.config.chainId}`,
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

  async connect(config: ConnectionConfig): Promise<Wallet> {
    this.reconfigureClient(config);

    if (config.manifestUrl) {
      this.tonConnect = new TonConnect({ manifestUrl: config.manifestUrl });
      await this.tonConnect.connect();

      const walletInfo = this.tonConnect.wallet;
      if (!walletInfo) {
        throw new Error("Failed to connect wallet");
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
      throw new Error("TON headless connect requires tonMnemonic (or manifestUrl for TonConnect)");
    }

    const words = splitTonMnemonic(config.tonMnemonic);
    const keyPair = await mnemonicToPrivateKey(words);
    const workchain = typeof config.tonWorkchain === "number" ? config.tonWorkchain : 0;

    const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
    const provider = this.client.provider(wallet.address, wallet.init);

    this.tonConnect = undefined;
    this.headless = {
      workchain,
      keyPair,
      wallet,
      provider,
    };

    this.connectedWallet = {
      address: wallet.address.toString(),
      publicKey: keyPair.publicKey.toString("hex"),
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

    if (this.tonConnect) {
      await this.tonConnect.disconnect();
      this.tonConnect = undefined;
    }

    this.headless = undefined;
    this.connectedWallet = undefined;
  }

  async getAddress(): Promise<ProviderAddress> {
    if (!this.connectedWallet) {
      throw new Error("Wallet not connected");
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
      throw new Error("Wallet not connected");
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

    if (!this.pollingInterval) {
      this.startEventPolling();
    }

    return () => {
      this.eventListeners.get(key)?.delete(callback);
      if (this.eventListeners.get(key)?.size === 0) {
        this.eventListeners.delete(key);
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
    // TODO: implement if/when required.
  }

  async waitForTransaction(txHash: TxHash, confirmations = 1): Promise<TxReceipt> {
    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      const receipt = await this.getTransactionReceipt(txHash);
      if (receipt) {
        return receipt;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error("Transaction confirmation timeout");
  }

  async getBlockNumber(): Promise<number> {
    const masterchain = await this.client.getMasterchainInfo();
    return masterchain.latestSeqno;
  }

  async getTransactionReceipt(txHash: TxHash): Promise<TxReceipt | null> {
    if (!this.connectedWallet) return null;
    const address = Address.parse(this.connectedWallet.address);

    try {
      // Searching for transaction with specific hash or message hash.
      // NOTE: For external BOCs returned by transfer(), we might need to search by message hash.
      const txs = await this.client.getTransactions(address, { limit: 20 });
      for (const tx of txs) {
        // Match by tx hash
        if (tx.hash().toString("base64") === txHash || tx.hash().toString("hex") === txHash) {
          return {
            status: "success",
            blockNumber: tx.lt.toString(),
            transactionHash: tx.hash().toString("hex"),
            confirmations: 1,
          };
        }
        // Match by message hash (if txHash is actually a msg hash or BOC hash)
        if (
          tx.inMessage?.hash().toString("base64") === txHash ||
          tx.inMessage?.hash().toString("hex") === txHash
        ) {
          return {
            status: "success",
            blockNumber: tx.lt.toString(),
            transactionHash: tx.hash().toString("hex"),
            confirmations: 1,
          };
        }
      }
    } catch (err) {
      console.error("TON getTransactionReceipt error:", err);
    }
    return null;
  }

  getExplorerUrl(txHash: TxHash | string): string {
    return `${this.config.explorerUrl}/tx/${txHash}`;
  }
}
