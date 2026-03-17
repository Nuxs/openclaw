export type ServiceProofRequirementType =
  | "tlsnotary"
  | "signed_receipt"
  | "human_attestation"
  | "oracle_event";

export type ServiceSchema = {
  inputs: string[];
  outputs: string[];
  sla?: {
    maxLatencySec?: number;
    deliveryWindowSec?: number;
  };
  proofRequirements?: Array<{ type: ServiceProofRequirementType; required?: boolean }>;
};

export type ServiceCategory = "digital" | "human" | "rwa";

export type AcceptanceMode = "auto" | "human" | "milestone" | "oracle";

export type ProofFamily = "tlsnotary" | "signed_receipt" | "human_attestation" | "oracle_event";

export type AcceptancePolicy = {
  mode: AcceptanceMode;
  reviewWindowHours?: number;
  milestoneCount?: number;
  arbitratorType?: "manual" | "dao" | "partner";
};

export type ProofPolicy = {
  families: ProofFamily[];
  required: boolean;
  minArtifacts?: number;
};

export type ServiceWrapper = {
  version: "v1";
  category: ServiceCategory;
  serviceSchema?: ServiceSchema;
  acceptance: AcceptancePolicy;
  proof: ProofPolicy;
  tags?: string[];
};

export const DEFAULT_ACCEPTANCE_REVIEW_WINDOW_HOURS = 7 * 24;

function uniqueFamilies(families: ProofFamily[]): ProofFamily[] {
  return [...new Set(families)];
}

export function proofFamiliesFromServiceSchema(serviceSchema?: ServiceSchema): ProofFamily[] {
  return uniqueFamilies((serviceSchema?.proofRequirements ?? []).map((entry) => entry.type));
}

export function defaultAcceptanceMode(category: ServiceCategory): AcceptanceMode {
  switch (category) {
    case "human":
      return "milestone";
    case "rwa":
      return "oracle";
    default:
      return "human";
  }
}

export function createDefaultAcceptancePolicy(
  category: ServiceCategory = "digital",
): AcceptancePolicy {
  const mode = defaultAcceptanceMode(category);
  if (mode === "milestone") {
    return {
      mode,
      reviewWindowHours: DEFAULT_ACCEPTANCE_REVIEW_WINDOW_HOURS,
      milestoneCount: 1,
      arbitratorType: "manual",
    };
  }
  if (mode === "oracle") {
    return {
      mode,
      reviewWindowHours: DEFAULT_ACCEPTANCE_REVIEW_WINDOW_HOURS,
      arbitratorType: "partner",
    };
  }
  return {
    mode,
    reviewWindowHours: DEFAULT_ACCEPTANCE_REVIEW_WINDOW_HOURS,
    arbitratorType: "manual",
  };
}

export function createDefaultProofPolicy(params?: {
  category?: ServiceCategory;
  serviceSchema?: ServiceSchema;
}): ProofPolicy {
  const category = params?.category ?? "digital";
  const fromSchema = proofFamiliesFromServiceSchema(params?.serviceSchema);
  const fallbackFamilies: ProofFamily[] =
    fromSchema.length > 0
      ? fromSchema
      : category === "human"
        ? ["human_attestation"]
        : category === "rwa"
          ? ["oracle_event"]
          : [];
  return {
    families: fallbackFamilies,
    required: fallbackFamilies.length > 0,
  };
}

export function createDefaultServiceWrapper(params?: {
  category?: ServiceCategory;
  serviceSchema?: ServiceSchema;
  tags?: string[];
}): ServiceWrapper {
  const category = params?.category ?? "digital";
  return {
    version: "v1",
    category,
    serviceSchema: params?.serviceSchema,
    acceptance: createDefaultAcceptancePolicy(category),
    proof: createDefaultProofPolicy({
      category,
      serviceSchema: params?.serviceSchema,
    }),
    tags: params?.tags,
  };
}

export function resolveServiceWrapper(params: {
  serviceSchema?: ServiceSchema;
  serviceWrapper?: ServiceWrapper | null;
}): ServiceWrapper | undefined {
  if (params.serviceWrapper) {
    return {
      ...params.serviceWrapper,
      serviceSchema: params.serviceWrapper.serviceSchema ?? params.serviceSchema,
    };
  }
  if (!params.serviceSchema) {
    return undefined;
  }
  return createDefaultServiceWrapper({ serviceSchema: params.serviceSchema });
}
