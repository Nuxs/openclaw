/**
 * 交易相关类型定义
 */

import type { Address } from "./provider.js";

/**
 * 转账选项
 */
export interface TransferOptions {
  /** ERC20 代币地址，空=原生代币 */
  token?: Address;
  /** Gas 限制 */
  gasLimit?: bigint;
  /** 最大费用 per gas */
  maxFeePerGas?: bigint;
  /** 最大优先费 per gas */
  maxPriorityFeePerGas?: bigint;
  /** nonce */
  nonce?: number;
  /** 交易数据 */
  data?: string;
}

/**
 * EVM 交易参数
 */
export interface EvmTransaction {
  /** 接收地址 */
  to: Address;
  /** 金额 (wei) */
  value?: bigint;
  /** 交易数据 */
  data?: string;
  /** Gas 限制 */
  gasLimit?: bigint;
  /** 最大费用 per gas */
  maxFeePerGas?: bigint;
  /** 最大优先费 per gas */
  maxPriorityFeePerGas?: bigint;
  /** nonce */
  nonce?: number;
}

/**
 * 交易哈希
 */
export type TxHash = string;

/**
 * 交易回执
 */
export interface TxReceipt {
  /** 交易哈希 */
  txHash: TxHash;
  /** 区块号 */
  blockNumber: number;
  /** 区块哈希 */
  blockHash?: string;
  /** 状态 */
  status: "success" | "failure";
  /** 发送方 */
  from: Address;
  /** 接收方 */
  to?: Address;
  /** Gas 使用量 */
  gasUsed?: bigint;
  /** 日志 */
  logs: TxLog[];
}

/**
 * 交易日志
 */
export interface TxLog {
  /** 合约地址 */
  address: Address;
  /** 数据 */
  data: string;
  /** 主题 */
  topics: string[];
}

/**
 * 钱包信息
 */
export interface Wallet {
  /** 地址 */
  address: Address;
  /** 链 ID */
  chainId: number;
  /** 公钥 (可选，部分链如 TON 需要) */
  publicKey?: string;
}

/**
 * 连接配置
 */
export interface ConnectionConfig {
  /** 私钥 (后端/AI 模式) */
  privateKey?: `0x${string}`;
  /** 是否使用浏览器钱包 */
  useBrowserWallet?: boolean;
  /** 远程签名函数 (AI 场景 - 调用外部签名服务) */
  remoteSignFn?: (messageHash: string) => Promise<`0x${string}`>;
  /** TonConnect manifest URL (TON 模式) */
  manifestUrl?: string;
}
