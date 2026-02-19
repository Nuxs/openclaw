import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { Web3StateStore } from "../state/store.js";
import { createBindWalletCommand } from "./commands.js";

describe("/bind_wallet command", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not bind when SIWE is enabled", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "openclaw-web3-bind-"));
    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({ identity: { allowSiwe: true } });
    const handler = createBindWalletCommand(store, config);

    const result = await handler({ args: "0x0000000000000000000000000000000000000001" } as any);

    expect(result.text).toContain("web3.siwe.challenge");
    expect(store.getBindings()).toHaveLength(0);
  });

  it("does not bind when SIWE is disabled", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "openclaw-web3-bind-"));
    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({ identity: { allowSiwe: false } });
    const handler = createBindWalletCommand(store, config);

    const result = await handler({ args: "0x0000000000000000000000000000000000000001" } as any);

    expect(result.text).toContain("SIWE is disabled");
    expect(store.getBindings()).toHaveLength(0);
  });
});
