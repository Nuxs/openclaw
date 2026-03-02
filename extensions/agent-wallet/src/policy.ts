import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

export type WalletPolicy = {
  version: "v1";
  budget: {
    dailyCap: string;
    perTxCap: string;
    currency: string;
  };
  scope: {
    allowedContracts?: string[];
    allowedMethods?: string[];
    allowedTools?: string[];
    allowedChains?: Array<"evm" | "ton">;
  };
  autoPay: {
    enabled: boolean;
    maxRetries: number;
    maxAutoPayPerRequest?: string;
  };
  ttl?: {
    notBefore?: string;
    notAfter?: string;
  };
};

export type PolicyReasonCode =
  | "approved"
  | "budget_daily_exceeded"
  | "budget_per_tx_exceeded"
  | "scope_contract_denied"
  | "scope_method_denied"
  | "scope_tool_denied"
  | "scope_chain_denied"
  | "ttl_expired"
  | "policy_missing"
  | "internal_error";

export type PolicyAction = "sign" | "send" | "autopay";

export type PolicyDecision = {
  decisionId: string;
  timestamp: string;
  action: PolicyAction;
  result: "approved" | "rejected";
  reasonCode: PolicyReasonCode;
  metadata?: Record<string, unknown>;
};

export type PolicyIntent = {
  action: PolicyAction;
  chain: "evm" | "ton";
  tool?: string;
  to?: string;
  amount?: bigint;
  method?: string;
};

export type PolicyCheckContext = {
  now?: Date;
  dailySpent?: bigint;
};

export type WalletPolicyConfig = {
  enabled: boolean;
  policyPath?: string;
  inlinePolicy?: WalletPolicy;
  decisionLogPath?: string;
};

export type LoadedWalletPolicy = {
  policy: WalletPolicy | null;
  source: "inline" | "file" | "none";
};

const DEFAULT_POLICY_CONFIG: WalletPolicyConfig = {
  enabled: false,
};

const DEFAULT_POLICY: WalletPolicy = {
  version: "v1",
  budget: {
    dailyCap: "0",
    perTxCap: "0",
    currency: "NATIVE",
  },
  scope: {},
  autoPay: {
    enabled: false,
    maxRetries: 1,
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCap(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") {
    return fallback;
  }
  const value = raw.trim();
  if (value.length === 0 || !/^\d+$/.test(value)) {
    return fallback;
  }
  return value;
}

function parseStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const normalized = raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function parseAllowedChains(raw: unknown): Array<"evm" | "ton"> | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const normalized = raw.filter(
    (entry): entry is "evm" | "ton" => entry === "evm" || entry === "ton",
  );
  return normalized.length > 0 ? normalized : undefined;
}

function normalizePolicy(raw: unknown): WalletPolicy {
  const source = isObject(raw) ? raw : {};

  const budgetRaw = isObject(source.budget) ? source.budget : {};
  const scopeRaw = isObject(source.scope) ? source.scope : {};
  const autoPayRaw = isObject(source.autoPay) ? source.autoPay : {};
  const ttlRaw = isObject(source.ttl) ? source.ttl : undefined;

  const maxRetries =
    typeof autoPayRaw.maxRetries === "number" && Number.isFinite(autoPayRaw.maxRetries)
      ? Math.max(0, Math.floor(autoPayRaw.maxRetries))
      : DEFAULT_POLICY.autoPay.maxRetries;

  const notBefore = typeof ttlRaw?.notBefore === "string" ? ttlRaw.notBefore.trim() : undefined;
  const notAfter = typeof ttlRaw?.notAfter === "string" ? ttlRaw.notAfter.trim() : undefined;

  return {
    version: "v1",
    budget: {
      dailyCap: parseCap(budgetRaw.dailyCap, DEFAULT_POLICY.budget.dailyCap),
      perTxCap: parseCap(budgetRaw.perTxCap, DEFAULT_POLICY.budget.perTxCap),
      currency:
        typeof budgetRaw.currency === "string" && budgetRaw.currency.trim().length > 0
          ? budgetRaw.currency.trim()
          : DEFAULT_POLICY.budget.currency,
    },
    scope: {
      allowedContracts: parseStringArray(scopeRaw.allowedContracts),
      allowedMethods: parseStringArray(scopeRaw.allowedMethods),
      allowedTools: parseStringArray(scopeRaw.allowedTools),
      allowedChains: parseAllowedChains(scopeRaw.allowedChains),
    },
    autoPay: {
      enabled:
        typeof autoPayRaw.enabled === "boolean"
          ? autoPayRaw.enabled
          : DEFAULT_POLICY.autoPay.enabled,
      maxRetries,
      maxAutoPayPerRequest: parseCap(autoPayRaw.maxAutoPayPerRequest, "0"),
    },
    ttl:
      notBefore || notAfter
        ? {
            notBefore,
            notAfter,
          }
        : undefined,
  };
}

export function resolveWalletPolicyConfig(raw?: unknown): WalletPolicyConfig {
  if (!isObject(raw)) {
    return { ...DEFAULT_POLICY_CONFIG };
  }

  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_POLICY_CONFIG.enabled;

  return {
    enabled,
    policyPath: typeof raw.policyPath === "string" ? raw.policyPath : undefined,
    decisionLogPath: typeof raw.decisionLogPath === "string" ? raw.decisionLogPath : undefined,
    inlinePolicy: raw.inlinePolicy ? normalizePolicy(raw.inlinePolicy) : undefined,
  };
}

