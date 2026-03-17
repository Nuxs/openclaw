import { normalizeTonAddress } from "@openclaw/blockchain-adapter";
import { getAddress } from "viem";
import {
  requireOptionalPositiveInt,
  requireOptionalStringArray,
  requireStringArray,
} from "./resources/validators.js";
import type {
  AcceptancePolicy,
  ProofFamily,
  ProofPolicy,
  ServiceCategory,
  ServiceSchema,
  ServiceWrapper,
} from "./service-wrapper.js";
import { createDefaultAcceptancePolicy, createDefaultProofPolicy } from "./service-wrapper.js";
import type {
  AssetType,
  DeliveryPayload,
  DeliveryType,
  ExecutionProof,
  Sha256ArtifactHash,
  UsageScope,
} from "./types.js";

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

export function requireAddress(value: unknown, field: string): `0x${string}` {
  const input = requireString(value, field);
  return getAddress(input) as `0x${string}`;
}

/**
 * Validate and normalise a chain address. TON networks use base64 addresses;
 * EVM networks use checksummed hex addresses.
 */
export function requireChainAddress(network: string, value: unknown, field: string): string {
  if (network.startsWith("ton-")) {
    const raw = requireString(value, field);
    return normalizeTonAddress(raw);
  }
  return requireAddress(value, field);
}

