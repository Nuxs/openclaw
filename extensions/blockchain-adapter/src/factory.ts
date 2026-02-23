/**
 * Blockchain Provider Factory
 * 统一管理和切换不同区块链的Provider
 */

import { EVM_CHAINS, getChainInfo } from "./config/chains.js";
import { EVMProvider, type EVMProviderConfig } from "./providers/evm";
import { TONProvider } from "./providers/ton";
import type { ChainInfo, TonChainId } from "./types/chain.js";
import type { IProvider, ChainType, ChainId } from "./types/provider.js";

/**
 * 旧版链ID映射到新版（兼容性）
 */
const CHAIN_MAPPING: Record<string, { chainType: ChainType; chainId: ChainId }> = {
  "ton-mainnet": { chainType: "ton", chainId: "-239" as TonChainId },
  "ton-testnet": { chainType: "ton", chainId: "-3" as TonChainId },
  ethereum: { chainType: "evm", chainId: 1 },
  sepolia: { chainType: "evm", chainId: 11155111 },
  "base-mainnet": { chainType: "evm", chainId: 8453 },
  "base-sepolia": { chainType: "evm", chainId: 84532 },
  polygon: { chainType: "evm", chainId: 137 },
  "polygon-amoy": { chainType: "evm", chainId: 80002 },
  optimism: { chainType: "evm", chainId: 10 },
  arbitrum: { chainType: "evm", chainId: 42161 },
  bsc: { chainType: "evm", chainId: 56 },
  "bsc-testnet": { chainType: "evm", chainId: 97 },
};

/**
 * 工厂类
 */
export class BlockchainFactory {
  private static instance: BlockchainFactory;
  private providers = new Map<ChainId, IProvider>();
  private configs = new Map<ChainId, ChainInfo>();
  private defaultChainId?: ChainId;

  private constructor() {}

  /**
   * 获取工厂实例 (单例模式)
   */
  static getInstance(): BlockchainFactory {
    if (!BlockchainFactory.instance) {
      BlockchainFactory.instance = new BlockchainFactory();
    }
    return BlockchainFactory.instance;
  }

  /**
   * 初始化工厂
   */
  static init(): void {
    const factory = BlockchainFactory.getInstance();
    factory.registerBuiltInProviders();
  }

  /**
   * 注册内置Provider
   */
  private registerBuiltInProviders(): void {
    // TON
    this.register("ton-mainnet", new TONProvider({ testnet: false }));
    this.register("ton-testnet", new TONProvider({ testnet: true }));

    // EVM - 从配置表加载
    const evmChains = [
      { id: "ethereum", chainId: 1 },
      { id: "sepolia", chainId: 11155111 },
      { id: "base-mainnet", chainId: 8453 },
      { id: "base-sepolia", chainId: 84532 },
      { id: "polygon", chainId: 137 },
      { id: "polygon-amoy", chainId: 80002 },
      { id: "optimism", chainId: 10 },
      { id: "arbitrum", chainId: 42161 },
      { id: "bsc", chainId: 56 },
      { id: "bsc-testnet", chainId: 97 },
    ];

    for (const { id, chainId } of evmChains) {
      const chainInfo = EVM_CHAINS[chainId as keyof typeof EVM_CHAINS];
      if (chainInfo) {
        this.register(id, new EVMProvider({ chainId: chainId as any, chainInfo }));
      }
    }

    // 设置默认链
    this.defaultChainId = "ton-mainnet";
  }

  /**
   * 注册Provider
   */
  register(chainId: ChainId, provider: IProvider): void {
    if (this.providers.has(chainId)) {
      console.warn(`Provider for ${chainId} already registered, overwriting...`);
    }
    this.providers.set(chainId, provider);
  }

  /**
   * 获取Provider
   */
  getProvider(chainId?: ChainId): IProvider {
    const targetChainId = chainId || this.defaultChainId;

    if (!targetChainId) {
      throw new Error("No chain specified and no default chain set");
    }

    const provider = this.providers.get(targetChainId);

    if (!provider) {
      throw new Error(
        `Provider for chain "${targetChainId}" not found. ` +
          `Supported chains: ${this.getSupportedChains().join(", ")}`,
      );
    }

    return provider;
  }

  /**
   * 获取默认Provider
   */
  getDefaultProvider(): IProvider {
    return this.getProvider();
  }

  /**
   * 列出所有支持的链
   */
  getSupportedChains(): ChainId[] {
    return Array.from(this.providers.keys());
  }

  /**
   * 检查是否支持某条链
   */
  isSupported(chainId: ChainId): boolean {
    return this.providers.has(chainId);
  }

  /**
   * 设置默认链
   */
  setDefaultChain(chainId: ChainId): void {
    if (!this.isSupported(chainId)) {
      throw new Error(`Chain "${chainId}" is not supported`);
    }
    this.defaultChainId = chainId;
  }

  /**
   * 获取当前默认链ID
   */
  getDefaultChainId(): ChainId | undefined {
    return this.defaultChainId;
  }

  /**
   * 根据链类型获取Provider
   */
  getProviderByType(chainType: ChainType, chainId?: number): IProvider {
    // 查找匹配的链
    for (const [id, provider] of this.providers) {
      if (provider.chainType === chainType) {
        if (chainId === undefined || provider.chainId === chainId) {
          return provider;
        }
      }
    }
    throw new Error(`No provider found for chain type: ${chainType}`);
  }

  /**
   * 获取EVM Provider (便捷方法)
   */
  getEVMProvider(chainId?: number): IProvider {
    return this.getProviderByType("evm", chainId);
  }

  /**
   * 获取TON Provider (便捷方法)
   */
  getTONProvider(): IProvider {
    return this.getProviderByType("ton");
  }
}

// ============================================================================
// 便捷导出
// ============================================================================

export const factory = BlockchainFactory.getInstance();

/**
 * 初始化工厂
 */
export function initBlockchainFactory(): void {
  BlockchainFactory.init();
}

/**
 * 获取Provider
 */
export function getProvider(chainId?: ChainId): IProvider {
  return factory.getProvider(chainId);
}

/**
 * 获取支持的链列表
 */
export function getSupportedChains(): ChainId[] {
  return factory.getSupportedChains();
}

/**
 * 检查是否支持某条链
 */
export function isChainSupported(chainId: ChainId): boolean {
  return factory.isSupported(chainId);
}

/**
 * 获取EVM Provider
 */
export function getEVMProvider(chainId?: number): IProvider {
  return factory.getEVMProvider(chainId);
}

/**
 * 获取TON Provider
 */
export function getTONProvider(): IProvider {
  return factory.getTONProvider();
}

export default BlockchainFactory;
