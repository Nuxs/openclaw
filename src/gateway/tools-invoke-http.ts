import type { IncomingMessage, ServerResponse } from "node:http";
import { createOpenClawTools } from "../agents/openclaw-tools.js";
import {
  resolveEffectiveToolPolicy,
  resolveGroupToolPolicy,
  resolveSubagentToolPolicy,
} from "../agents/pi-tools.policy.js";
import {
  applyToolPolicyPipeline,
  buildDefaultToolPolicyPipelineSteps,
} from "../agents/tool-policy-pipeline.js";
import {
  collectExplicitAllowlist,
  mergeAlsoAllowPolicy,
  resolveToolProfilePolicy,
} from "../agents/tool-policy.js";
import { ToolInputError } from "../agents/tools/common.js";
import { loadConfig } from "../config/config.js";
import { resolveMainSessionKey } from "../config/sessions.js";
import { logWarn } from "../logger.js";
import { isTestDefaultMemorySlotDisabled } from "../plugins/config-state.js";
import { getPluginToolMeta } from "../plugins/tools.js";
import { isSubagentSessionKey } from "../routing/session-key.js";
import { DEFAULT_GATEWAY_HTTP_TOOL_DENY } from "../security/dangerous-tools.js";
import { normalizeMessageChannel } from "../utils/message-channel.js";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import { authorizeHttpGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import { callGateway } from "./call.js";
import {
  readJsonBodyOrError,
  sendGatewayAuthFailure,
  sendInvalidRequest,
  sendJson,
  sendMethodNotAllowed,
} from "./http-common.js";
import { getBearerToken, getHeader } from "./http-utils.js";

const DEFAULT_BODY_BYTES = 2 * 1024 * 1024;
const MEMORY_TOOL_NAMES = new Set(["memory_search", "memory_get"]);

type ToolsInvokeBody = {
  tool?: unknown;
  action?: unknown;
  args?: unknown;
  sessionKey?: unknown;
  dryRun?: unknown;
};

function resolveSessionKeyFromBody(body: ToolsInvokeBody): string | undefined {
  if (typeof body.sessionKey === "string" && body.sessionKey.trim()) {
    return body.sessionKey.trim();
  }
  return undefined;
}

function resolveMemoryToolDisableReasons(cfg: ReturnType<typeof loadConfig>): string[] {
  if (!process.env.VITEST) {
    return [];
  }
  const reasons: string[] = [];
  const plugins = cfg.plugins;
  const slotRaw = plugins?.slots?.memory;
  const slotDisabled =
    slotRaw === null || (typeof slotRaw === "string" && slotRaw.trim().toLowerCase() === "none");
  const pluginsDisabled = plugins?.enabled === false;
  const defaultDisabled = isTestDefaultMemorySlotDisabled(cfg);

  if (pluginsDisabled) {
    reasons.push("plugins.enabled=false");
  }
  if (slotDisabled) {
    reasons.push(slotRaw === null ? "plugins.slots.memory=null" : 'plugins.slots.memory="none"');
  }
  if (!pluginsDisabled && !slotDisabled && defaultDisabled) {
    reasons.push("memory plugin disabled by test default");
  }
  return reasons;
}

function mergeActionIntoArgsIfSupported(params: {
  toolSchema: unknown;
  action: string | undefined;
  args: Record<string, unknown>;
}): Record<string, unknown> {
  const { toolSchema, action, args } = params;
  if (!action) {
    return args;
  }
  if (args.action !== undefined) {
    return args;
  }
  // TypeBox schemas are plain objects; many tools define an `action` property.
  const schemaObj = toolSchema as { properties?: Record<string, unknown> } | null;
  const hasAction = Boolean(
    schemaObj &&
    typeof schemaObj === "object" &&
    schemaObj.properties &&
    "action" in schemaObj.properties,
  );
  if (!hasAction) {
    return args;
  }
  return { ...args, action };
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message || String(err);
  }
  if (typeof err === "string") {
    return err;
  }
  return String(err);
}

