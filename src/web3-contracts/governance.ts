import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parse as parseYaml } from "yaml";
import { DEFAULT_CONFIG as MARKET_DEFAULT_CONFIG } from "../../extensions/market-core/src/config.ts";
import { describeWeb3Capabilities } from "../../extensions/web3-core/src/capabilities/catalog.ts";
import type { CapabilityDescriptor } from "../../extensions/web3-core/src/capabilities/types.ts";
import {
  DEFAULT_CONFIG as WEB3_DEFAULT_CONFIG,
  resolveConfig as resolveWeb3Config,
} from "../../extensions/web3-core/src/config.ts";
import {
  loadPluginManifest,
  type PluginManifest,
  type PluginManifestLoadResult,
} from "../plugins/manifest.js";
import { validateJsonSchemaValue } from "../plugins/schema-validator.js";

export const WEB3_CONTRACT_SNAPSHOT_PATH = "docs/reference/generated/web3-contract-snapshot.json";

const TARGET_PLUGINS = [
  {
    id: "agent-wallet",
    manifestPath: "extensions/agent-wallet/openclaw.plugin.json",
    entryPath: "extensions/agent-wallet/src/index.ts",
  },
  {
    id: "web3-core",
    manifestPath: "extensions/web3-core/openclaw.plugin.json",
    entryPath: "extensions/web3-core/src/index.ts",
  },
  {
    id: "market-core",
    manifestPath: "extensions/market-core/openclaw.plugin.json",
    entryPath: "extensions/market-core/src/index.ts",
  },
] as const;

const WEB3_DOC_EXPLICIT_PATHS = new Set([
  "docs/assessments/web3-fitness-report.md",
  "docs/concepts/web3-market.md",
  "docs/plugins/agent-wallet.md",
  "docs/plugins/market-core.md",
  "docs/plugins/web3-core.md",
  "docs/reference/web3-dual-stack-payments-and-settlement.md",
  "docs/reference/web3-market-dev.md",
  "docs/reference/web3-market-output-redaction.md",
  "docs/reference/web3-market-tools-review.md",
  "docs/reference/web3-resource-market-api.md",
  "docs/web3/TON_E2E_SETTLEMENT.md",
  "docs/web3/WEB3_DUAL_STACK_STRATEGY.md",
  "docs/web3/ai-steward-golden-path.md",
]);

