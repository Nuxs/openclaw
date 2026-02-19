import { describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { resolveBrainModelOverride } from "./resolve.js";

describe("web3-core brain resolve", () => {
  it("returns overrides when brain is enabled and allowlist matches", () => {
    const config = resolveConfig({
      brain: {
        enabled: true,
        providerId: "web3-decentralized",
        defaultModel: "model-1",
        allowlist: ["model-1"],
        endpoint: "https://brain.example.com",
      },
    });

    const result = resolveBrainModelOverride(config);
    expect(result?.providerOverride).toBe("web3-decentralized");
    expect(result?.modelOverride).toBe("model-1");
  });

  it("returns undefined when allowlist does not match", () => {
    const config = resolveConfig({
      brain: {
        enabled: true,
        providerId: "web3-decentralized",
        defaultModel: "model-2",
        allowlist: ["model-1"],
        endpoint: "https://brain.example.com",
      },
    });

    const result = resolveBrainModelOverride(config);
    expect(result).toBeUndefined();
  });

  it("returns undefined when endpoint is missing for openai-compat", () => {
    const config = resolveConfig({
      brain: {
        enabled: true,
        providerId: "web3-decentralized",
        defaultModel: "model-1",
        allowlist: ["model-1"],
        endpoint: "",
        protocol: "openai-compat",
      },
    });

    const result = resolveBrainModelOverride(config);
    expect(result).toBeUndefined();
  });
});
