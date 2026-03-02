import { Type } from "@sinclair/typebox";
import { fetchWithSsrFGuard, type AnyAgentTool } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import { ErrorCode, ERROR_CODE_DESCRIPTIONS } from "../errors/codes.js";
import { redactUnknown } from "../utils/redact.js";
import { getConsumerLeaseAccess } from "./leases.js";

const Web3SearchSchema = Type.Object(
  {
    resourceId: Type.String({ description: "Resource ID (search offer id)." }),
    q: Type.String({ description: "Search query string." }),
    limit: Type.Optional(
      Type.Number({
        description: "Max results to return (1-20).",
        minimum: 1,
        maximum: 20,
      }),
    ),
    site: Type.Optional(Type.String({ description: "Optional site filter (domain or URL)." })),
  },
  { additionalProperties: false },
);

type Web3SearchParams = {
  resourceId: string;
  q: string;
  limit?: number;
  site?: string;
};

type AgentToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
};

type ProviderEndpointResolution =
  | { lease: NonNullable<ReturnType<typeof getConsumerLeaseAccess>>; endpoint: string }
  | { error: ErrorCode; reason: string };

function jsonResult(payload: unknown): AgentToolResult {
  const safePayload = redactUnknown(payload);
  return {
    content: [{ type: "text", text: JSON.stringify(safePayload, null, 2) }],
    details: safePayload,
  };
}

function errorResult(code: ErrorCode, details?: Record<string, unknown>): AgentToolResult {
  const message = ERROR_CODE_DESCRIPTIONS[code] ?? "An internal error occurred.";
  return jsonResult({
    error: code,
    message,
    details: details && Object.keys(details).length > 0 ? details : undefined,
  });
}

function errorFromStatus(status: number, details?: Record<string, unknown>): AgentToolResult {
  switch (status) {
    case 400:
      return errorResult(ErrorCode.E_INVALID_ARGUMENT, details);
    case 401:
      return errorResult(ErrorCode.E_AUTH_REQUIRED, details);
    case 403:
      return errorResult(ErrorCode.E_FORBIDDEN, details);
    case 404:
      return errorResult(ErrorCode.E_NOT_FOUND, details);
    case 409:
      return errorResult(ErrorCode.E_CONFLICT, details);
    case 410:
      return errorResult(ErrorCode.E_EXPIRED, details);
    case 429:
      return errorResult(ErrorCode.E_QUOTA_EXCEEDED, details);
    case 503:
      return errorResult(ErrorCode.E_UNAVAILABLE, details);
    case 504:
      return errorResult(ErrorCode.E_TIMEOUT, details);
    default:
      return errorResult(ErrorCode.E_INTERNAL, details);
  }
}

function errorFromException(err: unknown, details?: Record<string, unknown>): AgentToolResult {
  return jsonResult(formatWeb3GatewayErrorResponse(err, ErrorCode.E_INTERNAL, details));
}

