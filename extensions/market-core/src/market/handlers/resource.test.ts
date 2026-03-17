import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import { createResourcePublishHandler } from "./resource.js";

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

async function withStoreModes(
  tempDir: string,
  run: (input: {
    mode: "file" | "sqlite";
    store: MarketStateStore;
    config: ReturnType<typeof resolveConfig>;
  }) => Promise<void>,
) {
  for (const mode of ["file", "sqlite"] as const) {
    const modeDir = path.join(tempDir, mode);
    await fs.mkdir(modeDir, { recursive: true });
    const config = resolveConfig({
      store: { mode },
      access: { mode: "open", requireActor: true, requireActorMatch: true },
    });
    const store = new MarketStateStore(modeDir, config);
    await run({ mode, store, config });
  }
}

describe("resource publish handler", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "resource-handler-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("publishes service resources with additive serviceWrapper metadata in both store modes", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const handler = createResourcePublishHandler(store, config);
      const r = createResponder();

      await handler({
        params: {
          actorId: "0x00000000000000000000000000000000000000a1",
          resource: {
            kind: "service",
            label: "Human review",
            tags: ["security"],
            price: { unit: "call", amount: "15", currency: "USDC" },
            serviceWrapper: {
              category: "human",
              serviceSchema: {
                inputs: ["brief"],
                outputs: ["review"],
              },
              acceptance: {
                mode: "milestone",
                milestoneCount: 2,
              },
              proof: {
                families: ["human_attestation"],
                required: true,
              },
              tags: ["human", "review"],
            },
            offer: {
              assetId: "asset-human-review",
              assetType: "service",
              currency: "USDC",
              usageScope: { purpose: "review" },
              deliveryType: "service",
            },
          },
        },
        respond: r.respond,
      } as never);

      expect(r.result()?.ok).toBe(true);
      const resourceId = String(r.result()?.payload.resourceId ?? "");
      const stored = store.getResource(resourceId);
      expect(stored?.serviceSchema?.inputs).toEqual(["brief"]);
      expect(stored?.serviceWrapper?.category).toBe("human");
      expect(stored?.serviceWrapper?.acceptance.mode).toBe("milestone");
      expect(stored?.serviceWrapper?.acceptance.milestoneCount).toBe(2);
      expect(stored?.serviceWrapper?.proof.families).toEqual(["human_attestation"]);
      expect(stored?.serviceWrapper?.tags).toEqual(["human", "review"]);
    });
  });

  it("rejects serviceWrapper for non-service resources", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const handler = createResourcePublishHandler(store, config);
      const r = createResponder();

      await handler({
        params: {
          actorId: "0x00000000000000000000000000000000000000a1",
          resource: {
            kind: "model",
            label: "Model resource",
            price: { unit: "token", amount: "1", currency: "USDC" },
            serviceWrapper: {
              category: "digital",
            },
            offer: {
              assetId: "asset-model",
              assetType: "api",
              currency: "USDC",
              usageScope: { purpose: "inference" },
              deliveryType: "api",
            },
          },
        },
        respond: r.respond,
      } as never);

      expect(r.result()?.ok).toBe(false);
      expect(r.result()?.payload.error).toBe("E_INVALID_ARGUMENT");
    });
  });
});
