import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { runBeforeToolCallHook as runBeforeToolCallHookType } from "../agents/pi-tools.before-tool-call.js";

type RunBeforeToolCallHook = typeof runBeforeToolCallHookType;
type RunBeforeToolCallHookArgs = Parameters<RunBeforeToolCallHook>[0];
type RunBeforeToolCallHookResult = Awaited<ReturnType<RunBeforeToolCallHook>>;

const TEST_GATEWAY_TOKEN = "test-gateway-token-1234567890";

const hookMocks = vi.hoisted(() => ({
  resolveToolLoopDetectionConfig: vi.fn(() => ({ warnAt: 3 })),
  runBeforeToolCallHook: vi.fn(
    async (args: RunBeforeToolCallHookArgs): Promise<RunBeforeToolCallHookResult> => ({
      blocked: false,
      params: args.params,
    }),
  ),
}));

let cfg: Record<string, unknown> = {};
let lastCreateOpenClawToolsContext: Record<string, unknown> | undefined;
let paymentRequiredCallCount = 0;
let lastPaymentRequiredArgs: Record<string, unknown> | undefined;

const PAYMENT_INVOICE = {
  invoiceId: "inv-1",
  provider: "provider-1",
  chain: "evm",
  asset: "ETH",
  amount: "10",
  payTo: "0x0000000000000000000000000000000000000002",
  nonce: "nonce-1",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  idempotencyKey: "idem-1",
};
const PAYMENT_INVOICE_BASE64 = Buffer.from(JSON.stringify(PAYMENT_INVOICE)).toString("base64");
const PAYMENT_RESUME_TOKEN = {
  invoiceId: PAYMENT_INVOICE.invoiceId,
  paymentReceiptId: "receipt-1",
  chain: "evm",
  issuedAt: new Date().toISOString(),
  expiresAt: PAYMENT_INVOICE.expiresAt,
};
const PAYMENT_AUTHORIZATION = `OpenClaw-PayFi ${Buffer.from(
  JSON.stringify(PAYMENT_RESUME_TOKEN),
).toString("base64")}`;
const PAYMENT_RECEIPT = {
  receiptId: PAYMENT_RESUME_TOKEN.paymentReceiptId,
  chain: "evm",
  txHash: "0xtxhash",
  amount: PAYMENT_INVOICE.amount,
  confirmedAt: PAYMENT_RESUME_TOKEN.issuedAt,
  mode: "live",
};

// Perf: keep this suite pure unit. Mock heavyweight config/session modules.
vi.mock("../config/config.js", () => ({
  loadConfig: () => cfg,
}));

vi.mock("../config/sessions.js", () => ({
  resolveMainSessionKey: (params?: {
    session?: { scope?: string; mainKey?: string };
    agents?: { list?: Array<{ id?: string; default?: boolean }> };
  }) => {
    if (params?.session?.scope === "global") {
      return "global";
    }
    const agents = params?.agents?.list ?? [];
    const rawDefault = agents.find((agent) => agent?.default)?.id ?? agents[0]?.id ?? "main";
    const agentId =
      String(rawDefault ?? "main")
        .trim()
        .toLowerCase() || "main";
    const mainKeyRaw = String(params?.session?.mainKey ?? "main")
      .trim()
      .toLowerCase();
    const mainKey = mainKeyRaw || "main";
    return `agent:${agentId}:${mainKey}`;
  },
}));

vi.mock("./auth.js", () => ({
  authorizeHttpGatewayConnect: async () => ({ ok: true }),
}));

type GatewayResponse =
  | {
      ok: true;
      result: {
        resumeToken?: Record<string, unknown>;
        authorization?: string;
        paymentReceipt?: Record<string, unknown>;
        maxRetries?: number;
        trace?: Record<string, unknown>;
        [key: string]: unknown;
      };
    }
  | {
      ok: false;
      error: string;
    };

const mockCallGateway = vi.fn<(..._args: unknown[]) => Promise<GatewayResponse>>(
  async (..._args: unknown[]) => ({
    ok: true,
    result: {
      resumeToken: PAYMENT_RESUME_TOKEN,
      authorization: PAYMENT_AUTHORIZATION,
      paymentReceipt: PAYMENT_RECEIPT,
    },
  }),
);

vi.mock("../logger.js", () => ({
  logWarn: () => {},
}));

vi.mock("./call.js", () => ({
  callGateway: (...args: unknown[]) => mockCallGateway(...args),
}));

