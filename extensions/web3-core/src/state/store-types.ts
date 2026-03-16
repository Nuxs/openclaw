/**
 * Shared type definitions originally defined in the monolithic `store.ts`.
 *
 * Extracted into a dedicated module so both the sub-stores and the facade
 * can reference them without circular imports.  All types are re-exported
 * from the main `store.ts` barrel to preserve backward compatibility.
 */

import type {
  FXQuote,
  PaymentConfirmationStatus,
  PaymentIntent,
  TreasuryRoute,
} from "@openclaw/market-core";
import type { AuditEvent } from "../audit/types.js";
import type {
  PaymentOrchestrationStatus,
  PaymentResumeToken,
  PaymentSettlementContext,
} from "../billing/types.js";

export type PendingAnchor = {
  anchorId: string;
  payloadHash: string;
  createdAt: string;
  attempts?: number;
  lastError?: string;
};

export type PendingArchive = {
  event: AuditEvent;
  createdAt: string;
  attempts?: number;
  lastError?: string;
};

export type PendingSettlement = {
  sessionIdHash: string;
  createdAt: string;
  orderId?: string;
  payer?: string;
  amount?: string;
  actorId?: string;
  paymentIntent?: PaymentIntent;
  paymentReceiptId?: string;
  paymentChain?: "evm" | "ton";
  paymentNetwork?: string;
  paymentTxHash?: string;
  confirmationStatus?: PaymentConfirmationStatus;
  fxQuote?: FXQuote;
  treasuryRoute?: TreasuryRoute;
  attempts?: number;
  lastError?: string;
};

export type PaymentRequiredRecord = {
  idempotencyKey: string;
  requestId?: string;
  toolName?: string;
  invoiceHash: string;
  resumeToken: PaymentResumeToken;
  createdAt: string;
  updatedAt?: string;
  maxRetries?: number;
  consumedAt?: string;
  /** Network identifier from the wallet response (e.g. "base", "ton-testnet"). */
  network?: string;
  amount?: string;
  asset?: string;
  provider?: string;
  payTo?: string;
  status?: PaymentOrchestrationStatus;
  reused?: boolean;
  confirmationStatus?: PaymentConfirmationStatus;
  paymentIntent?: PaymentIntent;
  settlement?: PaymentSettlementContext;
  fxQuote?: FXQuote;
  treasuryRoute?: TreasuryRoute;
  lastError?: string;
};

export type X402AutopayStats = {
  attempts: number;
  successes: number;
  failures: number;
  retryCount: number;
  circuitBreakerTrips: number;
  lastCircuitBreakerTripAt?: string;
  attemptEvents: string[];
  failureEvents: string[];
  cooldownUntil?: string;
  updatedAt: string;
};

export type IndexedResourceKind = "model" | "search" | "storage";

export type IndexedResource = {
  resourceId: string;
  kind: IndexedResourceKind;
  label?: string;
  description?: string;
  tags?: string[];
  price?: string;
  unit?: string;
  metadata?: Record<string, unknown>;
};

export type ResourceIndexEntry = {
  providerId: string;
  endpoint?: string;
  resources: IndexedResource[];
  updatedAt: string;
  expiresAt?: string;
  lastHeartbeatAt?: string;
  meta?: Record<string, unknown>;
  signature?: IndexSignature;
  /** MDL: libp2p peer identifier (present when discovered via DHT/Rendezvous) */
  peerId?: string;
  /** MDL: how the provider can be reached */
  reachability?: "direct" | "relay" | "unknown";
};

export type IndexSignature = {
  scheme: "ed25519";
  publicKey: string;
  signature: string;
  payloadHash: string;
  signedAt: string;
  /** MDL: signature payload version (2 = includes peerId/reachability) */
  payloadVersion?: number;
};

export type IndexSigningKey = {
  scheme: "ed25519";
  publicKey: string;
  privateKey: string;
  createdAt: string;
};

export type P2pPeerRecord = {
  peerId: string;
  transport: "gossip" | "dht" | "pubsub" | "mdns" | "static";
  address?: string;
  lastSeenAt: string;
  source?: string;
};

export type DiscoveryIdentityRecord = {
  providerId: string;
  peerId: string;
  actorId: string;
  did?: string;
  publicKey?: string;
  updatedAt: string;
};

export type AnchorReceipt = {
  anchorId: string;
  tx: string;
  network: string;
  block?: number;
  updatedAt: string;
};

export type ArchiveReceipt = {
  cid?: string;
  uri?: string;
  updatedAt: string;
};
