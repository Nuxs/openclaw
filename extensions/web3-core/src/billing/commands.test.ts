import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Web3StateStore } from "../state/store.js";
import { createPayStatusCommand } from "./commands.js";

describe("/pay_status command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-web3-pay-status-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("returns settlement status from market store", async () => {
    const marketDir = path.join(tempDir, "market");
    await fs.mkdir(marketDir, { recursive: true });
    await fs.writeFile(
      path.join(marketDir, "settlements.json"),
      JSON.stringify(
        {
          "settlement-1": {
            settlementId: "settlement-1",
            orderId: "order-1",
            status: "settlement_locked",
            lockTxHash: "0xlock",
          },
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(marketDir, "orders.json"),
      JSON.stringify(
        {
          "order-1": {
            orderId: "order-1",
            status: "payment_locked",
          },
        },
        null,
        2,
      ),
    );

    const handler = createPayStatusCommand(new Web3StateStore(tempDir), {
      stateDir: tempDir,
      marketConfig: { store: { mode: "file" } },
    });

    const result = await handler({
      channel: "test",
      isAuthorizedSender: true,
      commandBody: "/pay_status order-1",
      args: "order-1",
      config: { plugins: { entries: { "market-core": { config: { store: { mode: "file" } } } } } },
    } as any);

    expect(result.text).toContain("settlement_locked");
    expect(result.text).toContain("order-1");
  });

  it("prints usage when no args are provided", async () => {
    const handler = createPayStatusCommand(new Web3StateStore(tempDir), {
      stateDir: tempDir,
      marketConfig: { store: { mode: "file" } },
    });

    const result = await handler({
      channel: "test",
      isAuthorizedSender: true,
      commandBody: "/pay_status",
      args: "",
      config: { plugins: { entries: {} } },
    } as any);

    expect(result.text).toContain("Usage: /pay_status");
  });
});
