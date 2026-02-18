import type { Web3PluginConfig } from "../config.js";
import { ArweaveStorageAdapter } from "./arweave-adapter.js";
import { FilecoinStorageAdapter } from "./filecoin-adapter.js";
import { IpfsStorageAdapter } from "./ipfs-adapter.js";
import type { DecentralizedStorageAdapter } from "./types.js";

export function createStorageAdapter(config: Web3PluginConfig): DecentralizedStorageAdapter | null {
  const provider = config.storage.provider ?? "ipfs";

  if (provider === "ipfs") {
    if (!config.storage.pinataJwt) return null;
    return new IpfsStorageAdapter({
      pinataJwt: config.storage.pinataJwt,
      gateway: config.storage.gateway,
    });
  }

  if (provider === "arweave") {
    if (!config.storage.arweaveKeyfile) return null;
    return new ArweaveStorageAdapter({
      keyfilePath: config.storage.arweaveKeyfile,
      gateway: config.storage.gateway,
    });
  }

  if (provider === "filecoin") {
    if (!config.storage.filecoinToken) return null;
    return new FilecoinStorageAdapter({
      token: config.storage.filecoinToken,
      gateway: config.storage.gateway,
      endpoint: config.storage.filecoinEndpoint,
    });
  }

  return null;
}