const DOC_LAYERS = new Set(["reference", "guide", "status", "historical"]);
const CODE_FRAGMENT_PATTERN = /`([^`]+)`/g;
const SCHEMA_OBJECT_KEYS = new Set([
  "$ref",
  "type",
  "properties",
  "required",
  "items",
  "enum",
  "oneOf",
  "anyOf",
  "allOf",
  "additionalProperties",
  "pattern",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "description",
]);

const MANIFEST_FIXTURES: Record<string, Record<string, unknown>> = {
  "agent-wallet": {
    enabled: true,
    storePath: "${AGENT_WALLET_STORE_PATH}",
    encryptionKey: "${AGENT_WALLET_ENCRYPTION_KEY}",
    chain: { network: "ton-mainnet" },
    policy: {
      enabled: true,
      policyPath: "/secure/policy.json",
      decisionLogPath: "/secure/policy.log",
      statePath: "/secure/state.json",
      inlinePolicy: {
        version: "v1",
        budget: { dailyCap: "100", perTxCap: "10", currency: "NATIVE" },
        scope: {
          allowedContracts: ["0xabc"],
          allowedMethods: ["transfer"],
          allowedTools: ["web3.wallet.autopay"],
          allowedChains: ["evm", "ton"],
        },
        autoPay: { enabled: true, maxRetries: 1, maxAutoPayPerRequest: "10" },
        ttl: { notBefore: "2026-01-01T00:00:00.000Z", notAfter: "2026-12-31T00:00:00.000Z" },
      },
    },
  },
  "web3-core": {
    ...WEB3_DEFAULT_CONFIG,
    x402: { autopay: { enabled: true } },
    brain: {
      ...WEB3_DEFAULT_CONFIG.brain,
      enabled: true,
      defaultModel: "brain-1",
      endpoint: "https://brain.example.com",
    },
    resources: {
      ...WEB3_DEFAULT_CONFIG.resources,
      enabled: true,
      advertiseToMarket: true,
      provider: {
        ...WEB3_DEFAULT_CONFIG.resources.provider,
        listen: {
          ...WEB3_DEFAULT_CONFIG.resources.provider.listen,
          enabled: true,
          port: 18790,
          publicBaseUrl: "https://provider.example.com",
        },
        offers: {
          models: [
            {
              id: "model-1",
              label: "Model 1",
              backend: "openai-compat",
              backendConfig: {},
              price: { unit: "token", amount: 1, currency: "USDC" },
              policy: { maxConcurrent: 1, maxTokens: 2048, allowTools: false },
            },
          ],
          search: [
            {
              id: "search-1",
              label: "Search 1",
              backend: "searxng",
              backendConfig: {},
              price: { unit: "query", amount: 1, currency: "USDC" },
              policy: { maxConcurrent: 1, maxQueryChars: 500 },
            },
          ],
          storage: [
            {
              id: "storage-1",
              label: "Storage 1",
              backend: "filesystem",
              backendConfig: {},
              price: { unit: "gb_day", amount: 1, currency: "USDC" },
              policy: { maxBytes: 1024, allowMime: ["text/plain"], maxConcurrent: 1 },
            },
          ],
        },
      },
      consumer: { enabled: true, preferLocalFirst: true },
    },
    monitor: {
      enabled: true,
      notifications: {
        enabled: true,
        channels: {
          webhook: { url: "https://ops.example.com/hook", method: "POST", timeout: 5000 },
          wecom: { webhookUrl: "https://qyapi.weixin.qq.com/webhook/send?key=placeholder" },
        },
      },
    },
    rewards: { enabled: true },
  },
  "market-core": {
    ...MARKET_DEFAULT_CONFIG,
    chain: {
      ...MARKET_DEFAULT_CONFIG.chain,
      network: "ton-mainnet",
      rpcUrl: "https://rpc.example.com",
      privateKey: "0x1234",
      tonMnemonic: "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu",
      tonWorkchain: 0,
      escrowContractAddress: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
      rewardDistributorAddress: "0x0000000000000000000000000000000000000001",
    },
    settlement: {
      ...MARKET_DEFAULT_CONFIG.settlement,
      tokenAddress: "0x0000000000000000000000000000000000000002",
      confirmations: 2,
      confirmationTimeoutMs: 30000,
      transferTimeoutMs: 30000,
      maxRetries: 3,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 5000,
    },
  },
};

export type ContractIssue = {
  kind:
    | "doc_metadata"
    | "doc_reference"
    | "historical_doc"
    | "capability_example"
    | "stable_capability"
    | "manifest_schema"
    | "snapshot";
  message: string;
  path?: string;
};

export type Web3ContractSnapshot = {
  schemaVersion: 1;
  plugins: Array<{
    id: string;
    entryPath: string;
    manifestPath: string;
    manifest: PluginManifest;
    manifestCoverageMissingPaths: string[];
    runtime: {
      commands: string[];
      gatewayMethods: string[];
      httpRoutes: string[];
      services: string[];
    };
  }>;
  capabilities: {
    defaultConfig: CapabilityDescriptor[];
    maxEnabled: CapabilityDescriptor[];
    stableNames: string[];
  };
  docs: Array<{
    path: string;
    title: string | null;
    docLayer: string | null;
    normative: boolean | null;
    declaredContracts: string[];
  }>;
};

function toPosixPath(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].toSorted(compareStrings);
}

function sortJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJson(entry)) as T;
  }
  if (value && typeof value === "object") {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .toSorted(([left], [right]) => compareStrings(left, right))
      .map(([key, entry]) => [key, sortJson(entry)]);
    return Object.fromEntries(sortedEntries) as T;
  }
  return value;
}

function stringifySnapshot(snapshot: Web3ContractSnapshot): string {
  return `${JSON.stringify(sortJson(snapshot), null, 2)}\n`;
}

function isSchemaObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.keys(value).some((key) => SCHEMA_OBJECT_KEYS.has(key));
}

export function normalizeCapabilitySchema(schema: unknown): Record<string, unknown> {
  if (isSchemaObject(schema)) {
    return schema;
  }
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { type: "object", additionalProperties: true };
  }
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (typeof value === "string") {
      properties[key] = { type: value };
      continue;
    }
    if (isSchemaObject(value)) {
      properties[key] = value;
      continue;
    }
    properties[key] = { type: "object", additionalProperties: true };
  }
  return {
    type: "object",
    additionalProperties: false,
    properties,
  };
}

function extractManifestSchemaPaths(schema: Record<string, unknown> | undefined): Set<string> {
  const seen = new Set<string>();
  const visit = (node: unknown, prefix: string[]) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return;
    }
    const record = node as Record<string, unknown>;
    const properties = record.properties;
    if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
      return;
    }
    for (const [key, child] of Object.entries(properties as Record<string, unknown>)) {
      const nextPath = [...prefix, key];
      seen.add(nextPath.join("."));
      visit(child, nextPath);
    }
  };
  visit(schema, []);
  return seen;
}

function extractFixturePaths(
  value: unknown,
  prefix: string[] = [],
  seen = new Set<string>(),
): Set<string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return seen;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = [...prefix, key];
    seen.add(nextPath.join("."));
    extractFixturePaths(child, nextPath, seen);
  }
  return seen;
}

function getStringLiteral(node: ts.Expression | undefined): string | null {
  if (!node) {
    return null;
  }
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function getObjectPropertyString(node: ts.ObjectLiteralExpression, name: string): string | null {
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const propertyName = property.name.getText().replace(/['"]/g, "");
    if (propertyName !== name) {
      continue;
    }
    return getStringLiteral(property.initializer);
  }
  return null;
}

function collectRuntimeInventory(
  sourceText: string,
  fileName: string,
): {
  commands: string[];
  gatewayMethods: string[];
  httpRoutes: string[];
  services: string[];
} {
  const commands = new Set<string>();
  const gatewayMethods = new Set<string>();
  const httpRoutes = new Set<string>();
  const services = new Set<string>();
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === "registerGatewayMethod") {
        const name = getStringLiteral(node.arguments[0]);
        if (name) {
          gatewayMethods.add(name);
        }
      }
      if (method === "registerCommand") {
        const argument = node.arguments[0];
        if (argument && ts.isObjectLiteralExpression(argument)) {
          const name = getObjectPropertyString(argument, "name");
          if (name) {
            commands.add(name);
          }
        }
      }
      if (method === "registerService") {
        const argument = node.arguments[0];
        if (argument && ts.isObjectLiteralExpression(argument)) {
          const id = getObjectPropertyString(argument, "id");
          if (id) {
            services.add(id);
          }
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === "registerPluginHttpRoute") {
        const argument = node.arguments[0];
        if (argument && ts.isObjectLiteralExpression(argument)) {
          const routePath = getObjectPropertyString(argument, "path");
          if (routePath) {
            httpRoutes.add(routePath);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return {
    commands: uniqueSorted(commands),
    gatewayMethods: uniqueSorted(gatewayMethods),
    httpRoutes: uniqueSorted(httpRoutes),
    services: uniqueSorted(services),
  };
}

function collectRelativeModuleSpecifiers(sourceText: string, fileName: string): string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const specifier = getStringLiteral(statement.moduleSpecifier);
      if (specifier?.startsWith(".")) {
        specifiers.add(specifier);
      }
      continue;
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      const specifier = getStringLiteral(statement.moduleSpecifier);
      if (specifier?.startsWith(".")) {
        specifiers.add(specifier);
      }
    }
  }

  return [...specifiers];
}

async function resolveImportedSourceFile(
  repoRoot: string,
  fromRelativePath: string,
  specifier: string,
): Promise<string | null> {
  const fromAbsolutePath = path.join(repoRoot, fromRelativePath);
  const basePath = path.resolve(path.dirname(fromAbsolutePath), specifier);
  const ext = path.extname(basePath);
  const normalizedBase = ext ? basePath.slice(0, -ext.length) : basePath;
  const candidates = [
    `${normalizedBase}.ts`,
    `${normalizedBase}.tsx`,
    `${normalizedBase}.mts`,
    `${normalizedBase}.cts`,
    path.join(normalizedBase, "index.ts"),
    path.join(normalizedBase, "index.tsx"),
    path.join(normalizedBase, "index.mts"),
    path.join(normalizedBase, "index.cts"),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return toPosixPath(path.relative(repoRoot, candidate));
    } catch {
      // keep trying other candidates
    }
  }

  return null;
}

async function collectRuntimeInventoryFromModuleGraph(
  repoRoot: string,
  entryPath: string,
): Promise<{
  commands: string[];
  gatewayMethods: string[];
  httpRoutes: string[];
  services: string[];
}> {
  const commands = new Set<string>();
  const gatewayMethods = new Set<string>();
  const httpRoutes = new Set<string>();
  const services = new Set<string>();
  const visited = new Set<string>();

  const visitFile = async (relativePath: string): Promise<void> => {
    const normalizedPath = toPosixPath(relativePath);
    if (visited.has(normalizedPath)) {
      return;
    }
    visited.add(normalizedPath);

    const sourceText = await readTextFile(repoRoot, normalizedPath);
    const inventory = collectRuntimeInventory(sourceText, normalizedPath);
    for (const name of inventory.commands) {
      commands.add(name);
    }
    for (const name of inventory.gatewayMethods) {
      gatewayMethods.add(name);
    }
    for (const routePath of inventory.httpRoutes) {
      httpRoutes.add(routePath);
    }
    for (const id of inventory.services) {
      services.add(id);
    }

    const specifiers = collectRelativeModuleSpecifiers(sourceText, normalizedPath);
    for (const specifier of specifiers) {
      const nextRelativePath = await resolveImportedSourceFile(repoRoot, normalizedPath, specifier);
      if (nextRelativePath) {
        await visitFile(nextRelativePath);
      }
    }
  };

  await visitFile(entryPath);
  return {
    commands: uniqueSorted(commands),
    gatewayMethods: uniqueSorted(gatewayMethods),
    httpRoutes: uniqueSorted(httpRoutes),
    services: uniqueSorted(services),
  };
}

async function readTextFile(repoRoot: string, relativePath: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

function parseFrontMatter(content: string): { data: Record<string, unknown>; body: string } {
  if (!content.startsWith("---\n")) {
    return { data: {}, body: content };
  }
  const endIndex = content.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { data: {}, body: content };
  }
  const raw = content.slice(4, endIndex);
  const body = content.slice(endIndex + 5);
  const parsed = parseYaml(raw);
  return {
    data:
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {},
    body,
  };
}

function isWeb3DocCandidate(relativePath: string): boolean {
  if (relativePath.startsWith("docs/zh-CN/")) {
    return false;
  }
  if (WEB3_DOC_EXPLICIT_PATHS.has(relativePath)) {
    return true;
  }
  return relativePath.startsWith("docs/web3/") || relativePath.includes("/web3-");
}

async function listMarkdownFiles(rootDir: string): Promise<string[]> {
  const results: string[] = [];
  const visit = async (currentDir: string) => {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = toPosixPath(path.relative(rootDir, absolutePath));
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(relativePath);
      }
    }
  };
  await visit(path.join(rootDir, "docs"));
  return results.toSorted(compareStrings);
}

export function extractDeclaredContracts(body: string): string[] {
  const declared = new Set<string>();
  const inlineBody = body.replace(/```[\s\S]*?```/g, "");
  for (const match of inlineBody.matchAll(CODE_FRAGMENT_PATTERN)) {
    const fragment = match[1]?.trim();
    if (!fragment) {
      continue;
    }
    if (
      /^web3(\.[A-Za-z0-9_*]+)+$/.test(fragment) ||
      /^market(\.[A-Za-z0-9_*]+)+$/.test(fragment)
    ) {
      declared.add(fragment);
      continue;
    }
    if (/^agent-wallet\.(create|balance|sign|send|autopay)$/.test(fragment)) {
      declared.add(fragment);
      continue;
    }
    if (fragment === "web3_market_status") {
      declared.add(fragment);
      continue;
    }
    if (
      fragment.startsWith("/web3") ||
      fragment.startsWith("/bind_wallet") ||
      fragment.startsWith("/unbind_wallet") ||
      fragment.startsWith("/whoami_web3") ||
      fragment.startsWith("/credits") ||
      fragment.startsWith("/pay_status") ||
      fragment.startsWith("/audit_status")
    ) {
      declared.add(fragment.split(/\s+/, 1)[0] ?? fragment);
    }
  }
  return uniqueSorted(declared);
}

function referenceExists(reference: string, validContracts: Set<string>): boolean {
  if (reference.includes("*")) {
    const prefix = reference.slice(0, reference.indexOf("*"));
    for (const candidate of validContracts) {
      if (candidate.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }
  return validContracts.has(reference);
}

function buildValidContractSet(snapshot: Web3ContractSnapshot): Set<string> {
  const valid = new Set<string>();
  for (const plugin of snapshot.plugins) {
    valid.add(plugin.id);
    for (const entry of plugin.runtime.commands) {
      valid.add(`/${entry}`);
    }
    for (const entry of plugin.runtime.gatewayMethods) {
      valid.add(entry);
    }
    for (const entry of plugin.runtime.httpRoutes) {
      valid.add(entry);
    }
  }
  for (const capability of snapshot.capabilities.maxEnabled) {
    valid.add(capability.name);
  }
  return valid;
}

function buildStableCapabilityMap(capabilities: CapabilityDescriptor[]): Map<string, string> {
  const stableEntries = capabilities
    .filter((entry) => entry.stability === "stable")
    .map((entry) => [entry.name, JSON.stringify(sortJson(entry))] as const)
    .toSorted(([left], [right]) => compareStrings(left, right));
  return new Map(stableEntries);
}

export function collectGovernanceIssues(snapshot: Web3ContractSnapshot): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const validContracts = buildValidContractSet(snapshot);

  for (const plugin of snapshot.plugins) {
    for (const missingPath of plugin.manifestCoverageMissingPaths) {
      issues.push({
        kind: "manifest_schema",
        path: plugin.manifestPath,
        message: `${plugin.id} manifest is missing configSchema path \`${missingPath}\``,
      });
    }
  }

  for (const doc of snapshot.docs) {
    if (!doc.docLayer || !DOC_LAYERS.has(doc.docLayer)) {
      issues.push({
        kind: "doc_metadata",
        path: doc.path,
        message:
          "doc_family=web3 pages must declare doc_layer: reference | guide | status | historical",
      });
    }
    if (doc.normative === null) {
      issues.push({
        kind: "doc_metadata",
        path: doc.path,
        message: "doc_family=web3 pages must declare normative: true|false",
      });
    }
    if (doc.docLayer === "historical" && doc.normative !== false) {
      issues.push({
        kind: "historical_doc",
        path: doc.path,
        message: "historical docs must be explicitly non-normative",
      });
    }
    if (doc.docLayer !== "historical") {
      for (const reference of doc.declaredContracts) {
        if (!referenceExists(reference, validContracts)) {
          issues.push({
            kind: "doc_reference",
            path: doc.path,
            message: `documented contract \`${reference}\` does not exist in runtime/capability inventory`,
          });
        }
      }
    }
  }

  const stableMap = buildStableCapabilityMap(snapshot.capabilities.maxEnabled);
  for (const descriptor of snapshot.capabilities.defaultConfig) {
    if (descriptor.stability !== "stable") {
      continue;
    }
    if (!stableMap.has(descriptor.name)) {
      issues.push({
        kind: "stable_capability",
        message: `stable capability \`${descriptor.name}\` is missing from max-enabled inventory`,
      });
    }
  }

  for (const descriptor of snapshot.capabilities.maxEnabled) {
    if (!descriptor.examples || descriptor.examples.length === 0) {
      continue;
    }
    const normalizedSchema = normalizeCapabilitySchema(descriptor.paramsSchema ?? {});
    for (const example of descriptor.examples) {
      const validation = validateJsonSchemaValue({
        schema: normalizedSchema,
        cacheKey: `web3-contract:${descriptor.name}`,
        value: example.params ?? {},
      });
      if (!validation.ok) {
        issues.push({
          kind: "capability_example",
          message: `capability example \`${descriptor.name}\` / \`${example.summary}\` failed schema validation: ${validation.errors[0]?.text ?? "invalid"}`,
        });
      }
    }
  }

  return issues.toSorted((left, right) => {
    const leftKey = `${left.path ?? ""}:${left.kind}:${left.message}`;
    const rightKey = `${right.path ?? ""}:${right.kind}:${right.message}`;
    return compareStrings(leftKey, rightKey);
  });
}

