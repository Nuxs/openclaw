import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import { ErrorCode } from "../errors/codes.js";

type AgentToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
};

type GatewayCallResult = {
  ok?: boolean;
  error?: string;
  result?: unknown;
};

type CallGatewayFn = (opts: {
  method: string;
  params?: unknown;
  timeoutMs?: number;
}) => Promise<unknown>;

async function loadCallGateway(): Promise<CallGatewayFn> {
  try {
    const mod = await import("../../../../src/gateway/call.ts");
    if (typeof mod.callGateway === "function") {
      return mod.callGateway as CallGatewayFn;
    }
  } catch {
    // ignore
  }

  // @ts-expect-error — dist fallback only exists after build; unreachable when src import succeeds
  const mod = await import("../../../../dist/gateway/call.js");
  if (typeof mod.callGateway !== "function") {
    throw new Error("callGateway is not available");
  }
  return mod.callGateway as CallGatewayFn;
}

function normalizeGatewayResult(payload: unknown): {
  ok: boolean;
  result?: unknown;
  error?: string;
} {
  if (payload && typeof payload === "object") {
    const record = payload as GatewayCallResult;
    if (record.ok === false) {
      return { ok: false, error: record.error ?? "gateway call failed" };
    }
    const result = "result" in record ? record.result : payload;
    return { ok: true, result };
  }
  return { ok: true, result: payload };
}

function jsonResult(payload: unknown): AgentToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

import { redactUnknown } from "../utils/redact.js";

async function callGatewayMethod(config: Web3PluginConfig, method: string, params?: unknown) {
  const callGateway = await loadCallGateway();
  const response = await callGateway({
    method,
    params,
    timeoutMs: config.brain.timeoutMs,
  });
  const normalized = normalizeGatewayResult(response);
  if (!normalized.ok) {
    return { ok: false, error: formatWeb3GatewayErrorResponse(normalized.error) };
  }
  return normalized;
}

function safeResult(payload: unknown): AgentToolResult {
  return jsonResult(redactUnknown(payload));
}

function errorResult(err: unknown, details?: Record<string, unknown>): AgentToolResult {
  return safeResult(formatWeb3GatewayErrorResponse(err, ErrorCode.E_INTERNAL, details));
}

const IndexListSchema = Type.Object(
  {
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
  },
  { additionalProperties: false },
);

type IndexListParams = { limit?: number };

