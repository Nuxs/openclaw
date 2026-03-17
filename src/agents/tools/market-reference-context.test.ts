import { beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();

vi.mock("../../gateway/call.js", () => ({
  callGateway: (...args: unknown[]) => callGatewayMock(...args),
}));

const {
  appendMarketReferenceContext,
  formatMarketReferenceContext,
  formatMountedMarketLeaseContext,
  resolveAndMountLease,
} = await import("./market-reference-context.js");

describe("market-reference-context", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
  });

  it("formats all non-empty market references", () => {
    const formatted = formatMarketReferenceContext({
      orderId: "order-1",
      leaseId: "lease-1",
      proofId: "proof-1",
      acceptanceId: "acceptance-1",
      settlementId: "settlement-1",
      disputeId: "dispute-1",
      executionRef: "execution-1",
    });
    expect(formatted).toContain("orderId=order-1");
    expect(formatted).toContain("acceptanceId=acceptance-1");
    expect(formatted).toContain("executionRef=execution-1");
  });

  it("formats mounted lease summaries without exposing secrets", () => {
    const formatted = formatMountedMarketLeaseContext({
      status: "mounted",
      leaseId: "lease-1",
      resourceId: "res-1",
      kind: "search",
      serviceCategory: "digital",
      expiresAt: "2026-03-17T10:00:00.000Z",
    });
    expect(formatted).toContain("Market lease mounted internally");
    expect(formatted).toContain("leaseId=lease-1");
    expect(formatted).toContain("resourceId=res-1");
    expect(formatted).not.toContain("tok_");
  });

  it("appends market references onto an existing task body", () => {
    const task = appendMarketReferenceContext("Review this provider", {
      orderId: "order-1",
      proofId: "proof-1",
    });
    expect(task).toContain("Review this provider");
    expect(task).toContain("Market references: orderId=order-1, proofId=proof-1.");
  });

  it("resolves approval-required execution without attempting mount", async () => {
    callGatewayMock.mockResolvedValueOnce({
      orderId: "order-1",
      approval: {
        status: "approval_required",
        consentId: "consent-1",
      },
      resource: {
        resourceId: "res-1",
      },
    });

    await expect(resolveAndMountLease({ orderId: "order-1" })).resolves.toEqual({
      status: "approval_required",
      orderId: "order-1",
      consentId: "consent-1",
      resourceId: "res-1",
    });
    expect(callGatewayMock).toHaveBeenCalledTimes(1);
  });

  it("resolves execution then mounts lease through the safe facade", async () => {
    callGatewayMock
      .mockResolvedValueOnce({
        orderId: "order-1",
        lease: { leaseId: "lease-1", expiresAt: "2026-03-17T10:00:00.000Z" },
        resource: {
          resourceId: "res-1",
          kind: "search",
          serviceWrapper: { category: "digital" },
        },
      })
      .mockResolvedValueOnce({
        leaseId: "lease-1",
        orderId: "order-1",
        resourceId: "res-1",
        kind: "search",
        serviceCategory: "digital",
        expiresAt: "2026-03-17T10:00:00.000Z",
      });

    await expect(resolveAndMountLease({ orderId: "order-1" })).resolves.toEqual({
      status: "mounted",
      leaseId: "lease-1",
      orderId: "order-1",
      resourceId: "res-1",
      kind: "search",
      serviceCategory: "digital",
      expiresAt: "2026-03-17T10:00:00.000Z",
    });
    expect(callGatewayMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ method: "web3.market.execution.status" }),
    );
    expect(callGatewayMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: "web3.market.lease.mount" }),
    );
  });
});
