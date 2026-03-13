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
  hashTypedData,
  type WalletClient,
  type PublicClient,
  type Hash,
  type Address as EvmAddress,
  type Chain,
  type Account,
  type SignableMessage,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ChainInfo, EvmChainId } from "../../types/chain.js";
import { NotConnectedError, NotSupportedError, EvmError, ErrorCode } from "../../types/error.js";
import type { ConnectionConfig, Wallet } from "../../types/transaction.js";

/**
 * 签名模式
 */
export type SignerMode =
  | { type: "private-key"; privateKey: `0x${string}` }
  | { type: "browser-wallet" }
  | { type: "remote-signature"; signMessage: (messageHash: string) => Promise<`0x${string}`> }
  | { type: "none" };

export type WalletConnectionConfig = ConnectionConfig;

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
      throw new NotSupportedError("Browser wallet (use privateKey or remoteSigner instead)", "evm");
    } else if (config.remoteSigner) {
      const { address, signMessage } = config.remoteSigner;
      if (!address || !signMessage) {
        throw new EvmError(
          "Invalid remoteSigner config: address and signMessage are required",
          ErrorCode.INVALID_PARAMS,
        );
      }
      await this.connectWithRemoteSignature(address, signMessage);
    } else {
      throw new EvmError("No wallet configuration provided", ErrorCode.INVALID_PARAMS);
    }

    if (!this._address) {
      throw new EvmError("Failed to get wallet address after connect", ErrorCode.CONNECTION_FAILED);
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
    throw new NotSupportedError("Browser wallet connect", "evm");
  }

  /**
   * 远程签名模式 (AI 场景 - 调用外部签名服务)
   */
  private async connectWithRemoteSignature(
    address: EvmAddress,
    signMessage: (messageHash: string) => Promise<`0x${string}`>,
  ): Promise<void> {
    // 远程签名必须使用签名器对应的真实地址，禁止随机临时地址
    this._account = null;
    this._address = address;

    this.signerMode = { type: "remote-signature", signMessage };

    // 远程模式仅保留 client 能力，不在本地持有可签名私钥
    this.walletClient = createWalletClient({
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
      case "private-key":
      case "browser-wallet": {
        // Both modes sign via WalletClient bound to an account
        if (!this.walletClient) {
          throw new NotConnectedError("evm");
        }
        // SAFETY: viem 2.x WalletClient requires account at type level, but we
        // bind it at runtime via connectWithPrivateKey. The cast is unavoidable
        // until viem exposes a runtime-account-aware overload.
        return (
          this.walletClient as unknown as {
            signMessage(args: { message: SignableMessage }): Promise<`0x${string}`>;
          }
        ).signMessage({ message: message as SignableMessage });
      }

      case "remote-signature": {
        // 远程签名服务 - 先计算哈希再签名
        const messageHash = hashMessage(message);
        return this.signerMode.signMessage(messageHash);
      }

      default:
        throw new EvmError("No signing capability available", ErrorCode.SIGNER_NOT_AVAILABLE);
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
  >(domain: TDomain, types: TTypes, value: TValues, primaryType?: string): Promise<`0x${string}`> {
    if (!this._address) {
      throw new NotConnectedError("evm");
    }

    const resolvedPrimaryType = primaryType ?? Object.keys(types)[0];

    switch (this.signerMode.type) {
      case "private-key":
      case "browser-wallet": {
        if (!this.walletClient) {
          throw new NotConnectedError("evm");
        }
        // SAFETY: viem 2.x signTypedData has deeply recursive generic constraints
        // that cannot be satisfied with our generic type params. The cast to
        // Record<string, unknown> is the minimal erasure needed.
        return (
          this.walletClient as unknown as {
            signTypedData(args: Record<string, unknown>): Promise<`0x${string}`>;
          }
        ).signTypedData({
          domain,
          types,
          primaryType: resolvedPrimaryType,
          message: value,
        });
      }

      case "remote-signature": {
        // EIP-712: 使用 hashTypedData 生成正确的结构化哈希
        // SAFETY: hashTypedData has the same deep recursive generics issue as signTypedData
        const messageHash = hashTypedData({
          domain: domain as Record<string, unknown>,
          types: types as Record<string, { name: string; type: string }[]>,
          primaryType: resolvedPrimaryType,
          message: value as Record<string, unknown>,
        });
        return this.signerMode.signMessage(messageHash);
      }

      default:
        throw new EvmError("No signing capability available", ErrorCode.SIGNER_NOT_AVAILABLE);
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
    throw new NotSupportedError("signTransaction (use sendTransaction instead)", "evm");
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
    if (!this.walletClient || !this._address) {
      throw new NotConnectedError("evm");
    }
    if (this.signerMode.type === "remote-signature") {
      throw new NotSupportedError("sendTransaction with remote signer", "evm");
    }

    try {
      const chain = this.createChain();
      const hash = await this.walletClient.sendTransaction({
        account: this._account ?? this._address,
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
      throw new EvmError(`Transaction failed: ${error}`, ErrorCode.TRANSACTION_FAILED, error);
    }
  }

  /**
   * AI 场景: 发送原始交易 (raw transaction)
   *
   * AI 可以直接提供签名的交易 hex 进行广播
   */
  async sendRawTransaction(signedTx: `0x${string}`): Promise<Hash> {
    if (!this.publicClient) {
      throw new NotConnectedError("evm");
    }

    try {
      // 使用 publicClient 广播已签名交易
      return await this.publicClient.sendRawTransaction({
        serializedTransaction: signedTx,
      });
    } catch (error) {
      throw new EvmError(
        `Failed to broadcast raw transaction: ${error}`,
        ErrorCode.TRANSACTION_FAILED,
        error,
      );
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
      throw new EvmError(`Gas estimation failed: ${error}`, ErrorCode.INSUFFICIENT_GAS, error);
    }
  }
}
