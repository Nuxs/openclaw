import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_GATEWAY_TOKEN = "test-gateway-token-1234567890";

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
const PAYMENT_AUTHORIZATION = "OpenClaw-PayFi dGVzdC1yZXN1bWU=";
const PAYMENT_RESUME_TOKEN = {
  invoiceId: PAYMENT_INVOICE.invoiceId,
  paymentReceiptId: "receipt-1",
  chain: "evm",
  issuedAt: new Date().toISOString(),
  expiresAt: PAYMENT_INVOICE.expiresAt,
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

const mockCallGateway = vi.fn(async (..._args: unknown[]) => ({
  ok: true,
  result: {
    resumeToken: PAYMENT_RESUME_TOKEN,
    authorization: PAYMENT_AUTHORIZATION,
  },
}));

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
      lastPaymentRequiredArgs = (args ?? {}) as Record<string, unknown>;
      if (paymentRequiredCallCount === 1) {
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
    },
  });
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
    const res = await invokeToolAuthed({
      tool: "tools_invoke_payment_required",
      args: { headers: {} },
      sessionKey: "main",
      headers: { "x-idempotency-key": idempotencyKey },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(paymentRequiredCallCount).toBe(2);
    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "web3.billing.handlePaymentRequired",
        params: expect.objectContaining({ idempotencyKey }),
      }),
    );
    const headers = (lastPaymentRequiredArgs?.headers ?? {}) as Record<string, unknown>;
    expect(headers.authorization).toBe(PAYMENT_AUTHORIZATION);
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

    const res = await invokeToolAuthed({
      tool: "tools_invoke_payment_required",
      args: { headers: {} },
      sessionKey: "main",
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(paymentRequiredCallCount).toBe(1);
    expect(mockCallGateway).toHaveBeenCalled();
    expect(body.error?.authorization).toBe(PAYMENT_AUTHORIZATION);
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
