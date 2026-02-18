/**
 * Gateway methods for wallet identity: challenge / verify SIWE.
 */

import { randomUUID } from "node:crypto";
import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
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
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    if (!config.identity.allowSiwe) {
      respond(false, { error: "SIWE is disabled" });
      return;
    }

    const address = (params as Record<string, unknown>)?.address as string | undefined;
    if (!address) {
      respond(false, { error: "address is required" });
      return;
    }

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

    respond(true, challenge);
  };
}

export function createSiweVerifyHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    if (!config.identity.allowSiwe) {
      respond(false, { error: "SIWE is disabled" });
      return;
    }

    const { message, signature } = (params ?? {}) as { message?: string; signature?: string };
    if (!message || !signature) {
      respond(false, { error: "message and signature are required" });
      return;
    }

    const parsed = parseSiweMessage(message);
    if ("error" in parsed) {
      respond(false, { error: parsed.error });
      return;
    }

    const challenge = pendingChallenges.get(parsed.nonce);
    if (!challenge) {
      respond(false, { error: "challenge not found or expired" });
      return;
    }

    const now = new Date();
    if (new Date(challenge.expiresAt) < now) {
      pendingChallenges.delete(parsed.nonce);
      respond(false, { error: "challenge expired" });
      return;
    }

    if (parsed.expirationTime) {
      const parsedExpiration = new Date(parsed.expirationTime);
      if (Number.isNaN(parsedExpiration.getTime())) {
        respond(false, { error: "invalid SIWE message (bad expiration)" });
        return;
      }
      if (parsedExpiration < now) {
        respond(false, { error: "challenge expired" });
        return;
      }
    }

    if (config.identity.requiredChainId !== undefined) {
      if (!parsed.chainId) {
        respond(false, { error: "invalid SIWE message (missing chain id)" });
        return;
      }
      if (parsed.chainId !== config.identity.requiredChainId) {
        respond(false, { error: "SIWE chainId mismatch" });
        return;
      }
    }

    if (!signature.startsWith("0x")) {
      respond(false, { error: "invalid signature format" });
      return;
    }

    const { getAddress, recoverMessageAddress } = await import("viem");
    const recoveredAddress = getAddress(
      await recoverMessageAddress({ message, signature: signature as `0x${string}` }),
    );
    const messageAddress = getAddress(parsed.address);
    if (recoveredAddress !== messageAddress) {
      respond(false, { error: "signature verification failed" });
      return;
    }

    pendingChallenges.delete(parsed.nonce);

    store.addBinding({
      address: messageAddress,
      chainId: parsed.chainId ?? config.identity.requiredChainId ?? 8453,
      verifiedAt: new Date().toISOString(),
    });

    respond(true, { ok: true, address: messageAddress, chainId: parsed.chainId ?? null });
  };
}