export function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${field} must be a number`);
  }
  return value;
}

export function requireAssetType(value: unknown): AssetType {
  if (value === "data" || value === "api" || value === "service") return value;
  throw new Error("assetType must be data | api | service");
}

export function requireDeliveryType(value: unknown): DeliveryType {
  if (value === "download" || value === "api" || value === "service") return value;
  throw new Error("deliveryType must be download | api | service");
}

export function requireUsageScope(value: unknown): UsageScope {
  if (!value || typeof value !== "object") throw new Error("usageScope is required");
  const scope = value as UsageScope;
  if (!scope.purpose || typeof scope.purpose !== "string") {
    throw new Error("usageScope.purpose is required");
  }
  return scope;
}

export function normalizeBuyerId(value: unknown): string {
  const raw = requireString(value, "buyerId");
  try {
    return getAddress(raw);
  } catch {
    return raw;
  }
}

export function requireDeliveryPayload(
  type: DeliveryType,
  payload: unknown,
): DeliveryPayload | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  if (type === "download") {
    const input = payload as { downloadUrl?: string };
    if (!input.downloadUrl) throw new Error("downloadUrl is required for download delivery");
    return { type: "download", downloadUrl: input.downloadUrl };
  }
  if (type === "api") {
    const input = payload as { accessToken?: string; quota?: number };
    if (!input.accessToken) throw new Error("accessToken is required for api delivery");
    return { type: "api", accessToken: input.accessToken, quota: input.quota };
  }
  if (type === "service") {
    const input = payload as { serviceQuota?: number; ticketId?: string };
    return { type: "service", serviceQuota: input.serviceQuota, ticketId: input.ticketId };
  }
  return undefined;
}

export function requireIsoTimestamp(params: Record<string, unknown>, key: string): string {
  const raw = params[key];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error(`${key} must be an ISO timestamp`);
  }
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`${key} must be an ISO timestamp`);
  }
  return raw;
}

export function requireExecutionProof(input: unknown): ExecutionProof {
  if (!input || typeof input !== "object") {
    throw new Error("proof is required");
  }
  const proof = input as Record<string, unknown>;
  const type = requireString(proof.type, "proof.type");
  if (
    type !== "tlsnotary" &&
    type !== "signed_receipt" &&
    type !== "human_attestation" &&
    type !== "oracle_event"
  ) {
    throw new Error(
      "proof.type must be tlsnotary | signed_receipt | human_attestation | oracle_event",
    );
  }
  const artifactHash = requireString(proof.artifactHash, "proof.artifactHash");
  if (!/^sha256:[a-f0-9]{64}$/i.test(artifactHash)) {
    throw new Error("proof.artifactHash must be sha256:<hex>");
  }
  const artifactHashTyped = artifactHash as Sha256ArtifactHash;
  const issuedAt = requireIsoTimestamp(proof, "issuedAt");
  const redactedFields = requireOptionalStringArray(proof, "proof.redactedFields", {
    maxItems: 64,
    maxLen: 64,
    unique: true,
  });
  const verifier = requireString(proof.verifier, "proof.verifier");
  const metadataInput = proof.metadata;
  const metadata =
    metadataInput && typeof metadataInput === "object" && !Array.isArray(metadataInput)
      ? ({ ...(metadataInput as Record<string, unknown>) } satisfies Record<string, unknown>)
      : metadataInput === undefined
        ? undefined
        : (() => {
            throw new Error("proof.metadata must be an object");
          })();

  if (type === "signed_receipt") {
    if (typeof metadata?.receiptId !== "string" || metadata.receiptId.trim().length === 0) {
      throw new Error("proof.metadata.receiptId is required for signed_receipt");
    }
  }
  if (type === "human_attestation") {
    if (typeof metadata?.attesterRole !== "string" || metadata.attesterRole.trim().length === 0) {
      throw new Error("proof.metadata.attesterRole is required for human_attestation");
    }
    if (
      metadata?.confidence !== undefined &&
      (typeof metadata.confidence !== "number" ||
        Number.isNaN(metadata.confidence) ||
        metadata.confidence < 0 ||
        metadata.confidence > 1)
    ) {
      throw new Error("proof.metadata.confidence must be a number between 0 and 1");
    }
  }
  if (type === "oracle_event") {
    if (typeof metadata?.oracle !== "string" || metadata.oracle.trim().length === 0) {
      throw new Error("proof.metadata.oracle is required for oracle_event");
    }
    if (typeof metadata?.eventId !== "string" || metadata.eventId.trim().length === 0) {
      throw new Error("proof.metadata.eventId is required for oracle_event");
    }
  }

  return {
    type,
    artifactHash: artifactHashTyped,
    issuedAt,
    redactedFields,
    verifier,
    metadata,
  };
}

function requireServiceCategory(value: unknown, field: string): ServiceCategory {
  if (value === "digital" || value === "human" || value === "rwa") {
    return value;
  }
  throw new Error(`${field} must be digital | human | rwa`);
}

function requireProofFamily(value: unknown, field: string): ProofFamily {
  if (
    value === "tlsnotary" ||
    value === "signed_receipt" ||
    value === "human_attestation" ||
    value === "oracle_event"
  ) {
    return value;
  }
  throw new Error(`${field} must be tlsnotary | signed_receipt | human_attestation | oracle_event`);
}

export function requireAcceptancePolicy(
  input: unknown,
  category: ServiceCategory = "digital",
): AcceptancePolicy {
  if (input === undefined) {
    return createDefaultAcceptancePolicy(category);
  }
  if (!input || typeof input !== "object") {
    throw new Error("serviceWrapper.acceptance must be an object");
  }
  const policy = input as Record<string, unknown>;
  const mode = requireString(policy.mode, "serviceWrapper.acceptance.mode");
  if (mode !== "auto" && mode !== "human" && mode !== "milestone" && mode !== "oracle") {
    throw new Error("serviceWrapper.acceptance.mode must be auto | human | milestone | oracle");
  }
  return {
    mode,
    reviewWindowHours: requireOptionalPositiveInt(policy, "reviewWindowHours", {
      min: 1,
      max: 24 * 30,
    }),
    milestoneCount: requireOptionalPositiveInt(policy, "milestoneCount", {
      min: 1,
      max: 100,
    }),
    arbitratorType:
      policy.arbitratorType === "manual" ||
      policy.arbitratorType === "dao" ||
      policy.arbitratorType === "partner"
        ? policy.arbitratorType
        : undefined,
  };
}

export function requireProofPolicy(
  input: unknown,
  params?: { category?: ServiceCategory; serviceSchema?: ServiceSchema },
): ProofPolicy {
  const category = params?.category ?? "digital";
  const defaultPolicy = createDefaultProofPolicy({
    category,
    serviceSchema: params?.serviceSchema,
  });
  if (input === undefined) {
    return defaultPolicy;
  }
  if (!input || typeof input !== "object") {
    throw new Error("serviceWrapper.proof must be an object");
  }
  const policy = input as Record<string, unknown>;
  const familiesInput = policy.families;
  if (!Array.isArray(familiesInput) || familiesInput.length === 0) {
    throw new Error("serviceWrapper.proof.families must be a non-empty array");
  }
  const families = familiesInput.map((family, index) =>
    requireProofFamily(family, `serviceWrapper.proof.families[${index}]`),
  );
  return {
    families: [...new Set(families)],
    required: typeof policy.required === "boolean" ? policy.required : defaultPolicy.required,
    minArtifacts: requireOptionalPositiveInt(policy, "minArtifacts", {
      min: 1,
      max: 100,
    }),
  };
}

export function requireServiceWrapper(
  input: unknown,
  serviceSchema?: ServiceSchema,
): ServiceWrapper {
  if (input === undefined) {
    return {
      version: "v1",
      category: "digital",
      serviceSchema,
      acceptance: createDefaultAcceptancePolicy("digital"),
      proof: createDefaultProofPolicy({ category: "digital", serviceSchema }),
    };
  }
  if (!input || typeof input !== "object") {
    throw new Error("serviceWrapper must be an object");
  }
  const wrapper = input as Record<string, unknown>;
  const category = requireServiceCategory(wrapper.category, "serviceWrapper.category");
  const embeddedServiceSchema =
    wrapper.serviceSchema !== undefined
      ? requireServiceSchema(wrapper.serviceSchema)
      : serviceSchema;
  return {
    version: "v1",
    category,
    serviceSchema: embeddedServiceSchema,
    acceptance: requireAcceptancePolicy(wrapper.acceptance, category),
    proof: requireProofPolicy(wrapper.proof, {
      category,
      serviceSchema: embeddedServiceSchema,
    }),
    tags: requireOptionalStringArray(wrapper, "tags", {
      maxItems: 16,
      maxLen: 40,
      unique: true,
    }),
  };
}

export function requireServiceSchema(input: unknown): ServiceSchema {
  if (!input || typeof input !== "object") {
    throw new Error("serviceSchema is required");
  }
  const schema = input as Record<string, unknown>;
  const inputs = requireStringArray(schema, "inputs", { maxItems: 32, maxLen: 80, unique: true });
  const outputs = requireStringArray(schema, "outputs", { maxItems: 32, maxLen: 80, unique: true });
  const slaInput = schema.sla;
  const sla =
    slaInput && typeof slaInput === "object"
      ? {
          maxLatencySec: requireOptionalPositiveInt(
            slaInput as Record<string, unknown>,
            "maxLatencySec",
            {
              min: 1,
              max: 60 * 60,
            },
          ),
          deliveryWindowSec: requireOptionalPositiveInt(
            slaInput as Record<string, unknown>,
            "deliveryWindowSec",
            { min: 1, max: 7 * 24 * 60 * 60 },
          ),
        }
      : undefined;
  const proofRequirementsInput = schema.proofRequirements as unknown;
  let proofRequirements: ServiceSchema["proofRequirements"];
  if (proofRequirementsInput !== undefined) {
    if (!Array.isArray(proofRequirementsInput)) {
      throw new Error("serviceSchema.proofRequirements must be an array");
    }
    if (proofRequirementsInput.length === 0) {
      throw new Error("serviceSchema.proofRequirements must not be empty");
    }
    proofRequirements = proofRequirementsInput.map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        throw new Error(`serviceSchema.proofRequirements[${index}] must be an object`);
      }
      const record = entry as Record<string, unknown>;
      const type = requireString(record.type, `serviceSchema.proofRequirements[${index}].type`);
      if (type !== "tlsnotary") {
        throw new Error("serviceSchema.proofRequirements.type must be tlsnotary");
      }
      const required = typeof record.required === "boolean" ? record.required : undefined;
      return { type: "tlsnotary", required };
    });
  }
  const normalizedSchema: ServiceSchema = {
    inputs,
    outputs,
    sla,
    proofRequirements,
  };
  return normalizedSchema;
}

export * from "./resources/validators.js";