vi.mock("../plugins/config-state.js", () => ({
  isTestDefaultMemorySlotDisabled: () => false,
}));

vi.mock("../plugins/tools.js", () => ({
  getPluginToolMeta: () => undefined,
}));

// Perf: the real tool factory instantiates many tools per request; for these HTTP
// routing/policy tests we only need a small set of tool names.
vi.mock("../agents/openclaw-tools.js", () => {
  const toolInputError = (message: string) => {
    const err = new Error(message);
    err.name = "ToolInputError";
    return err;
  };
  const toolAuthorizationError = (message: string) => {
    const err = new Error(message) as Error & { status?: number };
    err.name = "ToolAuthorizationError";
    err.status = 403;
    return err;
  };

  const createPaymentRequiredTool = () => ({
    name: "tools_invoke_payment_required",
    parameters: {
      type: "object",
      properties: {
        headers: { type: "object" },
      },
    },
    execute: async (_toolCallId: string, args: unknown) => {
      paymentRequiredCallCount += 1;
      const input = (args ?? {}) as Record<string, unknown>;
      lastPaymentRequiredArgs = input;
      const headers =
        input.headers && typeof input.headers === "object" && !Array.isArray(input.headers)
          ? (input.headers as Record<string, unknown>)
          : {};
      const hasAuthorization =
        typeof headers.authorization === "string" || typeof headers.Authorization === "string";
      if (!hasAuthorization) {
        const err = new Error("payment required") as Error & {
          status?: number;
          headers?: Record<string, string>;
        };
        err.status = 402;
        err.headers = {
          "www-authenticate": `OpenClaw-PayFi realm="market", invoice="${PAYMENT_INVOICE_BASE64}"`,
        };
        throw err;
      }
      if (input.forceRetryFailure === true) {
        throw new Error("post-pay callback failed");
      }
      return { ok: true };
    },
  });

  const tools = [
    {
      name: "session_status",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ ok: true }),
    },
    {
      name: "agents_list",
      parameters: { type: "object", properties: { action: { type: "string" } } },
      execute: async () => ({ ok: true, result: [] }),
    },
    {
      name: "sessions_spawn",
      parameters: { type: "object", properties: {} },
      execute: async () => ({
        ok: true,
        route: {
          agentTo: lastCreateOpenClawToolsContext?.agentTo,
          agentThreadId: lastCreateOpenClawToolsContext?.agentThreadId,
        },
      }),
    },
    {
      name: "sessions_send",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ ok: true }),
    },
    {
      name: "gateway",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        throw toolInputError("invalid args");
      },
    },
    {
      name: "tools_invoke_test",
      parameters: {
        type: "object",
        properties: {
          mode: { type: "string" },
        },
        required: ["mode"],
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, args: unknown) => {
        const mode = (args as { mode?: unknown })?.mode;
        if (mode === "input") {
          throw toolInputError("mode invalid");
        }
        if (mode === "auth") {
          throw toolAuthorizationError("mode forbidden");
        }
        if (mode === "crash") {
          throw new Error("boom");
        }
        return { ok: true };
      },
    },
    createPaymentRequiredTool(),
    {
      name: "diffs_compat_test",
      parameters: {
        type: "object",
        properties: {
          mode: { type: "string" },
          fileFormat: { type: "string" },
        },
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, args: unknown) => {
        const input = (args ?? {}) as Record<string, unknown>;
        return {
          ok: true,
          observedFormat: input.format,
          observedFileFormat: input.fileFormat,
        };
      },
    },
  ];

  return {
    createOpenClawTools: (ctx: Record<string, unknown>) => {
      lastCreateOpenClawToolsContext = ctx;
      return tools;
    },
  };
});

vi.mock("../agents/pi-tools.js", () => ({
  resolveToolLoopDetectionConfig: hookMocks.resolveToolLoopDetectionConfig,
}));

vi.mock("../agents/pi-tools.before-tool-call.js", () => ({
  runBeforeToolCallHook: hookMocks.runBeforeToolCallHook,
}));

const { handleToolsInvokeHttpRequest } = await import("./tools-invoke-http.js");

let pluginHttpHandlers: Array<(req: IncomingMessage, res: ServerResponse) => Promise<boolean>> = [];

let sharedPort = 0;
let sharedServer: ReturnType<typeof createServer> | undefined;

