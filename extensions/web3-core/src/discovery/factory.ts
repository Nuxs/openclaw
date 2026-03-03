/**
 * DiscoveryBackend factory — creates the appropriate backend based on config.
 */

import { StaticDiscoveryBackend } from "./backend-static.js";
import type { DiscoveryConfig, DiscoveryBackend } from "./types.js";

export type DiscoveryFactoryOptions = {
  config: DiscoveryConfig;
  /** Ed25519 private key in PKCS#8 DER format (base64). Used by libp2p backend. */
  privateKeyDer?: string;
  /** Logger for backend messages. */
  logger?: (msg: string) => void;
};

/**
 * Create a DiscoveryBackend instance based on the config.
 *
 * - "static" → StaticDiscoveryBackend (no-op)
 * - "libp2p" → Libp2pDiscoveryBackend (lazy-loaded to avoid bundling
 *   libp2p when discovery is disabled)
 */
export async function createDiscoveryBackend(
  options: DiscoveryFactoryOptions,
): Promise<DiscoveryBackend> {
  const { config } = options;

  if (!config.enabled) {
    return new StaticDiscoveryBackend();
  }

  switch (config.backend) {
    case "libp2p": {
      // Dynamic import to avoid pulling in libp2p deps when not needed
      const { Libp2pDiscoveryBackend } = await import("./backend-libp2p.js");
      return new Libp2pDiscoveryBackend({
        config,
        privateKeyDer: options.privateKeyDer,
        logger: options.logger,
      });
    }
    case "static":
      return new StaticDiscoveryBackend();
    default:
      options.logger?.(`[mdl:factory] Unknown backend "${config.backend}", falling back to static`);
      return new StaticDiscoveryBackend();
  }
}
