export type CapabilityAvailability = {
  enabled: boolean;
  reason?: string;
};

export type CapabilityKind = "gateway" | "tool" | "http";

export type CapabilityGroup =
  | "capabilities"
  | "identity"
  | "audit"
  | "billing"
  | "status"
  | "resources"
  | "market"
  | "reward"
  | "index"
  | "monitor"
  | "dispute"
  | "tools";

export type CapabilityStability = "stable" | "experimental" | "internal";

export type CapabilityDescriptor = {
  name: string;
  summary: string;
  kind: CapabilityKind;
  group: CapabilityGroup;
  availability: CapabilityAvailability;
  /** API stability grade: stable (production), experimental (may change), internal (do not rely on) */
  stability?: CapabilityStability;
  permissions?: {
    requiresIdentity?: boolean;
    allowlist?: string[];
  };
  risk?: {
    level: "low" | "medium" | "high";
    notes?: string[];
  };
  pricing?: {
    unit?: string;
    currency?: string;
    requiresPreLock?: boolean;
    estimate?: string;
  };
  prerequisites?: string[];
  paramsSchema?: Record<string, unknown>;
  returns?: string;
  examples?: Array<{
    summary: string;
    params?: Record<string, unknown>;
  }>;
  aliases?: string[];
};

export type CapabilitySummary = Pick<
  CapabilityDescriptor,
  "name" | "summary" | "kind" | "group" | "availability" | "aliases"
>;
