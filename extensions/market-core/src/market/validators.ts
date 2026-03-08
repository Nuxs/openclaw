import { normalizeTonAddress } from "@openclaw/blockchain-adapter";
import { getAddress } from "viem";
import type { ServiceSchema } from "./resources.js";
import {
  requireOptionalPositiveInt,
  requireOptionalStringArray,
  requireStringArray,
} from "./resources/validators.js";
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
  if (type !== "tlsnotary") {
    throw new Error("proof.type must be tlsnotary");
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
  return {
    type: "tlsnotary",
    artifactHash: artifactHashTyped,
    issuedAt,
    redactedFields,
    verifier,
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
