/**
 * Blockchain Provider Factory
 * 统一管理和切换不同区块链的Provider
 *
 * EVM providers are loaded lazily via dynamic import so that the package
 * remains functional (TON, types, config) even when `viem` is not installed.
 */

import { EVM_CHAINS } from "./config/chains.js";
import { isViemAvailable, loadEvmProvider, ensureViemInstalled } from "./deps.js";
import { TONProvider } from "./providers/ton/index.js";
import type { ChainInfo, TonChainId, EvmChainId } from "./types/chain.js";
import { BlockchainError, ErrorCode, NotSupportedError } from "./types/error.js";
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

  /** Whether EVM providers have been registered. */
  private evmInitialized = false;

  /**
   * 初始化工厂 (async — registers TON immediately, EVM lazily)
   */
  static async init(): Promise<void> {
    const factory = BlockchainFactory.getInstance();
    await factory.registerBuiltInProviders();
  }

  /**
   * 同步初始化 — 仅注册 TON，EVM 需要后续调用 ensureEvmProviders()
   */
  static initSync(): void {
    const factory = BlockchainFactory.getInstance();
    factory.registerTonProviders();
    factory.defaultChainId = "ton-mainnet";
    // Attempt EVM in background (best-effort, non-blocking)
    if (isViemAvailable()) {
      void factory.registerEvmProviders();
    }
  }

  /**
   * 注册内置 Provider (TON 同步 + EVM 按需)
   */
  private async registerBuiltInProviders(): Promise<void> {
    this.registerTonProviders();

    // EVM — only if viem is available
    if (isViemAvailable()) {
      await this.registerEvmProviders();
    }

    this.defaultChainId = "ton-mainnet";
  }

  /**
   * 注册 TON providers (同步，无外部依赖)
   */
  private registerTonProviders(): void {
    if (!this.providers.has("ton-mainnet")) {
      this.register("ton-mainnet", new TONProvider({ testnet: false }));
    }
    if (!this.providers.has("ton-testnet")) {
      this.register("ton-testnet", new TONProvider({ testnet: true }));
    }
  }

  /**
   * 确保 EVM providers 已注册。如果 viem 未安装，尝试自动安装。
   */
  async ensureEvmProviders(params?: {
    log?: (message: string) => void;
    autoInstall?: boolean;
  }): Promise<void> {
    if (this.evmInitialized) return;

    if (!isViemAvailable()) {
      if (params?.autoInstall !== false) {
        await ensureViemInstalled({ log: params?.log });
      } else {
        throw new BlockchainError(
          "EVM chain support requires 'viem'. Install it with: npm install viem",
          ErrorCode.NOT_SUPPORTED,
          "evm",
        );
      }
    }

    await this.registerEvmProviders();
  }

  /**
   * 注册 EVM providers (需要 viem 已安装)
   */
  private async registerEvmProviders(): Promise<void> {
    if (this.evmInitialized) return;

    const { EVMProvider } = await loadEvmProvider();

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
        this.register(id, new EVMProvider({ chainId: chainId as EvmChainId, chainInfo }));
      }
    }

    this.evmInitialized = true;
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
      throw new BlockchainError(
        "No chain specified and no default chain set",
        ErrorCode.INVALID_PARAMS,
        "evm",
      );
    }

    const provider = this.providers.get(targetChainId);

    if (!provider) {
      throw new BlockchainError(
        `Provider for chain "${targetChainId}" not found. Supported chains: ${this.getSupportedChains().join(", ")}`,
        ErrorCode.NOT_SUPPORTED,
        "evm",
        { requestedChain: targetChainId, supported: this.getSupportedChains() },
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
      throw new BlockchainError(
        `Chain "${chainId}" is not supported`,
        ErrorCode.NOT_SUPPORTED,
        "evm",
        { requestedChain: chainId, supported: this.getSupportedChains() },
      );
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
    throw new BlockchainError(
      `No provider found for chain type: ${chainType}`,
      ErrorCode.NOT_SUPPORTED,
      chainType,
    );
  }

  /**
   * 获取EVM Provider (便捷方法，自动确保 EVM 已注册)
   */
  async getEVMProvider(chainId?: number): Promise<IProvider> {
    if (!this.evmInitialized) {
      await this.ensureEvmProviders();
    }
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
 * 初始化工厂 (异步 — 注册 TON + 按需注册 EVM)
 */
export async function initBlockchainFactory(): Promise<void> {
  await BlockchainFactory.init();
}

/**
 * 同步初始化工厂 (仅注册 TON，EVM 后台尝试)
 * 适用于不方便 await 的场景（如插件 onActivate 同步入口）
 */
export function initBlockchainFactorySync(): void {
  BlockchainFactory.initSync();
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
 * 获取EVM Provider (异步 — 自动确保 viem 已安装)
 */
export async function getEVMProvider(chainId?: number): Promise<IProvider> {
  return factory.getEVMProvider(chainId);
}

/**
 * 获取TON Provider
 */
export function getTONProvider(): IProvider {
  return factory.getTONProvider();
}

export default BlockchainFactory;
