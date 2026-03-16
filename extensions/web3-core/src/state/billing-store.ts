/**
 * Billing sub-store — usage records, x402 payment-required idempotency
 * and autopay statistics.
 *
 * Split from the monolithic `Web3StateStore` to honour single-responsibility.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PaymentResumeToken, PaymentTraceRef, UsageRecord } from "../billing/types.js";
import type { PaymentRequiredRecord, X402AutopayStats } from "./store-types.js";

export class BillingStore {
  constructor(private readonly dir: string) {}

  // ── Usage / billing ──────────────────────────────────────────────

  private get usagePath() {
    return join(this.dir, "usage.json");
  }

  getUsage(sessionIdHash: string): UsageRecord | undefined {
    if (!existsSync(this.usagePath)) return undefined;
    const map = JSON.parse(readFileSync(this.usagePath, "utf-8")) as Record<string, UsageRecord>;
    return map[sessionIdHash];
  }

  saveUsage(record: UsageRecord): void {
    let map: Record<string, UsageRecord> = {};
    if (existsSync(this.usagePath)) {
      map = JSON.parse(readFileSync(this.usagePath, "utf-8")) as Record<string, UsageRecord>;
    }
    map[record.sessionIdHash] = record;
    writeFileSync(this.usagePath, JSON.stringify(map, null, 2));
  }

  listUsageRecords(): UsageRecord[] {
    if (!existsSync(this.usagePath)) return [];
    const map = JSON.parse(readFileSync(this.usagePath, "utf-8")) as Record<string, UsageRecord>;
    return Object.values(map);
  }

  // ── Payment required (x402 idempotency) ──────────────────────────

  private get paymentRequiredPath() {
    return join(this.dir, "payment-required.json");
  }

  private get x402AutopayStatsPath() {
    return join(this.dir, "x402-autopay-stats.json");
  }

  private loadPaymentRequiredMap(opts?: {
    prune?: boolean;
  }): Record<string, PaymentRequiredRecord> {
    if (!existsSync(this.paymentRequiredPath)) {
      return {};
    }
    const map = JSON.parse(readFileSync(this.paymentRequiredPath, "utf-8")) as Record<
      string,
      PaymentRequiredRecord
    >;
    if (!opts?.prune) {
      return map;
    }
    return this.prunePaymentRequiredMap(map).map;
  }

  private savePaymentRequiredMap(map: Record<string, PaymentRequiredRecord>): void {
    writeFileSync(this.paymentRequiredPath, JSON.stringify(map, null, 2));
  }

  private prunePaymentRequiredMap(
    map: Record<string, PaymentRequiredRecord>,
    nowMs = Date.now(),
  ): { map: Record<string, PaymentRequiredRecord>; removed: number } {
    const MAX_RECORDS = 500;
    const MAX_AGE_MS = 24 * 60 * 60 * 1000;
    const entries = Object.entries(map);
    const retained: Array<[string, PaymentRequiredRecord]> = [];

    for (const [key, record] of entries) {
      const expiresAt = Date.parse(record.resumeToken.expiresAt);
      const createdAt = Date.parse(record.createdAt);
      const expiredByToken = Number.isNaN(expiresAt) || expiresAt <= nowMs;
      const expiredByTtl = Number.isNaN(createdAt) || nowMs - createdAt > MAX_AGE_MS;
      if (expiredByToken || expiredByTtl) {
        continue;
      }
      retained.push([key, record]);
    }

    retained.sort((left, right) => right[1].createdAt.localeCompare(left[1].createdAt));
    const capped = retained.slice(0, MAX_RECORDS);
    const nextMap = Object.fromEntries(capped);
    const removed = entries.length - capped.length;

    if (removed > 0) {
      this.savePaymentRequiredMap(nextMap);
    }

    return { map: nextMap, removed };
  }

  getPaymentRequired(idempotencyKey: string): PaymentRequiredRecord | undefined {
    const map = this.loadPaymentRequiredMap({ prune: true });
    return map[idempotencyKey];
  }

  listPaymentRequiredRecords(): PaymentRequiredRecord[] {
    return Object.values(this.loadPaymentRequiredMap({ prune: true }));
  }

  listPaymentTraceRefs(limit = 50): PaymentTraceRef[] {
    const records = this.listPaymentRequiredRecords();
    return records
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(1, Math.floor(limit)))
      .map((record) => ({
        requestId: record.requestId,
        idempotencyKey: record.idempotencyKey,
        invoiceId: record.resumeToken.invoiceId,
        paymentReceiptId: record.resumeToken.paymentReceiptId,
        txHash: record.resumeToken.txHash,
        toolName: record.toolName,
        chain: record.resumeToken.chain,
        network: record.network ?? record.resumeToken.network,
        amount: record.amount,
        status: record.status,
        reused: record.reused,
        orderId: record.settlement?.orderId,
        settlementId: record.settlement?.settlementId,
        confirmationStatus: record.confirmationStatus,
        intentId: record.resumeToken.intentId,
        fxQuoteId: record.fxQuote?.quoteId,
        treasuryRouteId: record.treasuryRoute?.routeId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }));
  }

  savePaymentRequired(record: PaymentRequiredRecord): void {
    const map = this.loadPaymentRequiredMap({ prune: true });
    map[record.idempotencyKey] = record;
    const next = this.prunePaymentRequiredMap(map).map;
    this.savePaymentRequiredMap(next);
  }

  removePaymentRequired(idempotencyKey: string): void {
    const map = this.loadPaymentRequiredMap();
    if (!(idempotencyKey in map)) return;
    delete map[idempotencyKey];
    this.savePaymentRequiredMap(map);
  }

  // ── x402 autopay statistics ──────────────────────────────────────

  getX402AutopayStats(): X402AutopayStats {
    if (!existsSync(this.x402AutopayStatsPath)) {
      return {
        attempts: 0,
        successes: 0,
        failures: 0,
        retryCount: 0,
        circuitBreakerTrips: 0,
        lastCircuitBreakerTripAt: undefined,
        attemptEvents: [],
        failureEvents: [],
        cooldownUntil: undefined,
        updatedAt: new Date(0).toISOString(),
      };
    }
    const stored = JSON.parse(readFileSync(this.x402AutopayStatsPath, "utf-8")) as
      | Partial<X402AutopayStats>
      | undefined;
    return {
      attempts: Number.isFinite(stored?.attempts) ? Math.max(0, Math.floor(stored!.attempts!)) : 0,
      successes: Number.isFinite(stored?.successes)
        ? Math.max(0, Math.floor(stored!.successes!))
        : 0,
      failures: Number.isFinite(stored?.failures) ? Math.max(0, Math.floor(stored!.failures!)) : 0,
      retryCount: Number.isFinite(stored?.retryCount)
        ? Math.max(0, Math.floor(stored!.retryCount!))
        : 0,
      circuitBreakerTrips: Number.isFinite(stored?.circuitBreakerTrips)
        ? Math.max(0, Math.floor(stored!.circuitBreakerTrips!))
        : 0,
      lastCircuitBreakerTripAt:
        typeof stored?.lastCircuitBreakerTripAt === "string" &&
        stored.lastCircuitBreakerTripAt.length > 0
          ? stored.lastCircuitBreakerTripAt
          : undefined,
      attemptEvents: Array.isArray(stored?.attemptEvents)
        ? stored!.attemptEvents!.filter((entry): entry is string => typeof entry === "string")
        : [],
      failureEvents: Array.isArray(stored?.failureEvents)
        ? stored!.failureEvents!.filter((entry): entry is string => typeof entry === "string")
        : [],
      cooldownUntil:
        typeof stored?.cooldownUntil === "string" && stored.cooldownUntil.length > 0
          ? stored.cooldownUntil
          : undefined,
      updatedAt:
        typeof stored?.updatedAt === "string" && stored.updatedAt.length > 0
          ? stored.updatedAt
          : new Date(0).toISOString(),
    };
  }

  saveX402AutopayStats(stats: X402AutopayStats): void {
    writeFileSync(this.x402AutopayStatsPath, JSON.stringify(stats, null, 2));
  }

  updateX402AutopayStats(
    delta: Partial<
      Pick<
        X402AutopayStats,
        | "attempts"
        | "successes"
        | "failures"
        | "retryCount"
        | "circuitBreakerTrips"
        | "lastCircuitBreakerTripAt"
        | "cooldownUntil"
      >
    > & {
      attemptEventAt?: string;
      failureEventAt?: string;
    },
  ): X402AutopayStats {
    const current = this.getX402AutopayStats();
    const nowIso = new Date().toISOString();
    const historyCutoff = Date.now() - 24 * 60 * 60 * 1000;
    const pruneEvents = (events: string[]): string[] =>
      events.filter((entry) => {
        const ts = Date.parse(entry);
        return !Number.isNaN(ts) && ts >= historyCutoff;
      });

    const attemptEvents = pruneEvents(current.attemptEvents);
    if (typeof delta.attemptEventAt === "string") {
      attemptEvents.push(delta.attemptEventAt);
    }

    const failureEvents = pruneEvents(current.failureEvents);
    if (typeof delta.failureEventAt === "string") {
      failureEvents.push(delta.failureEventAt);
    }

    const next: X402AutopayStats = {
      attempts: current.attempts + (delta.attempts ?? 0),
      successes: current.successes + (delta.successes ?? 0),
      failures: current.failures + (delta.failures ?? 0),
      retryCount: current.retryCount + (delta.retryCount ?? 0),
      circuitBreakerTrips: current.circuitBreakerTrips + (delta.circuitBreakerTrips ?? 0),
      lastCircuitBreakerTripAt: delta.lastCircuitBreakerTripAt ?? current.lastCircuitBreakerTripAt,
      attemptEvents: attemptEvents.slice(-1024),
      failureEvents: failureEvents.slice(-1024),
      cooldownUntil: "cooldownUntil" in delta ? delta.cooldownUntil : current.cooldownUntil,
      updatedAt: nowIso,
    };
    this.saveX402AutopayStats(next);
    return next;
  }
}
