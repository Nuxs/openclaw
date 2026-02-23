import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig, type MarketPluginConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import {
  createTokenEconomyBurnHandler,
  createTokenEconomyConfigureHandler,
  createTokenEconomyGovernanceUpdateHandler,
  createTokenEconomyMintHandler,
  createTokenEconomySummaryHandler,
} from "./token-economy.js";

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return { ...actual, verifyMessage: vi.fn().mockResolvedValue(true) };
});

type HandlerResult = { ok: boolean; payload: Record<string, unknown> } | undefined;

function createResponder() {
  let result: HandlerResult;
  return {
    respond: (ok: boolean, payload: Record<string, unknown>) => {
      result = { ok, payload };
    },
    result: () => result,
  };
}

function createClient(scopes = ["operator.write"]) {
  return {
    connect: { client: { id: "gateway-client" }, role: "operator", scopes },
  };
}

const VALID_POLICY = {
  symbol: "OCL",
  name: "OpenClaw Token",
  decimals: 18,
};

let tempDir: string;
let store: MarketStateStore;
let config: MarketPluginConfig;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "token-eco-test-"));
  config = resolveConfig({ access: { mode: "open" } });
  store = new MarketStateStore(tempDir, config);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

function configureToken(status: "token_draft" | "token_active" = "token_active") {
  const handler = createTokenEconomyConfigureHandler(store, config);
  const r = createResponder();
  handler({
    params: { policy: VALID_POLICY, status },
    respond: r.respond,
    client: createClient(),
  } as any);
  return r.result()!.payload as any;
}

describe("tokenEconomy.summary", () => {
  it("returns null when not configured", () => {
    const handler = createTokenEconomySummaryHandler(store, config);
    const r = createResponder();
    handler({
      params: {},
      respond: r.respond,
      client: createClient(["operator.read"]),
    } as any);
    expect(r.result()!.ok).toBe(true);
    expect(r.result()!.payload).toBeNull();
  });

  it("returns state after configure", () => {
    configureToken();
    const handler = createTokenEconomySummaryHandler(store, config);
    const r = createResponder();
    handler({
      params: {},
      respond: r.respond,
      client: createClient(["operator.read"]),
    } as any);
    expect(r.result()!.ok).toBe(true);
    expect((r.result()!.payload as any).policy.symbol).toBe("OCL");
  });
});

describe("tokenEconomy.configure", () => {
  it("creates token economy with draft status", () => {
    const state = configureToken("token_draft");
    expect(state.status).toBe("token_draft");
    expect(state.policy.symbol).toBe("OCL");
    expect(state.totals.minted).toBe("0");
  });

  it("fails without policy", () => {
    const handler = createTokenEconomyConfigureHandler(store, config);
    const r = createResponder();
    handler({
      params: {},
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
  });

  it("fails without symbol in policy", () => {
    const handler = createTokenEconomyConfigureHandler(store, config);
    const r = createResponder();
    handler({
      params: { policy: { name: "No Symbol" } },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
  });
});

describe("tokenEconomy.mint", () => {
  it("mints tokens and updates totals", () => {
    configureToken();
    const handler = createTokenEconomyMintHandler(store, config);
    const r = createResponder();
    handler({
      params: { amount: "1000" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(true);
    const state = r.result()!.payload as any;
    expect(state.totals.minted).toBe("1000");
    expect(state.totals.totalSupply).toBe("1000");
    expect(state.totals.circulating).toBe("1000");
  });

  it("fails when not configured", () => {
    const handler = createTokenEconomyMintHandler(store, config);
    const r = createResponder();
    handler({
      params: { amount: "1000" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
  });

  it("fails when not active (draft)", () => {
    configureToken("token_draft");
    const handler = createTokenEconomyMintHandler(store, config);
    const r = createResponder();
    handler({
      params: { amount: "1000" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
  });
});

describe("tokenEconomy.burn", () => {
  it("burns tokens and updates totals", () => {
    configureToken();
    // Mint first
    const mintHandler = createTokenEconomyMintHandler(store, config);
    const mr = createResponder();
    mintHandler({
      params: { amount: "500" },
      respond: mr.respond,
      client: createClient(),
    } as any);

    const handler = createTokenEconomyBurnHandler(store, config);
    const r = createResponder();
    handler({
      params: { amount: "200" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(true);
    const state = r.result()!.payload as any;
    expect(state.totals.burned).toBe("200");
    expect(state.totals.totalSupply).toBe("300");
    expect(state.totals.circulating).toBe("300");
  });

  it("fails when burn exceeds circulating supply", () => {
    configureToken();
    const mintHandler = createTokenEconomyMintHandler(store, config);
    const mr = createResponder();
    mintHandler({
      params: { amount: "100" },
      respond: mr.respond,
      client: createClient(),
    } as any);

    const handler = createTokenEconomyBurnHandler(store, config);
    const r = createResponder();
    handler({
      params: { amount: "200" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
  });
});

describe("tokenEconomy.governance.update", () => {
  it("updates governance policy", () => {
    configureToken();
    const handler = createTokenEconomyGovernanceUpdateHandler(store, config);
    const r = createResponder();
    handler({
      params: {
        governance: { quorumBps: 5000, votingPeriodDays: 7 },
      },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(true);
    const state = r.result()!.payload as any;
    expect(state.policy.governance.quorumBps).toBe(5000);
    expect(state.policy.governance.votingPeriodDays).toBe(7);
  });

  it("fails without governance input", () => {
    configureToken();
    const handler = createTokenEconomyGovernanceUpdateHandler(store, config);
    const r = createResponder();
    handler({
      params: {},
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
  });

  it("fails when not configured", () => {
    const handler = createTokenEconomyGovernanceUpdateHandler(store, config);
    const r = createResponder();
    handler({
      params: { governance: { quorumBps: 5000 } },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
  });
});
