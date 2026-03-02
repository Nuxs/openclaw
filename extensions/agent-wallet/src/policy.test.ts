import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkPolicy, loadPolicy, resolveWalletPolicyConfig, type WalletPolicy } from "./policy.js";

const SAMPLE_POLICY: WalletPolicy = {
  version: "v1",
  budget: {
    dailyCap: "1000",
    perTxCap: "500",
    currency: "USDC",
  },
  scope: {
    allowedContracts: ["0x123400000000000000000000000000000000abcd"],
    allowedMethods: ["0xa9059cbb"],
    allowedTools: ["agent-wallet.send", "agent-wallet.sign"],
    allowedChains: ["evm"],
  },
  autoPay: {
    enabled: false,
    maxRetries: 1,
  },
};

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-wallet-policy-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("resolveWalletPolicyConfig", () => {
  it("returns disabled defaults for invalid input", () => {
    const cfg = resolveWalletPolicyConfig(undefined);
    expect(cfg.enabled).toBe(false);
    expect(cfg.inlinePolicy).toBeUndefined();
  });

  it("normalizes inline policy fields", () => {
    const cfg = resolveWalletPolicyConfig({
      enabled: true,
      inlinePolicy: {
        budget: {
          dailyCap: "1200",
          perTxCap: "200",
          currency: "USDC",
        },
        scope: {
          allowedChains: ["evm", "ton", "invalid"],
        },
        autoPay: {
          enabled: true,
          maxRetries: 2,
        },
      },
    });

    expect(cfg.enabled).toBe(true);
    expect(cfg.inlinePolicy?.version).toBe("v1");
    expect(cfg.inlinePolicy?.scope.allowedChains).toEqual(["evm", "ton"]);
    expect(cfg.inlinePolicy?.autoPay.maxRetries).toBe(2);
  });
});

describe("loadPolicy", () => {
  it("loads inline policy first", async () => {
    const loaded = await loadPolicy({
      enabled: true,
      inlinePolicy: SAMPLE_POLICY,
    });

    expect(loaded.source).toBe("inline");
    expect(loaded.policy?.version).toBe("v1");
  });

  it("loads policy from file", async () => {
    const policyPath = path.join(tmpDir, "policy.json");
    await fs.writeFile(policyPath, JSON.stringify(SAMPLE_POLICY), "utf8");

    const loaded = await loadPolicy({
      enabled: true,
      policyPath,
    });

    expect(loaded.source).toBe("file");
    expect(loaded.policy?.budget.perTxCap).toBe("500");
  });

  it("returns none when file is missing", async () => {
    const loaded = await loadPolicy({
      enabled: true,
      policyPath: path.join(tmpDir, "missing-policy.json"),
    });

    expect(loaded.source).toBe("none");
    expect(loaded.policy).toBeNull();
  });
});

describe("checkPolicy", () => {
  it("rejects when policy is missing", () => {
    const decision = checkPolicy(null, {
      action: "send",
      chain: "evm",
      tool: "agent-wallet.send",
      to: SAMPLE_POLICY.scope.allowedContracts?.[0],
      amount: 1n,
      method: "0xa9059cbb",
    });

    expect(decision.result).toBe("rejected");
    expect(decision.reasonCode).toBe("policy_missing");
  });

  it("rejects per-tx over cap", () => {
    const decision = checkPolicy(SAMPLE_POLICY, {
      action: "send",
      chain: "evm",
      tool: "agent-wallet.send",
      to: SAMPLE_POLICY.scope.allowedContracts?.[0],
      amount: 600n,
      method: "0xa9059cbb",
    });

    expect(decision.result).toBe("rejected");
    expect(decision.reasonCode).toBe("budget_per_tx_exceeded");
  });

  it("rejects unknown contract", () => {
    const decision = checkPolicy(SAMPLE_POLICY, {
      action: "send",
      chain: "evm",
      tool: "agent-wallet.send",
      to: "0x0000000000000000000000000000000000000001",
      amount: 10n,
      method: "0xa9059cbb",
    });

    expect(decision.result).toBe("rejected");
    expect(decision.reasonCode).toBe("scope_contract_denied");
  });

  it("rejects expired ttl", () => {
    const decision = checkPolicy(
      {
        ...SAMPLE_POLICY,
        ttl: {
          notAfter: "2025-01-01T00:00:00.000Z",
        },
      },
      {
        action: "send",
        chain: "evm",
        tool: "agent-wallet.send",
        to: SAMPLE_POLICY.scope.allowedContracts?.[0],
        amount: 10n,
        method: "0xa9059cbb",
      },
      { now: new Date("2026-01-01T00:00:00.000Z") },
    );

    expect(decision.result).toBe("rejected");
    expect(decision.reasonCode).toBe("ttl_expired");
  });

  it("approves valid request", () => {
    const decision = checkPolicy(SAMPLE_POLICY, {
      action: "send",
      chain: "evm",
      tool: "agent-wallet.send",
      to: SAMPLE_POLICY.scope.allowedContracts?.[0],
      amount: 100n,
      method: "0xa9059cbb",
    });

    expect(decision.result).toBe("approved");
    expect(decision.reasonCode).toBe("approved");
  });
});
