/**
 * Provider 接口定义
 */

import type { ChainType, ChainId, TokenInfo } from "./chain.js";
import type {
  TransferOptions,
  EvmTransaction,
  TxHash,
  TxReceipt,
  Wallet,
  ConnectionConfig,
} from "./transaction.js";

// 重新导出 transaction.ts 中的类型
export type {
  TransferOptions,
  EvmTransaction,
  TxHash,
  TxReceipt,
  Wallet,
  ConnectionConfig,
} from "./transaction.js";

// 导出 chain.ts 中的类型
export type { ChainType, ChainId, TokenInfo } from "./chain.js";

/**
 * 地址类型
 */
/** EVM 地址格式 */
export type Address = `0x${string}` | string;

/**
 * 事件回调类型
 */
export type EventCallback = (event: unknown) => void;

/**
 * 取消订阅函数
 */
export type Unsubscribe = () => void;

/**
 * 通用 Provider 接口
 */
export interface IProvider {
  /** 链类型 */
  readonly chainType: ChainType;
  /** 链 ID */
  readonly chainId: ChainId;
  /** 链名称 */
  readonly chainName: string;
  /** 原生代币信息 */
  readonly nativeToken: TokenInfo;
  /** 是否已连接 */
  readonly isConnected: boolean;
  /** 当前钱包 */
  readonly wallet?: Wallet;

  /** 连接钱包 */
  connect(config: ConnectionConfig): Promise<Wallet>;
  /** 断开连接 */
  disconnect(): Promise<void>;
  /** 获取地址 */
  getAddress(): Promise<Address>;

  /** 获取余额 */
  getBalance(address: Address): Promise<bigint>;

  /** 转账 */
  transfer(to: Address, amount: bigint, options?: TransferOptions): Promise<TxHash>;

  /** 等待交易确认 */
  waitForTransaction(txHash: TxHash, confirmations?: number): Promise<TxReceipt>;

  /** 获取交易回执 */
  getTransactionReceipt(txHash: string): Promise<TxReceipt | undefined>;

  /** 获取当前区块号 */
  getBlockNumber(): Promise<number>;

  /** 获取区块链浏览器链接 */
  getExplorerUrl(txHash: TxHash | string): string;

  /** 获取链 ID */
  getChainId(): Promise<number>;
}

/**
 * EVM 特定 Provider 接口
 */
export interface IProviderEVM extends IProvider {
  readonly chainType: "evm";

  // ==================== EVM 签名 ====================

  /** 签名消息 */
  signMessage(message: string): Promise<`0x${string}`>;

  /** 签名 Typed Data (EIP-712) */
  signTypedData<
    TDomain extends TypedDataDomain,
    TTypes extends Record<string, TypedDataField[]>,
    TValues extends Record<string, unknown>,
  >(
    domain: TDomain,
    types: TTypes,
    value: TValues,
  ): Promise<`0x${string}`>;

  // ==================== EVM 交易 ====================

  /** 发送交易 */
  sendTransaction(tx: EvmTransaction): Promise<TxHash>;

  /** 估算 Gas */
  estimateGas(tx: Partial<EvmTransaction>): Promise<bigint>;

  /** 获取当前 Gas 价格 */
  getGasPrice(): Promise<bigint>;

  /** 获取当前 nonce */
  getNonce(): Promise<number>;

  // ==================== EVM 合约调用 ====================

  /** 调用合约 (只读) */
  call(to: Address, data: string): Promise<`0x${string}`>;

  // ==================== ERC20 ====================

  /** 获取 ERC20 代币余额 */
  erc20BalanceOf(token: Address, owner: Address): Promise<bigint>;

  /** ERC20 转账 */
  erc20Transfer(token: Address, to: Address, amount: bigint): Promise<TxHash>;

  /** ERC20 授权 */
  erc20Approve(token: Address, spender: Address, amount: bigint): Promise<TxHash>;
}

/**
 * TON 特定 Provider 接口
 */
export interface IProviderTON extends IProvider {
  readonly chainType: "ton";

  /**
   * Get the currently-connected TON wallet public key if available.
   *
   * - TonConnect: depends on wallet implementation
   * - Headless: derived from mnemonic
   */
  getPublicKey(): Promise<string | undefined>;
}

/**
 * Typed Data 类型定义 (EIP-712)
 */
export interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: Address;
  salt?: string;
}

export interface TypedDataField {
  name: string;
  type: string;
}

/**
 * 类型守卫：检查是否为 EVM Provider
 */
export function isProviderEVM(provider: IProvider): provider is IProviderEVM {
  return provider.chainType === "evm";
}

/**
 * 类型守卫：检查是否为 TON Provider
 */
export function isProviderTON(provider: IProvider): provider is IProviderTON {
  return provider.chainType === "ton";
}

/**
 * 类型守卫：断言为 EVM Provider
 */
export function assertProviderEVM(provider: IProvider): asserts provider is IProviderEVM {
  if (provider.chainType !== "evm") {
    throw new Error(`Expected EVM provider, got ${provider.chainType}`);
  }
}
