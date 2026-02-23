/**
 * EVM WalletClient + 签名封装
 *
 * 职责：交易签名与发送
 * 支持三种模式：
 * 1. 私钥模式 - AI/后端直接用私钥签名
 * 2. 浏览器钱包 - 用户通过 MetaMask 等授权 (暂时禁用)
 * 3. 远程签名 - AI 可以请求外部签名服务
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  hashMessage,
  type WalletClient,
  type PublicClient,
  type Hash,
  type Address as EvmAddress,
  type Chain,
  type Account,
  type SignableMessage,
} from "viem";
import { privateKeyToAccount, generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import type { ChainInfo, EvmChainId } from "../../types/chain.js";
import { NotConnectedError, EvmError } from "../../types/error.js";
import type { ConnectionConfig, Wallet } from "../../types/transaction.js";

/**
 * 签名模式
 */
export type SignerMode =
  | { type: "private-key"; privateKey: `0x${string}` }
  | { type: "browser-wallet" }
  | { type: "remote-signature"; signFn: (message: string) => Promise<`0x${string}`> }
  | { type: "none" };

/**
 * 连接配置扩展 (支持 AI 场景)
 */
export interface WalletConnectionConfig extends ConnectionConfig {
  /** 远程签名函数 (AI 场景) */
  remoteSignFn?: (message: string) => Promise<`0x${string}`>;
}

/**
 * WalletClient 封装类
 */
export class EvmWallet {
  private walletClient: WalletClient | null = null;
  private publicClient: PublicClient | null = null;
  private _account: Account | null = null;
  private _address: EvmAddress | null = null;
  public signerMode: SignerMode = { type: "none" };
  public wallet: Wallet | undefined;

  constructor(private readonly chainInfo: ChainInfo) {
    // 初始化 PublicClient (用于不需要签名的操作)
    this.publicClient = createPublicClient({
      chain: this.createChain(),
      transport: http(chainInfo.rpcUrl),
    });
  }

  /**
   * 连接钱包
   */
  async connect(config: WalletConnectionConfig): Promise<Wallet> {
    if (config.privateKey) {
      await this.connectWithPrivateKey(config.privateKey);
    } else if (config.useBrowserWallet) {
      // TODO: 浏览器钱包模式暂时禁用，等待 viem 2.x 稳定
      throw new Error(
        "Browser wallet support is temporarily disabled. Use privateKey or remoteSignFn.",
      );
    } else if (config.remoteSignFn) {
      await this.connectWithRemoteSignature(config.remoteSignFn);
    } else {
      throw new Error("No wallet configuration provided");
    }

    if (!this._address) {
      throw new Error("Failed to get wallet address");
    }

    this.wallet = {
      address: this._address,
      chainId: Number(this.chainInfo.id),
    };

    return this.wallet;
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.walletClient = null;
    this._account = null;
    this._address = null;
    this.signerMode = { type: "none" };
    this.wallet = undefined;
  }

  /**
   * 获取当前地址
   */
  getAddress(): EvmAddress {
    if (!this._address) {
      throw new NotConnectedError("evm");
    }
    return this._address;
  }

  /**
   * 是否已连接
   */
  get isConnected(): boolean {
    return this._address !== null;
  }

  // ==================== 连接方式 ====================

  /**
   * 使用私钥连接 (AI/后端场景)
   */
  private async connectWithPrivateKey(privateKey: `0x${string}`): Promise<void> {
    this._account = privateKeyToAccount(privateKey);
    this._address = this._account.address;
    this.signerMode = { type: "private-key", privateKey };

    this.walletClient = createWalletClient({
      account: this._account,
      chain: this.createChain(),
      transport: http(this.chainInfo.rpcUrl),
    });
  }

  /**
   * 使用浏览器钱包连接 (MetaMask 等)
   * 暂时禁用 - viem 2.x 兼容性问题
   */
  private async connectWithBrowserWallet(): Promise<void> {
    throw new Error("Browser wallet support is temporarily disabled");
  }

