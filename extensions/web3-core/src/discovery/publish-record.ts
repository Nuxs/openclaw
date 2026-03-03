import type { IndexSigningKey, ResourceIndexEntry } from "../state/store.js";
import { signEntryV2 } from "./signature-v2.js";
import type { Reachability, DiscoveryRecord } from "./types.js";

function toDiscoveryResources(entry: ResourceIndexEntry): DiscoveryRecord["resources"] {
  return entry.resources.map((resource) => ({
    resourceId: resource.resourceId,
    kind: resource.kind,
    label: resource.label,
    tags: resource.tags,
    price: resource.price,
    unit: resource.unit,
  }));
}

export function buildSignedDiscoveryRecord(params: {
  entry: ResourceIndexEntry;
  peerId: string;
  reachability: Reachability;
  signingKey: IndexSigningKey;
}): DiscoveryRecord {
  const resources = toDiscoveryResources(params.entry);
  const signature = signEntryV2(
    {
      providerId: params.entry.providerId,
      endpoint: undefined,
      resources,
      updatedAt: params.entry.updatedAt,
      expiresAt: params.entry.expiresAt,
      lastHeartbeatAt: undefined,
      meta: undefined,
      peerId: params.peerId,
      reachability: params.reachability,
    },
    params.signingKey.privateKey,
    params.signingKey.publicKey,
  );

  return {
    providerId: params.entry.providerId,
    peerId: params.peerId,
    resources,
    reachability: params.reachability,
    updatedAt: params.entry.updatedAt,
    expiresAt: params.entry.expiresAt,
    signature,
  };
}
