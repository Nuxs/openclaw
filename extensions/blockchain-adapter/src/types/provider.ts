/**
 * Blockchain Provider 统一接口
 * 所有区块链适配器必须实现此接口
 */

// ============================================================================
// 基础类型定义
// ============================================================================

export type ChainId =
  | "ton-mainnet"
  | "ton-testnet"
  | "solana-mainnet"
  | "solana-devnet"
  | "sui-mainnet"
  | "sui-testnet"
  | "base-mainnet"
  | "base-sepolia";

export type TxHash = string;
export type Address = string;
export type ContractAddress = string;

export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  address?: string; // native token没有address
}

export interface Wallet {
  address: Address;
  publicKey?: string;
  chainId: string;
}

export interface ConnectionConfig {
  rpcUrl?: string;
  manifestUrl?: string; // TonConnect需要
  walletType?: string; // 'phantom' | 'metamask' | ...
  privateKey?: string; // 仅用于测试/后端
}

export interface Transaction {
  from: Address;
  to: Address;
  value?: bigint;
  data?: string;
  gasLimit?: bigint;
}

export interface TxReceipt {
  txHash: TxHash;
  blockNumber: number;
  blockHash: string;
  from: Address;
  to?: Address;
  status: "success" | "failure";
  gasUsed: bigint;
  logs: TxLog[];
}

export interface TxLog {
  address: Address;
  topics: string[];
  data: string;
}

export interface Proof {
  taskId: string;
  result: string;
  usage: {
    tokens?: number;
    time: number;
  };
  signature: string;
  timestamp: number;
}

export type EventCallback = (event: TxLog) => void;
export type Unsubscribe = () => void;

// ============================================================================
// 核心接口
// ============================================================================

export interface IBlockchainProvider {
  // ==================== 基础信息 ====================

  /**
   * 链ID (唯一标识)
   * @example 'ton-mainnet', 'solana-mainnet'
   */
  readonly chainId: ChainId;

  /**
   * 链名称
   * @example 'TON Network', 'Solana'
   */
  readonly chainName: string;

  /**
   * 原生代币信息
   * @example { symbol: 'TON', name: 'Toncoin', decimals: 9 }
   */
  readonly nativeToken: TokenInfo;

  // ==================== 身份认证 ====================

  /**
   * 连接钱包
   * @param config 连接配置
   * @returns 钱包信息
   *
   * @example
   * // TON (TonConnect)
   * await provider.connect({
   *   manifestUrl: 'https://example.com/tonconnect-manifest.json'
   * });
   *
   * // Solana (Phantom)
   * await provider.connect({
   *   walletType: 'phantom'
   * });
   */
  connect(config: ConnectionConfig): Promise<Wallet>;

  /**
   * 断开钱包连接
   */
  disconnect(): Promise<void>;

  /**
   * 获取当前连接的地址
   * @returns 地址字符串
   */
  getAddress(): Promise<Address>;

  /**
   * 签名消息 (用于身份验证)
   * @param message 待签名的消息
   * @returns 签名字符串
   *
   * @example
   * const signature = await provider.signMessage(
   *   'Sign in to OpenClaw at ' + new Date().toISOString()
   * );
   */
  signMessage(message: string): Promise<string>;

  /**
   * 验证签名
   * @param message 原始消息
   * @param signature 签名
   * @param address 签名者地址
   * @returns 是否有效
   */
  verifySignature(message: string, signature: string, address: Address): Promise<boolean>;

  // ==================== 代币操作 ====================

  /**
   * 查询余额
   * @param address 地址
   * @param tokenAddress 代币地址 (可选，不传则查询原生代币)
   * @returns 余额 (以最小单位表示)
   *
   * @example
   * // 查询TON余额
   * const balance = await provider.getBalance(address);
   * console.log(balance / 1_000_000_000n, 'TON');
   *
   * // 查询$OCT代币余额
   * const octBalance = await provider.getBalance(address, OCT_TOKEN_ADDRESS);
   */
  getBalance(address: Address, tokenAddress?: ContractAddress): Promise<bigint>;

  /**
   * 转账
   * @param to 接收地址
   * @param amount 金额 (以最小单位表示)
   * @param tokenAddress 代币地址 (可选)
   * @returns 交易哈希
   *
   * @example
   * // 转10 TON
   * const txHash = await provider.transfer(
   *   toAddress,
   *   parseUnits('10', 9)
   * );
   *
   * // 转50 $OCT
   * const txHash = await provider.transfer(
   *   toAddress,
   *   parseUnits('50', 9),
   *   OCT_TOKEN_ADDRESS
   * );
   */
  transfer(to: Address, amount: bigint, tokenAddress?: ContractAddress): Promise<TxHash>;

  // ==================== 智能合约交互 ====================

  /**
   * 部署合约
   * @param bytecode 合约字节码
   * @param args 构造函数参数
   * @returns 合约地址
   */
  deployContract(bytecode: string, args: any[]): Promise<ContractAddress>;

  /**
   * 调用合约方法
   * @param address 合约地址
   * @param method 方法名
   * @param args 参数
   * @returns 返回值
   *
   * @example
   * const result = await provider.callContract(
   *   SETTLEMENT_CONTRACT,
   *   'getOrder',
   *   [orderId]
   * );
   */
  callContract(address: ContractAddress, method: string, args: any[]): Promise<any>;

