export type MarketResourceKind = "model" | "search" | "storage";

export type MarketResourceStatus = "resource_draft" | "resource_published" | "resource_unpublished";

export type MarketPrice = {
  unit: "token" | "call" | "query" | "gb_day" | "put" | "get";
  amount: string;
  currency: string;
  tokenAddress?: string;
};

export type MarketResourcePolicy = {
  maxConcurrent?: number;
  maxTokens?: number;
  maxBytes?: number;
  allowTools?: boolean;
  allowMime?: string[];
};

export type MarketResource = {
  resourceId: string;
  kind: MarketResourceKind;
  status: MarketResourceStatus;
  providerActorId: string;
  offerId: string;
  offerHash?: string;
  label: string;
  description?: string;
  tags?: string[];
  price: MarketPrice;
  policy?: MarketResourcePolicy;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type MarketLeaseStatus = "lease_active" | "lease_revoked" | "lease_expired";

export type MarketLease = {
  leaseId: string;
  resourceId: string;
  kind: MarketResourceKind;
  providerActorId: string;
  consumerActorId: string;
  orderId: string;
  consentId?: string;
  deliveryId?: string;
  accessTokenHash?: string;
  accessRef?: {
    store: "credentials";
    ref: string;
  };
  status: MarketLeaseStatus;
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
  maxCost?: string;
};

export type MarketLedgerUnit = "token" | "call" | "query" | "byte";

export type MarketLedgerEntry = {
  ledgerId: string;
  timestamp: string;
  leaseId: string;
  resourceId: string;
  kind: MarketResourceKind;
  providerActorId: string;
  consumerActorId: string;
  unit: MarketLedgerUnit;
  quantity: string;
  cost: string;
  currency: string;
  tokenAddress?: string;
  sessionId?: string;
  runId?: string;
  entryHash: string;
};

export type MarketResourceFilter = {
  kind?: MarketResourceKind;
  providerActorId?: string;
  status?: MarketResourceStatus;
  tag?: string;
  limit?: number;
};

export type MarketLeaseFilter = {
  resourceId?: string;
  providerActorId?: string;
  consumerActorId?: string;
  status?: MarketLeaseStatus;
  limit?: number;
};

export type MarketLedgerFilter = {
  leaseId?: string;
  resourceId?: string;
  providerActorId?: string;
  consumerActorId?: string;
  since?: string;
  until?: string;
  limit?: number;
};

export type MarketLedgerSummary = {
  byUnit: Record<string, { quantity: string; cost: string }>;
  totalCost: string;
  currency: string;
};
