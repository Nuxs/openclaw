import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithSsrFGuardMock = vi.fn();

vi.mock("openclaw/plugin-sdk/compat", async () => {
  const actual = await vi.importActual<typeof import("openclaw/plugin-sdk/compat")>(
    "openclaw/plugin-sdk/compat",
  );
  return {
    ...actual,
    fetchWithSsrFGuard: fetchWithSsrFGuardMock,
  };
});

const { resolveEnsName, resolveEnsAddress, resetEnsCacheForTests } = await import("./ens.js");

function createJsonRpcResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("ens resolution", () => {
  beforeEach(() => {
    fetchWithSsrFGuardMock.mockReset();
    resetEnsCacheForTests();
  });

  it("returns null for invalid ENS name without calling RPC", async () => {
    const result = await resolveEnsName("not-valid-name", "https://rpc.example");
    expect(result).toBeNull();
    expect(fetchWithSsrFGuardMock).not.toHaveBeenCalled();
  });

  it("caches forward resolution per rpc url", async () => {
    fetchWithSsrFGuardMock.mockImplementation(async () => ({
      response: createJsonRpcResponse({
        result: "0x0000000000000000000000001111111111111111111111111111111111111111",
      }),
      release: async () => {},
    }));

    const first = await resolveEnsName("vitalik.eth", "https://rpc-a.example");
    const second = await resolveEnsName("vitalik.eth", "https://rpc-a.example");
    const third = await resolveEnsName("vitalik.eth", "https://rpc-b.example");

    expect(first?.address).toBeTruthy();
    expect(second?.address).toBe(first?.address);
    expect(third?.address).toBeTruthy();
    expect(fetchWithSsrFGuardMock).toHaveBeenCalledTimes(2);
  });

  it("returns null for invalid reverse address without RPC call", async () => {
    const result = await resolveEnsAddress("bad-address", "https://rpc.example");
    expect(result).toBeNull();
    expect(fetchWithSsrFGuardMock).not.toHaveBeenCalled();
  });
});
