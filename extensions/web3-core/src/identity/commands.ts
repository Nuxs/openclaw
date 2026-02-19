/**
 * Plugin commands: /bind_wallet, /unbind_wallet, /whoami_web3
 */

import type { PluginCommandHandler } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import type { Web3StateStore } from "../state/store.js";

export function createBindWalletCommand(
  store: Web3StateStore,
  config: Web3PluginConfig,
): PluginCommandHandler {
  return async (ctx) => {
    const address = ctx.args?.trim();
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return { text: "Usage: /bind_wallet 0xYourAddress\nProvide a valid EVM address." };
    }

    if (!config.identity.allowSiwe) {
      return {
        text: "SIWE is disabled. Enable identity.allowSiwe and bind via web3.siwe.challenge + web3.siwe.verify.",
      };
    }

    return {
      text: "Direct binding is disabled for security. Use web3.siwe.challenge + web3.siwe.verify to bind ownership.",
    };
  };
}

export function createUnbindWalletCommand(store: Web3StateStore): PluginCommandHandler {
  return async (ctx) => {
    const address = ctx.args?.trim();
    if (!address) {
      return { text: "Usage: /unbind_wallet 0xYourAddress" };
    }
    store.removeBinding(address);
    return { text: `Wallet unbound: ${address}` };
  };
}

export function createWhoamiCommand(store: Web3StateStore): PluginCommandHandler {
  return async () => {
    const bindings = store.getBindings();
    if (bindings.length === 0) {
      return { text: "No wallet bound. Use /bind_wallet 0xAddress to bind one." };
    }
    const lines = bindings.map(
      (b) =>
        `• ${b.address}${b.ensName ? ` (${b.ensName})` : ""} — chain ${b.chainId}, verified ${b.verifiedAt}`,
    );
    return { text: `Bound wallets:\n${lines.join("\n")}` };
  };
}
