import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { Web3StateStore } from "../state/store.js";
import { tryRequireNodeSqlite } from "../utils/require-node-sqlite.js";
import { createPayStatusCommand } from "./commands.js";

describe("/pay_status command", () => {
  const sqlite = tryRequireNodeSqlite();
  const itSqlite = sqlite ? it : it.skip;

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
      config: resolveConfig({}),
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
    expect(result.text).toContain("Brain source:");
    expect(result.text).toContain("Pending settlements:");
  });

  itSqlite("returns settlement status from sqlite store using settlement prefix", async () => {
    const marketDir = path.join(tempDir, "market");
    await fs.mkdir(marketDir, { recursive: true });
    const dbPath = path.join(marketDir, "market.db");
    const { DatabaseSync } = sqlite!;
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TABLE IF NOT EXISTS settlements (id TEXT PRIMARY KEY, data TEXT NOT NULL);");
    db.exec("CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, data TEXT NOT NULL);");
    db.prepare("INSERT INTO settlements (id, data) VALUES (?, ?)").run(
      "settlement-1",
      JSON.stringify({
        settlementId: "settlement-1",
        orderId: "order-1",
        status: "settlement_locked",
        lockTxHash: "0xlock",
      }),
    );
    db.prepare("INSERT INTO orders (id, data) VALUES (?, ?)").run(
      "order-1",
      JSON.stringify({
        orderId: "order-1",
        status: "payment_locked",
      }),
    );
    db.close();

    const handler = createPayStatusCommand(new Web3StateStore(tempDir), {
      stateDir: tempDir,
      config: resolveConfig({}),
      marketConfig: { store: { mode: "sqlite", dbPath } },
    });

    const result = await handler({
      channel: "test",
      isAuthorizedSender: true,
      commandBody: "/pay_status settlement:settlement-1",
      args: "settlement:settlement-1",
      config: {
        plugins: { entries: { "market-core": { config: { store: { mode: "sqlite", dbPath } } } } },
      },
    } as any);

    expect(result.text).toContain("settlement_locked");
    expect(result.text).toContain("settlement-1");
    expect(result.text).toContain("order-1");
    expect(result.text).toContain("Brain source:");
    expect(result.text).toContain("Pending settlements:");
  });

  it("prints usage when no args are provided", async () => {
    const handler = createPayStatusCommand(new Web3StateStore(tempDir), {
      stateDir: tempDir,
      config: resolveConfig({}),
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
