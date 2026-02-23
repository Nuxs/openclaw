/**
 * 链配置常量
 */

import type { ChainInfo, EvmChainId } from "../types/chain.js";

/**
 * EVM 链配置映射
 */
export const EVM_CHAINS: Record<EvmChainId, ChainInfo> = {
  // Ethereum
  1: {
    id: 1,
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
    explorerUrl: "https://etherscan.io",
    rpcUrl: "https://eth.llamarpc.com",
  },
  // Sepolia (Testnet)
  11155111: {
    id: 11155111,
    name: "Sepolia",
    symbol: "ETH",
    decimals: 18,
    explorerUrl: "https://sepolia.etherscan.io",
    rpcUrl: "https://rpc.sepolia.org",
  },
  // Base
  8453: {
    id: 8453,
    name: "Base",
    symbol: "ETH",
    decimals: 18,
    explorerUrl: "https://basescan.org",
    rpcUrl: "https://mainnet.base.org",
  },
  // Base Sepolia (Testnet)
  84532: {
    id: 84532,
    name: "Base Sepolia",
    symbol: "ETH",
    decimals: 18,
    explorerUrl: "https://sepolia.basescan.org",
    rpcUrl: "https://sepolia.base.org",
  },
  // Optimism
  10: {
    id: 10,
    name: "Optimism",
    symbol: "ETH",
    decimals: 18,
    explorerUrl: "https://optimistic.etherscan.io",
    rpcUrl: "https://mainnet.optimism.io",
  },
  // Arbitrum
  42161: {
    id: 42161,
    name: "Arbitrum One",
    symbol: "ETH",
    decimals: 18,
    explorerUrl: "https://arbiscan.io",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
  },
  // Arbitrum Sepolia
  421614: {
    id: 421614,
    name: "Arbitrum Sepolia",
    symbol: "ETH",
    decimals: 18,
    explorerUrl: "https://sepolia.arbiscan.io",
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
  },
  // Polygon
  137: {
    id: 137,
    name: "Polygon",
    symbol: "MATIC",
    decimals: 18,
    explorerUrl: "https://polygonscan.com",
    rpcUrl: "https://polygon-rpc.com",
  },
  // Polygon Amoy (Testnet)
  80002: {
    id: 80002,
    name: "Polygon Amoy",
    symbol: "MATIC",
    decimals: 18,
    explorerUrl: "https://amoy.polygonscan.com",
    rpcUrl: "https://rpc-amoy.polygon.technology",
  },
  // BSC
  56: {
    id: 56,
    name: "BNB Chain",
    symbol: "BNB",
    decimals: 18,
    explorerUrl: "https://bscscan.com",
    rpcUrl: "https://bsc-dataseed.binance.org",
  },
  // BSC Testnet
  97: {
    id: 97,
    name: "BSC Testnet",
    symbol: "BNB",
    decimals: 18,
    explorerUrl: "https://testnet.bscscan.com",
    rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
  },
};

/**
 * 根据链 ID 获取链信息
 */
export function getChainInfo(chainId: EvmChainId): ChainInfo | undefined {
  return EVM_CHAINS[chainId];
}

/**
 * 常用代币配置
 */
export const COMMON_TOKENS = {
  // USDT
  USDT: {
    1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    8453: "0x4DEcEda2020b7298E65EE5Db6d6d4C3cD42D9E53", // Base
    137: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // Polygon
    56: "0x55d398326f99059fF775485246999027B319E5C", // BSC
  } as Record<number, string>,
  // USDC
  USDC: {
    1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    8453: "0x833589fCD6eDb6E08f4c7c32D4f71b54bdA02913", // Base
    137: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // Polygon
    56: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // BSC
  } as Record<number, string>,
  // DAI
  DAI: {
    1: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    8453: "0x4EC3A4dA54FC4B84eB6f6D4E21Cc32f3E7A7e8a", // Base
    137: "0x53E0bca35eC356BD5ddDFEbdD1Fc0fD03FaBad39", // Polygon
  } as Record<number, string>,
};

/**
 * 根据链 ID 获取代币地址
 */
export function getTokenAddress(
  token: keyof typeof COMMON_TOKENS,
  chainId: number,
): string | undefined {
  return COMMON_TOKENS[token]?.[chainId];
}