function resolveToolInputErrorStatus(err: unknown): number | null {
  if (err instanceof ToolInputError) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number" ? status : 400;
  }
  if (typeof err !== "object" || err === null || !("name" in err)) {
    return null;
  }
  const name = (err as { name?: unknown }).name;
  if (name !== "ToolInputError" && name !== "ToolAuthorizationError") {
    return null;
  }
  const status = (err as { status?: unknown }).status;
  if (typeof status === "number") {
    return status;
  }
  return name === "ToolAuthorizationError" ? 403 : 400;
}

type PaymentRequiredContext = {
  invoice?: string;
  wwwAuthenticate?: string;
  status?: number;
};

type PaymentResumeToken = {
  invoiceId: string;
  paymentReceiptId: string;
  txHash?: string;
  chain: "evm" | "ton";
  issuedAt: string;
  expiresAt: string;
};

type PaymentRequiredResult = {
  authorization?: string;
  resumeToken?: PaymentResumeToken;
  reused?: boolean;
};

type GatewayCallResult = {
  ok?: boolean;
  error?: string;
  result?: unknown;
};

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

function resolveErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  const record = err as { status?: unknown; statusCode?: unknown; code?: unknown };
  if (typeof record.status === "number") {
    return record.status;
  }
  if (typeof record.statusCode === "number") {
    return record.statusCode;
  }
  if (typeof record.code === "number") {
    return record.code;
  }
  return undefined;
}

function resolveWwwAuthenticate(err: unknown): string | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  const record = err as {
    headers?: unknown;
    response?: { headers?: unknown };
    wwwAuthenticate?: unknown;
  };
  if (typeof record.wwwAuthenticate === "string") {
    return record.wwwAuthenticate;
  }

  const headers = record.headers ?? record.response?.headers;
  if (!headers) {
    return undefined;
  }
  if (typeof (headers as { get?: unknown }).get === "function") {
    const getter = (headers as { get: (name: string) => string | null }).get;
    return getter.call(headers, "www-authenticate") ?? undefined;
  }
  if (headers && typeof headers === "object") {
    const lower = Object.fromEntries(
      Object.entries(headers as Record<string, unknown>).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ]),
    );
    const candidate = lower["www-authenticate"] ?? lower["www_authenticate"];
    if (typeof candidate === "string") {
      return candidate;
    }
  }
  return undefined;
}

function resolvePaymentRequiredContext(err: unknown): PaymentRequiredContext | null {
  const status = resolveErrorStatus(err);
  const wwwAuthenticate = resolveWwwAuthenticate(err);
  const invoice =
    typeof (err as { invoice?: unknown })?.invoice === "string"
      ? ((err as { invoice?: string }).invoice ?? undefined)
      : undefined;

  if (status !== 402 && !wwwAuthenticate) {
    return null;
  }

  return {
    status,
    wwwAuthenticate,
    invoice,
  };
}

type X402AutopayConfig = {
  enabled: boolean;
  maxRetries: number;
};

function resolveX402AutopayConfig(cfg: ReturnType<typeof loadConfig>): X402AutopayConfig {
  const pluginConfig = cfg.plugins?.entries?.["web3-core"]?.config;
  const x402 = pluginConfig && typeof pluginConfig === "object" ? pluginConfig.x402 : undefined;
  const autopay =
    x402 && typeof x402 === "object" ? (x402 as Record<string, unknown>).autopay : undefined;

  const enabled = !(
    autopay &&
    typeof autopay === "object" &&
    (autopay as Record<string, unknown>).enabled === false
  );
  const maxRetriesRaw =
    autopay && typeof autopay === "object"
      ? (autopay as Record<string, unknown>).maxRetries
      : undefined;
  const maxRetries =
    typeof maxRetriesRaw === "number" && Number.isFinite(maxRetriesRaw)
      ? Math.max(0, Math.floor(maxRetriesRaw))
      : 1;

  return { enabled, maxRetries };
}