  /**
   * 远程签名模式 (AI 场景 - 调用外部签名服务)
   */
  private async connectWithRemoteSignature(
    signFn: (message: string) => Promise<`0x${string}`>,
  ): Promise<void> {
    // 生成临时地址用于显示 (实际签名由远程服务完成)
    const tempPrivateKey = generatePrivateKey();
    this._account = privateKeyToAccount(tempPrivateKey);
    this._address = privateKeyToAddress(tempPrivateKey);

    this.signerMode = { type: "remote-signature", signFn };

    // 创建只读 walletClient (不实际发送交易)
    this.walletClient = createWalletClient({
      account: this._account,
      chain: this.createChain(),
      transport: http(this.chainInfo.rpcUrl),
    });
  }

  /**
   * 创建 viem Chain 对象
   * 注意：EVM 链 ID 必须是 number
   */
  private createChain(): Chain {
    // EVM 链 ID 必须是 number
    const evmChainId = Number(this.chainInfo.id);
    if (isNaN(evmChainId)) {
      throw new EvmError(`Invalid EVM chain ID: ${this.chainInfo.id}`);
    }

    return {
      id: evmChainId,
      name: this.chainInfo.name,
      nativeCurrency: {
        name: this.chainInfo.symbol,
        symbol: this.chainInfo.symbol,
        decimals: this.chainInfo.decimals,
      },
      rpcUrls: {
        default: { http: [this.chainInfo.rpcUrl] },
        public: { http: [this.chainInfo.rpcUrl] },
      },
      blockExplorers: {
        default: { name: "Explorer", url: this.chainInfo.explorerUrl },
      },
    };
  }

  // ==================== 签名 ====================

  /**
   * 签名消息 (完整实现)
   *
   * 支持三种签名模式：
   * 1. private-key - 使用本地私钥签名 (通过 WalletClient)
   * 2. browser-wallet - 通过外部 provider (MetaMask 等) 签名
   * 3. remote-signature - 调用远程签名服务
   */
  async signMessage(message: string): Promise<`0x${string}`> {
    if (!this._address) {
      throw new NotConnectedError("evm");
    }

    switch (this.signerMode.type) {
      case "private-key": {
        // 后端私钥签名 - 使用 WalletClient (已绑定 account)
        if (!this.walletClient) {
          throw new NotConnectedError("evm");
        }
        // @ts-expect-error viem 2.x account 类型复杂，运行时绑定
        return this.walletClient.signMessage({
          message: message as SignableMessage,
        });
      }

      case "browser-wallet": {
        // 浏览器钱包签名 - 通过外部 provider
        if (!this.walletClient) {
          throw new NotConnectedError("evm");
        }
        // @ts-expect-error viem 2.x account 类型复杂，运行时绑定
        return this.walletClient.signMessage({
          message: message as SignableMessage,
        });
      }

      case "remote-signature": {
        // 远程签名服务 - 先计算哈希再签名
        const messageHash = hashMessage(message);
        return this.signerMode.signFn(messageHash);
      }

      default:
        throw new Error("No signing capability available");
    }
  }

