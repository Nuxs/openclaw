/**
 * Blockchain Provider Factory
 * 统一管理和切换不同区块链的Provider
 */

import { TONProvider } from "./providers/ton";
import type {
  IBlockchainProvider,
  IBlockchainFactory,
  ChainId,
  ProviderConfig,
} from "./types/provider";

// ============================================================================
// 工厂类
// ============================================================================

export class BlockchainFactory implements IBlockchainFactory {
  private static instance: BlockchainFactory;
  private providers = new Map<ChainId, IBlockchainProvider>();
  private configs = new Map<ChainId, ProviderConfig>();
  private defaultChainId?: ChainId;

  private constructor() {
    // 私有构造函数，强制使用单例
  }

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
   * 初始化工厂 (注册所有支持的链)
   * @param configs 链配置列表
   * @param defaultChain 默认链ID
   */
  static init(configs?: ProviderConfig[], defaultChain?: ChainId): void {
    const factory = BlockchainFactory.getInstance();

    // 加载配置
    if (configs) {
      configs.forEach((config) => {
        factory.configs.set(config.chainId, config);
      });
    }

    // 设置默认链
    factory.defaultChainId = defaultChain || "ton-mainnet";

    // 注册内置Provider
    factory.registerBuiltInProviders();
  }

  /**
   * 注册内置的Provider
   */
  private registerBuiltInProviders(): void {
    // TON Mainnet
    const tonMainnetConfig = this.getConfig("ton-mainnet");
    this.register("ton-mainnet", new TONProvider({ testnet: false, config: tonMainnetConfig }));

    // TON Testnet
    const tonTestnetConfig = this.getConfig("ton-testnet");
    this.register("ton-testnet", new TONProvider({ testnet: true, config: tonTestnetConfig }));

    // 其他链暂时注册为占位符
    // Solana
    // this.register('solana-mainnet', new SolanaProvider());

    // Sui
    // this.register('sui-mainnet', new SuiProvider());

    // Base (EVM)
    // this.register('base-mainnet', new BaseProvider());
  }

  /**
   * 注册Provider
   * @param chainId 链ID
   * @param provider Provider实例
   */
  register(chainId: ChainId, provider: IBlockchainProvider): void {
    if (this.providers.has(chainId)) {
      console.warn(`Provider for ${chainId} already registered, overwriting...`);
    }
    this.providers.set(chainId, provider);
  }