function extractInvoiceFromAuthenticate(header: string): string | undefined {
  const match = header.match(/\binvoice\s*=\s*"([^"]+)"/i);
  if (match?.[1]) {
    return match[1].trim();
  }
  const loose = header.match(/\binvoice\s*=\s*([^,\s]+)/i);
  if (loose?.[1]) {
    return loose[1].trim();
  }
  return undefined;
}

function applyPaymentResumeToken(params: {
  args: Record<string, unknown>;
  toolSchema: unknown;
  authorization?: string;
  resumeToken?: PaymentResumeToken;
}): Record<string, unknown> | null {
  const { args, toolSchema, authorization, resumeToken } = params;
  const schemaObj = toolSchema as { properties?: Record<string, unknown> } | null;
  const properties = schemaObj?.properties ?? {};
  const hasHeadersArg =
    args.headers && typeof args.headers === "object" && !Array.isArray(args.headers);
  const supportsHeaders = hasHeadersArg || "headers" in properties;
  const supportsResumeToken = "paymentResumeToken" in properties;

  if (authorization && supportsHeaders) {
    const headers = hasHeadersArg ? { ...(args.headers as Record<string, unknown>) } : {};
    if (!headers.authorization && !headers.Authorization) {
      headers.authorization = authorization;
    }
    return { ...args, headers };
  }

  if (resumeToken && supportsResumeToken) {
    return { ...args, paymentResumeToken: resumeToken };
  }

  return null;
}