beforeAll(async () => {
  sharedServer = createServer((req, res) => {
    void (async () => {
      const handled = await handleToolsInvokeHttpRequest(req, res, {
        auth: { mode: "token", token: TEST_GATEWAY_TOKEN, allowTailscale: false },
      });
      if (handled) {
        return;
      }
      for (const handler of pluginHttpHandlers) {
        if (await handler(req, res)) {
          return;
        }
      }
      res.statusCode = 404;
      res.end("not found");
    })().catch((err) => {
      res.statusCode = 500;
      res.end(String(err));
    });
  });

  await new Promise<void>((resolve, reject) => {
    sharedServer?.once("error", reject);
    sharedServer?.listen(0, "127.0.0.1", () => {
      const address = sharedServer?.address() as AddressInfo | null;
      sharedPort = address?.port ?? 0;
      resolve();
    });
  });
});

afterAll(async () => {
  const server = sharedServer;
  if (!server) {
    return;
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  sharedServer = undefined;
});

beforeEach(() => {
  delete process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_PASSWORD;
  pluginHttpHandlers = [];
  cfg = {};
  lastCreateOpenClawToolsContext = undefined;
  paymentRequiredCallCount = 0;
  lastPaymentRequiredArgs = undefined;
  mockCallGateway.mockReset();
  mockCallGateway.mockResolvedValue({
    ok: true,
    result: {
      resumeToken: PAYMENT_RESUME_TOKEN,
      authorization: PAYMENT_AUTHORIZATION,
      paymentReceipt: PAYMENT_RECEIPT,
    },
  });
  hookMocks.resolveToolLoopDetectionConfig.mockClear();
  hookMocks.resolveToolLoopDetectionConfig.mockImplementation(() => ({ warnAt: 3 }));
  hookMocks.runBeforeToolCallHook.mockClear();
  hookMocks.runBeforeToolCallHook.mockImplementation(
    async (args: RunBeforeToolCallHookArgs): Promise<RunBeforeToolCallHookResult> => ({
      blocked: false,
      params: args.params,
    }),
  );
});

const resolveGatewayToken = (): string => TEST_GATEWAY_TOKEN;
const gatewayAuthHeaders = () => ({ authorization: `Bearer ${resolveGatewayToken()}` });

const allowAgentsListForMain = () => {
  cfg = {
    ...cfg,
    agents: {
      list: [
        {
          id: "main",
          default: true,
          tools: {
            allow: ["agents_list"],
          },
        },
      ],
    },
  };
};

const postToolsInvoke = async (params: {
  port: number;
  headers?: Record<string, string>;
  body: Record<string, unknown>;
}) =>
  await fetch(`http://127.0.0.1:${params.port}/tools/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json", ...params.headers },
    body: JSON.stringify(params.body),
  });

const withOptionalSessionKey = (body: Record<string, unknown>, sessionKey?: string) => ({
  ...body,
  ...(sessionKey ? { sessionKey } : {}),
});

const invokeAgentsList = async (params: {
  port: number;
  headers?: Record<string, string>;
  sessionKey?: string;
}) => {
  const body = withOptionalSessionKey(
    { tool: "agents_list", action: "json", args: {} },
    params.sessionKey,
  );
  return await postToolsInvoke({ port: params.port, headers: params.headers, body });
};

const invokeTool = async (params: {
  port: number;
  tool: string;
  args?: Record<string, unknown>;
  action?: string;
  headers?: Record<string, string>;
  sessionKey?: string;
}) => {
  const body: Record<string, unknown> = withOptionalSessionKey(
    {
      tool: params.tool,
      args: params.args ?? {},
    },
    params.sessionKey,
  );
  if (params.action) {
    body.action = params.action;
  }
  return await postToolsInvoke({ port: params.port, headers: params.headers, body });
};

const invokeAgentsListAuthed = async (params: { sessionKey?: string } = {}) =>
  invokeAgentsList({
    port: sharedPort,
    headers: gatewayAuthHeaders(),
    sessionKey: params.sessionKey,
  });

const invokeToolAuthed = async (params: {
  tool: string;
  args?: Record<string, unknown>;
  action?: string;
  headers?: Record<string, string>;
  sessionKey?: string;
}) =>
  invokeTool({
    port: sharedPort,
    headers: { ...gatewayAuthHeaders(), ...params.headers },
    ...params,
  });

const expectOkInvokeResponse = async (res: Response) => {
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  return body as { ok: boolean; result?: Record<string, unknown> };
};

const setMainAllowedTools = (params: {
  allow: string[];
  gatewayAllow?: string[];
  gatewayDeny?: string[];
}) => {
  cfg = {
    ...cfg,
    agents: {
      list: [{ id: "main", default: true, tools: { allow: params.allow } }],
    },
    ...(params.gatewayAllow || params.gatewayDeny
      ? {
          gateway: {
            tools: {
              ...(params.gatewayAllow ? { allow: params.gatewayAllow } : {}),
              ...(params.gatewayDeny ? { deny: params.gatewayDeny } : {}),
            },
          },
        }
      : {}),
  };
};

describe("POST /tools/invoke", () => {
  it("invokes a tool and returns {ok:true,result}", async () => {
    allowAgentsListForMain();
    const res = await invokeAgentsListAuthed({ sessionKey: "main" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("result");
    expect(lastCreateOpenClawToolsContext?.allowMediaInvokeCommands).toBe(true);
    expect(hookMocks.runBeforeToolCallHook).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "agents_list",
        ctx: expect.objectContaining({
          agentId: "main",
          sessionKey: "agent:main:main",
          loopDetection: { warnAt: 3 },
        }),
      }),
    );
  });

  it("blocks tool execution when before_tool_call rejects the invoke", async () => {
    setMainAllowedTools({ allow: ["tools_invoke_test"] });
    hookMocks.runBeforeToolCallHook.mockResolvedValueOnce({
      blocked: true,
      reason: "blocked by test hook",
    });

    const res = await invokeToolAuthed({
      tool: "tools_invoke_test",
      args: { mode: "ok" },
      sessionKey: "main",
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: {
        type: "tool_call_blocked",
        message: "blocked by test hook",
      },
    });
  });

  it("uses before_tool_call adjusted params for HTTP tool execution", async () => {
    setMainAllowedTools({ allow: ["tools_invoke_test"] });
    hookMocks.runBeforeToolCallHook.mockImplementationOnce(async () => ({
      blocked: false,
      params: { mode: "rewritten" },
    }));

    const res = await invokeToolAuthed({
      tool: "tools_invoke_test",
      args: { mode: "input" },
      sessionKey: "main",
    });

    const body = await expectOkInvokeResponse(res);
    expect(body.result).toMatchObject({ ok: true });
  });

  it("supports tools.alsoAllow in profile and implicit modes", async () => {
    cfg = {
      ...cfg,
      agents: { list: [{ id: "main", default: true }] },
      tools: { profile: "minimal", alsoAllow: ["agents_list"] },
    };

    const resProfile = await invokeAgentsListAuthed({ sessionKey: "main" });

    expect(resProfile.status).toBe(200);
    const profileBody = await resProfile.json();
    expect(profileBody.ok).toBe(true);

    cfg = {
      ...cfg,
      tools: { alsoAllow: ["agents_list"] },
    };

    const resImplicit = await invokeAgentsListAuthed({ sessionKey: "main" });
    expect(resImplicit.status).toBe(200);
    const implicitBody = await resImplicit.json();
    expect(implicitBody.ok).toBe(true);
  });

  it("routes non-tools requests to plugin HTTP handlers", async () => {
    const pluginHandler = vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.url !== "/web3/resources/health") {
        return false;
      }
      res.statusCode = 200;
      res.end("ok");
      return true;
    });
    pluginHttpHandlers = [async (req, res) => pluginHandler(req, res)];

    const res = await fetch(`http://127.0.0.1:${sharedPort}/web3/resources/health`);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("routes tools invoke before plugin HTTP handlers", async () => {
    const pluginHandler = vi.fn(async (_req: IncomingMessage, res: ServerResponse) => {
      res.statusCode = 418;
      res.end("plugin");
      return true;
    });
    allowAgentsListForMain();
    pluginHttpHandlers = [async (req, res) => pluginHandler(req, res)];

    const res = await invokeAgentsListAuthed({ sessionKey: "main" });

    expect(res.status).toBe(200);
    expect(pluginHandler).not.toHaveBeenCalled();
  });

  it("returns 404 when denylisted or blocked by tools.profile", async () => {
    cfg = {
      ...cfg,
      agents: {
        list: [
          {
            id: "main",
            default: true,
            tools: {
              deny: ["agents_list"],
            },
          },
        ],
      },
    };
    const denyRes = await invokeAgentsListAuthed({ sessionKey: "main" });
    expect(denyRes.status).toBe(404);

    allowAgentsListForMain();
    cfg = {
      ...cfg,
      tools: { profile: "minimal" },
    };

    const profileRes = await invokeAgentsListAuthed({ sessionKey: "main" });
    expect(profileRes.status).toBe(404);
  });

  it("denies sessions_spawn via HTTP even when agent policy allows", async () => {
    cfg = {
      ...cfg,
      agents: {
        list: [
          {
            id: "main",
            default: true,
            tools: { allow: ["sessions_spawn"] },
          },
        ],
      },
    };

    const res = await invokeToolAuthed({
      tool: "sessions_spawn",
      args: { task: "test" },
      sessionKey: "main",
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.type).toBe("not_found");
  });

  it("propagates message target/thread headers into tools context for sessions_spawn", async () => {
    cfg = {
      ...cfg,
      agents: {
        list: [{ id: "main", default: true, tools: { allow: ["sessions_spawn"] } }],
      },
      gateway: { tools: { allow: ["sessions_spawn"] } },
    };

    const res = await invokeTool({
      port: sharedPort,
      headers: {
        ...gatewayAuthHeaders(),
        "x-openclaw-message-to": "channel:24514",
        "x-openclaw-thread-id": "thread-24514",
      },
      tool: "sessions_spawn",
      sessionKey: "main",
    });

    const body = await expectOkInvokeResponse(res);
    expect(body.result?.route).toEqual({
      agentTo: "channel:24514",
      agentThreadId: "thread-24514",
    });
  });

  it("denies sessions_send via HTTP gateway", async () => {
    setMainAllowedTools({ allow: ["sessions_send"] });

    const res = await invokeToolAuthed({
      tool: "sessions_send",
      sessionKey: "main",
    });

    expect(res.status).toBe(404);
  });

  it("denies gateway tool via HTTP", async () => {
    setMainAllowedTools({ allow: ["gateway"] });

    const res = await invokeToolAuthed({
      tool: "gateway",
      sessionKey: "main",
    });

    expect(res.status).toBe(404);
  });

  it("allows gateway tool via HTTP when explicitly enabled in gateway.tools.allow", async () => {
    setMainAllowedTools({ allow: ["gateway"], gatewayAllow: ["gateway"] });

    const res = await invokeToolAuthed({
      tool: "gateway",
      sessionKey: "main",
    });

    // Ensure we didn't hit the HTTP deny list (404). Invalid args should map to 400.
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error?.type).toBe("tool_error");
  });

  it("treats gateway.tools.deny as higher priority than gateway.tools.allow", async () => {
    setMainAllowedTools({
      allow: ["gateway"],
      gatewayAllow: ["gateway"],
      gatewayDeny: ["gateway"],
    });

    const res = await invokeToolAuthed({
      tool: "gateway",
      sessionKey: "main",
    });

    expect(res.status).toBe(404);
  });

  it("uses the configured main session key when sessionKey is missing or main", async () => {
    cfg = {
      ...cfg,
      agents: {
        list: [
          {
            id: "main",
            tools: {
              deny: ["agents_list"],
            },
          },
          {
            id: "ops",
            default: true,
            tools: {
              allow: ["agents_list"],
            },
          },
        ],
      },
      session: { mainKey: "primary" },
    };

    const resDefault = await invokeAgentsListAuthed();
    expect(resDefault.status).toBe(200);

    const resMain = await invokeAgentsListAuthed({ sessionKey: "main" });
    expect(resMain.status).toBe(200);
  });

  it("auto pays and retries on 402 payment required", async () => {
    cfg = {
      ...cfg,
      agents: {
        list: [
          {
            id: "main",
            default: true,
            tools: { allow: ["tools_invoke_payment_required"] },
          },
        ],
      },
    };

    const idempotencyKey = "idem-request-1";
    const requestId = "req-001";
    const res = await invokeToolAuthed({
      tool: "tools_invoke_payment_required",
      args: { headers: {} },
      sessionKey: "main",
      headers: { "x-idempotency-key": idempotencyKey, "x-openclaw-request-id": requestId },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.payment).toMatchObject(PAYMENT_RECEIPT);
    expect(paymentRequiredCallCount).toBe(2);
    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "web3.billing.handlePaymentRequired",
        params: expect.objectContaining({ idempotencyKey, requestId }),
      }),
    );
    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "web3.billing.consumePaymentRequired",
        params: expect.objectContaining({ idempotencyKey }),
      }),
    );
    const headers = (lastPaymentRequiredArgs?.headers ?? {}) as Record<string, unknown>;
    expect(headers.authorization).toBe(PAYMENT_AUTHORIZATION);
  });

  it("does not retry tool when payment authorization consume fails", async () => {
    cfg = {
      ...cfg,
      agents: {
        list: [
          {
            id: "main",
            default: true,
            tools: { allow: ["tools_invoke_payment_required"] },
          },
        ],
      },
    };

    mockCallGateway.mockImplementation(async (input: unknown) => {
      const method = (input as { method?: unknown })?.method;
      if (method === "web3.metrics.snapshot") {
        return { ok: true, result: { alerts: [] } };
      }
      if (method === "web3.billing.handlePaymentRequired") {
        return {
          ok: true,
          result: {
            resumeToken: PAYMENT_RESUME_TOKEN,
            authorization: PAYMENT_AUTHORIZATION,
            paymentReceipt: PAYMENT_RECEIPT,
          },
        };
      }
      if (method === "web3.billing.consumePaymentRequired") {
        return {
          ok: false,
          error: "E_CONFLICT: payment authorization already consumed",
        };
      }
      return { ok: true, result: {} };
    });

    const res = await invokeToolAuthed({
      tool: "tools_invoke_payment_required",
      args: { headers: {} },
      sessionKey: "main",
      headers: { "x-idempotency-key": "idem-consume-fail" },
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error?.autoPayError).toBe("E_CONFLICT: payment authorization already consumed");
    expect(paymentRequiredCallCount).toBe(1);
    const headers = (lastPaymentRequiredArgs?.headers ?? {}) as Record<string, unknown>;
    expect(headers.authorization).toBeUndefined();
  });

  it("stays stable under continuous 402 autopay retries", async () => {
    cfg = {
      ...cfg,
      agents: {
        list: [
          {
            id: "main",
            default: true,
            tools: { allow: ["tools_invoke_payment_required"] },
          },
        ],
      },
      plugins: {
        entries: {
          "web3-core": {
            config: { x402: { autopay: { enabled: true, maxRetries: 1 } } },
          },
        },
      },
    };

    const rounds = 12;
    for (let index = 0; index < rounds; index += 1) {
      const res = await invokeToolAuthed({
        tool: "tools_invoke_payment_required",
        args: { headers: {} },
        sessionKey: "main",
        headers: {
          "x-idempotency-key": `idem-round-${index}`,
          "x-openclaw-request-id": `req-round-${index}`,
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.payment).toMatchObject(PAYMENT_RECEIPT);
    }

    expect(paymentRequiredCallCount).toBe(rounds * 2);
  });

  it("skips autopay when disabled in web3-core config", async () => {
    cfg = {
      ...cfg,
      agents: {
        list: [
          {
            id: "main",
            default: true,
            tools: { allow: ["tools_invoke_payment_required"] },
          },
        ],
      },
      plugins: {
        entries: {
          "web3-core": {
            config: { x402: { autopay: { enabled: false } } },
          },
        },
      },
    };

    const res = await invokeToolAuthed({
      tool: "tools_invoke_payment_required",
      args: { headers: {} },
      sessionKey: "main",
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(paymentRequiredCallCount).toBe(1);
    expect(mockCallGateway).not.toHaveBeenCalled();
    expect(body.error?.autoPayError).toBe("autopay disabled by config");
  });

  it("rejects autopay when idempotency key header is missing", async () => {
    cfg = {
      ...cfg,
      agents: {
        list: [
          {
            id: "main",
            default: true,
            tools: { allow: ["tools_invoke_payment_required"] },
          },
        ],
      },
    };

    const res = await invokeToolAuthed({
      tool: "tools_invoke_payment_required",
      args: { headers: {} },
      sessionKey: "main",
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(paymentRequiredCallCount).toBe(1);
    expect(mockCallGateway).not.toHaveBeenCalled();
    expect(body.error?.autoPayError).toBe("idempotency key required for autopay");
  });

  it("rejects autopay in production when agent-wallet policy baseline is missing", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    cfg = {
      ...cfg,
      agents: {
        list: [
          {
            id: "main",
            default: true,
            tools: { allow: ["tools_invoke_payment_required"] },
          },
        ],
      },
      plugins: {
        entries: {
          "web3-core": {
            config: { x402: { autopay: { enabled: true } } },
          },
          "agent-wallet": {
            config: {
              policy: {
                enabled: false,
              },
            },
          },
        },
      },
    };

    try {
      const res = await invokeToolAuthed({
        tool: "tools_invoke_payment_required",
        args: { headers: {} },
        sessionKey: "main",
        headers: { "x-idempotency-key": "idem-prod-baseline-missing" },
      });

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error?.autoPayError).toBe("agent-wallet policy must be enabled in production");
      expect(paymentRequiredCallCount).toBe(1);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("accepts production baseline when policyPath provides required caps", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const tempDir = await mkdtemp(join(tmpdir(), "openclaw-policy-"));
    const policyPath = join(tempDir, "policy.json");

    await writeFile(
      policyPath,
      JSON.stringify({
        version: "v1",
        budget: {
          dailyCap: "1000000000000000000",
          perTxCap: "100000000000000000",
          currency: "NATIVE",
        },
        scope: {},
        autoPay: {
          enabled: true,
          maxRetries: 1,
          maxAutoPayPerRequest: "100000000000000000",
        },
      }),
      "utf8",
    );

    cfg = {
      ...cfg,
      agents: {
        list: [
          {
            id: "main",
            default: true,
            tools: { allow: ["tools_invoke_payment_required"] },
          },
        ],
      },
      plugins: {
        entries: {
          "web3-core": {
            config: { x402: { autopay: { enabled: true } } },
          },
          "agent-wallet": {
            config: {
              policy: {
                enabled: true,
                policyPath,
              },
            },
          },
        },
      },
    };

    try {
      const res = await invokeToolAuthed({
        tool: "tools_invoke_payment_required",
        args: { headers: {} },
        sessionKey: "main",
        headers: { "x-idempotency-key": "idem-prod-policy-path" },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(mockCallGateway).toHaveBeenCalledWith(
        expect.objectContaining({ method: "web3.billing.handlePaymentRequired" }),
      );
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("degrades autopay when x402 health guard is triggered", async () => {
    cfg = {
      ...cfg,
      agents: {
        list: [
          {
            id: "main",
            default: true,
            tools: { allow: ["tools_invoke_payment_required"] },
          },
        ],
      },
    };

    mockCallGateway.mockImplementation(async (input: unknown) => {
      const method = (input as { method?: unknown })?.method;
      if (method === "web3.metrics.snapshot") {
        return {
          ok: true,
          result: {
            alerts: [
              {
                rule: "x402_autopay_failure_rate",
                triggered: true,
              },
            ],
          },
        };
      }
      return {
        ok: true,
        result: {
          resumeToken: PAYMENT_RESUME_TOKEN,
          authorization: PAYMENT_AUTHORIZATION,
        },
      };
    });

    const res = await invokeToolAuthed({
      tool: "tools_invoke_payment_required",
      args: { headers: {} },
      sessionKey: "main",
      headers: { "x-idempotency-key": "idem-health-guard" },
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(paymentRequiredCallCount).toBe(1);
    expect(body.error?.autoPayError).toBe("autopay degraded by health guard");
    expect(mockCallGateway).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "web3.billing.handlePaymentRequired" }),
    );
  });

  it("honors maxRetries=0 for x402 autopay", async () => {
    cfg = {
      ...cfg,
      agents: {
        list: [
          {
            id: "main",
            default: true,
            tools: { allow: ["tools_invoke_payment_required"] },
          },
        ],
      },
      plugins: {
        entries: {
          "web3-core": {
            config: { x402: { autopay: { maxRetries: 0 } } },
          },
        },
      },
    };

    mockCallGateway.mockResolvedValue({
      ok: true,
      result: {
        resumeToken: PAYMENT_RESUME_TOKEN,
        authorization: PAYMENT_AUTHORIZATION,
        trace: {
          requestId: "req-retry-0",
          idempotencyKey: "idem-request-2",
          invoiceId: PAYMENT_INVOICE.invoiceId,
          paymentReceiptId: PAYMENT_RESUME_TOKEN.paymentReceiptId,
          createdAt: PAYMENT_RESUME_TOKEN.issuedAt,
        },
      },
    });

    const res = await invokeToolAuthed({
      tool: "tools_invoke_payment_required",
      args: { headers: {} },
      sessionKey: "main",
      headers: {
        "x-idempotency-key": "idem-request-2",
        "x-openclaw-request-id": "req-retry-0",
      },
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(paymentRequiredCallCount).toBe(1);
    expect(mockCallGateway).toHaveBeenCalled();
    expect(body.error?.requestId).toBe("req-retry-0");
    expect(body.error?.authorization).toBe(PAYMENT_AUTHORIZATION);
    expect(body.error?.trace?.idempotencyKey).toBe("idem-request-2");
  });

  it("prefers wallet policy retry budget from payment-required response", async () => {
    cfg = {
      ...cfg,
      agents: {
        list: [
          {
            id: "main",
            default: true,
            tools: { allow: ["tools_invoke_payment_required"] },
          },
        ],
      },
      plugins: {
        entries: {
          "web3-core": {
            config: { x402: { autopay: { maxRetries: 0 } } },
          },
        },
      },
    };

    mockCallGateway.mockResolvedValue({
      ok: true,
      result: {
        resumeToken: PAYMENT_RESUME_TOKEN,
        authorization: PAYMENT_AUTHORIZATION,
        maxRetries: 1,
      },
    });

    const res = await invokeToolAuthed({
      tool: "tools_invoke_payment_required",
      args: { headers: {} },
      sessionKey: "main",
      headers: { "x-idempotency-key": "idem-request-3" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(paymentRequiredCallCount).toBe(2);
  });

  it("rejects retry when autopay returns expired resume token", async () => {
    cfg = {
      ...cfg,
      agents: {
        list: [
          {
            id: "main",
            default: true,
            tools: { allow: ["tools_invoke_payment_required"] },
          },
        ],
      },
    };

    mockCallGateway.mockResolvedValue({
      ok: true,
      result: {
        resumeToken: {
          ...PAYMENT_RESUME_TOKEN,
          expiresAt: new Date(Date.now() - 5_000).toISOString(),
        },
      },
    });

    const res = await invokeToolAuthed({
      tool: "tools_invoke_payment_required",
      args: { headers: {} },
      sessionKey: "main",
      headers: { "x-idempotency-key": "idem-expired-token" },
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error?.autoPayError).toBe("autopay resume token expired");
    expect(paymentRequiredCallCount).toBe(1);
  });

  it("returns 402 when callback fails after successful autopay", async () => {
    cfg = {
      ...cfg,
      agents: {
        list: [
          {
            id: "main",
            default: true,
            tools: { allow: ["tools_invoke_payment_required"] },
          },
        ],
      },
      plugins: {
        entries: {
          "web3-core": {
            config: { x402: { autopay: { maxRetries: 1 } } },
          },
        },
      },
    };

    const res = await invokeToolAuthed({
      tool: "tools_invoke_payment_required",
      args: { headers: {}, forceRetryFailure: true },
      sessionKey: "main",
      headers: { "x-idempotency-key": "idem-request-callback-fail" },
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error?.autoPayError).toContain("post-pay callback failed");
    expect(mockCallGateway).toHaveBeenCalled();
  });

  it("maps tool input/auth errors to 400/403 and unexpected execution errors to 500", async () => {
    cfg = {
      ...cfg,
      agents: {
        list: [{ id: "main", default: true, tools: { allow: ["tools_invoke_test"] } }],
      },
    };

    const inputRes = await invokeToolAuthed({
      tool: "tools_invoke_test",
      args: { mode: "input" },
      sessionKey: "main",
    });
    expect(inputRes.status).toBe(400);
    const inputBody = await inputRes.json();
    expect(inputBody.ok).toBe(false);
    expect(inputBody.error?.type).toBe("tool_error");
    expect(inputBody.error?.message).toBe("mode invalid");

    const authRes = await invokeToolAuthed({
      tool: "tools_invoke_test",
      args: { mode: "auth" },
      sessionKey: "main",
    });
    expect(authRes.status).toBe(403);
    const authBody = await authRes.json();
    expect(authBody.ok).toBe(false);
    expect(authBody.error?.type).toBe("tool_error");
    expect(authBody.error?.message).toBe("mode forbidden");

    const crashRes = await invokeToolAuthed({
      tool: "tools_invoke_test",
      args: { mode: "crash" },
      sessionKey: "main",
    });
    expect(crashRes.status).toBe(500);
    const crashBody = await crashRes.json();
    expect(crashBody.ok).toBe(false);
    expect(crashBody.error?.type).toBe("tool_error");
    expect(crashBody.error?.message).toBe("tool execution failed");
  });

  it("passes deprecated format alias through invoke payloads even when schema omits it", async () => {
    setMainAllowedTools({ allow: ["diffs_compat_test"] });

    const res = await invokeToolAuthed({
      tool: "diffs_compat_test",
      args: { mode: "file", format: "pdf" },
      sessionKey: "main",
    });

    const body = await expectOkInvokeResponse(res);
    expect(body.result?.observedFormat).toBe("pdf");
    expect(body.result?.observedFileFormat).toBeUndefined();
  });
});
