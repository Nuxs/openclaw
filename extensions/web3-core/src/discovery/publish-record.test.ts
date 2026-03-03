import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyIndexSignature } from "../resources/signature-verification.js";
import type { ResourceIndexEntry } from "../state/store.js";
import { buildSignedDiscoveryRecord } from "./publish-record.js";

function genSigningKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    scheme: "ed25519" as const,
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    createdAt: new Date().toISOString(),
  };
}

describe("buildSignedDiscoveryRecord", () => {
  it("signs discovery-safe payload with v2 signature", () => {
    const signingKey = genSigningKey();
    const entry: ResourceIndexEntry = {
      providerId: "provider-a",
      endpoint: "https://provider.internal",
      resources: [
        {
          resourceId: "model-1",
          kind: "model",
          label: "Model One",
          description: "private",
          metadata: { secret: true },
        },
      ],
      updatedAt: "2026-03-03T00:00:00.000Z",
      expiresAt: "2026-03-03T01:00:00.000Z",
      meta: { internal: true },
    };

    const record = buildSignedDiscoveryRecord({
      entry,
      peerId: "12D3KooWProviderA",
      reachability: "relay",
      signingKey,
    });

    expect(record.signature?.payloadVersion).toBe(2);

    const verifyTarget: ResourceIndexEntry = {
      providerId: record.providerId,
      resources: record.resources,
      updatedAt: record.updatedAt,
      expiresAt: record.expiresAt,
      peerId: record.peerId,
      reachability: record.reachability,
      signature: record.signature,
    };
    expect(verifyIndexSignature(verifyTarget).valid).toBe(true);
  });
});
