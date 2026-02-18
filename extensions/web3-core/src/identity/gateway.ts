/**
 * Gateway methods for wallet identity: challenge / verify SIWE.
 */

import { randomUUID } from "node:crypto";
import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import { SiweMessage } from "siwe";
import { getAddress } from "viem";
import type { Web3PluginConfig } from "../config.js";
import type { Web3StateStore } from "../state/store.js";
import type { SiweChallenge } from "./types.js";

const DEFAULT_CHAIN_ID = 8453;

function resolveSiweSettings(config: Web3PluginConfig) {
  const domain = config.identity.domain ?? "openclaw.ai";
  const uri = config.identity.uri ?? `https://${domain}`;
  const statement = config.identity.statement ?? "Sign in to OpenClaw Web3";
  const ttlMs = config.identity.challengeTtlMs ?? 5 * 60_000;
  const chainId = config.identity.requiredChainId ?? DEFAULT_CHAIN_ID;
  return { domain, uri, statement, ttlMs, chainId };
}

export function createSiweChallengeHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    if (!config.identity.allowSiwe) {
      respond(false, { error: "SIWE is disabled" });
      return;
    }

    const addressRaw = (params as Record<string, unknown>)?.address as string | undefined;
    if (!addressRaw) {
      respond(false, { error: "address is required" });
      return;
    }

    let address: string;
    try {
      address = getAddress(addressRaw);
    } catch {
      respond(false, { error: "invalid address" });
      return;
    }

    const { domain, uri, statement, ttlMs, chainId } = resolveSiweSettings(config);
    const nonce = randomUUID().replace(/-/g, "").slice(0, 16);
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    const siwe = new SiweMessage({
      domain,
      address,
      statement,
      uri,
      version: "1",
      chainId,
      nonce,
      issuedAt,
      expirationTime: expiresAt,
    });

    const challenge: SiweChallenge = {
      message: siwe.prepareMessage(),
      nonce,
      address,
      domain,
      uri,
      statement,
      issuedAt,
      expiresAt,
    };

    store.pruneSiweChallenges();
    store.saveSiweChallenge(challenge);

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

    let siweMessage: SiweMessage;
    try {
      siweMessage = new SiweMessage(message);
    } catch {
      respond(false, { error: "invalid SIWE message" });
      return;
    }

    const challenge = store.getSiweChallenge(siweMessage.nonce);
    if (!challenge) {
      respond(false, { error: "challenge not found or expired" });
      return;
    }

    const now = Date.now();
    const expiresAt = Date.parse(challenge.expiresAt);
    if (Number.isNaN(expiresAt) || expiresAt <= now) {
      store.deleteSiweChallenge(challenge.nonce);
      respond(false, { error: "challenge expired" });
      return;
    }

    const expectedDomain = challenge.domain;
    const verifyResult = await siweMessage.verify(
      {
        signature,
        domain: expectedDomain,
        nonce: challenge.nonce,
        time: new Date(now).toISOString(),
      },
      { suppressExceptions: true },
    );

    if (!verifyResult.success) {
      respond(false, { error: verifyResult.error?.type ?? "SIWE verification failed" });
      return;
    }

    let messageAddress: string;
    try {
      messageAddress = getAddress(siweMessage.address);
    } catch {
      respond(false, { error: "invalid SIWE message address" });
      return;
    }

    if (messageAddress !== challenge.address) {
      respond(false, { error: "SIWE address mismatch" });
      return;
    }

    if (challenge.uri && siweMessage.uri !== challenge.uri) {
      respond(false, { error: "SIWE uri mismatch" });
      return;
    }

    const requiredChainId = config.identity.requiredChainId;
    if (requiredChainId !== undefined && siweMessage.chainId !== requiredChainId) {
      respond(false, { error: "SIWE chainId mismatch" });
      return;
    }

    store.deleteSiweChallenge(challenge.nonce);

    store.addBinding({
      address: messageAddress,
      chainId: siweMessage.chainId ?? requiredChainId ?? DEFAULT_CHAIN_ID,
      verifiedAt: new Date().toISOString(),
      siweDomain: challenge.domain,
      siweUri: challenge.uri,
      siweStatement: siweMessage.statement ?? challenge.statement,
    });

    respond(true, { ok: true, address: messageAddress, chainId: siweMessage.chainId ?? null });
  };
}
