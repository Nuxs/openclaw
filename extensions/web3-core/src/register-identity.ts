/**
 * Identity & Wallet domain registration.
 *
 * Commands: bind_wallet, unbind_wallet, whoami_web3
 * Gateway:  web3.siwe.*, web3.identity.*, web3.wallet.*
 */

import {
  createBindWalletCommand,
  createUnbindWalletCommand,
  createWhoamiCommand,
} from "./identity/commands.js";
import { createEnsResolveHandler, createEnsReverseHandler } from "./identity/ens.js";
import { createSiweChallengeHandler, createSiweVerifyHandler } from "./identity/gateway.js";
import type { RegistrationContext } from "./register-types.js";
import {
  createWeb3WalletAutopayHandler,
  createWeb3WalletBalanceHandler,
  createWeb3WalletCreateHandler,
  createWeb3WalletSendHandler,
  createWeb3WalletSignHandler,
} from "./wallet/handlers.js";

export function registerIdentity({ api, store, config }: RegistrationContext): void {
  // ── Commands ──
  api.registerCommand({
    name: "bind_wallet",
    description: "Bind an EVM wallet address to your identity",
    acceptsArgs: true,
    handler: createBindWalletCommand(store, config),
  });
  api.registerCommand({
    name: "unbind_wallet",
    description: "Remove a bound wallet address",
    acceptsArgs: true,
    handler: createUnbindWalletCommand(store),
  });
  api.registerCommand({
    name: "whoami_web3",
    description: "Show your bound wallets and Web3 identity",
    handler: createWhoamiCommand(store),
  });

  // ── Gateway: SIWE ──
  api.registerGatewayMethod("web3.siwe.challenge", createSiweChallengeHandler(store, config));
  api.registerGatewayMethod("web3.siwe.verify", createSiweVerifyHandler(store, config));

  // ── Gateway: ENS ──
  api.registerGatewayMethod("web3.identity.resolveEns", createEnsResolveHandler(store, config));
  api.registerGatewayMethod("web3.identity.reverseEns", createEnsReverseHandler(store, config));

  // ── Gateway: Wallet ──
  api.registerGatewayMethod("web3.wallet.create", createWeb3WalletCreateHandler());
  api.registerGatewayMethod("web3.wallet.balance", createWeb3WalletBalanceHandler());
  api.registerGatewayMethod("web3.wallet.sign", createWeb3WalletSignHandler());
  api.registerGatewayMethod("web3.wallet.send", createWeb3WalletSendHandler());
  api.registerGatewayMethod("web3.wallet.autopay", createWeb3WalletAutopayHandler());
}
