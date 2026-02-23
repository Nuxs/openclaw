/**
 * EVM PublicClient 封装
 *
 * 职责：只读区块链交互
 * - 查询余额
 * - 估算 Gas
 * - 获取 Gas 价格
 * - 合约只读调用
 * - 获取区块信息
 */

import {
  createPublicClient,
  http,
  type PublicClient,
  type Chain,
  type Hash,
  type Address as EvmAddress,
  getContract,
} from "viem";
import { ERC20_ABI } from "../../types/abi/erc20.js";
import { SETTLEMENT_ABI } from "../../types/abi/settlement.js";
import type { ChainInfo, EvmChainId, TokenInfo } from "../../types/chain.js";
import { EvmError } from "../../types/error.js";

/**
 * PublicClient 封装类
 */
export class EvmClient {
  public readonly publicClient: PublicClient;
  public readonly chainInfo: ChainInfo;
  public readonly nativeToken: TokenInfo;

  constructor(chainInfo: ChainInfo) {
    this.chainInfo = chainInfo;
    this.nativeToken = {
      symbol: chainInfo.symbol,
      decimals: chainInfo.decimals,
    };

    // 创建 PublicClient
    this.publicClient = createPublicClient({
      chain: this.createChain(chainInfo),
      transport: http(chainInfo.rpcUrl),
      pollingInterval: 4_000, // 4 秒轮询
    });
  }

  /**
   * 创建 viem Chain 对象
   * 注意：EVM 链 ID 必须是 number，TON 链 ID 是字符串
   */
  private createChain(chainInfo: ChainInfo): Chain {
    // EVM 链 ID 必须是 number
    const evmChainId = Number(chainInfo.id);
    if (isNaN(evmChainId)) {
      throw new EvmError(`Invalid EVM chain ID: ${chainInfo.id}`);
    }

    const chain: Chain = {
      id: evmChainId,
      name: chainInfo.name,
      nativeCurrency: {
        name: chainInfo.symbol,
        symbol: chainInfo.symbol,
        decimals: chainInfo.decimals,
      },
      rpcUrls: {
        default: { http: [chainInfo.rpcUrl] },
        public: { http: [chainInfo.rpcUrl] },
      },
      blockExplorers: {
        default: { name: "Explorer", url: chainInfo.explorerUrl },
      },
    };
    return chain;
  }

  // ==================== 余额查询 ====================

  /**
   * 获取原生代币余额
   */
  async getBalance(address: EvmAddress): Promise<bigint> {
    return this.publicClient.getBalance({ address });
  }

  /**
   * 获取 ERC20 代币余额
   */
  async getErc20Balance(tokenAddress: EvmAddress, owner: EvmAddress): Promise<bigint> {
    const contract = getContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      client: this.publicClient,
    });

    try {
      return (await contract.read.balanceOf([owner])) as bigint;
    } catch (error) {
      throw new EvmError(`Failed to get ERC20 balance: ${error}`);
    }
  }

  // ==================== Gas 估算 ====================

  /**
   * 获取当前 Gas 价格
   */
  async getGasPrice(): Promise<bigint> {
    return this.publicClient.getGasPrice();
  }

  /**
   * 估算交易 Gas
   */
  async estimateGas(tx: {
    from?: EvmAddress;
    to: EvmAddress;
    value?: bigint;
    data?: string;
  }): Promise<bigint> {
    try {
      return await this.publicClient.estimateGas({
        account: tx.from,
        to: tx.to,
        value: tx.value,
        data: tx.data as `0x${string}` | undefined,
      });
    } catch (error) {
      throw new EvmError(`Failed to estimate gas: ${error}`);
    }
  }

  // ==================== 合约调用 ====================

  /**
   * 合约只读调用
   */
  async call(to: EvmAddress, data: string): Promise<`0x${string}`> {
    try {
      const result = await this.publicClient.call({
        to,
        data: data as `0x${string}`,
      });
      return result.data || "0x";
    } catch (error) {
      throw new EvmError(`Contract call failed: ${error}`);
    }
  }

  /**
   * 读取 ERC20 授权额度
   */
  async getErc20Allowance(
    tokenAddress: EvmAddress,
    owner: EvmAddress,
    spender: EvmAddress,
  ): Promise<bigint> {
    const contract = getContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      client: this.publicClient,
    });

    try {
      return (await contract.read.allowance([owner, spender])) as bigint;
    } catch (error) {
      throw new EvmError(`Failed to get allowance: ${error}`);
    }
  }

  // ==================== 区块信息 ====================

  /**
   * 获取当前区块号
   */
  async getBlockNumber(): Promise<number> {
    return Number(await this.publicClient.getBlockNumber());
  }

  /**
   * 获取区块信息
   */
  async getBlock(blockNumber: bigint) {
    return this.publicClient.getBlock({ blockNumber });
  }

  // ==================== 交易查询 ====================

  /**
   * 获取交易回执
   */
  async getTransactionReceipt(txHash: Hash) {
    return this.publicClient.getTransactionReceipt({ hash: txHash });
  }

  /**
   * 等待交易确认
   */
  async waitForTransaction(
    txHash: Hash,
    confirmations: number = 1,
    timeout: number = 120_000,
  ): Promise<{
    status: "success" | "failure";
    blockNumber: bigint;
    gasUsed: bigint;
  }> {
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations,
      timeout,
    });

    return {
      status: receipt.status === "success" ? "success" : "failure",
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  }

  // ==================== 结算合约 ====================

  /**
   * 获取结算状态
   */
  async getSettlementStatus(
    settlementContract: EvmAddress,
    orderId: string,
  ): Promise<{
    status: number;
    amount: bigint;
    lockedAt: bigint;
    releasedAt: bigint;
  }> {
    const contract = getContract({
      address: settlementContract,
      abi: SETTLEMENT_ABI,
      client: this.publicClient,
    });

    try {
      return (await contract.read.getStatus([orderId])) as {
        status: number;
        amount: bigint;
        lockedAt: bigint;
        releasedAt: bigint;
      };
    } catch {
      // 合约可能未部署或方法不存在
      return {
        status: 0,
        amount: 0n,
        lockedAt: 0n,
        releasedAt: 0n,
      };
    }
  }
}
