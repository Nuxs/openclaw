import type { ProofFamily } from "./service-wrapper.js";
import type { ExecutionProof, ServiceProof } from "./types.js";

export type GenericProofStatus = "submitted" | "verified" | "rejected";

export type GenericProofArtifact = {
  type: ProofFamily;
  artifactHash: string;
  issuedAt: string;
  verifier: string;
  redactedFields?: string[];
  metadata?: Record<string, unknown>;
};

export type GenericProof = {
  id: string;
  orderId: string;
  family: ProofFamily;
  artifacts: GenericProofArtifact[];
  metadata: Record<string, unknown>;
  submittedAt: string;
  verifiedAt?: string;
  status: GenericProofStatus;
  verificationProof?: string;
};

export type GenericProofSummary = {
  proofId: string;
  family: ProofFamily;
  artifactCount: number;
  issuedAt: string;
  verifier: string;
  status: GenericProofStatus;
};

export function proofFamilyFromExecutionProof(proof: ExecutionProof): ProofFamily {
  return proof.type;
}

export function isVerifiedExecutionProof(proof: ExecutionProof): boolean {
  if (typeof proof.artifactHash !== "string" || !proof.artifactHash.startsWith("sha256:")) {
    return false;
  }
  if (typeof proof.verifier !== "string" || proof.verifier.trim().length === 0) {
    return false;
  }
  if (proof.type === "signed_receipt") {
    return (
      typeof proof.metadata?.receiptId === "string" && proof.metadata.receiptId.trim().length > 0
    );
  }
  if (proof.type === "human_attestation") {
    return (
      typeof proof.metadata?.attesterRole === "string" &&
      proof.metadata.attesterRole.trim().length > 0
    );
  }
  if (proof.type === "oracle_event") {
    return (
      typeof proof.metadata?.oracle === "string" &&
      proof.metadata.oracle.trim().length > 0 &&
      typeof proof.metadata?.eventId === "string" &&
      proof.metadata.eventId.trim().length > 0
    );
  }
  return true;
}

export function toGenericProofArtifact(proof: ExecutionProof): GenericProofArtifact {
  return {
    type: proof.type,
    artifactHash: proof.artifactHash,
    issuedAt: proof.issuedAt,
    verifier: proof.verifier,
    redactedFields: proof.redactedFields,
    metadata: proof.metadata,
  };
}

export function toGenericProof(serviceProof: ServiceProof): GenericProof {
  const verified = isVerifiedExecutionProof(serviceProof.proof);
  return {
    id: serviceProof.proofId,
    orderId: serviceProof.orderId,
    family: proofFamilyFromExecutionProof(serviceProof.proof),
    artifacts: [toGenericProofArtifact(serviceProof.proof)],
    metadata: {
      actorId: serviceProof.actorId,
      leaseId: serviceProof.leaseId ?? null,
      deliveryId: serviceProof.deliveryId ?? null,
      proofHash: serviceProof.proofHash,
      proofMetadata: serviceProof.proof.metadata ?? null,
    },
    submittedAt: serviceProof.submittedAt,
    verifiedAt: verified ? serviceProof.submittedAt : undefined,
    status: verified ? "verified" : "submitted",
  };
}

export function buildGenericProofSummary(serviceProof: ServiceProof): GenericProofSummary {
  const genericProof = toGenericProof(serviceProof);
  const artifact = genericProof.artifacts[0];
  return {
    proofId: genericProof.id,
    family: genericProof.family,
    artifactCount: genericProof.artifacts.length,
    issuedAt: artifact?.issuedAt ?? genericProof.submittedAt,
    verifier: artifact?.verifier ?? "unknown",
    status: genericProof.status,
  };
}
