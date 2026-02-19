export type AssetType = "data" | "api" | "service";
export type DeliveryType = "download" | "api" | "service";

export type OfferStatus = "offer_created" | "offer_published" | "offer_closed";
export type OrderStatus =
  | "order_created"
  | "payment_locked"
  | "consent_granted"
  | "delivery_ready"
  | "delivery_completed"
  | "settlement_completed"
  | "order_cancelled"
  | "settlement_cancelled"
  | "consent_revoked";

export type DeliveryStatus = "delivery_ready" | "delivery_completed" | "delivery_revoked";
export type ConsentStatus = "consent_granted" | "consent_revoked";
export type SettlementStatus = "settlement_locked" | "settlement_released" | "settlement_refunded";

export type UsageScope = {
  purpose: string;
  region?: string;
  durationDays?: number;
  transferable?: boolean;
};

export type AssetMeta = {
  title?: string;
  description?: string;
  tags?: string[];
  schemaHash?: string;
};

export type Offer = {
  offerId: string;
  sellerId: string;
  assetId: string;
  assetType: AssetType;
  assetMeta: AssetMeta;
  price: number;
  currency: string;
  usageScope: UsageScope;
  deliveryType: DeliveryType;
  status: OfferStatus;
  offerHash: string;
  createdAt: string;
  updatedAt: string;
};

export type Order = {
  orderId: string;
  offerId: string;
  buyerId: string;
  quantity: number;
  status: OrderStatus;
  orderHash: string;
  createdAt: string;
  updatedAt: string;
  paymentTxHash?: string;
};

export type ConsentScope = {
  purpose: string;
  durationDays?: number;
  scopeHash?: string;
};

export type Consent = {
  consentId: string;
  orderId: string;
  scope: ConsentScope;
  signature: string;
  status: ConsentStatus;
  consentHash: string;
  grantedAt: string;
  revokedAt?: string;
  revokeReason?: string;
  revokeHash?: string;
};

export type DeliveryPayload =
  | { type: "download"; downloadUrl: string }
  | { type: "api"; accessToken: string; quota?: number }
  | { type: "service"; serviceQuota?: number; ticketId?: string };

export type DeliveryPayloadRef = {
  store: "credentials";
  ref: string;
};

export type Delivery = {
  deliveryId: string;
  orderId: string;
  deliveryType: DeliveryType;
  status: DeliveryStatus;
  deliveryHash: string;
  issuedAt: string;
  revokedAt?: string;
  revokeReason?: string;
  revokeHash?: string;
  payload?: DeliveryPayload;
  payloadRef?: DeliveryPayloadRef;
};

export type Settlement = {
  settlementId: string;
  orderId: string;
  status: SettlementStatus;
  amount: string;
  tokenAddress?: string;
  lockedAt?: string;
  releasedAt?: string;
  refundedAt?: string;
  refundReason?: string;
  lockTxHash?: string;
  releaseTxHash?: string;
  refundTxHash?: string;
  settlementHash?: string;
};

export type AuditEventKind =
  | "offer_created"
  | "offer_published"
  | "offer_updated"
  | "offer_closed"
  | "resource_published"
  | "resource_unpublished"
  | "order_created"
  | "order_cancelled"
  | "payment_locked"
  | "consent_granted"
  | "consent_revoked"
  | "delivery_issued"
  | "delivery_revoked"
  | "delivery_completed"
  | "lease_issued"
  | "lease_revoked"
  | "lease_expired"
  | "ledger_appended"
  | "settlement_released"
  | "settlement_refunded"
  | "repair_retry"
  | "revocation_retry"
  | "revocation_succeeded"
  | "revocation_failed";

export type AuditEvent = {
  id: string;
  kind: AuditEventKind;
  refId: string;
  hash?: string;
  actor?: string;
  timestamp: string;
  details?: Record<string, unknown>;
};

export type RevocationJobStatus = "pending" | "succeeded" | "failed";

export type RevocationJob = {
  jobId: string;
  deliveryId: string;
  orderId?: string;
  offerId?: string;
  consentId?: string;
  reason?: string;
  payloadHash: string;
  attempts: number;
  status: RevocationJobStatus;
  lastError?: string;
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
};
