import { createHash } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveConfig } from "../config.js";
import {
  clearConsumerLeaseAccess,
  clearConsumerLeaseById,
  getConsumerLeaseAccess,
  saveConsumerLeaseAccess,
} from "./leases.js";

const callGatewayMock = vi.fn();
vi.mock("../../../../src/gateway/call.ts", () => ({
  callGateway: (...args: unknown[]) => callGatewayMock(...args),
}));

function hashToken(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

function activeLease(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    result: {
      lease: {
        leaseId: "lease-1",
        resourceId: "res-1",
        providerActorId: "0xprovider",
        consumerActorId: "0xconsumer",
        status: "lease_active",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        accessTokenHash: hashToken("tok_valid"),
        ...overrides,
      },
    },
  };
}

describe("leases - consumer cache", () => {
  beforeEach(() => {
    clearConsumerLeaseAccess("res-cache-1");
    clearConsumerLeaseAccess("res-cache-2");
  });

  it("stores and retrieves a consumer lease access entry", () => {
    saveConsumerLeaseAccess({
      leaseId: "lease-cache-1",
      resourceId: "res-cache-1",
      accessToken: "tok_abc",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const entry = getConsumerLeaseAccess("res-cache-1");
    expect(entry).not.toBeNull();
    expect(entry?.leaseId).toBe("lease-cache-1");
    expect(entry?.accessToken).toBe("tok_abc");
  });

  it("returns null for unknown resourceId", () => {
    expect(getConsumerLeaseAccess("unknown-res")).toBeNull();
  });

  it("returns null and evicts expired entries", () => {
    saveConsumerLeaseAccess({
      leaseId: "lease-expired",
      resourceId: "res-cache-1",
      accessToken: "tok_expired",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const entry = getConsumerLeaseAccess("res-cache-1");
    expect(entry).toBeNull();
  });

  it("skips entries with empty accessToken", () => {
    saveConsumerLeaseAccess({
      leaseId: "lease-empty",
      resourceId: "res-cache-1",
      accessToken: "",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(getConsumerLeaseAccess("res-cache-1")).toBeNull();
  });

  it("clears a specific resourceId entry", () => {
    saveConsumerLeaseAccess({
      leaseId: "lease-clear",
      resourceId: "res-cache-1",
      accessToken: "tok_clear",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    clearConsumerLeaseAccess("res-cache-1");
    expect(getConsumerLeaseAccess("res-cache-1")).toBeNull();
  });

  it("clears all entries matching a leaseId", () => {
    saveConsumerLeaseAccess({
      leaseId: "lease-multi",
      resourceId: "res-cache-1",
      accessToken: "tok1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    saveConsumerLeaseAccess({
      leaseId: "lease-multi",
      resourceId: "res-cache-2",
      accessToken: "tok2",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    clearConsumerLeaseById("lease-multi");
    expect(getConsumerLeaseAccess("res-cache-1")).toBeNull();
    expect(getConsumerLeaseAccess("res-cache-2")).toBeNull();
  });
});

describe("leases - validateLeaseAccess", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
  });

  it("returns ok for a valid active lease with matching token", async () => {
    callGatewayMock.mockResolvedValue(activeLease());

    const { validateLeaseAccess } = await import("./leases.js");
    const config = resolveConfig({
      resources: {
        enabled: true,
        provider: { auth: { allowedConsumers: [] } },
      },
    });

    const result = await validateLeaseAccess({
      leaseId: "lease-1",
      token: "tok_valid",
      config,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects when lease is not found", async () => {
    callGatewayMock.mockResolvedValue({ ok: true, result: { lease: null } });

    const { validateLeaseAccess } = await import("./leases.js");
    const config = resolveConfig({
      resources: {
        enabled: true,
        provider: { auth: { allowedConsumers: [] } },
      },
    });

    const result = await validateLeaseAccess({
      leaseId: "lease-missing",
      token: "tok_valid",
      config,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not found");
  });

  it("rejects when lease status is not active", async () => {
    callGatewayMock.mockResolvedValue(activeLease({ status: "lease_revoked" }));

    const { validateLeaseAccess } = await import("./leases.js");
    const config = resolveConfig({
      resources: {
        enabled: true,
        provider: { auth: { allowedConsumers: [] } },
      },
    });

    const result = await validateLeaseAccess({
      leaseId: "lease-1",
      token: "tok_valid",
      config,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not active");
  });

  it("rejects when lease is expired", async () => {
    callGatewayMock.mockResolvedValue(
      activeLease({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
    );

    const { validateLeaseAccess } = await import("./leases.js");
    const config = resolveConfig({
      resources: {
        enabled: true,
        provider: { auth: { allowedConsumers: [] } },
      },
    });

    const result = await validateLeaseAccess({
      leaseId: "lease-1",
      token: "tok_valid",
      config,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("expired");
  });

  it("rejects when token hash does not match", async () => {
    callGatewayMock.mockResolvedValue(activeLease());

    const { validateLeaseAccess } = await import("./leases.js");
    const config = resolveConfig({
      resources: {
        enabled: true,
        provider: { auth: { allowedConsumers: [] } },
      },
    });

    const result = await validateLeaseAccess({
      leaseId: "lease-1",
      token: "tok_wrong",
      config,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("invalid lease token");
  });

  it("rejects when consumer is not in allowedConsumers", async () => {
    callGatewayMock.mockResolvedValue(activeLease());

    const { validateLeaseAccess } = await import("./leases.js");
    const config = resolveConfig({
      resources: {
        enabled: true,
        provider: { auth: { allowedConsumers: ["0xother"] } },
      },
    });

    const result = await validateLeaseAccess({
      leaseId: "lease-1",
      token: "tok_valid",
      config,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not allowed");
  });

  it("handles gateway call failure gracefully", async () => {
    callGatewayMock.mockRejectedValue(new Error("gateway timeout"));

    const { validateLeaseAccess } = await import("./leases.js");
    const config = resolveConfig({
      resources: {
        enabled: true,
        provider: { auth: { allowedConsumers: [] } },
      },
    });

    const result = await validateLeaseAccess({
      leaseId: "lease-1",
      token: "tok_valid",
      config,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("gateway timeout");
  });
});
