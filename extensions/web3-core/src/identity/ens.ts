/**
 * ENS (Ethereum Name Service) resolution for wallet identity.
 *
 * Provides:
 * - Forward resolution: ENS name -> Ethereum address
 * - Reverse resolution: Ethereum address -> ENS name
 * - Caching to avoid excessive RPC calls
 */

import {
  fetchWithSsrFGuard,
  type GatewayRequestHandler,
  type GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk";
import { getAddress, isAddress, keccak256 } from "viem";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import type { Web3StateStore } from "../state/store.js";

/** ENS resolution result. */
export type EnsResolution = {
  name: string;
  address: string;
  resolver: string;
  resolvedAt: string;
};

/** Cache entry with TTL. */
type EnsCacheEntry = {
  result: EnsResolution;
  expiresAt: number;
};

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_RPC_URL = "https://eth-mainnet.g.alchemy.com/v2/demo";

/** Simple in-memory cache for ENS lookups. */
class EnsCache {
  private cache = new Map<string, EnsCacheEntry>();

  get(key: string): EnsResolution | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.result;
  }

  set(key: string, result: EnsResolution, ttlMs: number): void {
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + ttlMs,
    });
  }
}

const ensCache = new EnsCache();

/** Encode ENS name for ERC-137 resolve call. */
function encodeEnsName(name: string): string {
  const parts = name.split(".");
  let encoded = "";
  for (const part of parts) {
    const len = part.length.toString(16).padStart(2, "0");
    const hex = Buffer.from(part).toString("hex");
    encoded += len + hex;
  }
  return encoded + "00";
}

/** Decode DNS-encoded name from ENS reverse resolution. */
function decodeEnsName(data: string): string | null {
  try {
    // Skip offset word, read length-prefixed labels
    let offset = parseInt(data.slice(2, 4), 16) * 2;
    const labels: string[] = [];

    while (offset < data.length) {
      const len = parseInt(data.slice(offset + 2, offset + 4), 16);
      if (len === 0) break;
      const labelHex = data.slice(offset + 4, offset + 4 + len * 2);
      const label = Buffer.from(labelHex, "hex").toString("utf8");
      labels.push(label);
      offset += 4 + len * 2;
    }

    return labels.length > 0 ? labels.join(".") : null;
  } catch {
    return null;
  }
}

/**
 * Resolve an ENS name to an Ethereum address.
 * Uses public RPC endpoint for resolution.
 */
export async function resolveEnsName(name: string, rpcUrl?: string): Promise<EnsResolution | null> {
  const cached = ensCache.get(`forward:${name}`);
  if (cached) return cached;

  const providerRpc = rpcUrl ?? DEFAULT_RPC_URL;

  try {
    // Use Ethereum JSON-RPC to resolve ENS name
    // Standard ENS resolution via ERC-137 contract methods
    const { response, release } = await fetchWithSsrFGuard({
      url: providerRpc,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [
            {
              to: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e", // ENS Registry
              data: "0x0178b8bc" + encodeEnsName(name), // resolve(bytes32,bytes)
            },
            "latest",
          ],
        }),
      },
      auditContext: "web3-ens-resolve",
    });

    try {
      const data = (await response.json()) as { result?: string };
      const result = data.result;

      if (!result || result === "0x") {
        return null;
      }

      // Parse address from result (last 40 hex chars = 20 bytes)
      const addressHex = "0x" + result.slice(-40);
      const address = getAddress(addressHex);

      const resolution: EnsResolution = {
        name,
        address,
        resolver: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
        resolvedAt: new Date().toISOString(),
      };

      ensCache.set(`forward:${name}`, resolution, DEFAULT_CACHE_TTL_MS);
      return resolution;
    } finally {
      await release();
    }
  } catch {
    return null;
  }
}

/**
 * Resolve an Ethereum address to its ENS name (reverse resolution).
 */
export async function resolveEnsAddress(
  address: string,
  rpcUrl?: string,
): Promise<EnsResolution | null> {
  if (!isAddress(address)) {
    return null;
  }

  const cached = ensCache.get(`reverse:${address.toLowerCase()}`);
  if (cached) return cached;

  const providerRpc = rpcUrl ?? DEFAULT_RPC_URL;
  const addressLower = address.toLowerCase();

  try {
    // Reverse resolution: hash address and query ENS resolver
    const addressHash = keccak256(`0x${addressLower.slice(2).padStart(64, "0")}`);
    const { response, release } = await fetchWithSsrFGuard({
      url: providerRpc,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [
            {
              to: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e", // ENS Registry
              data: "0x5e60fce4" + addressHash, // name(bytes32)
            },
            "latest",
          ],
        }),
      },
      auditContext: "web3-ens-reverse",
    });

    try {
      const data = (await response.json()) as { result?: string };
      const result = data.result;

      if (
        !result ||
        result === "0x" ||
        result === "0x0000000000000000000000000000000000000000000000000000000000000000"
      ) {
        return null;
      }

      // Decode ENS name from result (stored as DNS-encoded string)
      const name = decodeEnsName(result);
      if (!name) {
        return null;
      }

      const resolution: EnsResolution = {
        name,
        address: getAddress(address),
        resolver: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
        resolvedAt: new Date().toISOString(),
      };

      ensCache.set(`reverse:${addressLower}`, resolution, DEFAULT_CACHE_TTL_MS);
      return resolution;
    } finally {
      await release();
    }
  } catch {
    return null;
  }
}

/** Gateway handler: resolve ENS name to address. */
export function createEnsResolveHandler(
  _store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    const { name, rpcUrl } = (params ?? {}) as { name?: string; rpcUrl?: string };

    if (!name) {
      respond(false, formatWeb3GatewayErrorResponse("name is required"));
      return;
    }

    // Validate ENS name format (basic check)
    if (!name.includes(".") || name.length > 253) {
      respond(false, formatWeb3GatewayErrorResponse("invalid ENS name"));
      return;
    }

    const resolution = await resolveEnsName(name, rpcUrl ?? config.chain.rpcUrl);

    if (!resolution) {
      respond(false, formatWeb3GatewayErrorResponse("ENS name not found"));
      return;
    }

    respond(true, resolution);
  };
}

/** Gateway handler: reverse resolve address to ENS name. */
export function createEnsReverseHandler(
  _store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    const { address, rpcUrl } = (params ?? {}) as { address?: string; rpcUrl?: string };

    if (!address) {
      respond(false, formatWeb3GatewayErrorResponse("address is required"));
      return;
    }

    if (!isAddress(address)) {
      respond(false, formatWeb3GatewayErrorResponse("invalid Ethereum address"));
      return;
    }

    const resolution = await resolveEnsAddress(address, rpcUrl ?? config.chain.rpcUrl);

    if (!resolution) {
      respond(false, formatWeb3GatewayErrorResponse("no reverse resolution found"));
      return;
    }

    respond(true, resolution);
  };
}