function normalizeBaseUrl(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

export function createWeb3SearchTool(config: Web3PluginConfig): AnyAgentTool | null {
  if (!config.resources.enabled || !config.resources.consumer.enabled) {
    return null;
  }

  return {
    name: "web3.search.query",
    label: "Web3 Search",
    description: "Query a leased Web3 search resource and return results from the provider.",
    parameters: Web3SearchSchema,
    execute: async (_toolCallId, params: Web3SearchParams) => {
      try {
        if (!config.resources.enabled || !config.resources.consumer.enabled) {
          return errorResult(ErrorCode.E_FORBIDDEN, { reason: "resources consumer disabled" });
        }
        const resourceId = params.resourceId?.trim();
        const query = params.q?.trim();
        if (!resourceId || !query) {
          return errorResult(ErrorCode.E_INVALID_ARGUMENT, { fields: ["resourceId", "q"] });
        }

        const lease = getConsumerLeaseAccess(resourceId);
        if (!lease) {
          return errorResult(ErrorCode.E_NOT_FOUND, { reason: "no active lease for resource" });
        }

        const endpoint = lease.providerEndpoint?.trim() || config.brain.endpoint?.trim();
        if (!endpoint) {
          return errorResult(ErrorCode.E_INVALID_ARGUMENT, {
            reason: "provider endpoint not configured",
          });
        }

        const url = new URL(`${normalizeBaseUrl(endpoint)}/web3/resources/search/query`);
        const body = {
          q: query,
          limit: params.limit,
          site: params.site,
        };

        const { response, release } = await fetchWithSsrFGuard({
          url: url.toString(),
          init: {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${lease.accessToken}`,
              "X-OpenClaw-Lease": lease.leaseId,
            },
            body: JSON.stringify(body),
          },
          auditContext: "web3-tool-search-query",
        });

        try {
          if (!response.ok) {
            return errorFromStatus(response.status, { status: response.status });
          }

          const payload = (await response.json()) as { results?: unknown };
          return jsonResult(payload);
        } finally {
          await release();
        }
      } catch (err) {
        return errorFromException(err);
      }
    },
  } as AnyAgentTool;
}

const Web3StoragePutSchema = Type.Object(
  {
    resourceId: Type.String({ description: "Resource ID (storage offer id)." }),
    path: Type.String({ description: "Virtual path (relative, no absolute paths)." }),
    bytesBase64: Type.String({ description: "Payload in base64." }),
    mime: Type.Optional(Type.String({ description: "Optional MIME type." })),
  },
  { additionalProperties: false },
);

const Web3StorageGetSchema = Type.Object(
  {
    resourceId: Type.String({ description: "Resource ID (storage offer id)." }),
    path: Type.String({ description: "Virtual path to read." }),
  },
  { additionalProperties: false },
);

const Web3StorageListSchema = Type.Object(
  {
    resourceId: Type.String({ description: "Resource ID (storage offer id)." }),
    prefix: Type.Optional(Type.String({ description: "Optional prefix filter." })),
    limit: Type.Optional(
      Type.Number({ description: "Max results to return (1-200).", minimum: 1, maximum: 200 }),
    ),
  },
  { additionalProperties: false },
);

type Web3StoragePutParams = {
  resourceId: string;
  path: string;
  bytesBase64: string;
  mime?: string;
};

type Web3StorageGetParams = {
  resourceId: string;
  path: string;
};

type Web3StorageListParams = {
  resourceId: string;
  prefix?: string;
  limit?: number;
};

function resolveProviderEndpoint(
  config: Web3PluginConfig,
  resourceId: string,
): ProviderEndpointResolution {
  const lease = getConsumerLeaseAccess(resourceId);
  if (!lease) {
    return { error: ErrorCode.E_NOT_FOUND, reason: "no active lease for resource" };
  }
  const endpoint = lease.providerEndpoint?.trim() || config.brain.endpoint?.trim();
  if (!endpoint) {
    return { error: ErrorCode.E_INVALID_ARGUMENT, reason: "provider endpoint not configured" };
  }
  return { lease, endpoint: normalizeBaseUrl(endpoint) };
}

export function createWeb3StoragePutTool(config: Web3PluginConfig): AnyAgentTool | null {
  if (!config.resources.enabled || !config.resources.consumer.enabled) {
    return null;
  }

  return {
    name: "web3.storage.put",
    label: "Web3 Storage Put",
    description: "Write bytes to a leased Web3 storage resource.",
    parameters: Web3StoragePutSchema,
    execute: async (_toolCallId, params: Web3StoragePutParams) => {
      try {
        const resourceId = params.resourceId?.trim();
        const path = params.path?.trim();
        if (!resourceId || !path || !params.bytesBase64) {
          return errorResult(ErrorCode.E_INVALID_ARGUMENT, {
            fields: ["resourceId", "path", "bytesBase64"],
          });
        }

        const resolved = resolveProviderEndpoint(config, resourceId);
        if ("error" in resolved) {
          return errorResult(resolved.error, { reason: resolved.reason });
        }

        const url = new URL(`${resolved.endpoint}/web3/resources/storage/put`);
        const { response, release } = await fetchWithSsrFGuard({
          url: url.toString(),
          init: {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resolved.lease.accessToken}`,
              "X-OpenClaw-Lease": resolved.lease.leaseId,
            },
            body: JSON.stringify({
              path,
              bytesBase64: params.bytesBase64,
              mime: params.mime,
            }),
          },
          auditContext: "web3-tool-storage-put",
        });

        try {
          if (!response.ok) {
            return errorFromStatus(response.status, { status: response.status });
          }

          const payload = (await response.json()) as unknown;
          return jsonResult(payload);
        } finally {
          await release();
        }
      } catch (err) {
        return errorFromException(err);
      }
    },
  } as AnyAgentTool;
}

