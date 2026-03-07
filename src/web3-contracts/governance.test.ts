import { describe, expect, it } from "vitest";
import {
  compareSnapshots,
  extractDeclaredContracts,
  normalizeCapabilitySchema,
  type Web3ContractSnapshot,
} from "./governance.js";

function createSnapshot(overrides?: Partial<Web3ContractSnapshot>): Web3ContractSnapshot {
  return {
    schemaVersion: 1,
    plugins: [
      {
        id: "web3-core",
        entryPath: "extensions/web3-core/src/index.ts",
        manifestPath: "extensions/web3-core/openclaw.plugin.json",
        manifest: {
          id: "web3-core",
          configSchema: { type: "object", properties: {} },
        },
        manifestCoverageMissingPaths: [],
        runtime: {
          commands: ["web3-market"],
          gatewayMethods: ["web3.status.summary", "web3.market.status.summary"],
          httpRoutes: ["/web3/resources/model/chat"],
          services: [],
        },
      },
    ],
    capabilities: {
      defaultConfig: [
        {
          name: "web3.status.summary",
          summary: "status",
          kind: "gateway",
          group: "status",
          availability: { enabled: true },
          stability: "stable",
        },
      ],
      maxEnabled: [
        {
          name: "web3.status.summary",
          summary: "status",
          kind: "gateway",
          group: "status",
          availability: { enabled: true },
          stability: "stable",
        },
        {
          name: "web3_market_status",
          summary: "tool",
          kind: "tool",
          group: "tools",
          availability: { enabled: true },
        },
      ],
      stableNames: ["web3.status.summary"],
    },
    docs: [],
    ...overrides,
  };
}

describe("normalizeCapabilitySchema", () => {
  it("converts shorthand paramsSchema maps into JSON schema", () => {
    expect(
      normalizeCapabilitySchema({
        resourceId: "string",
        limit: "number",
        includeDetails: "boolean",
      }),
    ).toEqual({
      type: "object",
      additionalProperties: false,
      properties: {
        resourceId: { type: "string" },
        limit: { type: "number" },
        includeDetails: { type: "boolean" },
      },
    });
  });
});

describe("extractDeclaredContracts", () => {
  it("extracts method, tool, command, and route references from code spans", () => {
    const body = [
      "Use `web3.market.status.summary` and `web3_market_status`.",
      "Run `/web3-market status` or inspect `/web3/resources/*`.",
    ].join("\n");
    expect(extractDeclaredContracts(body)).toEqual([
      "/web3-market",
      "/web3/resources/*",
      "web3_market_status",
      "web3.market.status.summary",
    ]);
  });
});

describe("compareSnapshots", () => {
  it("flags stable capability drift when snapshot changes", () => {
    const current = createSnapshot();
    const next = createSnapshot({
      capabilities: {
        ...current.capabilities,
        maxEnabled: [
          {
            name: "web3.status.summary",
            summary: "updated",
            kind: "gateway",
            group: "status",
            availability: { enabled: true },
            stability: "stable",
          },
        ],
      },
    });
    const issues = compareSnapshots(current, next);
    expect(issues.some((issue) => issue.kind === "stable_capability")).toBe(true);
    expect(issues.some((issue) => issue.kind === "snapshot")).toBe(true);
  });
});
