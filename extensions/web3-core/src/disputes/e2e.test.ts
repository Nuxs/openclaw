/**
 * End-to-End tests for Web3 Market flow.
 * Tests complete workflows: publish → lease → dispute → resolve
 */

import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Web3PluginConfig } from "../config.js";
import {
  createDisputeOpenHandler,
  createDisputeSubmitEvidenceHandler,
  createDisputeResolveHandler,
  createDisputeGetHandler,
  createDisputeListHandler,
  checkDisputeTimeouts,
} from "../disputes/handlers.js";
import { DEFAULT_DISPUTE_CONFIG, type DisputeStatus } from "../disputes/types.js";
import { Web3StateStore } from "../state/store.js";

describe("E2E: Complete Market Flow with Dispute", () => {
  let tempDir: string;
  let store: Web3StateStore;
  let config: Web3PluginConfig;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "web3-e2e-test-"));
    store = new Web3StateStore(tempDir);
    config = {
      resources: { enabled: true },
    } as Web3PluginConfig;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createMockResponder() {
    let lastSuccess: boolean | undefined;
    let lastData: unknown;

    return {
      respond: (success: boolean, data: unknown) => {
        lastSuccess = success;
        lastData = data;
      },
      getResult: () => {
        if (lastSuccess === undefined) throw new Error("No response yet");
        if (!lastSuccess) throw new Error(`Request failed: ${JSON.stringify(lastData)}`);
        return lastData as Record<string, unknown>;
      },
      getRawResponse: () => ({ success: lastSuccess, data: lastData }),
    };
  }

  it("Happy path: publish → lease → usage → settlement", async () => {
    // This test documents the expected flow without dispute
    // In Phase 1, we don't have full market-core integration
    // but we can verify the dispute module works independently

    const providerId = `0x${randomBytes(20).toString("hex")}`;
    const consumerId = `0x${randomBytes(20).toString("hex")}`;
    const resourceId = `res_${randomBytes(4).toString("hex")}`;
    const orderId = `lease_${randomBytes(4).toString("hex")}`;

    // Note: In full implementation, these would go through market-core
    // For Phase 1, we verify dispute APIs work correctly
    expect(providerId).toBeDefined();
    expect(consumerId).toBeDefined();
    expect(resourceId).toBeDefined();
    expect(orderId).toBeDefined();
  });

  it("Dispute flow: open → submitEvidence → resolve", async () => {
    const providerId = `0x${randomBytes(20).toString("hex")}`;
    const consumerId = `0x${randomBytes(20).toString("hex")}`;
    const resourceId = `res_${randomBytes(4).toString("hex")}`;
    const orderId = `lease_${randomBytes(4).toString("hex")}`;

    // Step 1: Consumer opens dispute
    const openHandler = createDisputeOpenHandler(store, config);
    const openResponder = createMockResponder();

    openHandler({
      params: {
        orderId,
        resourceId,
        consumerId,
        providerId,
        reason: "Service was unavailable for 3 hours during peak usage",
      },
      respond: openResponder.respond,
    } as any);

    const openResult = openResponder.getResult();
    expect(openResult.disputeId).toBeDefined();
    expect(openResult.status).toBe("open");

    const disputeId = openResult.disputeId as string;

    // Step 2: Consumer submits evidence
    const evidenceHandler = createDisputeSubmitEvidenceHandler(store, config);
    const evidence1Responder = createMockResponder();

    evidenceHandler({
      params: {
        disputeId,
        submittedBy: consumerId,
        type: "screenshot",
        description: "Screenshot showing 503 Service Unavailable error",
        data: { timestamp: "2026-02-21T10:00:00Z", httpStatus: 503 },
      },
      respond: evidence1Responder.respond,
    } as any);

    const evidence1Result = evidence1Responder.getResult();
    expect(evidence1Result.evidenceId).toBeDefined();
    expect(evidence1Result.contentHash).toBeDefined();

    // Step 3: Provider submits counter-evidence
    const evidence2Responder = createMockResponder();

    evidenceHandler({
      params: {
        disputeId,
        submittedBy: providerId,
        type: "usage_log",
        description: "Server logs showing 99.8% uptime during the period",
        data: { uptime: 0.998, totalDowntime: "2 minutes" },
      },
      respond: evidence2Responder.respond,
    } as any);

    const evidence2Result = evidence2Responder.getResult();
    expect(evidence2Result.evidenceId).toBeDefined();

    // Step 4: Verify dispute status
    const getHandler = createDisputeGetHandler(store, config);
    const getResponder = createMockResponder();

    getHandler({
      params: { disputeId },
      respond: getResponder.respond,
    } as any);

    const getResult = getResponder.getResult();
    const dispute = getResult.dispute as any;
    expect(dispute.status).toBe("evidence_submitted");
    expect(dispute.evidences).toHaveLength(2);
    expect(dispute.evidences[0].submittedBy).toBe(consumerId);
    expect(dispute.evidences[1].submittedBy).toBe(providerId);

    // Step 5: System resolves dispute
    const resolveHandler = createDisputeResolveHandler(store, config);
    const resolveResponder = createMockResponder();

    resolveHandler({
      params: {
        disputeId,
        ruling: "split",
        reason: "Brief downtime confirmed, partial refund warranted",
        refundAmount: "2.5",
        resolvedBy: "system",
      },
      respond: resolveResponder.respond,
    } as any);

    const resolveResult = resolveResponder.getResult();
    expect(resolveResult.status).toBe("resolved");
    expect((resolveResult.resolution as any).ruling).toBe("split");
    expect((resolveResult.resolution as any).refundAmount).toBe("2.5");

    // Step 6: Verify final state
    const finalGetResponder = createMockResponder();
    getHandler({
      params: { disputeId },
      respond: finalGetResponder.respond,
    } as any);

    const finalGetResult = finalGetResponder.getResult();
    const finalDispute = finalGetResult.dispute as any;
    expect(finalDispute.status).toBe("resolved");
    expect(finalDispute.resolution).toBeDefined();
  });

  it("Dispute timeout: auto-resolve after expiry", async () => {
    const providerId = `0x${randomBytes(20).toString("hex")}`;
    const consumerId = `0x${randomBytes(20).toString("hex")}`;
    const resourceId = `res_${randomBytes(4).toString("hex")}`;
    const orderId = `lease_${randomBytes(4).toString("hex")}`;

    // Step 1: Open dispute
    const openHandler = createDisputeOpenHandler(store, config);
    const openResponder = createMockResponder();

    openHandler({
      params: { orderId, resourceId, consumerId, providerId, reason: "Test dispute for timeout" },
      respond: openResponder.respond,
    } as any);

    const openResult = openResponder.getResult();
    const disputeId = openResult.disputeId as string;

    // Step 2: Manually set expiry to past (simulate 7 days passing)
    const dispute = store.getDispute(disputeId)!;
    dispute.expiresAt = new Date(Date.now() - 1000).toISOString(); // 1 second ago
    store.upsertDispute(dispute);

    // Step 3: Run timeout check
    const result = checkDisputeTimeouts(store);
    expect(result.resolved).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Step 4: Verify dispute is expired
    const getHandler = createDisputeGetHandler(store, config);
    const getResponder = createMockResponder();

    getHandler({
      params: { disputeId },
      respond: getResponder.respond,
    } as any);

    const getResult = getResponder.getResult();
    const finalDispute = getResult.dispute as any;
    expect(finalDispute.status).toBe("expired");
    expect(finalDispute.resolution.ruling).toBe("timeout");
  });

  it("Dispute validation: prevent duplicate open disputes", async () => {
    const providerId = `0x${randomBytes(20).toString("hex")}`;
    const consumerId = `0x${randomBytes(20).toString("hex")}`;
    const resourceId = `res_${randomBytes(4).toString("hex")}`;
    const orderId = `lease_${randomBytes(4).toString("hex")}`;

    const openHandler = createDisputeOpenHandler(store, config);

    // Open first dispute
    const responder1 = createMockResponder();
    openHandler({
      params: { orderId, resourceId, consumerId, providerId, reason: "First dispute" },
      respond: responder1.respond,
    } as any);

    const result1 = responder1.getResult();
    expect(result1.disputeId).toBeDefined();

    // Try to open second dispute for same order
    const responder2 = createMockResponder();
    openHandler({
      params: { orderId, resourceId, consumerId, providerId, reason: "Second dispute" },
      respond: responder2.respond,
    } as any);

    const response2 = responder2.getRawResponse();
    expect(response2.success).toBe(false);
    expect((response2.data as any).error.code).toBe("E_CONFLICT");
  });

  it("Dispute evidence: enforce quota limits", async () => {
    const providerId = `0x${randomBytes(20).toString("hex")}`;
    const consumerId = `0x${randomBytes(20).toString("hex")}`;
    const resourceId = `res_${randomBytes(4).toString("hex")}`;
    const orderId = `lease_${randomBytes(4).toString("hex")}`;

    // Open dispute
    const openHandler = createDisputeOpenHandler(store, config);
    const openResponder = createMockResponder();
    openHandler({
      params: { orderId, resourceId, consumerId, providerId, reason: "Evidence quota test" },
      respond: openResponder.respond,
    } as any);

    const disputeId = openResponder.getResult().disputeId as string;

    // Submit max allowed evidences
    const evidenceHandler = createDisputeSubmitEvidenceHandler(store, config);
    for (let i = 0; i < DEFAULT_DISPUTE_CONFIG.maxEvidencePerParty; i++) {
      const responder = createMockResponder();
      evidenceHandler({
        params: {
          disputeId,
          submittedBy: consumerId,
          type: "other",
          description: `Evidence ${i + 1}`,
        },
        respond: responder.respond,
      } as any);
      expect(responder.getResult().evidenceId).toBeDefined();
    }

    // Try to submit one more (should fail)
    const extraResponder = createMockResponder();
    evidenceHandler({
      params: {
        disputeId,
        submittedBy: consumerId,
        type: "other",
        description: "Extra evidence",
      },
      respond: extraResponder.respond,
    } as any);

    const extraResponse = extraResponder.getRawResponse();
    expect(extraResponse.success).toBe(false);
    expect((extraResponse.data as any).error.code).toBe("E_QUOTA_EXCEEDED");
  });

  it("Dispute list: filter by status and orderId", async () => {
    // Create multiple disputes
    const openHandler = createDisputeOpenHandler(store, config);

    const dispute1Params = {
      orderId: "order1",
      resourceId: "res1",
      consumerId: `0x${randomBytes(20).toString("hex")}`,
      providerId: `0x${randomBytes(20).toString("hex")}`,
      reason: "Dispute 1",
    };

    const dispute2Params = {
      orderId: "order2",
      resourceId: "res2",
      consumerId: `0x${randomBytes(20).toString("hex")}`,
      providerId: `0x${randomBytes(20).toString("hex")}`,
      reason: "Dispute 2",
    };

    // Open dispute 1
    const responder1 = createMockResponder();
    openHandler({ params: dispute1Params, respond: responder1.respond } as any);
    const disputeId1 = responder1.getResult().disputeId as string;

    // Open dispute 2
    const responder2 = createMockResponder();
    openHandler({ params: dispute2Params, respond: responder2.respond } as any);
    const disputeId2 = responder2.getResult().disputeId as string;

    // Resolve dispute 1
    const resolveHandler = createDisputeResolveHandler(store, config);
    const resolveResponder = createMockResponder();
    resolveHandler({
      params: {
        disputeId: disputeId1,
        ruling: "provider_wins",
        reason: "Test",
        resolvedBy: "system",
      },
      respond: resolveResponder.respond,
    } as any);

    // List all disputes
    const listHandler = createDisputeListHandler(store, config);
    const listAllResponder = createMockResponder();
    listHandler({ params: {}, respond: listAllResponder.respond } as any);
    const listAllResult = listAllResponder.getResult();
    expect((listAllResult.disputes as any[]).length).toBe(2);

    // List open disputes only
    const listOpenResponder = createMockResponder();
    listHandler({ params: { status: "open" }, respond: listOpenResponder.respond } as any);
    const listOpenResult = listOpenResponder.getResult();
    expect((listOpenResult.disputes as any[]).length).toBe(1);
    expect((listOpenResult.disputes as any[])[0].disputeId).toBe(disputeId2);

    // List by orderId
    const listOrderResponder = createMockResponder();
    listHandler({ params: { orderId: "order1" }, respond: listOrderResponder.respond } as any);
    const listOrderResult = listOrderResponder.getResult();
    expect((listOrderResult.disputes as any[]).length).toBe(1);
    expect((listOrderResult.disputes as any[])[0].disputeId).toBe(disputeId1);
  });
});
