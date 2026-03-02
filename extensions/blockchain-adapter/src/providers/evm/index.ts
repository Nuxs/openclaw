/**
 * EVM Provider 主导出
 *
 * IProviderEVM 完整实现
 *
 * 注意：settlement（托管/结算）业务逻辑由 market-core 层处理，
 * 本 Provider 只提供底层原子操作（transfer / call / erc20*）
 */

export { EvmClient } from "./client.js";
export { EvmWallet, type SignerMode } from "./wallet.js";
export { EvmErc20 } from "./erc20.js";

import { getChainInfo } from "../../config/chains.js";
import { type EvmChainId, type ChainInfo } from "../../types/chain.js";
import { NotConnectedError, EvmError } from "../../types/error.js";
import {
  type Address,
  type ChainId,
  type TokenInfo,
  type IProviderEVM,
  type ConnectionConfig,
  type Wallet,
  type TransferOptions,
  type EvmTransaction,
  type TxHash,
  type TxReceipt,
} from "../../types/provider.js";
import { EvmClient } from "./client.js";
import { EvmErc20 } from "./erc20.js";
import { EvmWallet } from "./wallet.js";

/**
 * EVM Provider 配置
 */
export interface EVMProviderConfig {
  /** 链 ID */
  chainId: EvmChainId;
  /** 链配置 (可选，自动从配置表获取) */
  chainInfo?: ChainInfo;
}

/**
 * EVM Provider 实现
 *
 * 完整实现 IProviderEVM 接口
 *
 * 设计原则：
 * - 保持底层抽象纯粹性：不包含业务场景假设（如 "AI 场景"）
 * - settlement（托管/结算）由 market-core 调用底层 transfer/call 实现
 */
export class EVMProvider implements IProviderEVM {
  // 核心组件
  public readonly client: EvmClient;
  public readonly walletClient: EvmWallet;
  public readonly erc20: EvmErc20;

  // 链信息
  public readonly chainInfo: ChainInfo;

  constructor(config: EVMProviderConfig) {
    // 获取链信息
    const chainInfo = config.chainInfo || getChainInfo(config.chainId);
    if (!chainInfo) {
      throw new EvmError(`Unknown chain: ${config.chainId}`);
    }
    this.chainInfo = chainInfo;

    // 初始化组件
    this.client = new EvmClient(this.chainInfo);
    this.walletClient = new EvmWallet(this.chainInfo);
    this.erc20 = new EvmErc20(this.client, this.walletClient);
  }

  // ==================== IProvider 通用接口 ====================

  get chainType(): "evm" {
    return "evm";
  }

  get chainId(): ChainId {
    return this.chainInfo.id;
  }

  get chainName(): string {
    return this.chainInfo.name;
  }

  get nativeToken(): TokenInfo {
    return this.client.nativeToken;
  }

  get isConnected(): boolean {
    return this.walletClient.isConnected;
  }

  get walletInfo(): Wallet | undefined {
    return this.walletClient.wallet;
  }

  async connect(config: ConnectionConfig): Promise<Wallet> {
    return this.walletClient.connect(config);
  }

  async disconnect(): Promise<void> {
    return this.walletClient.disconnect();
  }

  async getAddress(): Promise<Address> {
    return this.walletClient.getAddress();
  }

  async getBalance(address: Address): Promise<bigint> {
    return this.client.getBalance(address as `0x${string}`);
  }

  async transfer(to: Address, amount: bigint, options?: TransferOptions): Promise<TxHash> {
    // 根据 token 判断是原生代币还是 ERC20
    if (options?.token) {
      return this.erc20.transfer(options.token as `0x${string}`, to as `0x${string}`, amount);
    }
    // 原生代币转账
    return this.walletClient.sendTransaction({
      to: to as `0x${string}`,
      value: amount,
      data: options?.data as `0x${string}` | undefined,
      gasLimit: options?.gasLimit,
      maxFeePerGas: options?.maxFeePerGas,
      maxPriorityFeePerGas: options?.maxPriorityFeePerGas,
      nonce: options?.nonce,
    });
  }

