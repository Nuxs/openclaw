/**
 * Gateway methods for wallet identity: challenge / verify SIWE.
 */

import { randomUUID } from "node:crypto";
import type { GatewayRequestHandler } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import type { Web3StateStore } from "../state/store.js";
import type { SiweChallenge } from "./types.js";

// In-memory nonce store (production: use stateDir or Redis)
const pendingChallenges = new Map<string, SiweChallenge>();

type ParsedSiweMessage = {
  address: string;
  chainId?: number;
  nonce: string;
  expirationTime?: string;
};

function parseSiweMessage(message: string): ParsedSiweMessage | { error: string } {
  const addressMatch = message.match(/0x[0-9a-fA-F]{40}/);
  if (!addressMatch) return { error: "invalid SIWE message (no address)" };

  const nonceMatch = message.match(/Nonce:\s*([A-Za-z0-9]+)/);
  if (!nonceMatch) return { error: "invalid SIWE message (no nonce)" };

  const chainIdMatch = message.match(/Chain ID:\s*(\d+)/);
  const expirationMatch = message.match(/Expiration Time:\s*(.+)/);

  return {
    address: addressMatch[0],
    chainId: chainIdMatch ? Number(chainIdMatch[1]) : undefined,
    nonce: nonceMatch[1],
    expirationTime: expirationMatch?.[1]?.trim(),
  };
}

export function createSiweChallengeHandler(
  _store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return async ({ params }) => {
    if (!config.identity.allowSiwe) return { error: "SIWE is disabled" };

    const address = (params as Record<string, unknown>)?.address as string | undefined;
    if (!address) return { error: "address is required" };

    const nonce = randomUUID().replace(/-/g, "").slice(0, 16);
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const chainId = config.identity.requiredChainId ?? 8453;

    // Simplified EIP-4361 message (real impl uses siwe library)
    const message = [
      `openclaw.ai wants you to sign in with your Ethereum account:`,
      address,
      ``,
      `Sign in to OpenClaw Web3`,
      ``,
      `URI: https://openclaw.ai`,
      `Version: 1`,
      `Chain ID: ${chainId}`,
      `Nonce: ${nonce}`,
      `Issued At: ${new Date().toISOString()}`,
      `Expiration Time: ${expiresAt}`,
    ].join("\n");

    const challenge: SiweChallenge = { message, nonce, expiresAt };
    pendingChallenges.set(nonce, challenge);

    return { result: challenge };
  };
}

export function createSiweVerifyHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return async ({ params }) => {
    if (!config.identity.allowSiwe) return { error: "SIWE is disabled" };

    const { message, signature } = (params ?? {}) as { message?: string; signature?: string };
    if (!message || !signature) return { error: "message and signature are required" };

    const parsed = parseSiweMessage(message);
    if ("error" in parsed) return { error: parsed.error };

    const challenge = pendingChallenges.get(parsed.nonce);
    if (!challenge) return { error: "challenge not found or expired" };

    const now = new Date();
    if (new Date(challenge.expiresAt) < now) {
      pendingChallenges.delete(parsed.nonce);
      return { error: "challenge expired" };
    }

    if (parsed.expirationTime) {
      const parsedExpiration = new Date(parsed.expirationTime);
      if (Number.isNaN(parsedExpiration.getTime())) {
        return { error: "invalid SIWE message (bad expiration)" };
      }
      if (parsedExpiration < now) return { error: "challenge expired" };
    }

    if (config.identity.requiredChainId !== undefined) {
      if (!parsed.chainId) return { error: "invalid SIWE message (missing chain id)" };
      if (parsed.chainId !== config.identity.requiredChainId) {
        return { error: "SIWE chainId mismatch" };
      }
    }

    const { getAddress, recoverMessageAddress } = await import("viem");
    const recoveredAddress = getAddress(await recoverMessageAddress({ message, signature }));
    const messageAddress = getAddress(parsed.address);
    if (recoveredAddress !== messageAddress) {
      return { error: "signature verification failed" };
    }

    pendingChallenges.delete(parsed.nonce);

    store.addBinding({
      address: messageAddress,
      chainId: parsed.chainId ?? config.identity.requiredChainId ?? 8453,
      verifiedAt: new Date().toISOString(),
    });

    return { result: { ok: true, address: messageAddress, chainId: parsed.chainId } };
  };
}
