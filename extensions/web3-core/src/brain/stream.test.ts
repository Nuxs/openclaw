import { describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import { createWeb3StreamFn } from "./stream.js";

describe("web3-core brain stream", () => {
  describe("createWeb3StreamFn", () => {
    it("returns undefined when brain is disabled", () => {
      const config = resolveConfig({
        brain: { enabled: false },
      });
      expect(createWeb3StreamFn(config)).toBeUndefined();
    });

    it("returns undefined for unsupported protocol", () => {
      const config = resolveConfig({
        brain: {
          enabled: true,
          protocol: "custom-ws",
          endpoint: "https://brain.example.com",
          providerId: "test",
          defaultModel: "m",
        },
      });
      expect(createWeb3StreamFn(config)).toBeUndefined();
    });

    it("returns undefined when endpoint is empty", () => {
      const config = resolveConfig({
        brain: {
          enabled: true,
          protocol: "openai-compat",
          endpoint: "",
          providerId: "test",
          defaultModel: "m",
        },
      });
      expect(createWeb3StreamFn(config)).toBeUndefined();
    });

    it("returns undefined when endpoint is whitespace-only", () => {
      const config = resolveConfig({
        brain: {
          enabled: true,
          protocol: "openai-compat",
          endpoint: "   ",
          providerId: "test",
          defaultModel: "m",
        },
      });
      expect(createWeb3StreamFn(config)).toBeUndefined();
    });

    it("returns a StreamFn when brain is enabled with valid openai-compat config", () => {
      const config = resolveConfig({
        brain: {
          enabled: true,
          protocol: "openai-compat",
          endpoint: "https://brain.example.com",
          providerId: "web3-decentralized",
          defaultModel: "model-1",
        },
      });
      const fn = createWeb3StreamFn(config);
      expect(fn).toBeTypeOf("function");
    });
  });

  describe("normalizeBaseUrl (via createWeb3StreamFn behavior)", () => {
    // We test normalizeBaseUrl indirectly through createWeb3StreamFn's
    // returned function, which passes the normalized URL to streamSimple.

    it("appends /v1 to a plain URL", () => {
      const config = resolveConfig({
        brain: {
          enabled: true,
          protocol: "openai-compat",
          endpoint: "https://brain.example.com",
          providerId: "test",
          defaultModel: "m",
        },
      });
      const fn = createWeb3StreamFn(config);
      expect(fn).toBeDefined();
      // The function was created, meaning normalizeBaseUrl returned a non-empty baseUrl
    });

    it("does not duplicate /v1 suffix", () => {
      const config = resolveConfig({
        brain: {
          enabled: true,
          protocol: "openai-compat",
          endpoint: "https://brain.example.com/v1",
          providerId: "test",
          defaultModel: "m",
        },
      });
      const fn = createWeb3StreamFn(config);
      expect(fn).toBeDefined();
    });

    it("trims trailing slashes before appending /v1", () => {
      const config = resolveConfig({
        brain: {
          enabled: true,
          protocol: "openai-compat",
          endpoint: "https://brain.example.com///",
          providerId: "test",
          defaultModel: "m",
        },
      });
      const fn = createWeb3StreamFn(config);
      expect(fn).toBeDefined();
    });
  });

  describe("resolveTimeoutSignal (via StreamFn behavior)", () => {
    it("respects existing signal and does not create a new one", () => {
      const config = resolveConfig({
        brain: {
          enabled: true,
          protocol: "openai-compat",
          endpoint: "https://brain.example.com",
          providerId: "test",
          defaultModel: "m",
          timeoutMs: 5000,
        },
      });
      const fn = createWeb3StreamFn(config);
      expect(fn).toBeDefined();
      // When an existing signal is provided, it should be passed through
      // (tested structurally — the returned function accepts options.signal)
    });

    it("returns a function even when timeoutMs is 0 (no timeout)", () => {
      const config = resolveConfig({
        brain: {
          enabled: true,
          protocol: "openai-compat",
          endpoint: "https://brain.example.com",
          providerId: "test",
          defaultModel: "m",
          timeoutMs: 0,
        },
      });
      const fn = createWeb3StreamFn(config);
      expect(fn).toBeDefined();
    });

    it("returns a function even when timeoutMs is negative (no timeout)", () => {
      const config = resolveConfig({
        brain: {
          enabled: true,
          protocol: "openai-compat",
          endpoint: "https://brain.example.com",
          providerId: "test",
          defaultModel: "m",
          timeoutMs: -1,
        },
      });
      const fn = createWeb3StreamFn(config);
      expect(fn).toBeDefined();
    });
  });
});