export async function buildWeb3ContractSnapshot(repoRoot: string): Promise<Web3ContractSnapshot> {
  const plugins = await Promise.all(
    TARGET_PLUGINS.map(async (pluginDef) => {
      const manifestResult = loadPluginManifest(
        path.join(repoRoot, path.dirname(pluginDef.manifestPath)),
      );
      if (!manifestResult.ok) {
        throw new Error(`failed to load manifest for ${pluginDef.id}: ${manifestResult.error}`);
      }
      const manifest = manifestResult.manifest;
      const runtime = await collectRuntimeInventoryFromModuleGraph(repoRoot, pluginDef.entryPath);
      const manifestPaths = extractManifestSchemaPaths(manifest.configSchema);
      const fixturePaths = extractFixturePaths(MANIFEST_FIXTURES[pluginDef.id] ?? {});
      const manifestCoverageMissingPaths = [...fixturePaths].filter(
        (entry) => !manifestPaths.has(entry),
      );
      return {
        id: pluginDef.id,
        entryPath: pluginDef.entryPath,
        manifestPath: pluginDef.manifestPath,
        manifest,
        manifestCoverageMissingPaths: manifestCoverageMissingPaths.toSorted(compareStrings),
        runtime,
      };
    }),
  );

  const defaultCapabilities = describeWeb3Capabilities(resolveWeb3Config({}), {
    includeUnavailable: true,
  })
    .slice()
    .toSorted((left, right) => compareStrings(left.name, right.name));
  const maxEnabledConfig = resolveWeb3Config(MANIFEST_FIXTURES["web3-core"]);
  const maxEnabledCapabilities = describeWeb3Capabilities(maxEnabledConfig, {
    includeUnavailable: true,
  })
    .slice()
    .toSorted((left, right) => compareStrings(left.name, right.name));

  const markdownFiles = await listMarkdownFiles(repoRoot);
  const docs = await Promise.all(
    markdownFiles.filter(isWeb3DocCandidate).map(async (relativePath) => {
      const content = await readTextFile(repoRoot, relativePath);
      const { data, body } = parseFrontMatter(content);
      const docFamily = typeof data.doc_family === "string" ? data.doc_family.trim() : null;
      if (docFamily !== "web3") {
        return {
          path: relativePath,
          title: typeof data.title === "string" ? data.title.trim() : null,
          docLayer: null,
          normative: typeof data.normative === "boolean" ? data.normative : null,
          declaredContracts: extractDeclaredContracts(body),
        };
      }
      return {
        path: relativePath,
        title: typeof data.title === "string" ? data.title.trim() : null,
        docLayer: typeof data.doc_layer === "string" ? data.doc_layer.trim() : null,
        normative: typeof data.normative === "boolean" ? data.normative : null,
        declaredContracts: extractDeclaredContracts(body),
      };
    }),
  );

  return {
    schemaVersion: 1,
    plugins: plugins.toSorted((left, right) => compareStrings(left.id, right.id)),
    capabilities: {
      defaultConfig: defaultCapabilities,
      maxEnabled: maxEnabledCapabilities,
      stableNames: uniqueSorted(
        maxEnabledCapabilities
          .filter((entry) => entry.stability === "stable")
          .map((entry) => entry.name),
      ),
    },
    docs: docs.toSorted((left, right) => compareStrings(left.path, right.path)),
  };
}

