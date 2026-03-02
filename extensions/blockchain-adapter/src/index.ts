/**
 * @openclaw/blockchain-adapter
 *
 * Source entrypoint for the blockchain adapter extension package.
 */

// ==================== 类型导出 ====================

// 链类型
export type {
  ChainType,
  TonChainId,
  EvmChainId,
  ChainId,
  ChainInfo,
  TokenInfo,
} from "./types/index.js";

// Provider 接口
export type {
  IProvider,
  IProviderEVM,
  IProviderTON,
  Address,
  TypedDataDomain,
  TypedDataField,
} from "./types/index.js";
export { isProviderEVM, isProviderTON, assertProviderEVM } from "./types/index.js";

// 交易类型
export type {
  TransferOptions,
  EvmTransaction,
  TxHash,
  TxReceipt,
  TxLog,
  Wallet,
  ConnectionConfig,
} from "./types/index.js";

// 错误类型
export {
  ErrorCode,
  BlockchainError,
  EvmError,
  TonError,
  NotSupportedError,
  NotConnectedError,
} from "./types/index.js";

// ABI
export { ERC20_ABI, ERC20_SELECTORS } from "./types/index.js";
export { SETTLEMENT_ABI, SettlementStatus } from "./types/index.js";
export type { SettlementInfo } from "./types/index.js";

// ==================== 配置导出 ====================

export { EVM_CHAINS, getChainInfo, COMMON_TOKENS, getTokenAddress } from "./config/index.js";

// ==================== Provider 导出 ====================

export { EVMProvider, type EVMProviderConfig } from "./providers/evm/index.js";
export { TONProvider, type TONProviderConfig } from "./providers/ton/index.js";

// TON helpers (headless wallet + settlement payload)
export {
  createTonMnemonic,
  deriveTonKeyPairFromMnemonic,
  deriveTonWalletAddressFromMnemonic,
  splitTonMnemonic,
} from "./providers/ton/mnemonic.js";
export {
  TON_SETTLEMENT_OP,
  encodeTonSettlementLockPayload,
  encodeTonSettlementReleasePayload,
  encodeTonSettlementRefundPayload,
  decodeBocBase64ToCell,
  buildTonSettlementReleaseSigningCell,
  hashTonSettlementReleaseSigningCell,
  signTonSettlementReleasePayload,
} from "./providers/ton/settlement-payload.js";
export { normalizeTonAddress } from "./providers/ton/address.js";

// ==================== 工厂导出 ====================

export {
  BlockchainFactory,
  factory,
  initBlockchainFactory,
  getProvider,
  getSupportedChains,
  isChainSupported,
  getEVMProvider,
  getTONProvider,
} from "./factory.js";
