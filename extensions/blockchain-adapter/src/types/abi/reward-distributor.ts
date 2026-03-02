/**
 * RewardDistributor 合约 ABI 定义
 *
 * 设计说明:
 * - 后端签发 EIP-712 claim（离线凭证）
 * - 链上验证 signature + deadline + replay protection（claimId）
 * - 合约将自身持有的 ERC-20 转账给 recipient
 */

import type { Abi } from "viem";

export const REWARD_DISTRIBUTOR_ABI: Abi = [
  {
    type: "constructor",
    inputs: [{ name: "initialAuthority", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "authority",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "domainSeparator",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "usedClaims",
    inputs: [{ name: "claimId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setAuthority",
    inputs: [{ name: "next", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "token", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claim",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "eventHash", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "AuthorityUpdated",
    inputs: [{ name: "authority", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      { name: "claimId", type: "bytes32", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
];
