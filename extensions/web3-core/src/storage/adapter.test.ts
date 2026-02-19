import { describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { createStorageAdapter } from "./adapter.js";
import { FilecoinStorageAdapter } from "./filecoin-adapter.js";
import { IpfsStorageAdapter } from "./ipfs-adapter.js";

describe("createStorageAdapter", () => {
  it("returns null when required credentials are missing", () => {
    const config = resolveConfig({ storage: { provider: "ipfs" } });
    expect(createStorageAdapter(config)).toBeNull();
  });

  it("creates an IPFS adapter when configured", () => {
    const config = resolveConfig({ storage: { provider: "ipfs", pinataJwt: "jwt" } });
    const adapter = createStorageAdapter(config);
    expect(adapter).toBeInstanceOf(IpfsStorageAdapter);
  });

  it("creates a Filecoin adapter when configured", () => {
    const config = resolveConfig({
      storage: { provider: "filecoin", filecoinToken: "token" },
    });
    const adapter = createStorageAdapter(config);
    expect(adapter).toBeInstanceOf(FilecoinStorageAdapter);
  });
});
