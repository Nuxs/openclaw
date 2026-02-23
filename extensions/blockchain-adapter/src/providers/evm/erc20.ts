/**
 * ERC20 工具方法封装
 *
 * 职责：ERC20 代币操作
 * - 余额查询
 * - 转账
 * - 授权
 * - 授权额度查询
 */

import {
  encodeFunctionData,
  encodeAbiParameters,
  decodeFunctionResult,
  type Address as EvmAddress,
  type Hash,
} from "viem";
import { ERC20_ABI, ERC20_SELECTORS } from "../../types/abi/erc20.js";
import { EvmError } from "../../types/error.js";
import type { EvmClient } from "./client.js";
import type { EvmWallet } from "./wallet.js";

/**
 * ERC20 工具类
 */
export class EvmErc20 {
  constructor(
    private readonly client: EvmClient,
    private readonly wallet: EvmWallet,
  ) {}

  // ==================== 余额查询 ====================

  /**
   * 获取 ERC20 代币余额
   */
  async balanceOf(tokenAddress: EvmAddress, owner: EvmAddress): Promise<bigint> {
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [owner],
    });

    const result = await this.client.call(tokenAddress, data);
    return decodeFunctionResult({
      abi: ERC20_ABI,
      functionName: "balanceOf",
      data: result,
    }) as bigint;
  }

  /**
   * 获取代币 decimals
   */
  async decimals(tokenAddress: EvmAddress): Promise<number> {
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "decimals",
      args: [],
    });

    const result = await this.client.call(tokenAddress, data);
    return decodeFunctionResult({
      abi: ERC20_ABI,
      functionName: "decimals",
      data: result,
    }) as number;
  }

  /**
   * 获取代币符号
   */
  async symbol(tokenAddress: EvmAddress): Promise<string> {
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "symbol",
      args: [],
    });

    const result = await this.client.call(tokenAddress, data);
    return decodeFunctionResult({
      abi: ERC20_ABI,
      functionName: "symbol",
      data: result,
    }) as string;
  }

  // ==================== 授权操作 ====================

  /**
   * 查询授权额度
   */
  async allowance(
    tokenAddress: EvmAddress,
    owner: EvmAddress,
    spender: EvmAddress,
  ): Promise<bigint> {
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, spender],
    });

    const result = await this.client.call(tokenAddress, data);
    return decodeFunctionResult({
      abi: ERC20_ABI,
      functionName: "allowance",
      data: result,
    }) as bigint;
  }

  /**
   * 授权代币
   */
  async approve(tokenAddress: EvmAddress, spender: EvmAddress, amount: bigint): Promise<Hash> {
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount],
    });

    return this.wallet.sendTransaction({
      to: tokenAddress,
      data,
      value: 0n,
    });
  }

  /**
   * 检查是否已授权 (足够额度)
   */
  async isApproved(
    tokenAddress: EvmAddress,
    spender: EvmAddress,
    requiredAmount: bigint,
  ): Promise<boolean> {
    const owner = this.wallet.getAddress();
    const allowance = await this.allowance(tokenAddress, owner, spender);
    return allowance >= requiredAmount;
  }

  /**
   * 确保已授权 (如未授权则授权)
   */
  async ensureApproved(
    tokenAddress: EvmAddress,
    spender: EvmAddress,
    amount: bigint,
  ): Promise<Hash | null> {
    const isApproved = await this.isApproved(tokenAddress, spender, amount);
    if (isApproved) {
      return null;
    }
    return this.approve(tokenAddress, spender, amount);
  }

  // ==================== 转账操作 ====================

  /**
   * ERC20 转账
   */
  async transfer(tokenAddress: EvmAddress, to: EvmAddress, amount: bigint): Promise<Hash> {
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [to, amount],
    });

    return this.wallet.sendTransaction({
      to: tokenAddress,
      data,
      value: 0n,
    });
  }

  /**
   * ERC20 批量转账 (可选)
   */
  async transferBatch(
    tokenAddress: EvmAddress,
    recipients: EvmAddress[],
    amounts: bigint[],
  ): Promise<Hash[]> {
    if (recipients.length !== amounts.length) {
      throw new EvmError("Recipients and amounts length mismatch");
    }

    const promises = recipients.map((to, i) => this.transfer(tokenAddress, to, amounts[i]));
    return Promise.all(promises);
  }

  // ==================== 便捷方法 ====================

  /**
   * 获取代币信息 (符号 + decimals)
   */
  async getTokenInfo(tokenAddress: EvmAddress): Promise<{ symbol: string; decimals: number }> {
    const [symbol, decimals] = await Promise.all([
      this.symbol(tokenAddress),
      this.decimals(tokenAddress),
    ]);
    return { symbol, decimals };
  }

  /**
   * 格式化代币数量 (根据 decimals)
   */
  formatAmount(amount: bigint, decimals: number): string {
    const divisor = 10n ** BigInt(decimals);
    const integer = amount / divisor;
    const fraction = amount % divisor;
    const fractionStr = fraction
      .toString()
      .padStart(decimals, "0")
      .replace(/\.?0+$/, "");
    return fractionStr ? `${integer}.${fractionStr}` : integer.toString();
  }

  /**
   * 解析代币数量 (根据 decimals)
   */
  parseAmount(amount: string, decimals: number): bigint {
    const [integer, fraction = ""] = amount.split(".");
    const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
    return BigInt(integer + paddedFraction);
  }
}