  /**
   * 获取Provider
   * @param chainId 链ID (可选，不传则返回默认链)
   * @returns Provider实例
   * @throws 如果链不支持
   *
   * @example
   * // 获取默认链 (TON)
   * const provider = factory.getProvider();
   *
   * // 获取指定链
   * const solanaProvider = factory.getProvider('solana-mainnet');
   */
  getProvider(chainId?: ChainId): IBlockchainProvider {
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
  getDefaultProvider(): IBlockchainProvider {
    return this.getProvider();
  }

  /**
   * 列出所有支持的链
   * @returns 链ID列表
   */
  getSupportedChains(): ChainId[] {
    return Array.from(this.providers.keys());
  }

  /**
   * 检查是否支持某条链
   * @param chainId 链ID
   * @returns 是否支持
   */
  isSupported(chainId: ChainId): boolean {
    return this.providers.has(chainId);
  }

  /**
   * 设置默认链
   * @param chainId 链ID
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
   * 获取链配置
   * @param chainId 链ID
   * @returns 配置对象
   */
  getConfig(chainId: ChainId): ProviderConfig | undefined {
    return this.configs.get(chainId);
  }

  /**
   * 更新链配置
   * @param chainId 链ID
   * @param config 新配置
   */
  updateConfig(chainId: ChainId, config: Partial<ProviderConfig>): void {
    const existingConfig = this.configs.get(chainId);
    if (existingConfig) {
      this.configs.set(chainId, { ...existingConfig, ...config });
    } else {
      throw new Error(`Config for chain "${chainId}" not found`);
    }
  }
}

// ============================================================================
// 便捷导出 (单例模式)
// ============================================================================

/**
 * 全局工厂实例
 */
export const factory = BlockchainFactory.getInstance();

/**
 * 初始化工厂
 */
export function initBlockchainFactory(configs?: ProviderConfig[], defaultChain?: ChainId): void {
  BlockchainFactory.init(configs, defaultChain);
}

/**
 * 获取Provider
 */
export function getProvider(chainId?: ChainId): IBlockchainProvider {
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

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 创建多链Provider代理
 * 自动根据chainId切换Provider
 *
 * @example
 * const provider = createMultiChainProxy();
 *
 * // 自动切换到TON
 * await provider.getBalance(tonAddress, 'ton-mainnet');
 *
 * // 自动切换到Solana
 * await provider.getBalance(solAddress, 'solana-mainnet');
 */
export function createMultiChainProxy(): MultiChainProvider {
  return new Proxy({} as any, {
    get(target, prop: string) {
      return async (...args: any[]) => {
        // 从最后一个参数提取chainId
        const lastArg = args[args.length - 1];
        let chainId: ChainId | undefined;

        if (typeof lastArg === "string" && factory.isSupported(lastArg as ChainId)) {
          chainId = args.pop() as ChainId;
        }

        const provider = factory.getProvider(chainId);

        // 调用对应方法
        if (typeof (provider as any)[prop] === "function") {
          return await (provider as any)[prop](...args);
        }

        return (provider as any)[prop];
      };
    },
  });
}

/**
 * 多链Provider接口
 * 所有方法支持最后一个参数传入chainId
 */
export interface MultiChainProvider extends IBlockchainProvider {
  // 所有方法的签名与IBlockchainProvider相同
  // 但可以在最后添加chainId参数来切换链
}

// ============================================================================
// 配置加载器
// ============================================================================

/**
 * 从JSON文件加载配置
 * @param configPath 配置文件路径
 */
export async function loadConfigFromFile(configPath: string): Promise<void> {
  try {
    const fs = await import("fs/promises");
    const configData = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configData);

    const configs: ProviderConfig[] = Object.entries(config.chains || {}).map(
      ([chainId, chainConfig]: [string, any]) => ({
        chainId: chainId as ChainId,
        rpcUrl: chainConfig.rpcUrl,
        explorerUrl: chainConfig.explorerUrl,
        contracts: chainConfig.contracts,
        testnet: chainConfig.testnet,
      }),
    );

    BlockchainFactory.init(configs, config.defaultChain);
  } catch (error) {
    console.error("Failed to load config from file:", error);
    // 使用默认配置
    BlockchainFactory.init();
  }
}

/**
 * 从环境变量加载配置
 */
export function loadConfigFromEnv(): void {
  const configs: ProviderConfig[] = [];

  // TON Mainnet
  if (process.env.TON_MAINNET_RPC) {
    configs.push({
      chainId: "ton-mainnet",
      rpcUrl: process.env.TON_MAINNET_RPC,
      explorerUrl: "https://tonscan.org",
      contracts: {
        settlement: process.env.TON_MAINNET_SETTLEMENT!,
        marketplace: process.env.TON_MAINNET_MARKETPLACE,
        token: process.env.TON_MAINNET_TOKEN,
      },
    });
  }

  // TON Testnet
  if (process.env.TON_TESTNET_RPC) {
    configs.push({
      chainId: "ton-testnet",
      rpcUrl: process.env.TON_TESTNET_RPC,
      explorerUrl: "https://testnet.tonscan.org",
      contracts: {
        settlement: process.env.TON_TESTNET_SETTLEMENT!,
        marketplace: process.env.TON_TESTNET_MARKETPLACE,
        token: process.env.TON_TESTNET_TOKEN,
      },
      testnet: true,
    });
  }

  // Solana
  if (process.env.SOLANA_MAINNET_RPC) {
    configs.push({
      chainId: "solana-mainnet",
      rpcUrl: process.env.SOLANA_MAINNET_RPC,
      explorerUrl: "https://explorer.solana.com",
      contracts: {
        settlement: process.env.SOLANA_MAINNET_SETTLEMENT!,
        marketplace: process.env.SOLANA_MAINNET_MARKETPLACE,
        token: process.env.SOLANA_MAINNET_TOKEN,
      },
    });
  }

  const defaultChain = (process.env.DEFAULT_CHAIN as ChainId) || "ton-mainnet";

  BlockchainFactory.init(configs.length > 0 ? configs : undefined, defaultChain);
}

// ============================================================================
// 默认导出
// ============================================================================

export default BlockchainFactory;