export function createWeb3StorageGetTool(config: Web3PluginConfig): AnyAgentTool | null {
  if (!config.resources.enabled || !config.resources.consumer.enabled) {
    return null;
  }

  return {
    name: "web3.storage.get",
    label: "Web3 Storage Get",
    description: "Read bytes from a leased Web3 storage resource.",
    parameters: Web3StorageGetSchema,
    execute: async (_toolCallId, params: Web3StorageGetParams) => {
      try {
        const resourceId = params.resourceId?.trim();
        const path = params.path?.trim();
        if (!resourceId || !path) {
          return errorResult(ErrorCode.E_INVALID_ARGUMENT, { fields: ["resourceId", "path"] });
        }

        const resolved = resolveProviderEndpoint(config, resourceId);
        if ("error" in resolved) {
          return errorResult(resolved.error, { reason: resolved.reason });
        }

        const url = new URL(`${resolved.endpoint}/web3/resources/storage/get`);
        url.searchParams.set("path", path);
        const { response, release } = await fetchWithSsrFGuard({
          url: url.toString(),
          init: {
            method: "GET",
            headers: {
              Authorization: `Bearer ${resolved.lease.accessToken}`,
              "X-OpenClaw-Lease": resolved.lease.leaseId,
            },
          },
          auditContext: "web3-tool-storage-get",
        });

        try {
          if (!response.ok) {
            return errorFromStatus(response.status, { status: response.status });
          }

          const payload = (await response.json()) as unknown;
          return jsonResult(payload);
        } finally {
          await release();
        }
      } catch (err) {
        return errorFromException(err);
      }
    },
  } as AnyAgentTool;
}

export function createWeb3StorageListTool(config: Web3PluginConfig): AnyAgentTool | null {
  if (!config.resources.enabled || !config.resources.consumer.enabled) {
    return null;
  }

  return {
    name: "web3.storage.list",
    label: "Web3 Storage List",
    description: "List items in a leased Web3 storage resource.",
    parameters: Web3StorageListSchema,
    execute: async (_toolCallId, params: Web3StorageListParams) => {
      try {
        const resourceId = params.resourceId?.trim();
        if (!resourceId) {
          return errorResult(ErrorCode.E_INVALID_ARGUMENT, { fields: ["resourceId"] });
        }

        const resolved = resolveProviderEndpoint(config, resourceId);
        if ("error" in resolved) {
          return errorResult(resolved.error, { reason: resolved.reason });
        }

        const url = new URL(`${resolved.endpoint}/web3/resources/storage/list`);
        const { response, release } = await fetchWithSsrFGuard({
          url: url.toString(),
          init: {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resolved.lease.accessToken}`,
              "X-OpenClaw-Lease": resolved.lease.leaseId,
            },
            body: JSON.stringify({ prefix: params.prefix, limit: params.limit }),
          },
          auditContext: "web3-tool-storage-list",
        });

        try {
          if (!response.ok) {
            return errorFromStatus(response.status, { status: response.status });
          }

          const payload = (await response.json()) as unknown;
          return jsonResult(payload);
        } finally {
          await release();
        }
      } catch (err) {
        return errorFromException(err);
      }
    },
  } as AnyAgentTool;
}
