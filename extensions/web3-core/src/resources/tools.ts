import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
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

function jsonResult(payload: unknown): AgentToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
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
          return jsonResult({ error: "resources consumer disabled" });
        }
        const resourceId = params.resourceId?.trim();
        const query = params.q?.trim();
        if (!resourceId || !query) {
          return jsonResult({ error: "resourceId and q are required" });
        }

        const lease = getConsumerLeaseAccess(resourceId);
        if (!lease) {
          return jsonResult({ error: "no active lease for resource" });
        }

        const endpoint = lease.providerEndpoint?.trim() || config.brain.endpoint?.trim();
        if (!endpoint) {
          return jsonResult({ error: "provider endpoint not configured" });
        }

        const url = new URL(`${normalizeBaseUrl(endpoint)}/web3/resources/search/query`);
        const body = {
          q: query,
          limit: params.limit,
          site: params.site,
        };

        const response = await fetch(url.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lease.accessToken}`,
            "X-OpenClaw-Lease": lease.leaseId,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const text = await response.text();
          return jsonResult({
            error: `provider_error_${response.status}`,
            message: text || response.statusText,
          });
        }

        const payload = (await response.json()) as { results?: unknown };
        return jsonResult(payload);
      } catch (err) {
        return jsonResult({ error: err instanceof Error ? err.message : String(err) });
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

function resolveProviderEndpoint(config: Web3PluginConfig, resourceId: string) {
  const lease = getConsumerLeaseAccess(resourceId);
  if (!lease) return { error: "no active lease for resource" } as const;
  const endpoint = lease.providerEndpoint?.trim() || config.brain.endpoint?.trim();
  if (!endpoint) return { error: "provider endpoint not configured" } as const;
  return { lease, endpoint: normalizeBaseUrl(endpoint) } as const;
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
          return jsonResult({ error: "resourceId, path, bytesBase64 are required" });
        }

        const resolved = resolveProviderEndpoint(config, resourceId);
        if ("error" in resolved) {
          return jsonResult({ error: resolved.error });
        }

        const url = new URL(`${resolved.endpoint}/web3/resources/storage/put`);
        const response = await fetch(url.toString(), {
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
        });

        if (!response.ok) {
          const text = await response.text();
          return jsonResult({
            error: `provider_error_${response.status}`,
            message: text || response.statusText,
          });
        }

        const payload = (await response.json()) as unknown;
        return jsonResult(payload);
      } catch (err) {
        return jsonResult({ error: err instanceof Error ? err.message : String(err) });
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
          return jsonResult({ error: "resourceId and path are required" });
        }

        const resolved = resolveProviderEndpoint(config, resourceId);
        if ("error" in resolved) {
          return jsonResult({ error: resolved.error });
        }

        const url = new URL(`${resolved.endpoint}/web3/resources/storage/get`);
        url.searchParams.set("path", path);
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${resolved.lease.accessToken}`,
            "X-OpenClaw-Lease": resolved.lease.leaseId,
          },
        });

        if (!response.ok) {
          const text = await response.text();
          return jsonResult({
            error: `provider_error_${response.status}`,
            message: text || response.statusText,
          });
        }

        const payload = (await response.json()) as unknown;
        return jsonResult(payload);
      } catch (err) {
        return jsonResult({ error: err instanceof Error ? err.message : String(err) });
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
          return jsonResult({ error: "resourceId is required" });
        }

        const resolved = resolveProviderEndpoint(config, resourceId);
        if ("error" in resolved) {
          return jsonResult({ error: resolved.error });
        }

        const url = new URL(`${resolved.endpoint}/web3/resources/storage/list`);
        const response = await fetch(url.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resolved.lease.accessToken}`,
            "X-OpenClaw-Lease": resolved.lease.leaseId,
          },
          body: JSON.stringify({ prefix: params.prefix, limit: params.limit }),
        });

        if (!response.ok) {
          const text = await response.text();
          return jsonResult({
            error: `provider_error_${response.status}`,
            message: text || response.statusText,
          });
        }

        const payload = (await response.json()) as unknown;
        return jsonResult(payload);
      } catch (err) {
        return jsonResult({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  } as AnyAgentTool;
}
