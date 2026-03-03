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
import {
  comparePaymentResumeTokenIdentity,
  parsePaymentResumeTokenFromAuthorization,
  type PaymentResumeToken,
  validatePaymentResumeToken,
} from "./payment-resume-token.js";

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

type PaymentTraceRef = {
  requestId?: string;
  idempotencyKey: string;
  invoiceId: string;
  paymentReceiptId: string;
  txHash?: string;
  toolName?: string;
  createdAt: string;
};

type PaymentReceipt = {
  receiptId: string;
  chain: "evm" | "ton";
  network?: string;
  txHash?: string;
  amount?: string;
  tokenAddress?: string;
  confirmedAt: string;
  mode: "live" | "simulated";
};

type PaymentRequiredResult = {
  authorization?: string;
  resumeToken?: PaymentResumeToken;
  paymentReceipt?: PaymentReceipt;
  reused?: boolean;
  maxRetries?: number;
  trace?: PaymentTraceRef;
};

type X402AutopayAlert = {
  rule?: unknown;
  triggered?: unknown;
};

type X402MetricsSnapshotResult = {
  alerts?: unknown;
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

function resolveAutoPayMaxRetries(params: {
  configRetries: number;
  paymentRequiredRetries?: number;
}): number {
  const { paymentRequiredRetries, configRetries } = params;
  if (typeof paymentRequiredRetries === "number" && Number.isFinite(paymentRequiredRetries)) {
    return Math.max(0, Math.floor(paymentRequiredRetries));
  }
  return configRetries;
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

function resolveRequestIdHeader(req: IncomingMessage): string | undefined {
  return getHeader(req, "x-openclaw-request-id")?.trim() || getHeader(req, "x-request-id")?.trim();
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
  requestId?: string;
}): Promise<{ result?: PaymentRequiredResult; error?: string }> {
  try {
    const response = await callGateway({
      method: "web3.billing.handlePaymentRequired",
      params: {
        invoice: params.invoice,
        tool: params.toolName,
        idempotencyKey: params.idempotencyKey,
        requestId: params.requestId,
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

async function recordX402AutopayMetric(event: {
  event: "attempt" | "success" | "failure" | "retry" | "circuit_breaker_trip";
  count?: number;
}): Promise<void> {
  try {
    await callGateway({
      method: "web3.metrics.recordX402Autopay",
      params: event,
    });
  } catch {
    // Metrics emission must not block tool execution.
  }
}

async function shouldDegradeX402AutopayByHealth(): Promise<boolean> {
  try {
    const response = await callGateway({ method: "web3.metrics.snapshot", params: {} });
    const normalized = normalizeGatewayResult(response);
    if (!normalized.ok || !normalized.result || typeof normalized.result !== "object") {
      return false;
    }
    const snapshot = normalized.result as X402MetricsSnapshotResult;
    const alertsRaw = snapshot.alerts;
    if (!Array.isArray(alertsRaw)) {
      return false;
    }

    // Guardrail: degrade autopay when key x402 alerts are actively triggered.
    return alertsRaw.some((entry) => {
      const alert = entry as X402AutopayAlert;
      const rule = typeof alert.rule === "string" ? alert.rule : "";
      const triggered = alert.triggered === true;
      if (!triggered) {
        return false;
      }
      return rule === "x402_autopay_failure_rate" || rule === "x402_autopay_circuit_breaker_trips";
    });
  } catch {
    return false;
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
  const requestId = resolveRequestIdHeader(req);

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
      let autoPayAttempted = false;
      let autoPaySucceeded = false;
      let retryExhausted = false;
      if (!autoPayConfig.enabled) {
        autoPayError = "autopay disabled by config";
      } else if (!idempotencyKey) {
        autoPayError = "idempotency key required for autopay";
      } else if (invoice) {
        const healthGuardTriggered = await shouldDegradeX402AutopayByHealth();
        if (healthGuardTriggered) {
          autoPayError = "autopay degraded by health guard";
        } else {
          autoPayAttempted = true;
          await recordX402AutopayMetric({ event: "attempt" });
          const attempt = await tryAutoPay({ invoice, toolName, idempotencyKey, requestId });
          autoPayError = attempt.error;
          autoPayResult = attempt.result;
        }
      }

      if (autoPayResult?.authorization || autoPayResult?.resumeToken) {
        const authorizationToken = parsePaymentResumeTokenFromAuthorization(
          autoPayResult.authorization,
        );
        let effectiveResumeToken = autoPayResult.resumeToken ?? authorizationToken;

        if (autoPayResult.resumeToken && authorizationToken) {
          if (!comparePaymentResumeTokenIdentity(autoPayResult.resumeToken, authorizationToken)) {
            autoPayError = "autopay resume token mismatch between payload and authorization";
            effectiveResumeToken = undefined;
          }
        }

        if (effectiveResumeToken) {
          const tokenValidation = validatePaymentResumeToken(effectiveResumeToken);
          if (!tokenValidation.valid) {
            autoPayError = tokenValidation.error;
            effectiveResumeToken = undefined;
          }
        }

        const retryArgs = applyPaymentResumeToken({
          args: toolArgs,
          // oxlint-disable-next-line typescript/no-explicit-any
          toolSchema: (tool as any).parameters,
          authorization: autoPayResult.authorization,
          resumeToken: effectiveResumeToken,
        });

        if (retryArgs) {
          const maxRetries = resolveAutoPayMaxRetries({
            configRetries: autoPayConfig.maxRetries,
            paymentRequiredRetries: autoPayResult.maxRetries,
          });
          for (let attemptIndex = 0; attemptIndex < maxRetries; attemptIndex += 1) {
            try {
              // oxlint-disable-next-line typescript/no-explicit-any
              const retryResult = await (tool as any).execute?.(`http-${Date.now()}`, retryArgs);
              autoPaySucceeded = true;
              await recordX402AutopayMetric({ event: "success" });
              sendJson(res, 200, {
                ok: true,
                result: retryResult,
                payment: autoPayResult?.paymentReceipt,
                paymentTrace: autoPayResult?.trace,
              });
              return true;
            } catch (retryErr) {
              autoPayError = getErrorMessage(retryErr) || autoPayError;
              await recordX402AutopayMetric({ event: "retry" });
            }
          }
          retryExhausted = maxRetries > 0;
        }
      }

      if (autoPayAttempted && !autoPaySucceeded) {
        await recordX402AutopayMetric({ event: "failure" });
      }
      if (retryExhausted && !autoPaySucceeded) {
        await recordX402AutopayMetric({ event: "circuit_breaker_trip" });
      }

      sendJson(res, 402, {
        ok: false,
        error: {
          type: "payment_required",
          message: "payment required",
          invoice,
          requestId,
          authorization: autoPayResult?.authorization,
          resumeToken: autoPayResult?.resumeToken,
          paymentReceipt: autoPayResult?.paymentReceipt,
          trace: autoPayResult?.trace,
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
