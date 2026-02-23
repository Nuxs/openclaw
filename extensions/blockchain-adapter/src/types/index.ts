/**
 * 类型系统导出
 */

// 链类型
export type {
  ChainType,
  TonChainId,
  EvmChainId,
  ChainId,
  ChainIdOf,
  ChainInfo,
  TokenInfo,
} from "./chain.js";

// Provider 接口
export type {
  IProvider,
  IProviderEVM,
  IProviderTON,
  Address,
  TypedDataDomain,
  TypedDataField,
  EventCallback,
  Unsubscribe,
} from "./provider.js";
export { isProviderEVM, isProviderTON, assertProviderEVM } from "./provider.js";

// 交易类型
export type {
  TransferOptions,
  EvmTransaction,
  TxHash,
  TxReceipt,
  TxLog,
  Wallet,
  ConnectionConfig,
} from "./transaction.js";

// 错误类型
export {
  ErrorCode,
  BlockchainError,
  EvmError,
  TonError,
  NotSupportedError,
  NotConnectedError,
} from "./error.js";

// ABI
export { ERC20_ABI, ERC20_SELECTORS } from "./abi/erc20.js";
export { SETTLEMENT_ABI, SettlementStatus } from "./abi/settlement.js";
export type { SettlementInfo } from "./abi/settlement.js";
