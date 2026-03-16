import { describe, expect, it, vi } from "vitest";
import type { Web3PluginConfig } from "../config.js";
import {
  callGatewayMethod,
  errorResult,
  jsonResult,
  requireOneOf,
  requireTrimmedString,
  safeResult,
  withTrimmedActor,
} from "./market-tools-shared.js";

vi.mock("../core-imports.js", () => ({
  loadCallGateway: vi.fn(),
  normalizeGatewayResult: vi.fn(),
}));

vi.mock("../errors.js", () => ({
  formatWeb3GatewayErrorResponse: vi.fn((err, _code, details) => ({
    ok: false,
    error: String(err),
    details,
  })),
}));

vi.mock("../utils/redact.js", () => ({
  redactUnknown: vi.fn((obj) => obj),
}));

describe("market-tools-shared", () => {
  const mockConfig = {
    brain: { timeoutMs: 30000 },
  } as Web3PluginConfig;

  describe("jsonResult", () => {
    it("should format payload as JSON text", () => {
      const payload = { key: "value", nested: { num: 42 } };
      const result = jsonResult(payload);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(JSON.parse(result.content[0].text)).toEqual(payload);
      expect(result.details).toEqual(payload);
    });
  });

  describe("safeResult", () => {
    it("should redact payload and return JSON result", async () => {
      const { redactUnknown } = await import("../utils/redact.js");
      const payload = { sensitive: "secret" };
      const result = safeResult(payload);

      expect(redactUnknown).toHaveBeenCalledWith(payload);
      expect(result.details).toEqual(payload);
    });
  });

  describe("errorResult", () => {
    it("should format error with optional details", async () => {
      const { formatWeb3GatewayErrorResponse } = await import("../errors.js");
      const error = new Error("Test error");
      const details = { field: "test" };
      const result = errorResult(error, details);

      expect(formatWeb3GatewayErrorResponse).toHaveBeenCalledWith(error, "E_INTERNAL", details);
      expect(result.details).toEqual({
        ok: false,
        error: "Error: Test error",
        details,
      });
    });
  });

  describe("requireTrimmedString", () => {
    it("should return trimmed value when valid", () => {
      expect(requireTrimmedString("  value  ", "field")).toBe("value");
    });

    it("should throw when value is empty", () => {
      expect(() => requireTrimmedString("", "field")).toThrow("field is required");
    });

    it("should throw when value is undefined", () => {
      expect(() => requireTrimmedString(undefined, "field")).toThrow("field is required");
    });

    it("should throw when value is whitespace only", () => {
      expect(() => requireTrimmedString("   ", "field")).toThrow("field is required");
    });
  });

  describe("requireOneOf", () => {
    it("should pass when at least one value is valid", () => {
      expect(() => requireOneOf(["value1", undefined, ""], ["field1", "field2"])).not.toThrow();
    });

    it("should throw when all values are empty", () => {
      expect(() => requireOneOf([undefined, "", "  "], ["field1", "field2"])).toThrow(
        "one of field1, field2 is required",
      );
    });
  });

  describe("withTrimmedActor", () => {
    it("should trim actorId when present", () => {
      const params = { actorId: "  actor123  ", other: "value" };
      const result = withTrimmedActor(params);
      expect(result.actorId).toBe("actor123");
      expect(result.other).toBe("value");
    });

    it("should return params unchanged when actorId is absent", () => {
      const params = { actorId: undefined, other: "value" };
      const result = withTrimmedActor(params);
      expect(result).toEqual(params);
    });

    it("should return params unchanged when actorId is empty", () => {
      const params = { actorId: "", other: "value" };
      const result = withTrimmedActor(params);
      expect(result).toEqual(params);
    });
  });

  describe("callGatewayMethod", () => {
    it("should call gateway and return normalized result", async () => {
      const { loadCallGateway, normalizeGatewayResult } = await import("../core-imports.js");
      const mockCallGateway = vi.fn().mockResolvedValue({ ok: true, result: "data" });
      vi.mocked(loadCallGateway).mockResolvedValue(mockCallGateway);
      vi.mocked(normalizeGatewayResult).mockReturnValue({
        ok: true,
        result: "normalized",
      });

      const result = await callGatewayMethod(mockConfig, "web3.test.method", {
        param: "value",
      });

      expect(mockCallGateway).toHaveBeenCalledWith({
        method: "web3.test.method",
        params: { param: "value" },
        timeoutMs: 30000,
      });
      expect(result).toEqual({ ok: true, result: "normalized" });
    });

    it("should return error when gateway call fails", async () => {
      const { loadCallGateway, normalizeGatewayResult } = await import("../core-imports.js");
      const mockCallGateway = vi.fn().mockResolvedValue({ ok: false });
      vi.mocked(loadCallGateway).mockResolvedValue(mockCallGateway);
      vi.mocked(normalizeGatewayResult).mockReturnValue({
        ok: false,
        error: "Gateway error",
      });

      const result = await callGatewayMethod(mockConfig, "web3.test.method");

      expect(result.ok).toBe(false);
      expect((result as any).error).toBeDefined();
    });

    it("should log timing when logTiming is enabled", async () => {
      const { loadCallGateway, normalizeGatewayResult } = await import("../core-imports.js");
      const mockCallGateway = vi.fn().mockResolvedValue({ ok: true });
      vi.mocked(loadCallGateway).mockResolvedValue(mockCallGateway);
      vi.mocked(normalizeGatewayResult).mockReturnValue({ ok: true });

      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      await callGatewayMethod(mockConfig, "web3.test.method", undefined, {
        method: "web3.test.method",
        logTiming: true,
      });

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[market-tools\] web3\.test\.method completed in \d+\.\d+ms/),
      );

      debugSpy.mockRestore();
    });
  });
});
