import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveConfig } from "../config.js";

const loadConfigMock = vi.fn();
vi.mock("../../../../src/config/config.ts", () => ({
  loadConfig: (...args: unknown[]) => loadConfigMock(...args),
}));

const callGatewayMock = vi.fn();
vi.mock("../../../../src/gateway/call.ts", () => ({
  callGateway: (...args: unknown[]) => callGatewayMock(...args),
}));

function createResponder() {
  let result: { ok: boolean; payload: Record<string, unknown> } | undefined;
  return {
    respond: (ok: boolean, payload: Record<string, unknown>) => {
      result = { ok, payload };
    },
    result: () => result,
  };
}

describe("web3-core resource registry handlers", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
    loadConfigMock.mockReset();
  });

  it("rejects publish when resources disabled", async () => {
    const config = resolveConfig({ resources: { enabled: false } });
    const { createResourcePublishHandler } = await import("./registry.js");
    const handler = createResourcePublishHandler(config);
    const { respond, result } = createResponder();

    await handler({ params: {}, respond } as any);
    expect(result()?.ok).toBe(false);
    expect(result()?.payload.error).toBe("E_FORBIDDEN");
  });

  it("rejects publish when advertiseToMarket disabled", async () => {
    const config = resolveConfig({
      resources: { enabled: true, advertiseToMarket: false },
    });
    const { createResourcePublishHandler } = await import("./registry.js");
    const handler = createResourcePublishHandler(config);
    const { respond, result } = createResponder();

    await handler({ params: {}, respond } as any);
    expect(result()?.ok).toBe(false);
    expect(result()?.payload.error).toBe("E_FORBIDDEN");
  });

  it("proxies publish to market.resource.publish on success", async () => {
    callGatewayMock.mockResolvedValue({
      ok: true,
      result: { resourceId: "res-1", offerId: "offer-1" },
    });

    const config = resolveConfig({
      resources: { enabled: true, advertiseToMarket: true },
    });
    const { createResourcePublishHandler } = await import("./registry.js");
    const handler = createResourcePublishHandler(config);
    const { respond, result } = createResponder();

    await handler({ params: { actorId: "0xprov" }, respond } as any);
    expect(result()?.ok).toBe(true);
    expect(result()?.payload.resourceId).toBe("res-1");
    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: "market.resource.publish" }),
    );
  });

  it("rejects list when resources disabled", async () => {
    const config = resolveConfig({ resources: { enabled: false } });
    const { createResourceListHandler } = await import("./registry.js");
    const handler = createResourceListHandler(config);
    const { respond, result } = createResponder();

    await handler({ params: {}, respond } as any);
    expect(result()?.ok).toBe(false);
  });

  it("proxies list to market.resource.list on success", async () => {
    callGatewayMock.mockResolvedValue({ ok: true, result: { resources: [] } });

    const config = resolveConfig({ resources: { enabled: true } });
    const { createResourceListHandler } = await import("./registry.js");
    const handler = createResourceListHandler(config);
    const { respond, result } = createResponder();

    await handler({ params: {}, respond } as any);
    expect(result()?.ok).toBe(true);
  });

  it("rejects lease when consumer disabled", async () => {
    const config = resolveConfig({
      resources: { enabled: true, consumer: { enabled: false } },
    });
    const { createResourceLeaseHandler } = await import("./registry.js");
    const handler = createResourceLeaseHandler(config);
    const { respond, result } = createResponder();

    await handler({ params: { resourceId: "res-1" }, respond } as any);
    expect(result()?.ok).toBe(false);
    expect(result()?.payload.error).toBe("E_FORBIDDEN");
  });

  it("rejects lease when resourceId missing", async () => {
    const config = resolveConfig({
      resources: { enabled: true, consumer: { enabled: true } },
    });
    const { createResourceLeaseHandler } = await import("./registry.js");
    const handler = createResourceLeaseHandler(config);
    const { respond, result } = createResponder();

    await handler({ params: {}, respond } as any);
    expect(result()?.ok).toBe(false);
    expect(result()?.payload.error).toBe("E_INVALID_ARGUMENT");
  });

  it("caches consumer lease access on successful lease issue", async () => {
    callGatewayMock.mockResolvedValue({
      ok: true,
      result: {
        leaseId: "lease-new",
        accessToken: "tok_new",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        orderId: "ord-1",
        consentId: "con-1",
        deliveryId: "del-1",
      },
    });

    const config = resolveConfig({
      resources: { enabled: true, consumer: { enabled: true } },
    });
    const { createResourceLeaseHandler } = await import("./registry.js");
    const { getConsumerLeaseAccess, clearConsumerLeaseAccess } = await import("./leases.js");
    const handler = createResourceLeaseHandler(config);
    const { respond, result } = createResponder();

    await handler({
      params: { resourceId: "res-lease-test", consumerActorId: "0xcons", ttlMs: 60000 },
      respond,
    } as any);
    expect(result()?.ok).toBe(true);
    expect(result()?.payload.stored).toBe(true);

    const cached = getConsumerLeaseAccess("res-lease-test");
    expect(cached).not.toBeNull();
    expect(cached?.leaseId).toBe("lease-new");

    // Cleanup
    clearConsumerLeaseAccess("res-lease-test");
  });

  it("records settlement metadata when sessionKey is provided", async () => {
    const tempDir = fs.mkdtempSync(path.join(tmpdir(), "openclaw-web3-session-"));
    const storePath = path.join(tempDir, "sessions.json");
    const sessionKey = "agent:main:web3";
    fs.writeFileSync(
      storePath,
      JSON.stringify(
        {
          [sessionKey]: { sessionId: "sess-1", updatedAt: Date.now() },
        },
        null,
        2,
      ),
      "utf-8",
    );
    loadConfigMock.mockResolvedValue({ session: { store: storePath } });

    callGatewayMock.mockResolvedValue({
      ok: true,
      result: {
        leaseId: "lease-new",
        accessToken: "tok_new",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        orderId: "ord-2",
        consentId: "con-2",
        deliveryId: "del-2",
      },
    });

    const config = resolveConfig({
      resources: { enabled: true, consumer: { enabled: true } },
    });
    const { createResourceLeaseHandler } = await import("./registry.js");
    const { loadSessionStore } = await import("../../../../src/config/sessions/store.ts");
    const handler = createResourceLeaseHandler(config);
    const { respond, result } = createResponder();

    await handler({
      params: {
        resourceId: "res-lease-test",
        consumerActorId: "0xcons",
        actorId: "0xcons",
        ttlMs: 60000,
        sessionKey,
      },
      respond,
    } as any);

    expect(result()?.ok).toBe(true);

    const deadline = Date.now() + 1000;
    let store = loadSessionStore(storePath, { skipCache: true });
    while (Date.now() < deadline && !store[sessionKey]?.settlement?.orderId) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      store = loadSessionStore(storePath, { skipCache: true });
    }

    expect(store[sessionKey]?.settlement?.orderId).toBe("ord-2");
    expect(store[sessionKey]?.settlement?.payer).toBe("0xcons");
  });

  it("rejects revokeLease when resources disabled", async () => {
    const config = resolveConfig({ resources: { enabled: false } });
    const { createResourceRevokeLeaseHandler } = await import("./registry.js");
    const handler = createResourceRevokeLeaseHandler(config);
    const { respond, result } = createResponder();

    await handler({ params: { leaseId: "lease-1" }, respond } as any);
    expect(result()?.ok).toBe(false);
  });

  it("clears consumer cache on revoke", async () => {
    const { saveConsumerLeaseAccess, getConsumerLeaseAccess } = await import("./leases.js");
    saveConsumerLeaseAccess({
      leaseId: "lease-revoke-test",
      resourceId: "res-revoke-test",
      accessToken: "tok_rev",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    callGatewayMock.mockResolvedValue({
      ok: true,
      result: { leaseId: "lease-revoke-test", status: "lease_revoked" },
    });

    const config = resolveConfig({ resources: { enabled: true } });
    const { createResourceRevokeLeaseHandler } = await import("./registry.js");
    const handler = createResourceRevokeLeaseHandler(config);
    const { respond, result } = createResponder();

    await handler({
      params: { leaseId: "lease-revoke-test", actorId: "0xprov" },
      respond,
    } as any);
    expect(result()?.ok).toBe(true);

    expect(getConsumerLeaseAccess("res-revoke-test")).toBeNull();
  });

  it("rejects status when neither resourceId nor leaseId provided", async () => {
    const config = resolveConfig({ resources: { enabled: true } });
    const { createResourceStatusHandler } = await import("./registry.js");
    const handler = createResourceStatusHandler(config);
    const { respond, result } = createResponder();

    await handler({ params: {}, respond } as any);
    expect(result()?.ok).toBe(false);
    expect(result()?.payload.error).toBe("E_INVALID_ARGUMENT");
  });

  it("proxies status with leaseId to market.lease.get", async () => {
    callGatewayMock.mockResolvedValue({
      ok: true,
      result: { lease: { leaseId: "lease-1", status: "lease_active" } },
    });

    const config = resolveConfig({ resources: { enabled: true } });
    const { createResourceStatusHandler } = await import("./registry.js");
    const handler = createResourceStatusHandler(config);
    const { respond, result } = createResponder();

    await handler({ params: { leaseId: "lease-1" }, respond } as any);
    expect(result()?.ok).toBe(true);
    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: "market.lease.get" }),
    );
  });

  it("proxies status with resourceId to market.resource.get", async () => {
    callGatewayMock.mockResolvedValue({
      ok: true,
      result: { resource: { resourceId: "res-1" } },
    });

    const config = resolveConfig({ resources: { enabled: true } });
    const { createResourceStatusHandler } = await import("./registry.js");
    const handler = createResourceStatusHandler(config);
    const { respond, result } = createResponder();

    await handler({ params: { resourceId: "res-1" }, respond } as any);
    expect(result()?.ok).toBe(true);
    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: "market.resource.get" }),
    );
  });

  it("handles gateway error gracefully", async () => {
    callGatewayMock.mockResolvedValue({ ok: false, error: "internal error" });

    const config = resolveConfig({
      resources: { enabled: true, advertiseToMarket: true },
    });
    const { createResourcePublishHandler } = await import("./registry.js");
    const handler = createResourcePublishHandler(config);
    const { respond, result } = createResponder();

    await handler({ params: { actorId: "0xprov" }, respond } as any);
    expect(result()?.ok).toBe(false);
    expect(result()?.payload.error).toBe("E_INTERNAL");
  });
});
