import { describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import { executeRevocation } from "./revocation.js";

describe("executeRevocation", () => {
  it("fails when webhook endpoint is missing", async () => {
    const config = resolveConfig({ revocation: { mode: "webhook" } });
    const result = await executeRevocation(config, {
      delivery: { deliveryId: "d1", orderId: "o1", status: "delivery_completed" } as any,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("revocation.endpoint");
  });

  it("succeeds when webhook responds ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const config = resolveConfig({
      revocation: { mode: "webhook", endpoint: "https://example.com/revoke" },
    });

    const result = await executeRevocation(config, {
      delivery: { deliveryId: "d1", orderId: "o1", status: "delivery_completed" } as any,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
