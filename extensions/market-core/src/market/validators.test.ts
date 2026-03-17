import { describe, expect, it } from "vitest";
import {
  requireExecutionProof,
  requireServiceSchema,
  requireServiceWrapper,
} from "./validators.js";

describe("requireExecutionProof", () => {
  it("accepts a valid tlsnotary proof", () => {
    const proof = requireExecutionProof({
      type: "tlsnotary",
      artifactHash: "sha256:4f3c2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f",
      issuedAt: "2026-03-02T12:00:00Z",
      redactedFields: ["sessionCookies"],
      verifier: "tlsnotary",
    });
    expect(proof.type).toBe("tlsnotary");
    expect(proof.artifactHash).toMatch(/^sha256:/);
  });

  it("rejects invalid artifact hash", () => {
    expect(() =>
      requireExecutionProof({
        type: "tlsnotary",
        artifactHash: "sha256:not-a-hash",
        issuedAt: "2026-03-02T12:00:00Z",
        verifier: "tlsnotary",
      }),
    ).toThrow("proof.artifactHash");
  });
});

describe("requireServiceSchema", () => {
  it("accepts minimal service schema", () => {
    const schema = requireServiceSchema({
      inputs: ["repoUrl"],
      outputs: ["ciStatus"],
      proofRequirements: [{ type: "tlsnotary", required: true }],
    });
    expect(schema.inputs).toEqual(["repoUrl"]);
    expect(schema.outputs).toEqual(["ciStatus"]);
  });

  it("requires inputs and outputs", () => {
    expect(() => requireServiceSchema({ inputs: [], outputs: [] })).toThrow("inputs");
  });
});

describe("requireServiceWrapper", () => {
  it("builds a default digital wrapper from legacy serviceSchema", () => {
    const wrapper = requireServiceWrapper(undefined, {
      inputs: ["repoUrl"],
      outputs: ["report"],
      proofRequirements: [{ type: "tlsnotary", required: true }],
    });
    expect(wrapper.category).toBe("digital");
    expect(wrapper.acceptance.mode).toBe("human");
    expect(wrapper.proof.families).toEqual(["tlsnotary"]);
  });

  it("accepts explicit wrapper proof and acceptance policies", () => {
    const wrapper = requireServiceWrapper(
      {
        category: "human",
        acceptance: { mode: "milestone", milestoneCount: 2, reviewWindowHours: 48 },
        proof: {
          families: ["human_attestation", "signed_receipt"],
          required: true,
          minArtifacts: 2,
        },
      },
      {
        inputs: ["brief"],
        outputs: ["deliverable"],
      },
    );
    expect(wrapper.category).toBe("human");
    expect(wrapper.acceptance.milestoneCount).toBe(2);
    expect(wrapper.proof.families).toEqual(["human_attestation", "signed_receipt"]);
  });
});
