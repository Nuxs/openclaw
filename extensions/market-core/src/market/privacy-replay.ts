import { hashCanonical } from "./hash.js";
import type {
  AuditEvent,
  Consent,
  Delivery,
  Offer,
  Order,
  PrivacyReplaySummary,
  TaskOrder,
} from "./types.js";

export function deriveRetentionAction(consent: Consent): PrivacyReplaySummary["retentionAction"] {
  if (consent.replayPolicy?.deleteAfterRevoke) {
    return "delete_on_revoke";
  }
  if (consent.replayPolicy?.mode === "retained") {
    return "retain";
  }
  return "manual_review";
}

export function buildPrivacyReplaySummary(input: {
  consent: Consent;
  order?: Order;
  offer?: Offer;
  task?: TaskOrder;
  deliveries: Delivery[];
  audit: AuditEvent[];
}): PrivacyReplaySummary {
  const { consent, order, offer, task, deliveries, audit } = input;
  const title = task?.title ?? offer?.assetMeta.title ?? offer?.assetId ?? consent.orderId;
  const evidenceRefs = [
    consent.consentId,
    order?.orderId,
    task?.taskId,
    ...deliveries.map((entry) => entry.deliveryId),
  ].filter((entry): entry is string => typeof entry === "string" && entry.length > 0);

  const redactedFields = [
    "signature",
    "payload",
    "payloadRef",
    "endpoint",
    "accessToken",
    "downloadUrl",
  ];

  const timeline = audit.slice(-20).map((event) => ({
    timestamp: event.timestamp,
    kind: event.kind,
    details: event.details,
  }));

  return {
    title,
    purpose: consent.scope.purpose,
    retentionAction: deriveRetentionAction(consent),
    redactedFields,
    evidenceRefs,
    timeline,
  };
}

/** Produce a deterministic sha256 hash for the replay summary (used as replayHash). */
export function hashReplaySummary(summary: PrivacyReplaySummary): string {
  return hashCanonical(summary);
}