  async waitForTransaction(txHash: TxHash, confirmations: number = 1): Promise<TxReceipt> {
    const receipt = await this.client.waitForTransaction(txHash as `0x${string}`, confirmations);

    return {
      txHash,
      blockNumber: Number(receipt.blockNumber),
      status: receipt.status,
      gasUsed: receipt.gasUsed,
      from: (await this.getAddress()) as Address,
      to: undefined,
      logs: [],
    };
  }

  async getTransactionReceipt(txHash: string): Promise<TxReceipt | undefined> {
    try {
      const receipt = await this.client.getTransactionReceipt(txHash as `0x${string}`);
      if (!receipt) return undefined;

      return {
        txHash,
        blockNumber: Number(receipt.blockNumber),
        blockHash: receipt.blockHash,
        status: receipt.status === "success" ? "success" : "failure",
        from: receipt.from as Address,
        to: (receipt.to as Address) || undefined,
        gasUsed: receipt.gasUsed,
        logs: receipt.logs.map((log) => ({
          address: log.address as Address,
          data: log.data,
          topics: log.topics,
        })),
      };
    } catch {
      return undefined;
    }
  }

  async getBlockNumber(): Promise<number> {
    return this.client.getBlockNumber();
  }

  getExplorerUrl(txHash: TxHash | string): string {
    return `${this.chainInfo.explorerUrl}/tx/${txHash}`;
  }

  async getChainId(): Promise<number> {
    return Number(this.chainInfo.id);
  }

  // ==================== IProviderEVM 特定接口 ====================

  async signMessage(message: string): Promise<`0x${string}`> {
    return this.walletClient.signMessage(message);
  }

  async signTypedData<
    TDomain extends {
      name?: string;
      version?: string;
      chainId?: number;
      verifyingContract?: string;
      salt?: string;
    },
    TTypes extends Record<string, { name: string; type: string }[]>,
    TValues extends Record<string, unknown>,
  >(domain: TDomain, types: TTypes, value: TValues): Promise<`0x${string}`> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { name: _domainName, ...domainWithoutName } = domain;
    return this.walletClient.signTypedData(
      domainWithoutName as any,
      types as any,
      value as any,
    ) as Promise<`0x${string}`>;
  }

  async sendTransaction(tx: EvmTransaction): Promise<TxHash> {
    return this.walletClient.sendTransaction({
      to: tx.to as `0x${string}`,
      value: tx.value,
      data: tx.data as `0x${string}` | undefined,
      gasLimit: tx.gasLimit,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      nonce: tx.nonce,
    });
  }

  async estimateGas(tx: Partial<EvmTransaction>): Promise<bigint> {
    const address = await this.getAddress();
    return this.client.estimateGas({
      from: address as `0x${string}`,
      to: tx.to as `0x${string}`,
      value: tx.value,
      data: tx.data as `0x${string}` | undefined,
    });
  }

  async getGasPrice(): Promise<bigint> {
    return this.client.getGasPrice();
  }

  async getNonce(): Promise<number> {
    return this.walletClient.getNonce();
  }

  async call(to: Address, data: string): Promise<`0x${string}`> {
    return this.client.call(to as `0x${string}`, data as `0x${string}`);
  }

  // ERC20
  async erc20BalanceOf(token: Address, owner: Address): Promise<bigint> {
    return this.erc20.balanceOf(token as `0x${string}`, owner as `0x${string}`);
  }

  async erc20Transfer(token: Address, to: Address, amount: bigint): Promise<TxHash> {
    return this.erc20.transfer(token as `0x${string}`, to as `0x${string}`, amount);
  }

  async erc20Approve(token: Address, spender: Address, amount: bigint): Promise<TxHash> {
    return this.erc20.approve(token as `0x${string}`, spender as `0x${string}`, amount);
  }

  // ==================== 便捷方法 ====================

  /**
   * 检查是否已连接
   */
  assertConnected(): asserts this is { wallet: { isConnected: true } } {
    if (!this.isConnected) {
      throw new NotConnectedError("evm");
    }
  }
}
