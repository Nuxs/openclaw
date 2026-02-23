/**
 * 结算方法封装
 *
 * 职责：托管交易操作
 * - lock: 买方锁定资金
 * - release: 卖方确认后释放
 * - refund: 争议解决后退款
 * - getStatus: 查询状态
 */

import {
  encodeFunctionData,
  decodeFunctionResult,
  type Address as EvmAddress,
  type Hash,
} from "viem";
import { SETTLEMENT_ABI, SettlementStatus } from "../../types/abi/settlement.js";
import type { SettlementInfo } from "../../types/abi/settlement.js";
import { EvmError } from "../../types/error.js";
import type { EvmClient } from "./client.js";
import type { EvmWallet } from "./wallet.js";

/**
 * 结算配置
 */
export interface SettlementConfig {
  /** 结算合约地址 */
  contractAddress: EvmAddress;
  /** 结算代币 (空=原生代币) */
  token?: EvmAddress;
}

/**
 * 结算工具类
 */
export class EvmSettlement {
  private config: SettlementConfig | null = null;

  constructor(
    private readonly client: EvmClient,
    private readonly wallet: EvmWallet,
  ) {}

  /**
   * 配置结算合约
   */
  configure(config: SettlementConfig): void {
    this.config = config;
  }

  /**
   * 获取配置
   */
  getConfig(): SettlementConfig | null {
    return this.config;
  }

  // ==================== 锁定资金 ====================

  /**
   * 锁定资金 (买方操作)
   *
   * 买方将资金锁定到托管合约
   */
  async lock(orderId: string, amount: bigint, token?: EvmAddress): Promise<Hash> {
    const contractAddress = this.resolveContract(token);

    const data = encodeFunctionData({
      abi: SETTLEMENT_ABI,
      functionName: "lock",
      args: [orderId, amount],
    });

    return this.wallet.sendTransaction({
      to: contractAddress,
      value: token ? 0n : amount, // 原生代币需要发送 value
      data,
    });
  }

  /**
   * 锁定 ERC20 代币
   */
  async lockErc20(orderId: string, amount: bigint, token: EvmAddress): Promise<Hash> {
    // 先授权结算合约
    const { EvmErc20 } = await import("./erc20.js");
    const erc20 = new EvmErc20(this.client, this.wallet);
    await erc20.ensureApproved(token, this.config!.contractAddress, amount);

    return this.lock(orderId, amount, token);
  }

  // ==================== 释放资金 ====================

  /**
   * 释放资金 (卖方/托管方操作)
   *
   * 确认交易完成后，释放资金给卖方
   */
  async release(orderId: string, amount: bigint, proof?: string): Promise<Hash> {
    const contractAddress = this.resolveContract();

    const data = encodeFunctionData({
      abi: SETTLEMENT_ABI,
      functionName: "release",
      args: [orderId, amount, proof || "0x"],
    });

    return this.wallet.sendTransaction({
      to: contractAddress,
      value: 0n,
      data,
    });
  }

  // ==================== 退款 ====================

  /**
   * 退款 (争议解决后)
   *
   * 争议解决后，退款给买方
   */
  async refund(orderId: string, reason?: string): Promise<Hash> {
    const contractAddress = this.resolveContract();

    const data = encodeFunctionData({
      abi: SETTLEMENT_ABI,
      functionName: "refund",
      args: [orderId],
    });

    return this.wallet.sendTransaction({
      to: contractAddress,
      value: 0n,
      data,
    });
  }

  // ==================== 状态查询 ====================

  /**
   * 查询结算状态
   */
  async getStatus(orderId: string): Promise<SettlementInfo> {
    const contractAddress = this.resolveContract();

    try {
      const result = await this.client.getSettlementStatus(contractAddress, orderId);

      return {
        orderId,
        status: result.status as SettlementStatus,
        amount: result.amount,
        lockedAt: result.lockedAt > 0n ? Number(result.lockedAt) : undefined,
        releasedAt: result.releasedAt > 0n ? Number(result.releasedAt) : undefined,
      };
    } catch {
      return {
        orderId,
        status: SettlementStatus.None,
        amount: 0n,
      };
    }
  }

  /**
   * 检查订单是否已锁定
   */
  async isLocked(orderId: string): Promise<boolean> {
    const status = await this.getStatus(orderId);
    return status.status === SettlementStatus.Locked;
  }

  /**
   * 检查订单是否已释放
   */
  async isReleased(orderId: string): Promise<boolean> {
    const status = await this.getStatus(orderId);
    return status.status === SettlementStatus.Released;
  }

  /**
   * 检查订单是否已退款
   */
  async isRefunded(orderId: string): Promise<boolean> {
    const status = await this.getStatus(orderId);
    return status.status === SettlementStatus.Refunded;
  }

  // ==================== 私有方法 ====================

  /**
   * 解析合约地址
   */
  private resolveContract(token?: EvmAddress): EvmAddress {
    // 优先使用传入的 token 对应配置，否则使用默认配置
    const config = this.config;
    if (!config) {
      throw new EvmError("Settlement contract not configured");
    }

    // 如果传入了特定 token，返回对应合约地址
    if (token) {
      // TODO: 支持多代币结算合约映射
      return config.contractAddress;
    }

    return config.contractAddress;
  }
}
