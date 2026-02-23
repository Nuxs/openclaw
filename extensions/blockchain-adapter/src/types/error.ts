/**
 * 区块链错误类型定义
 */

import type { ChainType } from "./chain.js";

/**
 * 错误码枚举
 */
export const ErrorCode = {
  // 通用错误
  UNKNOWN: "UNKNOWN_ERROR",
  NOT_SUPPORTED: "NOT_SUPPORTED",
  NOT_CONNECTED: "NOT_CONNECTED",
  INVALID_PARAMS: "INVALID_PARAMS",

  // 连接错误
  CONNECTION_FAILED: "CONNECTION_FAILED",
  DISCONNECTION_FAILED: "DISCONNECTION_FAILED",

  // 交易错误
  TRANSACTION_FAILED: "TRANSACTION_FAILED",
  TRANSACTION_REVERTED: "TRANSACTION_REVERTED",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  INSUFFICIENT_GAS: "INSUFFICIENT_GAS",

  // 合约错误
  CONTRACT_ERROR: "CONTRACT_ERROR",
  CONTRACT_NOT_DEPLOYED: "CONTRACT_NOT_DEPLOYED",

  // 结算错误
  SETTLEMENT_FAILED: "SETTLEMENT_FAILED",
  SETTLEMENT_TIMEOUT: "SETTLEMENT_TIMEOUT",
  SETTLEMENT_ALREADY_LOCKED: "SETTLEMENT_ALREADY_LOCKED",
  SETTLEMENT_NOT_LOCKED: "SETTLEMENT_NOT_LOCKED",

  // 签名错误
  SIGNATURE_FAILED: "SIGNATURE_FAILED",
  SIGNER_NOT_AVAILABLE: "SIGNER_NOT_AVAILABLE",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * 区块链基础错误
 */
export class BlockchainError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly chainType: ChainType,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "BlockchainError";
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      chainType: this.chainType,
      details: this.details,
    };
  }
}

/**
 * EVM 特定错误
 */
export class EvmError extends BlockchainError {
  constructor(message: string, details?: unknown) {
    super(message, ErrorCode.UNKNOWN, "evm", details);
    this.name = "EvmError";
  }

  static transactionReverted(reason?: string): EvmError {
    return new EvmError(
      reason ? `Transaction reverted: ${reason}` : "Transaction reverted",
      ErrorCode.TRANSACTION_REVERTED,
    );
  }

  static insufficientBalance(required: bigint, available: bigint): EvmError {
    return new EvmError(
      `Insufficient balance: required ${required}, available ${available}`,
      ErrorCode.INSUFFICIENT_BALANCE,
    );
  }

  static insufficientGas(required: bigint, available: bigint): EvmError {
    return new EvmError(
      `Insufficient gas: required ${required}, available ${available}`,
      ErrorCode.INSUFFICIENT_GAS,
    );
  }

  static contractError(reason: string): EvmError {
    return new EvmError(`Contract error: ${reason}`, ErrorCode.CONTRACT_ERROR);
  }
}

/**
 * TON 特定错误
 */
export class TonError extends BlockchainError {
  constructor(message: string, details?: unknown) {
    super(message, ErrorCode.UNKNOWN, "ton", details);
    this.name = "TonError";
  }
}

/**
 * 不支持的操作错误
 */
export class NotSupportedError extends BlockchainError {
  constructor(operation: string, chainType: ChainType) {
    super(
      `${operation} is not supported on ${chainType} chain`,
      ErrorCode.NOT_SUPPORTED,
      chainType,
    );
    this.name = "NotSupportedError";
  }
}

/**
 * 未连接错误
 */
export class NotConnectedError extends BlockchainError {
  constructor(chainType: ChainType) {
    super(`Wallet not connected on ${chainType} chain`, ErrorCode.NOT_CONNECTED, chainType);
    this.name = "NotConnectedError";
  }
}
