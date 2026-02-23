/**
 * 链类型定义
 */
export type ChainType = "ton" | "evm" | "solana" | "sui";

/**
 * TON 链 ID
 */
export type TonChainId = "-239" | "-3" | string; // "-239"=mainnet, "-3"=testnet, 或自定义

/**
 * EVM 链 ID
 */
export type EvmChainId =
  | 1 // Ethereum Mainnet
  | 5 // Goerli (deprecated)
  | 11155111 // Sepolia
  | 8453 // Base Mainnet
  | 84532 // Base Sepolia
  | 10 // Optimism Mainnet
  | 42161 // Arbitrum One
  | 421614 // Arbitrum Sepolia
  | 137 // Polygon Mainnet
  | 80002 // Polygon Amoy
  | 56 // BSC
  | 97 // BSC Testnet
  | number; // 支持其他链

/**
 * 链 ID 联合类型（统一所有链）
 */
export type ChainId = TonChainId | EvmChainId;

/**
 * 检查链类型
 */
export type ChainIdOf<T extends ChainType> = T extends "ton"
  ? TonChainId
  : T extends "evm"
    ? EvmChainId
    : ChainId;

/**
 * 链元信息
 */
export interface ChainInfo {
  id: ChainId;
  name: string;
  symbol: string;
  decimals: number;
  explorerUrl: string;
  rpcUrl: string;
}

/**
 * 代币信息
 */
export interface TokenInfo {
  symbol: string;
  decimals: number;
  address?: string; // 空=原生代币
  name?: string;
}
