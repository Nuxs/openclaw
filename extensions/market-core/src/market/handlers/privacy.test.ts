import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import type { Consent, Offer, Order, PrivacyReplay } from "../types.js";
import {
  createConsentListHandler,
  createConsentGetHandler,
  createPrivacyAssetListHandler,
  createPrivacyReplayGenerateHandler,
  createPrivacyReplayListHandler,
  createPrivacyEraseHandler,
} from "./privacy.js";

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
    connect: {
      client: { id: "test-client" },
      role: "operator",
      scopes,
    },
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

function seedConsent(
  store: MarketStateStore,
  overrides: Partial<Consent> = {},
): { consent: Consent; offer: Offer; order: Order } {
  const now = new Date().toISOString();
  const offer: Offer = {
    offerId: "offer-priv-1",
    sellerId: "seller-1",
    assetId: "data-set-1",
    assetType: "data",
    assetMeta: { title: "Test Dataset", description: "test" },
    price: 50,
    currency: "USDC",
    usageScope: { purpose: "research" },
    deliveryType: "download",
    status: "offer_published",
    offerHash: "offer-hash-priv",
    createdAt: now,
    updatedAt: now,
  };
  store.saveOffer(offer);

  const order: Order = {
    orderId: "order-priv-1",
    offerId: offer.offerId,
    buyerId: "buyer-1",
    quantity: 1,
    status: "payment_locked",
    orderHash: "order-hash-priv",
    createdAt: now,
    updatedAt: now,
  };
  store.saveOrder(order);

  const consentBase: Consent = {
    consentId: "consent-1",
    orderId: order.orderId,
    scope: {
      purpose: "research",
      durationDays: 365,
      scopeHash: "scope-hash-1",
    },
    signature: "sig-consent-1",
    status: "consent_granted",
    consentHash: "consent-hash-1",
    grantedAt: now,
    replayPolicy: {
      mode: "audit",
      retainUntil: new Date(Date.now() + 86400_000 * 365).toISOString(),
    },
  };

  const consent: Consent = {
    ...consentBase,
    ...overrides,
  };
  store.saveConsent(consent);

  return { consent, offer, order };
}