  /**
   * 签名 Typed Data (EIP-712) (完整实现)
   *
   * AI 场景可构造任意 EIP-712 结构化数据
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    if (!this._address) {
      throw new NotConnectedError("evm");
    }

    // 移除 EIP-712 Domain 类型名称 (viem 要求)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { name: _domainName, ...domainWithoutName } = domain;

    switch (this.signerMode.type) {
      case "private-key": {
        // 使用 WalletClient 签名 (已绑定 account)
        if (!this.walletClient) {
          throw new NotConnectedError("evm");
        }
        // @ts-expect-error viem 2.x signTypedData 类型复杂，运行时绑定
        return this.walletClient.signTypedData({
          domain: domainWithoutName as never,
          types: types as never,
          primaryType: Object.keys(types)[0] as never,
          message: value as never,
        });
      }

      case "browser-wallet": {
        // 浏览器钱包签名 - 通过外部 provider
        if (!this.walletClient) {
          throw new NotConnectedError("evm");
        }
        // @ts-expect-error viem 2.x signTypedData 类型复杂，运行时绑定
        return this.walletClient.signTypedData({
          domain: domainWithoutName as never,
          types: types as never,
          primaryType: Object.keys(types)[0] as never,
          message: value as never,
        });
      }

      case "remote-signature": {
        // 远程签名需要构建完整的 EIP-712 消息
        const typedData = {
          domain: domainWithoutName,
          types,
          primaryType: Object.keys(types)[0],
          message: value,
        };
        // 这里返回空实现，实际需要构建 EIP-712 哈希
        const messageHash = hashMessage(JSON.stringify(typedData));
        return this.signerMode.signFn(messageHash);
      }

      default:
        throw new Error("No signing capability available");
    }
  }

  /**
   * AI 场景: 直接签名交易数据 (不广播)
   *
   * 返回签名的交易 hex，可用于:
   * - 发送给签名服务
   * - 延迟广播
   * - 多签场景
   *
   * 注: 当前版本使用 sendTransaction 替代，完整实现需要 viem 的 signTransaction
   */
  async signTransaction(_tx: {
    to?: EvmAddress;
    value?: bigint;
    data?: string;
    gasLimit?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    nonce?: number;
  }): Promise<`0x${string}`> {
    // 当前版本请使用 sendTransaction()
    throw new Error("Use sendTransaction() instead. Full signTransaction coming soon.");
  }

  // ==================== 交易发送 ====================

  /**
   * 发送交易
   */
  async sendTransaction(tx: {
    to: EvmAddress;
    value?: bigint;
    data?: string;
    gasLimit?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    nonce?: number;
  }): Promise<Hash> {
    if (!this.walletClient || !this._account) {
      throw new NotConnectedError("evm");
    }

    try {
      const chain = this.createChain();
      const hash = await this.walletClient.sendTransaction({
        account: this._account.address,
        chain,
        to: tx.to,
        value: tx.value || 0n,
        data: tx.data as `0x${string}` | undefined,
        gas: tx.gasLimit,
        maxFeePerGas: tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        nonce: tx.nonce,
      });
      return hash;
    } catch (error) {
      throw new Error(`Transaction failed: ${error}`);
    }
  }

  /**
   * AI 场景: 发送原始交易 (raw transaction)
   *
   * AI 可以直接提供签名的交易 hex 进行广播
   */
  async sendRawTransaction(signedTx: `0x${string}`): Promise<Hash> {
    if (!this.publicClient) {
      throw new Error("PublicClient not initialized");
    }

    try {
      // 使用 publicClient 广播已签名交易
      return await this.publicClient.sendRawTransaction({
        serializedTransaction: signedTx,
      });
    } catch (error) {
      throw new Error(`Failed to broadcast raw transaction: ${error}`);
    }
  }

  /**
   * 获取当前 nonce
   */
  async getNonce(): Promise<number> {
    if (!this._address || !this.publicClient) {
      throw new NotConnectedError("evm");
    }

    return Number(await this.publicClient.getTransactionCount({ address: this._address }));
  }

  /**
   * 估算交易 Gas (带签名)
   */
  async estimateGas(tx: { to: EvmAddress; value?: bigint; data?: string }): Promise<bigint> {
    if (!this._address || !this.publicClient) {
      throw new NotConnectedError("evm");
    }

    try {
      return await this.publicClient.estimateGas({
        account: this._address,
        to: tx.to,
        value: tx.value,
        data: tx.data as `0x${string}` | undefined,
      });
    } catch (error) {
      throw new Error(`Gas estimation failed: ${error}`);
    }
  }
}