  /**
   * 估算Gas费用
   * @param tx 交易对象
   * @returns Gas费用 (以原生代币最小单位表示)
   */
  estimateGas(tx: Transaction): Promise<bigint>;

  // ==================== 结算相关 (核心功能) ====================

  /**
   * 锁定结算金额
   * 用于任务发布时预付锁定
   *
   * @param orderId 订单ID
   * @param amount 锁定金额
   * @param tokenAddress 支付代币地址 (可选)
   * @returns 交易哈希
   *
   * @example
   * // 发布任务时锁定50 OCT
   * const txHash = await provider.lockSettlement(
   *   'order-123',
   *   parseUnits('50', 9),
   *   OCT_TOKEN_ADDRESS
   * );
   *
   * // 等待确认
   * await provider.waitForTransaction(txHash);
   */
  lockSettlement(orderId: string, amount: bigint, tokenAddress?: ContractAddress): Promise<TxHash>;

  /**
   * 释放结算金额
   * 用于任务完成后支付给节点
   *
   * @param orderId 订单ID
   * @param actualAmount 实际使用金额
   * @param proof 可验证证明
   * @returns 交易哈希
   *
   * @example
   * // 任务完成，实际使用35 OCT
   * const proof = generateProof(taskResult);
   * const txHash = await provider.releaseSettlement(
   *   'order-123',
   *   parseUnits('35', 9),
   *   proof
   * );
   *
   * // 剩余15 OCT自动退还给用户
   */
  releaseSettlement(orderId: string, actualAmount: bigint, proof: Proof): Promise<TxHash>;

  /**
   * 退款结算金额
   * 用于任务超时或失败时全额退款
   *
   * @param orderId 订单ID
   * @param reason 退款原因
   * @returns 交易哈希
   *
   * @example
   * // 任务超时，全额退款
   * const txHash = await provider.refundSettlement(
   *   'order-123',
   *   'timeout'
   * );
   */
  refundSettlement(orderId: string, reason?: string): Promise<TxHash>;

  /**
   * 查询结算状态
   * @param orderId 订单ID
   * @returns 结算信息
   */
  getSettlementStatus(orderId: string): Promise<SettlementInfo>;

  // ==================== 事件监听 ====================

  /**
   * 订阅合约事件
   * @param contract 合约地址
   * @param eventName 事件名称
   * @param callback 回调函数
   * @returns 取消订阅函数
   *
   * @example
   * const unsubscribe = await provider.subscribeEvents(
   *   SETTLEMENT_CONTRACT,
   *   'SettlementLocked',
   *   (event) => {
   *     console.log('Order locked:', event);
   *   }
   * );
   *
   * // 取消订阅
   * unsubscribe();
   */
  subscribeEvents(
    contract: ContractAddress,
    eventName: string,
    callback: EventCallback,
  ): Promise<Unsubscribe>;

  // ==================== 工具方法 ====================

  /**
   * 等待交易确认
   * @param txHash 交易哈希
   * @param confirmations 确认数 (可选，默认1)
   * @returns 交易回执
   */
  waitForTransaction(txHash: TxHash, confirmations?: number): Promise<TxReceipt>;

  /**
   * 获取当前区块高度
   * @returns 区块号
   */
  getBlockNumber(): Promise<number>;

  /**
   * 获取交易回执
   * @param txHash 交易哈希
   * @returns 交易回执 (未确认返回null)
   */
  getTransactionReceipt(txHash: TxHash): Promise<TxReceipt | null>;

  /**
   * 获取区块链浏览器链接
   * @param txHash 交易哈希
   * @returns 浏览器URL
   *
   * @example
   * const url = provider.getExplorerUrl(txHash);
   * // https://tonscan.org/tx/xxx
   */
  getExplorerUrl(txHash: TxHash): string;
}

// ============================================================================
// 结算相关类型
// ============================================================================

export interface SettlementInfo {
  orderId: string;
  status: "locked" | "released" | "refunded" | "disputed";
  lockedAmount: bigint;
  releasedAmount?: bigint;
  refundedAmount?: bigint;
  payer: Address;
  payee?: Address;
  tokenAddress: ContractAddress;
  lockedAt: number;
  releasedAt?: number;
  disputeWindowEnd?: number;
}

// ============================================================================
// 工厂模式支持
// ============================================================================

export interface ProviderConfig {
  chainId: ChainId;
  rpcUrl: string;
  explorerUrl: string;
  contracts: {
    settlement: ContractAddress;
    marketplace?: ContractAddress;
    token?: ContractAddress;
    governance?: ContractAddress;
  };
  testnet?: boolean;
}

export interface IBlockchainFactory {
  /**
   * 注册Provider
   * @param chainId 链ID
   * @param provider Provider实例
   */
  register(chainId: ChainId, provider: IBlockchainProvider): void;

  /**
   * 获取Provider
   * @param chainId 链ID
   * @returns Provider实例
   */
  getProvider(chainId: ChainId): IBlockchainProvider;

  /**
   * 列出所有支持的链
   * @returns 链ID列表
   */
  getSupportedChains(): ChainId[];

  /**
   * 检查是否支持某条链
   * @param chainId 链ID
   * @returns 是否支持
   */
  isSupported(chainId: ChainId): boolean;
}