describe("privacy handlers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-privacy-test-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  // ── consent.list ──

  describe("consent.list", () => {
    it("lists all consents", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        seedConsent(store);
        const handler = createConsentListHandler(store, config);
        const { respond, result } = createResponder();
        handler({
          params: {},
          respond,
          client: createClient(["operator.read"]),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.count).toBe(1);
      });
    });

    it("filters by status", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        seedConsent(store);
        const handler = createConsentListHandler(store, config);
        const { respond, result } = createResponder();
        handler({
          params: { status: "consent_revoked" },
          respond,
          client: createClient(["operator.read"]),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.count).toBe(0);
      });
    });

    it("filters by orderId", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        seedConsent(store);
        const handler = createConsentListHandler(store, config);
        const { respond, result } = createResponder();
        handler({
          params: { orderId: "order-priv-1" },
          respond,
          client: createClient(["operator.read"]),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.count).toBe(1);
      });
    });
  });

  // ── consent.get ──

  describe("consent.get", () => {
    it("retrieves a consent by id", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        seedConsent(store);
        const handler = createConsentGetHandler(store, config);
        const { respond, result } = createResponder();
        handler({
          params: { consentId: "consent-1" },
          respond,
          client: createClient(["operator.read"]),
        } as any);
        expect(result()?.ok).toBe(true);
        expect((result()?.payload.consent as Consent).consentId).toBe("consent-1");
      });
    });

    it("returns error for unknown consentId", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const handler = createConsentGetHandler(store, config);
        const { respond, result } = createResponder();
        handler({
          params: { consentId: "nonexistent" },
          respond,
          client: createClient(["operator.read"]),
        } as any);
        expect(result()?.ok).toBe(false);
      });
    });
  });

  // ── privacy.assets ──

  describe("privacy.assets", () => {
    it("lists knowledge assets derived from consents", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        seedConsent(store);
        const handler = createPrivacyAssetListHandler(store, config);
        const { respond, result } = createResponder();
        handler({
          params: {},
          respond,
          client: createClient(["operator.read"]),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.count).toBe(1);
        const assets = result()?.payload.assets as Array<Record<string, unknown>>;
        expect(assets[0].assetId).toBe("data-set-1");
        expect(assets[0].purpose).toBe("research");
      });
    });

    it("filters assets by status", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        seedConsent(store);
        const handler = createPrivacyAssetListHandler(store, config);
        const { respond, result } = createResponder();
        handler({
          params: { status: "consent_revoked" },
          respond,
          client: createClient(["operator.read"]),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.count).toBe(0);
      });
    });
  });

  // ── privacy.replay.generate ──

  describe("privacy.replay.generate", () => {
    it("generates a replay for a consent", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        seedConsent(store);
        const handler = createPrivacyReplayGenerateHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: { actorId: "buyer-1", consentId: "consent-1" },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.replayId).toBeDefined();
        expect(result()?.payload.status).toBe("replay_generated");
        expect(result()?.payload.replayHash).toBeDefined();

        // Verify persisted
        const replay = store.getPrivacyReplay(result()!.payload.replayId as string);
        expect(replay).toBeDefined();
        expect(replay!.consentId).toBe("consent-1");
        expect(replay!.summary).toBeDefined();
        expect(replay!.summary.purpose).toBe("research");
      });
    });

    it("rejects for unknown consent", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const handler = createPrivacyReplayGenerateHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: { actorId: "buyer-1", consentId: "nonexistent" },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(false);
      });
    });
  });

  // ── privacy.replay.list ──

  describe("privacy.replay.list", () => {
    it("lists replays filtered by consentId", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        seedConsent(store);
        // Generate a replay first
        const gen = createPrivacyReplayGenerateHandler(store, config);
        const { respond: r1 } = createResponder();
        await gen({
          params: { actorId: "buyer-1", consentId: "consent-1" },
          respond: r1,
          client: createClient(),
        } as any);

        const handler = createPrivacyReplayListHandler(store, config);
        const { respond, result } = createResponder();
        handler({
          params: { consentId: "consent-1" },
          respond,
          client: createClient(["operator.read"]),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.count).toBe(1);
      });
    });

    it("returns empty for unknown consentId", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const handler = createPrivacyReplayListHandler(store, config);
        const { respond, result } = createResponder();
        handler({
          params: { consentId: "unknown" },
          respond,
          client: createClient(["operator.read"]),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.count).toBe(0);
      });
    });
  });

  // ── privacy.erase ──

  describe("privacy.erase", () => {
    it("erases consent and marks related replays as erased", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        seedConsent(store);
        // Generate a replay
        const gen = createPrivacyReplayGenerateHandler(store, config);
        const { respond: r1, result: res1 } = createResponder();
        await gen({
          params: { actorId: "buyer-1", consentId: "consent-1" },
          respond: r1,
          client: createClient(),
        } as any);
        const replayId = res1()!.payload.replayId as string;

        // Erase
        const handler = createPrivacyEraseHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: { actorId: "buyer-1", consentId: "consent-1", reason: "GDPR request" },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.erasedAt).toBeDefined();
        expect(result()?.payload.replayCount).toBe(1);

        // Verify consent revoked and erased
        const consent = store.getConsent("consent-1")!;
        expect(consent.status).toBe("consent_revoked");
        expect(consent.erasedAt).toBeDefined();
        expect(consent.eraseReason).toBe("GDPR request");

        // Verify replay erased
        const replay = store.getPrivacyReplay(replayId)!;
        expect(replay.status).toBe("replay_erased");
        expect(replay.erasedAt).toBeDefined();
      });
    });

    it("handles erase on already-revoked consent", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const now = new Date().toISOString();
        seedConsent(store, {
          status: "consent_revoked",
          revokedAt: now,
          revokeReason: "user request",
        });

        const handler = createPrivacyEraseHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: { actorId: "buyer-1", consentId: "consent-1" },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(true);
        expect(result()?.payload.erasedAt).toBeDefined();

        // Status remains revoked (not changed back to granted)
        const consent = store.getConsent("consent-1")!;
        expect(consent.status).toBe("consent_revoked");
        expect(consent.erasedAt).toBeDefined();
      });
    });

    it("returns error for unknown consent", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        const handler = createPrivacyEraseHandler(store, config);
        const { respond, result } = createResponder();
        await handler({
          params: { actorId: "buyer-1", consentId: "nonexistent" },
          respond,
          client: createClient(),
        } as any);
        expect(result()?.ok).toBe(false);
      });
    });
  });

  // ── Full privacy lifecycle ──

  describe("full privacy lifecycle", () => {
    it("consent → replay → erase lifecycle in both store modes", async () => {
      await withStoreModes(tempDir, async ({ store, config }) => {
        // 1. Seed consent
        seedConsent(store);

        // 2. List consents
        const listH = createConsentListHandler(store, config);
        const { respond: r1, result: res1 } = createResponder();
        listH({ params: {}, respond: r1, client: createClient(["operator.read"]) } as any);
        expect(res1()?.ok).toBe(true);
        expect(res1()?.payload.count).toBe(1);

        // 3. Get consent
        const getH = createConsentGetHandler(store, config);
        const { respond: r2, result: res2 } = createResponder();
        getH({
          params: { consentId: "consent-1" },
          respond: r2,
          client: createClient(["operator.read"]),
        } as any);
        expect(res2()?.ok).toBe(true);

        // 4. List assets
        const assetsH = createPrivacyAssetListHandler(store, config);
        const { respond: r3, result: res3 } = createResponder();
        assetsH({ params: {}, respond: r3, client: createClient(["operator.read"]) } as any);
        expect(res3()?.ok).toBe(true);
        expect(res3()?.payload.count).toBe(1);

        // 5. Generate replay
        const genH = createPrivacyReplayGenerateHandler(store, config);
        const { respond: r4, result: res4 } = createResponder();
        await genH({
          params: { actorId: "buyer-1", consentId: "consent-1" },
          respond: r4,
          client: createClient(),
        } as any);
        expect(res4()?.ok).toBe(true);

        // 6. List replays
        const replayListH = createPrivacyReplayListHandler(store, config);
        const { respond: r5, result: res5 } = createResponder();
        replayListH({
          params: { consentId: "consent-1" },
          respond: r5,
          client: createClient(["operator.read"]),
        } as any);
        expect(res5()?.ok).toBe(true);
        expect(res5()?.payload.count).toBe(1);

        // 7. Erase
        const eraseH = createPrivacyEraseHandler(store, config);
        const { respond: r6, result: res6 } = createResponder();
        await eraseH({
          params: { actorId: "buyer-1", consentId: "consent-1" },
          respond: r6,
          client: createClient(),
        } as any);
        expect(res6()?.ok).toBe(true);
        expect(res6()?.payload.replayCount).toBe(1);

        // 8. Verify replay erased
        const { respond: r7, result: res7 } = createResponder();
        replayListH({
          params: { consentId: "consent-1", status: "replay_erased" },
          respond: r7,
          client: createClient(["operator.read"]),
        } as any);
        expect(res7()?.ok).toBe(true);
        expect(res7()?.payload.count).toBe(1);
      });
    });
  });
});
