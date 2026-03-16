import type { PluginCommandHandler } from "openclaw/plugin-sdk/plugin-command";
import { ErrorCode } from "../errors/codes.js";
import { MarketAssistant, type MarketAssistantRuntime } from "../market-assistant.js";
import { formatGatewayError } from "./handlers/_shared.js";

type CallGatewayFn = (opts: {
  method: string;
  params?: unknown;
  timeoutMs?: number;
}) => Promise<unknown>;

const HOST_SRC_ROOT = new URL("../../../../src/", import.meta.url);
const HOST_DIST_ROOT = new URL("../../../../dist/", import.meta.url);

function hostSrcUrl(path: string): string {
  return new URL(path, HOST_SRC_ROOT).href;
}

function hostDistUrl(path: string): string {
  return new URL(path, HOST_DIST_ROOT).href;
}

async function loadCallGateway(): Promise<CallGatewayFn> {
  try {
    const mod = await import(hostSrcUrl("gateway/call.ts"));
    if (typeof mod.callGateway === "function") {
      return mod.callGateway as CallGatewayFn;
    }
  } catch (err) {
    // Ignore source import failure and fallback to dist. Keep the debug note so
    // local troubleshooting can still explain why the fallback path was needed.
    if (process.env.DEBUG_MARKET) {
      console.warn("market-assistant: source import failed, trying dist...", err);
    }
  }

  const mod = await import(hostDistUrl("gateway/call.js"));
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
    const record = payload as { ok?: boolean; error?: string; result?: unknown };
    if (record.ok === false) {
      return { ok: false, error: record.error ?? "gateway call failed" };
    }
    return {
      ok: true,
      result: "result" in record ? record.result : payload,
    };
  }
  return { ok: true, result: payload };
}

function buildRuntime(): MarketAssistantRuntime {
  return {
    callGatewayMethod: async <T = unknown>(method: string, params?: Record<string, unknown>) => {
      const callGateway = await loadCallGateway();
      const raw = await callGateway({ method, params });
      const normalized = normalizeGatewayResult(raw);
      if (!normalized.ok) {
        throw new Error(normalized.error ?? "gateway call failed");
      }
      return (normalized.result ?? {}) as T;
    },
  };
}

function normalizeCommandMessage(raw: string, senderId?: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/actorId\s*[=:]/i.test(trimmed)) return trimmed;
  if (typeof senderId === "string" && /^0x[a-fA-F0-9]{40}$/.test(senderId)) {
    return `${trimmed} actorId=${senderId}`;
  }
  return trimmed;
}

export function createMarketAssistantCommand(): PluginCommandHandler {
  return async (ctx) => {
    const input = (ctx.args ?? "").trim();
    if (!input) {
      return {
        text: [
          "Usage: /market-assistant <message>",
          "示例: /market-assistant actorId=0x... 帮我查看今天收入",
        ].join("\n"),
      };
    }

    try {
      const assistant = new MarketAssistant(buildRuntime());
      const message = normalizeCommandMessage(input, ctx.senderId);
      const text = await assistant.handleUserMessage(message);
      return { text };
    } catch (err) {
      const code = formatGatewayError(err, ErrorCode.E_INTERNAL);
      return { text: `❌ 市场助手执行失败（${code}）` };
    }
  };
}
