import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/core";
import type { Web3PluginConfig } from "../config.js";
import { loadCallGateway, normalizeGatewayResult } from "../core-imports.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import { ErrorCode } from "../errors/codes.js";
import { redactUnknown } from "../utils/redact.js";

type AgentToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
};

function jsonResult(payload: unknown): AgentToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

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
    actorId: Type.String({ description: "Actor ID authorizing the lease request." }),
    consumerActorId: Type.String({ description: "Consumer actor ID (payer)." }),
    ttlMs: Type.Number({
      minimum: 10_000,
      maximum: 604_800_000,
      description: "Lease duration in milliseconds.",
    }),
    maxCost: Type.Optional(
      Type.String({ description: "Optional max cost as a numeric string, decimals allowed." }),
    ),
    // Optional metadata; passed through to web3.resources.lease.
    sessionKey: Type.Optional(Type.String({ description: "Session key for settlement tagging." })),
    providerEndpoint: Type.Optional(
      Type.String({ description: "Optional provider endpoint override (will not be returned)." }),
    ),
  },
  { additionalProperties: false },
);

type LeaseParams = {
  resourceId: string;
  actorId: string;
  consumerActorId: string;
  ttlMs: number;
  maxCost?: string;
  sessionKey?: string;
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
        const actorId = params.actorId?.trim();
        const consumerActorId = params.consumerActorId?.trim();
        if (!resourceId || !actorId || !consumerActorId) {
          return errorResult("resourceId, actorId, and consumerActorId are required", {
            fields: ["resourceId", "actorId", "consumerActorId"],
          });
        }
        const result = await callGatewayMethod(config, "web3.resources.lease", {
          ...params,
          resourceId,
          actorId,
          consumerActorId,
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
    actorId: Type.String({ description: "Actor ID authorizing the revocation." }),
    leaseId: Type.String({ description: "Lease ID to revoke." }),
    reason: Type.Optional(Type.String({ description: "Optional revocation reason." })),
  },
  { additionalProperties: false },
);

type RevokeLeaseParams = { actorId: string; leaseId: string; reason?: string };

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
        const actorId = params.actorId?.trim();
        const leaseId = params.leaseId?.trim();
        if (!actorId || !leaseId) {
          return errorResult("actorId and leaseId are required", {
            fields: ["actorId", "leaseId"],
          });
        }
        const result = await callGatewayMethod(config, "web3.resources.revokeLease", {
          ...params,
          actorId,
          leaseId,
        });
        return safeResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  } as AnyAgentTool;
}

const PublishSchema = Type.Object(
  {
    actorId: Type.String({ description: "Provider actor ID publishing the resource." }),
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

type PublishParams = { actorId: string; resource: Record<string, unknown> };

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
        const actorId = params.actorId?.trim();
        const resource = params.resource;
        if (!actorId || !resource || typeof resource !== "object") {
          return errorResult("actorId and resource are required", {
            fields: ["actorId", "resource"],
          });
        }
        const result = await callGatewayMethod(config, "web3.resources.publish", {
          actorId,
          resource,
        });
        return safeResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  } as AnyAgentTool;
}

const UnpublishSchema = Type.Object(
  {
    actorId: Type.String({ description: "Provider actor ID unpublishing the resource." }),
    resourceId: Type.String({ description: "Resource ID to unpublish." }),
  },
  { additionalProperties: false },
);

type UnpublishParams = { actorId: string; resourceId: string };

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
        const actorId = params.actorId?.trim();
        const resourceId = params.resourceId?.trim();
        if (!actorId || !resourceId) {
          return errorResult("actorId and resourceId are required", {
            fields: ["actorId", "resourceId"],
          });
        }
        const result = await callGatewayMethod(config, "web3.resources.unpublish", {
          actorId,
          resourceId,
        });
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
