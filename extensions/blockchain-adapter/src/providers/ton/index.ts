/**
 * TON Blockchain Provider Implementation
 * 基于TON SDK和TonConnect实现
 */

import { Address as TonAddress, TonClient, beginCell, Cell, toNano } from "@ton/ton";
import { TonConnect } from "@tonconnect/sdk";
import type {
  IProvider,
  ChainId,
  TxHash,
  Address,
  Wallet,
  ConnectionConfig,
  TxReceipt,
  TokenInfo,
  EventCallback,
  Unsubscribe,
} from "../../types/provider.js";

/**
 * TON Provider 配置
 */
export interface TONProviderConfig {
  chainId?: string;
  rpcUrl?: string;
  explorerUrl?: string;
}

// ============================================================================
// TON Provider Configuration
// ============================================================================

interface TONProviderOptions {
  testnet?: boolean;
  rpcUrl?: string;
  apiKey?: string;
  config?: TONProviderConfig;
}

export class TONProvider implements IProvider {
  // ==================== 基础属性 ====================

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
    return this.chainId === "ton-mainnet" ? -239 : -3; // TON 使用负数 chainId
  }

  private client: TonClient;
  private tonConnect?: TonConnect;
  private connectedWallet?: Wallet;
  private config: TONProviderConfig;
  private eventListeners = new Map<string, Set<EventCallback>>();
  private pollingInterval?: NodeJS.Timeout;

  // ==================== 构造函数 ====================

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

    // 加载配置：优先使用外部注入 (factory/config file/env)
    this.config = options.config
      ? {
          ...options.config,
          chainId: this.chainId,
          rpcUrl,
        }
      : this.loadConfig();
  }

  private loadConfig(): TONProviderConfig {
    // TODO: 从配置文件加载
    return {
      chainId: this.chainId as string,
      rpcUrl: this.client.parameters.endpoint,
      explorerUrl:
        this.chainId === "ton-testnet" ? "https://testnet.tonscan.org" : "https://tonscan.org",
    };
  }

  // ==================== 身份认证 ====================

  async connect(config: ConnectionConfig): Promise<Wallet> {
    if (!config.manifestUrl) {
      throw new Error("TonConnect requires manifestUrl");
    }

    // 初始化TonConnect
    this.tonConnect = new TonConnect({
      manifestUrl: config.manifestUrl,
    });

    // 请求连接
    await this.tonConnect.connect();

    // 获取钱包信息
    const walletInfo = this.tonConnect.wallet;
    if (!walletInfo) {
      throw new Error("Failed to connect wallet");
    }

    this.connectedWallet = {
      address: walletInfo.account.address,
      publicKey: walletInfo.account.publicKey,
      chainId: Number(this.chainId),
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
      this.connectedWallet = undefined;
    }
  }

  async getAddress(): Promise<Address> {
    if (!this.connectedWallet) {
      throw new Error("Wallet not connected");
    }
    return this.connectedWallet.address;
  }

  async signMessage(message: string): Promise<string> {
    if (!this.tonConnect) {
      throw new Error("Wallet not connected");
    }

    // TonConnect签名
    const payload = beginCell()
      .storeUint(0, 32) // opcode
      .storeStringTail(message)
      .endCell();

    const result = await this.tonConnect.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [
        {
          address: await this.getAddress(),
          amount: "0",
          payload: payload.toBoc().toString("base64"),
        },
      ],
    });

    return result.boc;
  }

  // ==================== 代币操作 ====================

  async getBalance(address: Address): Promise<bigint> {
    const tonAddress = TonAddress.parse(address);
    // 查询TON余额
    const balance = await this.client.getBalance(tonAddress);
    return balance;
  }

  async transfer(to: Address, amount: bigint): Promise<TxHash> {
    if (!this.tonConnect) {
      throw new Error("Wallet not connected");
    }

    // 转账TON
    const result = await this.tonConnect.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [
        {
          address: to,
          amount: amount.toString(),
        },
      ],
    });

    return result.boc;
  }

  // ==================== 智能合约交互 ====================

  async deployContract(bytecode: string, args: any[]): Promise<string> {
    if (!this.tonConnect) {
      throw new Error("Wallet not connected");
    }

    // TODO: 实现合约部署
    throw new Error("Not implemented");
  }

  async callContract(address: string, method: string, args: any[]): Promise<any> {
    const contractAddress = TonAddress.parse(address);

    // 调用get方法
    const result = await this.client.runMethod(contractAddress, method, args);

    return result.stack;
  }

  async estimateGas(tx: { to: string; value?: bigint; data?: string }): Promise<bigint> {
    // TON的Gas费用相对固定
    // 普通转账约0.01 TON，合约调用约0.05-0.1 TON
    return toNano("0.05");
  }

  // ==================== 事件监听 ====================

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

    // 启动轮询 (TON目前没有原生WebSocket事件)
    if (!this.pollingInterval) {
      this.startEventPolling();
    }

    // 返回取消订阅函数
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
          // 检查新区块的交易
          await this.checkNewTransactions(lastBlockNumber, currentBlock);
          lastBlockNumber = currentBlock;
        }
      } catch (error) {
        console.error("Event polling error:", error);
      }
    }, 5000); // 每5秒轮询一次
  }

  private async checkNewTransactions(fromBlock: number, toBlock: number) {
    // TODO: 实现交易检查逻辑
    // 遍历合约地址，查找相关交易，解析事件并触发回调
  }

  // ==================== 工具方法 ====================

  async waitForTransaction(txHash: TxHash, confirmations = 1): Promise<TxReceipt> {
    // TON的交易确认较快，通常1-2秒
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
    return masterchain.last.seqno;
  }

  async getTransactionReceipt(txHash: TxHash): Promise<TxReceipt | null> {
    try {
      // TODO: 通过txHash查询交易详情
      // TON的交易哈希格式与EVM不同，需要特殊处理

      return null; // 暂未实现
    } catch (error) {
      return null;
    }
  }

  getExplorerUrl(txHash: TxHash): string {
    return `${this.config.explorerUrl}/tx/${txHash}`;
  }

  getChainType(): "ton" | "evm" {
    return "ton";
  }
}
