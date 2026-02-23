import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { AgentWalletConfig } from "./config.js";
import { loadWalletRecord, saveWalletRecord, type WalletIdentity } from "./store.js";

export type AgentWallet = WalletIdentity & {
  privateKey: `0x${string}`;
};

export async function loadOrCreateWallet(config: AgentWalletConfig): Promise<AgentWallet> {
  const existing = await loadWalletRecord(config);
  if (existing) {
    return {
      ...existing.identity,
      privateKey: existing.privateKey,
    };
  }

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const createdAt = new Date().toISOString();

  const identity: WalletIdentity = {
    version: 1,
    address: account.address,
    publicKey: account.publicKey,
    createdAt,
  };

  await saveWalletRecord(config, identity, privateKey);

  return {
    ...identity,
    privateKey,
  };
}
