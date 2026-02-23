import { describe, expect, it } from "vitest";
import { AlertLevel } from "../monitor/types.js";
import {
  alertLevelBadge,
  buildStatLine,
  formatCredits,
  formatNextActions,
  formatWalletBinding,
  maskEndpoint,
  redactSensitive,
  sectionHeader,
  statusIndicator,
  truncateAddress,
  truncateCid,
  truncateList,
  truncateTx,
} from "./format.js";

describe("truncateAddress", () => {
  it("truncates a standard 42-char address", () => {
    expect(truncateAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1")).toBe("0x742d…bEb1");
  });
  it("returns short addresses unchanged", () => {
    expect(truncateAddress("0x1234")).toBe("0x1234");
  });
  it("returns non-0x strings unchanged", () => {
    expect(truncateAddress("abc")).toBe("abc");
  });
  it("returns empty string unchanged", () => {
    expect(truncateAddress("")).toBe("");
  });
});

describe("truncateTx", () => {
  it("truncates a long tx hash", () => {
    expect(truncateTx("0xabcdef1234567890abcdef")).toBe("0xabcdef…cdef");
  });
  it("returns short tx hashes unchanged", () => {
    expect(truncateTx("0xabcdef1234")).toBe("0xabcdef1234");
  });
  it("returns non-0x strings unchanged", () => {
    expect(truncateTx("not-a-tx")).toBe("not-a-tx");
  });
});

describe("truncateCid", () => {
  it("truncates a long CID", () => {
    expect(truncateCid("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")).toBe(
      "bafybeig…bzdi",
    );
  });
  it("returns short CIDs unchanged", () => {
    expect(truncateCid("bafy1234")).toBe("bafy1234");
  });
});

describe("maskEndpoint", () => {
  it("returns undefined for empty input", () => {
    expect(maskEndpoint(undefined)).toBeUndefined();
    expect(maskEndpoint("")).toBeUndefined();
  });
  it("masks a valid URL", () => {
    const masked = maskEndpoint("https://api.example.com/v1/data");
    expect(masked).toBe("https://api…com/***");
  });
  it("handles two-part hostnames", () => {
    const masked = maskEndpoint("https://example.com/path");
    expect(masked).toBe("https://example.com/***");
  });
  it("returns masked fallback for invalid URLs", () => {
    expect(maskEndpoint("not-a-url")).toBe("***masked***");
  });
});

describe("redactSensitive", () => {
  it("redacts known sensitive keys", () => {
    const result = redactSensitive({ token: "secret123", name: "Alice" });
    expect(result.token).toBe("***REDACTED***");
    expect(result.name).toBe("Alice");
  });
  it("truncates long string values", () => {
    const longVal = "a".repeat(100);
    const result = redactSensitive({ data: longVal });
    expect(result.data).toContain("…");
  });
  it("preserves short non-sensitive values", () => {
    const result = redactSensitive({ foo: "bar" });
    expect(result.foo).toBe("bar");
  });
});

describe("formatWalletBinding", () => {
  it("formats a binding without ENS", () => {
    const result = formatWalletBinding({
      address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
      chainId: 1,
      verifiedAt: "2026-01-01T00:00:00Z",
    });
    expect(result).toContain("0x742d…bEb1");
    expect(result).toContain("chain 1");
  });
  it("includes ENS name when present", () => {
    const result = formatWalletBinding({
      address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
      chainId: 1,
      verifiedAt: "2026-01-01T00:00:00Z",
      ensName: "alice.eth",
    });
    expect(result).toContain("alice.eth");
  });
});

describe("formatCredits", () => {
  it("formats a number", () => {
    expect(formatCredits(1000)).toBe("1,000");
  });
  it("formats a numeric string", () => {
    expect(formatCredits("2500")).toBe("2,500");
  });
  it("returns dash for undefined", () => {
    expect(formatCredits(undefined)).toBe("—");
  });
  it("returns original for NaN string", () => {
    expect(formatCredits("abc")).toBe("abc");
  });
});

describe("alertLevelBadge", () => {
  it("returns red for P0", () => {
    expect(alertLevelBadge(AlertLevel.P0)).toBe("🔴");
  });
  it("returns orange for P1", () => {
    expect(alertLevelBadge(AlertLevel.P1)).toBe("🟠");
  });
  it("returns yellow for P2", () => {
    expect(alertLevelBadge(AlertLevel.P2)).toBe("🟡");
  });
  it("returns white for unknown levels", () => {
    expect(alertLevelBadge("unknown" as AlertLevel)).toBe("⚪");
  });
});

describe("statusIndicator", () => {
  it("returns check for true", () => {
    expect(statusIndicator(true)).toBe("✅");
  });
  it("returns warning for false", () => {
    expect(statusIndicator(false)).toBe("⚠️");
  });
});

describe("buildStatLine", () => {
  it("builds a line without status", () => {
    expect(buildStatLine("Wallets", "3")).toBe("Wallets: 3");
  });
  it("builds a line with ok status", () => {
    expect(buildStatLine("Wallets", "3", true)).toBe("✅ Wallets: 3");
  });
  it("builds a line with warning status", () => {
    expect(buildStatLine("Wallets", "0", false)).toBe("⚠️ Wallets: 0");
  });
});

describe("sectionHeader", () => {
  it("creates a bordered header", () => {
    expect(sectionHeader("Identity")).toBe("\n━━━ Identity ━━━\n");
  });
});

describe("formatNextActions", () => {
  it("returns empty string for no actions", () => {
    expect(formatNextActions([])).toBe("");
  });
  it("formats numbered actions", () => {
    const result = formatNextActions(["action A", "action B"]);
    expect(result).toContain("1. action A");
    expect(result).toContain("2. action B");
    expect(result).toContain("📋 Next:");
  });
});

describe("truncateList", () => {
  it("returns all items when under max", () => {
    expect(truncateList([1, 2], 3)).toEqual({ shown: [1, 2], more: 0 });
  });
  it("truncates and reports overflow", () => {
    expect(truncateList([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2, 3], more: 2 });
  });
  it("returns exact max items with zero more", () => {
    expect(truncateList([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], more: 0 });
  });
});