export async function readCommittedWeb3ContractSnapshot(
  repoRoot: string,
): Promise<Web3ContractSnapshot | null> {
  const snapshotPath = path.join(repoRoot, WEB3_CONTRACT_SNAPSHOT_PATH);
  try {
    const raw = await fs.readFile(snapshotPath, "utf8");
    return JSON.parse(raw) as Web3ContractSnapshot;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeWeb3ContractSnapshot(
  repoRoot: string,
  snapshot: Web3ContractSnapshot,
): Promise<void> {
  const snapshotPath = path.join(repoRoot, WEB3_CONTRACT_SNAPSHOT_PATH);
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, stringifySnapshot(snapshot));
}

export function compareSnapshots(
  currentSnapshot: Web3ContractSnapshot | null,
  nextSnapshot: Web3ContractSnapshot,
): ContractIssue[] {
  if (!currentSnapshot) {
    return [
      {
        kind: "snapshot",
        path: WEB3_CONTRACT_SNAPSHOT_PATH,
        message: "committed snapshot is missing; run the generator in write mode",
      },
    ];
  }
  if (stringifySnapshot(currentSnapshot) === stringifySnapshot(nextSnapshot)) {
    return [];
  }
  const currentStable = buildStableCapabilityMap(currentSnapshot.capabilities.maxEnabled);
  const nextStable = buildStableCapabilityMap(nextSnapshot.capabilities.maxEnabled);
  const issues: ContractIssue[] = [
    {
      kind: "snapshot",
      path: WEB3_CONTRACT_SNAPSHOT_PATH,
      message: "committed Web3 contract snapshot is out of date; regenerate it",
    },
  ];
  const stableNames = uniqueSorted([...currentStable.keys(), ...nextStable.keys()]);
  for (const name of stableNames) {
    if (currentStable.get(name) !== nextStable.get(name)) {
      issues.push({
        kind: "stable_capability",
        message: `stable capability drift detected for \`${name}\``,
      });
    }
  }
  return issues;
}

export function formatIssues(issues: ContractIssue[]): string {
  return issues
    .map((issue) => `- ${issue.path ? `${issue.path}: ` : ""}${issue.message}`)
    .join("\n");
}

export async function loadManifestForTests(rootDir: string): Promise<PluginManifestLoadResult> {
  return loadPluginManifest(rootDir);
}
