import { describe, it, expect } from "vitest";
import { resolveConfig, DEFAULT_CONFIG } from "./config.js";

describe("resolveConfig", () => {
  it("should return defaults when no config is provided", () => {
    const cfg = resolveConfig();
    expect(cfg.chain.network).toBe("base");
    expect(cfg.privacy.onChainData).toBe("hash_only");
    expect(cfg.privacy.archiveEncryption).toBe(true);
    expect(cfg.billing.enabled).toBe(false);
    expect(cfg.identity.allowSiwe).toBe(true);
    expect(cfg.storage.provider).toBe("ipfs");
  });

  it("should merge partial config with defaults", () => {
    const cfg = resolveConfig({
      chain: { network: "optimism" },
      billing: { enabled: true },
    });
    expect(cfg.chain.network).toBe("optimism");
    expect(cfg.chain.rpcUrl).toBeUndefined(); // default has no rpcUrl
    expect(cfg.billing.enabled).toBe(true);
    expect(cfg.billing.quotaPerSession).toBe(1000); // default preserved
    expect(cfg.privacy.onChainData).toBe("hash_only"); // untouched section
  });

  it("should handle empty object", () => {
    const cfg = resolveConfig({});
    expect(cfg).toEqual(DEFAULT_CONFIG);
  });
});
