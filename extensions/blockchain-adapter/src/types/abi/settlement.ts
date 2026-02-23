/**
 * 结算合约 ABI 定义
 *
 * 设计说明:
 * - Settlement 合约用于托管交易双方的资金
 * - lock: 买方锁定资金
 * - release: 卖方确认后释放资金
 * - refund: 争议解决后退款
 */

import type { Abi } from "viem";

/**
 * 结算合约 ABI
 */
export const SETTLEMENT_ABI: Abi = [
  // 锁定资金 (买方操作)
  {
    type: "function",
    name: "lock",
    inputs: [
      { name: "orderId", type: "string" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // 释放资金 (卖方/托管方操作)
  {
    type: "function",
    name: "release",
    inputs: [
      { name: "orderId", type: "string" },
      { name: "amount", type: "uint256" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // 退款 (争议解决)
  {
    type: "function",
    name: "refund",
    inputs: [{ name: "orderId", type: "string" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // 查询锁定状态
  {
    type: "function",
    name: "getStatus",
    inputs: [{ name: "orderId", type: "string" }],
    outputs: [
      { name: "status", type: "uint8" },
      { name: "amount", type: "uint256" },
      { name: "lockedAt", type: "uint256" },
      { name: "releasedAt", type: "uint256" },
    ],
    stateMutability: "view",
  },
  // 事件: 资金锁定
  {
    type: "event",
    name: "Locked",
    inputs: [
      { name: "orderId", type: "string", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  // 事件: 资金释放
  {
    type: "event",
    name: "Released",
    inputs: [
      { name: "orderId", type: "string", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  // 事件: 退款
  {
    type: "event",
    name: "Refunded",
    inputs: [
      { name: "orderId", type: "string", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "reason", type: "string", indexed: false },
    ],
  },
];

/**
 * 结算状态枚举
 */
export enum SettlementStatus {
  None = 0,
  Locked = 1,
  Released = 2,
  Refunded = 3,
}

/**
 * 结算信息
 */
export interface SettlementInfo {
  orderId: string;
  status: SettlementStatus;
  amount: bigint;
  lockedAt?: number;
  releasedAt?: number;
  buyer?: string;
  seller?: string;
}