async function tryAutoPay(params: {
  invoice: string;
  toolName: string;
  idempotencyKey?: string;
}): Promise<{ result?: PaymentRequiredResult; error?: string }> {
  try {
    const response = await callGateway({
      method: "web3.billing.handlePaymentRequired",
      params: {
        invoice: params.invoice,
        tool: params.toolName,
        idempotencyKey: params.idempotencyKey,
      },
    });
    const normalized = normalizeGatewayResult(response);
    if (!normalized.ok) {
      return { error: normalized.error ?? "payment required handler failed" };
    }
    const payload = normalized.result as PaymentRequiredResult | undefined;
    return { result: payload };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function handleToolsInvokeHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: {
    auth: ResolvedGatewayAuth;
    maxBodyBytes?: number;
    trustedProxies?: string[];
    allowRealIpFallback?: boolean;
    rateLimiter?: AuthRateLimiter;
  },
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname !== "/tools/invoke") {
    return false;
  }

  if (req.method !== "POST") {
    sendMethodNotAllowed(res, "POST");
    return true;
  }

  const cfg = loadConfig();
  const token = getBearerToken(req);
  const authResult = await authorizeHttpGatewayConnect({
    auth: opts.auth,
    connectAuth: token ? { token, password: token } : null,
    req,
    trustedProxies: opts.trustedProxies ?? cfg.gateway?.trustedProxies,
    allowRealIpFallback: opts.allowRealIpFallback ?? cfg.gateway?.allowRealIpFallback,
    rateLimiter: opts.rateLimiter,
  });
  if (!authResult.ok) {
    sendGatewayAuthFailure(res, authResult);
    return true;
  }

  const bodyUnknown = await readJsonBodyOrError(req, res, opts.maxBodyBytes ?? DEFAULT_BODY_BYTES);
  if (bodyUnknown === undefined) {
    return true;
  }
  const body = (bodyUnknown ?? {}) as ToolsInvokeBody;

  const toolName = typeof body.tool === "string" ? body.tool.trim() : "";
  if (!toolName) {
    sendInvalidRequest(res, "tools.invoke requires body.tool");
    return true;
  }

  if (process.env.VITEST && MEMORY_TOOL_NAMES.has(toolName)) {
    const reasons = resolveMemoryToolDisableReasons(cfg);
    if (reasons.length > 0) {
      const suffix = reasons.length > 0 ? ` (${reasons.join(", ")})` : "";
      sendJson(res, 400, {
        ok: false,
        error: {
          type: "invalid_request",
          message:
            `memory tools are disabled in tests${suffix}. ` +
            'Enable by setting plugins.slots.memory="memory-core" (and ensure plugins.enabled is not false).',
        },
      });
      return true;
    }
  }

  const action = typeof body.action === "string" ? body.action.trim() : undefined;

  const argsRaw = body.args;
  const args =
    argsRaw && typeof argsRaw === "object" && !Array.isArray(argsRaw)
      ? (argsRaw as Record<string, unknown>)
      : {};

  const rawSessionKey = resolveSessionKeyFromBody(body);
  const sessionKey =
    !rawSessionKey || rawSessionKey === "main" ? resolveMainSessionKey(cfg) : rawSessionKey;

  // Resolve message channel/account hints (optional headers) for policy inheritance.
  const messageChannel = normalizeMessageChannel(
    getHeader(req, "x-openclaw-message-channel") ?? "",
  );
  const accountId = getHeader(req, "x-openclaw-account-id")?.trim() || undefined;
  const agentTo = getHeader(req, "x-openclaw-message-to")?.trim() || undefined;
  const agentThreadId = getHeader(req, "x-openclaw-thread-id")?.trim() || undefined;
  const idempotencyKey = getHeader(req, "x-idempotency-key")?.trim() || undefined;

  const {
    agentId,
    globalPolicy,
    globalProviderPolicy,
    agentPolicy,
    agentProviderPolicy,
    profile,
    providerProfile,
    profileAlsoAllow,
    providerProfileAlsoAllow,
  } = resolveEffectiveToolPolicy({ config: cfg, sessionKey });
  const profilePolicy = resolveToolProfilePolicy(profile);
  const providerProfilePolicy = resolveToolProfilePolicy(providerProfile);

  const profilePolicyWithAlsoAllow = mergeAlsoAllowPolicy(profilePolicy, profileAlsoAllow);
  const providerProfilePolicyWithAlsoAllow = mergeAlsoAllowPolicy(
    providerProfilePolicy,
    providerProfileAlsoAllow,
  );
  const groupPolicy = resolveGroupToolPolicy({
    config: cfg,
    sessionKey,
    messageProvider: messageChannel ?? undefined,
    accountId: accountId ?? null,
  });
  const subagentPolicy = isSubagentSessionKey(sessionKey)
    ? resolveSubagentToolPolicy(cfg)
    : undefined;

  // Build tool list (core + plugin tools).
  const allTools = createOpenClawTools({
    agentSessionKey: sessionKey,
    agentChannel: messageChannel ?? undefined,
    agentAccountId: accountId,
    agentTo,
    agentThreadId,
    config: cfg,
    pluginToolAllowlist: collectExplicitAllowlist([
      profilePolicy,
      providerProfilePolicy,
      globalPolicy,
      globalProviderPolicy,
      agentPolicy,
      agentProviderPolicy,
      groupPolicy,
      subagentPolicy,
    ]),
  });

  const subagentFiltered = applyToolPolicyPipeline({
    // oxlint-disable-next-line typescript/no-explicit-any
    tools: allTools as any,
    // oxlint-disable-next-line typescript/no-explicit-any
    toolMeta: (tool) => getPluginToolMeta(tool as any),
    warn: logWarn,
    steps: [
      ...buildDefaultToolPolicyPipelineSteps({
        profilePolicy: profilePolicyWithAlsoAllow,
        profile,
        providerProfilePolicy: providerProfilePolicyWithAlsoAllow,
        providerProfile,
        globalPolicy,
        globalProviderPolicy,
        agentPolicy,
        agentProviderPolicy,
        groupPolicy,
        agentId,
      }),
      { policy: subagentPolicy, label: "subagent tools.allow" },
    ],
  });

  // Gateway HTTP-specific deny list — applies to ALL sessions via HTTP.
  const gatewayToolsCfg = cfg.gateway?.tools;
  const defaultGatewayDeny: string[] = DEFAULT_GATEWAY_HTTP_TOOL_DENY.filter(
    (name) => !gatewayToolsCfg?.allow?.includes(name),
  );
  const gatewayDenyNames = defaultGatewayDeny.concat(
    Array.isArray(gatewayToolsCfg?.deny) ? gatewayToolsCfg.deny : [],
  );
  const gatewayDenySet = new Set(gatewayDenyNames);
  const gatewayFiltered = subagentFiltered.filter((t) => !gatewayDenySet.has(t.name));

  const tool = gatewayFiltered.find((t) => t.name === toolName);
  if (!tool) {
    sendJson(res, 404, {
      ok: false,
      error: { type: "not_found", message: `Tool not available: ${toolName}` },
    });
    return true;
  }

  const toolArgs = mergeActionIntoArgsIfSupported({
    // oxlint-disable-next-line typescript/no-explicit-any
    toolSchema: (tool as any).parameters,
    action,
    args,
  });

  try {
    // oxlint-disable-next-line typescript/no-explicit-any
    const result = await (tool as any).execute?.(`http-${Date.now()}`, toolArgs);
    sendJson(res, 200, { ok: true, result });
  } catch (err) {
    const inputStatus = resolveToolInputErrorStatus(err);
    if (inputStatus !== null) {
      sendJson(res, inputStatus, {
        ok: false,
        error: { type: "tool_error", message: getErrorMessage(err) || "invalid tool arguments" },
      });
      return true;
    }

    const paymentRequired = resolvePaymentRequiredContext(err);
    if (paymentRequired) {
      const wwwAuthenticate = paymentRequired.wwwAuthenticate;
      const invoice =
        paymentRequired.invoice ??
        (wwwAuthenticate ? extractInvoiceFromAuthenticate(wwwAuthenticate) : undefined);

      const autoPayConfig = resolveX402AutopayConfig(cfg);
      let autoPayError: string | undefined;
      let autoPayResult: PaymentRequiredResult | undefined;
      if (!autoPayConfig.enabled) {
        autoPayError = "autopay disabled by config";
      } else if (invoice) {
        const attempt = await tryAutoPay({ invoice, toolName, idempotencyKey });
        autoPayError = attempt.error;
        autoPayResult = attempt.result;
      }

      if (autoPayResult?.authorization || autoPayResult?.resumeToken) {
        const retryArgs = applyPaymentResumeToken({
          args: toolArgs,
          // oxlint-disable-next-line typescript/no-explicit-any
          toolSchema: (tool as any).parameters,
          authorization: autoPayResult.authorization,
          resumeToken: autoPayResult.resumeToken,
        });

        if (retryArgs) {
          const maxRetries = autoPayConfig.maxRetries;
          for (let attemptIndex = 0; attemptIndex < maxRetries; attemptIndex += 1) {
            try {
              // oxlint-disable-next-line typescript/no-explicit-any
              const retryResult = await (tool as any).execute?.(`http-${Date.now()}`, retryArgs);
              sendJson(res, 200, { ok: true, result: retryResult });
              return true;
            } catch (retryErr) {
              autoPayError = getErrorMessage(retryErr) || autoPayError;
            }
          }
        }
      }

      sendJson(res, 402, {
        ok: false,
        error: {
          type: "payment_required",
          message: "payment required",
          invoice,
          authorization: autoPayResult?.authorization,
          resumeToken: autoPayResult?.resumeToken,
          autoPayError,
        },
      });
      return true;
    }

    logWarn(`tools-invoke: tool execution failed: ${String(err)}`);
    sendJson(res, 500, {
      ok: false,
      error: { type: "tool_error", message: "tool execution failed" },
    });
  }

  return true;
}
