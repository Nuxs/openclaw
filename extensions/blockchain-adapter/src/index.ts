/**
 * @openclaw/blockchain-adapter
 *
 * Source entrypoint for the blockchain adapter extension package.
 * Note: examples in this repo should import from this file (relative path),
 * not from the published package name, so typecheck does not depend on build outputs.
 */

export {
  BlockchainFactory,
  factory,
  initBlockchainFactory,
  getProvider,
  getSupportedChains,
} from "./factory.js";

export type {
  IBlockchainProvider,
  IBlockchainFactory,
  ChainId,
  TxHash,
  Address,
  ContractAddress,
  Wallet,
  ConnectionConfig,
  Transaction,
  TxReceipt,
  TxLog,
  Proof,
  TokenInfo,
  EventCallback,
  Unsubscribe,
  SettlementInfo,
  ProviderConfig,
} from "./types/provider.js";
