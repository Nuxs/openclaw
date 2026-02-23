import {
  createTonMnemonic,
  deriveTonWalletAddressFromMnemonic,
} from "@openclaw/blockchain-adapter";
import type { AgentWalletConfig } from "./config.js";
import { loadTonWalletRecord, saveTonWalletRecord, type TonWalletIdentity } from "./store.js";
import { loadOrCreateWallet } from "./wallet.js";

export type AgentTonWallet = TonWalletIdentity & {
  mnemonic: string;
};

export async function loadOrCreateTonWallet(config: AgentWalletConfig): Promise<AgentTonWallet> {
  // Ensure base (EVM) record exists so we can upgrade it in-place.
  await loadOrCreateWallet(config);

  const existing = await loadTonWalletRecord(config);
  if (existing) {
    return {
      ...existing.identity,
      mnemonic: existing.mnemonic,
    };
  }

  const mnemonic = await createTonMnemonic(24);
  const derived = await deriveTonWalletAddressFromMnemonic(mnemonic, 0);
  const createdAt = new Date().toISOString();

  const identity: TonWalletIdentity = {
    address: derived.address,
    publicKey: derived.publicKeyHex,
    createdAt,
  };

  await saveTonWalletRecord(config, identity, mnemonic);

  return {
    ...identity,
    mnemonic,
  };
}