export async function loadPolicy(config: WalletPolicyConfig): Promise<LoadedWalletPolicy> {
  if (!config.enabled) {
    return { policy: null, source: "none" };
  }

  if (config.inlinePolicy) {
    return {
      policy: normalizePolicy(config.inlinePolicy),
      source: "inline",
    };
  }

  if (!config.policyPath || config.policyPath.trim().length === 0) {
    return { policy: null, source: "none" };
  }

  try {
    const raw = await fs.readFile(config.policyPath, "utf8");
    return {
      policy: normalizePolicy(JSON.parse(raw) as unknown),
      source: "file",
    };
  } catch {
    return { policy: null, source: "none" };
  }
}

function buildDecision(params: {
  action: PolicyAction;
  result: "approved" | "rejected";
  reasonCode: PolicyReasonCode;
  now: Date;
  metadata?: Record<string, unknown>;
}): PolicyDecision {
  return {
    decisionId: randomUUID(),
    timestamp: params.now.toISOString(),
    action: params.action,
    result: params.result,
    reasonCode: params.reasonCode,
    metadata: params.metadata,
  };
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function hasDenyByAllowlist(
  allowlist: string[] | undefined,
  value: string | undefined,
  options?: { denyWhenMissing?: boolean },
): boolean {
  if (!allowlist || allowlist.length === 0) {
    return false;
  }
  if (!value) {
    return options?.denyWhenMissing ?? false;
  }
  const needle = normalizeAddress(value);
  return !allowlist.some((candidate) => normalizeAddress(candidate) === needle);
}

function parseIso(value: string | undefined): Date | null {
  if (!value || value.length === 0) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asBigInt(value: string): bigint {
  return BigInt(value);
}

export function checkPolicy(
  policy: WalletPolicy | null,
  intent: PolicyIntent,
  context?: PolicyCheckContext,
): PolicyDecision {
  const now = context?.now ?? new Date();

  if (!policy) {
    return buildDecision({
      action: intent.action,
      result: "rejected",
      reasonCode: "policy_missing",
      now,
    });
  }

  try {
    const ttl = policy.ttl;
    if (ttl) {
      const notBefore = parseIso(ttl.notBefore);
      const notAfter = parseIso(ttl.notAfter);
      if ((notBefore && now < notBefore) || (notAfter && now > notAfter)) {
        return buildDecision({
          action: intent.action,
          result: "rejected",
          reasonCode: "ttl_expired",
          now,
        });
      }
    }

    const allowedChains = policy.scope.allowedChains;
    if (allowedChains && allowedChains.length > 0 && !allowedChains.includes(intent.chain)) {
      return buildDecision({
        action: intent.action,
        result: "rejected",
        reasonCode: "scope_chain_denied",
        now,
        metadata: { chain: intent.chain },
      });
    }

    if (hasDenyByAllowlist(policy.scope.allowedTools, intent.tool, { denyWhenMissing: true })) {
      return buildDecision({
        action: intent.action,
        result: "rejected",
        reasonCode: "scope_tool_denied",
        now,
        metadata: { tool: intent.tool },
      });
    }

    if (
      hasDenyByAllowlist(policy.scope.allowedContracts, intent.to, {
        denyWhenMissing: intent.action === "send",
      })
    ) {
      return buildDecision({
        action: intent.action,
        result: "rejected",
        reasonCode: "scope_contract_denied",
        now,
        metadata: { to: intent.to },
      });
    }

    if (
      hasDenyByAllowlist(policy.scope.allowedMethods, intent.method, {
        denyWhenMissing: intent.action === "send",
      })
    ) {
      return buildDecision({
        action: intent.action,
        result: "rejected",
        reasonCode: "scope_method_denied",
        now,
        metadata: { method: intent.method },
      });
    }

    if (typeof intent.amount === "bigint") {
      const perTxCap = asBigInt(policy.budget.perTxCap);
      if (intent.amount > perTxCap) {
        return buildDecision({
          action: intent.action,
          result: "rejected",
          reasonCode: "budget_per_tx_exceeded",
          now,
          metadata: {
            amount: intent.amount.toString(),
            perTxCap: policy.budget.perTxCap,
          },
        });
      }

      const dailySpent = context?.dailySpent ?? 0n;
      const dailyCap = asBigInt(policy.budget.dailyCap);
      if (dailySpent + intent.amount > dailyCap) {
        return buildDecision({
          action: intent.action,
          result: "rejected",
          reasonCode: "budget_daily_exceeded",
          now,
          metadata: {
            amount: intent.amount.toString(),
            dailySpent: dailySpent.toString(),
            dailyCap: policy.budget.dailyCap,
          },
        });
      }
    }

    return buildDecision({
      action: intent.action,
      result: "approved",
      reasonCode: "approved",
      now,
    });
  } catch {
    return buildDecision({
      action: intent.action,
      result: "rejected",
      reasonCode: "internal_error",
      now,
    });
  }
}

export async function appendPolicyDecisionLog(
  decisionLogPath: string | undefined,
  decision: PolicyDecision,
): Promise<void> {
  if (!decisionLogPath || decisionLogPath.trim().length === 0) {
    return;
  }

  const line = `${JSON.stringify(decision)}\n`;
  await fs.appendFile(decisionLogPath, line, "utf8");
}
