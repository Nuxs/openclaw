import { describe, expect, it } from "vitest";
import type { Web3ContractSnapshot } from "./governance.js";
import { formatGovernanceReport, formatSnapshotDiff, formatSnapshotOverview } from "./report.js";

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
          gatewayMethods: ["web3.status.summary"],
          httpRoutes: ["/web3/resources/model/chat"],
          services: ["web3-anchor-service"],
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
      ],
      stableNames: ["web3.status.summary"],
    },
    docs: [
      {
        path: "docs/reference/web3-market-dev.md",
        title: "Web3 Market Dev",
        docLayer: "reference",
        normative: true,
        declaredContracts: ["web3.status.summary"],
      },
    ],
    ...overrides,
  };
}

describe("formatSnapshotOverview", () => {
  it("summarizes plugin, capability, and doc counts", () => {
    const summary = formatSnapshotOverview(createSnapshot());
    expect(summary).toContain("Web3 contract snapshot overview");
    expect(summary).toContain("web3-core: commands=1, gatewayMethods=1, httpRoutes=1, services=1");
    expect(summary).toContain("capabilities: default=1, max-enabled=1, stable=1");
    expect(summary).toContain("docs: reference=1, guide=0, status=0, historical=0, unspecified=0");
  });
});

describe("formatSnapshotDiff", () => {
  it("surfaces capability and runtime changes", () => {
    const current = createSnapshot();
    const currentPlugin = current.plugins[0];
    if (!currentPlugin) {
      throw new Error("expected fixture plugin");
    }
    const next = createSnapshot({
      plugins: [
        {
          ...currentPlugin,
          runtime: {
            ...currentPlugin.runtime,
            gatewayMethods: ["web3.market.status.summary", "web3.status.summary"],
          },
        },
      ],
      capabilities: {
        ...current.capabilities,
        maxEnabled: [
          {
            name: "web3.market.status.summary",
            summary: "market status",
            kind: "gateway",
            group: "status",
            availability: { enabled: true },
          },
          {
            name: "web3.status.summary",
            summary: "status changed",
            kind: "gateway",
            group: "status",
            availability: { enabled: true },
            stability: "stable",
          },
        ],
      },
    });

    const diff = formatSnapshotDiff(current, next);
    expect(diff).toContain("capabilities added (1)");
    expect(diff).toContain("web3.market.status.summary");
    expect(diff).toContain("stable capability drift (1)");
    expect(diff).toContain("web3-core gateway methods added (1)");
  });
});

describe("formatGovernanceReport", () => {
  it("includes governance and snapshot issue sections", () => {
    const report = formatGovernanceReport({
      currentSnapshot: null,
      nextSnapshot: createSnapshot(),
      governanceIssues: [
        {
          kind: "doc_reference",
          path: "docs/reference/web3-market-dev.md",
          message: "documented contract `web3.missing` does not exist",
        },
      ],
      snapshotIssues: [
        {
          kind: "snapshot",
          path: "docs/reference/generated/web3-contract-snapshot.json",
          message: "committed snapshot is out of date",
        },
      ],
    });

    expect(report).toContain("Governance issues");
    expect(report).toContain("web3.missing");
    expect(report).toContain("Snapshot issues");
    expect(report).toContain("committed snapshot is out of date");
  });
});