export function createWeb3MarketIndexListTool(config: Web3PluginConfig): AnyAgentTool | null {
  if (!config.resources.enabled) {
    return null;
  }
  return {
    name: "web3.market.index.list",
    label: "Web3 Market Index",
    description:
      "List discoverable Web3 market resources (redacted; does not expose provider endpoints).",
    parameters: IndexListSchema,
    execute: async (_toolCallId, params: IndexListParams) => {
      try {
        const limit =
          typeof params.limit === "number" && Number.isFinite(params.limit)
            ? Math.max(1, Math.min(200, Math.floor(params.limit)))
            : 50;
        const result = await callGatewayMethod(config, "web3.index.list", { limit });
        return safeResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  } as AnyAgentTool;
}

const LeaseSchema = Type.Object(
  {
    resourceId: Type.String({ description: "Resource ID to lease." }),
    // Optional metadata; passed through to web3.resources.lease.
    sessionKey: Type.Optional(Type.String({ description: "Session key for settlement tagging." })),
    consumerActorId: Type.Optional(Type.String({ description: "Consumer actor ID (payer)." })),
    actorId: Type.Optional(Type.String({ description: "Optional actor id for access policies." })),
    providerEndpoint: Type.Optional(
      Type.String({ description: "Optional provider endpoint override (will not be returned)." }),
    ),
  },
  { additionalProperties: false },
);

type LeaseParams = {
  resourceId: string;
  sessionKey?: string;
  consumerActorId?: string;
  actorId?: string;
  providerEndpoint?: string;
};

export function createWeb3MarketLeaseTool(config: Web3PluginConfig): AnyAgentTool | null {
  if (!config.resources.enabled || !config.resources.consumer.enabled) {
    return null;
  }
  return {
    name: "web3.market.lease",
    label: "Web3 Market Lease",
    description:
      "Lease a Web3 market resource. Stores access token internally; never returns token or endpoint.",
    parameters: LeaseSchema,
    execute: async (_toolCallId, params: LeaseParams) => {
      try {
        const resourceId = params.resourceId?.trim();
        if (!resourceId) {
          return errorResult("resourceId is required", { fields: ["resourceId"] });
        }
        const result = await callGatewayMethod(config, "web3.resources.lease", {
          ...params,
          resourceId,
        });
        return safeResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  } as AnyAgentTool;
}

const RevokeLeaseSchema = Type.Object(
  {
    leaseId: Type.String({ description: "Lease ID to revoke." }),
  },
  { additionalProperties: false },
);

type RevokeLeaseParams = { leaseId: string };

export function createWeb3MarketRevokeLeaseTool(config: Web3PluginConfig): AnyAgentTool | null {
  if (!config.resources.enabled) {
    return null;
  }
  return {
    name: "web3.market.lease.revoke",
    label: "Web3 Market Revoke Lease",
    description: "Revoke a lease and clear any cached access locally.",
    parameters: RevokeLeaseSchema,
    execute: async (_toolCallId, params: RevokeLeaseParams) => {
      try {
        const leaseId = params.leaseId?.trim();
        if (!leaseId) {
          return errorResult("leaseId is required", { fields: ["leaseId"] });
        }
        const result = await callGatewayMethod(config, "web3.resources.revokeLease", { leaseId });
        return safeResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  } as AnyAgentTool;
}

const PublishSchema = Type.Object(
  {
    resource: Type.Object(
      {},
      {
        additionalProperties: true,
        description:
          "Resource fields for market.resource.publish (passed through via web3.resources.publish). Do not include secrets in this object.",
      },
    ),
  },
  { additionalProperties: false },
);

type PublishParams = { resource: Record<string, unknown> };

export function createWeb3MarketPublishTool(config: Web3PluginConfig): AnyAgentTool | null {
  if (!config.resources.enabled || !config.resources.advertiseToMarket) {
    return null;
  }
  return {
    name: "web3.market.resource.publish",
    label: "Web3 Market Publish",
    description:
      "Publish a resource to the Web3 market (seller/provider flow). Outputs are redacted.",
    parameters: PublishSchema,
    execute: async (_toolCallId, params: PublishParams) => {
      try {
        const resource = params.resource;
        if (!resource || typeof resource !== "object") {
          return errorResult("resource is required", { fields: ["resource"] });
        }
        const result = await callGatewayMethod(config, "web3.resources.publish", resource);
        return safeResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  } as AnyAgentTool;
}

const UnpublishSchema = Type.Object(
  {
    resourceId: Type.String({ description: "Resource ID to unpublish." }),
  },
  { additionalProperties: false },
);

type UnpublishParams = { resourceId: string };

export function createWeb3MarketUnpublishTool(config: Web3PluginConfig): AnyAgentTool | null {
  if (!config.resources.enabled || !config.resources.advertiseToMarket) {
    return null;
  }
  return {
    name: "web3.market.resource.unpublish",
    label: "Web3 Market Unpublish",
    description: "Unpublish a resource from the Web3 market (seller/provider flow).",
    parameters: UnpublishSchema,
    execute: async (_toolCallId, params: UnpublishParams) => {
      try {
        const resourceId = params.resourceId?.trim();
        if (!resourceId) {
          return errorResult("resourceId is required", { fields: ["resourceId"] });
        }
        const result = await callGatewayMethod(config, "web3.resources.unpublish", { resourceId });
        return safeResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  } as AnyAgentTool;
}

const LedgerListSchema = Type.Object(
  {
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
    resourceId: Type.Optional(Type.String()),
    leaseId: Type.Optional(Type.String()),
    providerActorId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type LedgerListParams = {
  limit?: number;
  resourceId?: string;
  leaseId?: string;
  providerActorId?: string;
};

export function createWeb3MarketLedgerListTool(config: Web3PluginConfig): AnyAgentTool | null {
  if (!config.resources.enabled) {
    return null;
  }
  return {
    name: "web3.market.ledger.list",
    label: "Web3 Market Ledger List",
    description: "List recent ledger entries (provider-authored) for auditing.",
    parameters: LedgerListSchema,
    execute: async (_toolCallId, params: LedgerListParams) => {
      try {
        const limit =
          typeof params.limit === "number" && Number.isFinite(params.limit)
            ? Math.max(1, Math.min(100, Math.floor(params.limit)))
            : 20;
        const result = await callGatewayMethod(config, "web3.market.ledger.list", {
          ...params,
          limit,
        });
        return safeResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  } as AnyAgentTool;
}

const LedgerSummarySchema = Type.Object({}, { additionalProperties: false });

export function createWeb3MarketLedgerSummaryTool(config: Web3PluginConfig): AnyAgentTool | null {
  if (!config.resources.enabled) {
    return null;
  }
  return {
    name: "web3.market.ledger.summary",
    label: "Web3 Market Ledger Summary",
    description: "Get ledger summary counts and totals.",
    parameters: LedgerSummarySchema,
    execute: async () => {
      try {
        const result = await callGatewayMethod(config, "web3.market.ledger.summary", {});
        return safeResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  } as AnyAgentTool;
}
