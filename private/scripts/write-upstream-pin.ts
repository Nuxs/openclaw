import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type UpstreamPin = {
  upstream: { remote: "upstream"; ref: string; sha: string };
  sync: {
    beforeSha: string;
    afterSha: string;
    at: string;
    strategy: "merge" | "rebase";
  };
  conflicts?: {
    predicted: {
      total: number;
      brand: number;
      other: number;
      files: string[];
      brandFiles?: string[];
      otherFiles?: string[];
    };
  };
};

type ParsedArgs = {
  targetRef: string;
  strategy: "merge" | "rebase";
  beforeSha?: string;
  afterSha?: string;
  at?: string;
  check: boolean;
  requireHead: boolean;
  noFetch: boolean;
  conflictsJsonPath?: string;
  outJsonPath: string;
  outMdPath: string;
};

const DEFAULT_UPSTREAM_URL = "https://github.com/openclaw/openclaw.git";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function execGit(args: string[], opts?: { cwd?: string }): string {
  return execFileSync("git", args, {
    cwd: opts?.cwd ?? repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryExecGit(args: string[]): string | null {
  try {
    return execGit(args);
  } catch {
    return null;
  }
}

function ensureUpstreamRemote(): void {
  const existing = tryExecGit(["remote", "get-url", "upstream"]);
  if (existing) {
    return;
  }
  execGit(["remote", "add", "upstream", DEFAULT_UPSTREAM_URL]);
}

function fetchUpstream(): void {
  execGit(["fetch", "upstream", "--tags", "--prune"]);
}

function gitHeadSha(): string {
  return execGit(["rev-parse", "HEAD"]);
}

function ensureCommitExists(sha: string, label: string): void {
  const t = execGit(["cat-file", "-t", sha]);
  if (t !== "commit") {
    throw new Error(`${label} is not a commit: ${sha} (type=${t})`);
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  let targetRef = "upstream/main";
  let strategy: "merge" | "rebase" = "merge";
  let beforeSha: string | undefined;
  let afterSha: string | undefined;
  let at: string | undefined;
  let check = false;
  let requireHead = false;
  let noFetch = false;
  let conflictsJsonPath: string | undefined;
  let outJsonPath = path.join(repoRoot, "private", "upstream-pin.json");
  let outMdPath = path.join(repoRoot, "private", "upstream-pin.md");

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--target") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("Missing --target value");
      }
      targetRef = next;
      index++;
      continue;
    }
    if (arg === "--strategy") {
      const next = argv[index + 1];
      if (next !== "merge" && next !== "rebase") {
        throw new Error("Missing/invalid --strategy (merge|rebase)");
      }
      strategy = next;
      index++;
      continue;
    }
    if (arg === "--before") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("Missing --before value");
      }
      beforeSha = next;
      index++;
      continue;
    }
    if (arg === "--after") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("Missing --after value");
      }
      afterSha = next;
      index++;
      continue;
    }
    if (arg === "--at") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("Missing --at value");
      }
      at = next;
      index++;
      continue;
    }
    if (arg === "--check") {
      check = true;
      continue;
    }
    if (arg === "--require-head") {
      requireHead = true;
      continue;
    }
    if (arg === "--no-fetch") {
      noFetch = true;
      continue;
    }
    if (arg === "--conflicts-json") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("Missing --conflicts-json value");
      }
      conflictsJsonPath = path.resolve(repoRoot, next);
      index++;
      continue;
    }
    if (arg === "--out-json") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("Missing --out-json value");
      }
      outJsonPath = path.resolve(repoRoot, next);
      index++;
      continue;
    }
    if (arg === "--out-md") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("Missing --out-md value");
      }
      outMdPath = path.resolve(repoRoot, next);
      index++;
      continue;
    }
  }

  return {
    targetRef,
    strategy,
    beforeSha,
    afterSha,
    at,
    check,
    requireHead,
    noFetch,
    conflictsJsonPath,
    outJsonPath,
    outMdPath,
  };
}

function normalizePin(pin: UpstreamPin): UpstreamPin {
  return {
    upstream: {
      remote: "upstream",
      ref: pin.upstream.ref,
      sha: pin.upstream.sha,
    },
    sync: {
      beforeSha: pin.sync.beforeSha,
      afterSha: pin.sync.afterSha,
      at: pin.sync.at,
      strategy: pin.sync.strategy,
    },
    conflicts: pin.conflicts
      ? {
          predicted: {
            total: pin.conflicts.predicted.total,
            brand: pin.conflicts.predicted.brand,
            other: pin.conflicts.predicted.other,
            files: [...pin.conflicts.predicted.files],
            brandFiles: pin.conflicts.predicted.brandFiles
              ? [...pin.conflicts.predicted.brandFiles]
              : undefined,
            otherFiles: pin.conflicts.predicted.otherFiles
              ? [...pin.conflicts.predicted.otherFiles]
              : undefined,
          },
        }
      : undefined,
  };
}

function pinToJson(pin: UpstreamPin): string {
  return `${JSON.stringify(normalizePin(pin), null, 2)}\n`;
}

function shortSha(sha: string): string {
  return sha.length >= 8 ? sha.slice(0, 8) : sha;
}

function renderPinMarkdown(pin: UpstreamPin): string {
  const lines: string[] = [];

  lines.push("## Upstream Pin (authoritative: `private/upstream-pin.json`)");
  lines.push("");
  lines.push(`- **upstream**: ${pin.upstream.ref} @ ${shortSha(pin.upstream.sha)}`);
  lines.push(
    `- **sync**: ${pin.sync.strategy} ${shortSha(pin.sync.beforeSha)} → ${shortSha(pin.sync.afterSha)} (${pin.sync.at})`,
  );

  if (pin.conflicts?.predicted) {
    const p = pin.conflicts.predicted;
    lines.push(`- **predicted conflicts**: total=${p.total} brand=${p.brand} other=${p.other}`);
    if (p.files.length > 0) {
      lines.push("  - files:");
      for (const f of p.files) {
        // Avoid template-string escaping issues with backticks.
        lines.push("    - `" + f + "`");
      }
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function maybeReadConflicts(conflictsJsonPath: string | undefined): UpstreamPin["conflicts"] {
  if (!conflictsJsonPath) {
    return undefined;
  }
  const parsed = readJsonFile<unknown>(conflictsJsonPath);
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  if (!("predicted" in parsed)) {
    return undefined;
  }
  const predicted = (parsed as { predicted?: unknown }).predicted;
  if (typeof predicted !== "object" || predicted === null) {
    return undefined;
  }

  const total =
    typeof (predicted as { total?: unknown }).total === "number"
      ? (predicted as { total: number }).total
      : 0;
  const brand =
    typeof (predicted as { brand?: unknown }).brand === "number"
      ? (predicted as { brand: number }).brand
      : 0;
  const other =
    typeof (predicted as { other?: unknown }).other === "number"
      ? (predicted as { other: number }).other
      : 0;
  const files = Array.isArray((predicted as { files?: unknown }).files)
    ? (predicted as { files: unknown[] }).files.filter(isString)
    : [];
  const brandFiles = Array.isArray((predicted as { brandFiles?: unknown }).brandFiles)
    ? (predicted as { brandFiles: unknown[] }).brandFiles.filter(isString)
    : undefined;
  const otherFiles = Array.isArray((predicted as { otherFiles?: unknown }).otherFiles)
    ? (predicted as { otherFiles: unknown[] }).otherFiles.filter(isString)
    : undefined;

  return {
    predicted: {
      total,
      brand,
      other,
      files,
      brandFiles,
      otherFiles,
    },
  };
}

async function main() {
  // Makes `... | head` safe.
  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") {
      process.exit(0);
    }
    throw error;
  });

  const args = parseArgs(process.argv.slice(2));

  ensureUpstreamRemote();
  if (!args.noFetch) {
    fetchUpstream();
  }

  if (args.check) {
    if (!fs.existsSync(args.outJsonPath)) {
      throw new Error(`Missing pin file: ${args.outJsonPath}`);
    }
    if (!fs.existsSync(args.outMdPath)) {
      throw new Error(`Missing pin file: ${args.outMdPath}`);
    }

    const pin = readJsonFile<UpstreamPin>(args.outJsonPath);
    const head = gitHeadSha();
    if (args.requireHead && pin.sync.afterSha !== head) {
      throw new Error(`Pin afterSha mismatch: expected HEAD=${head}, got ${pin.sync.afterSha}`);
    }

    ensureCommitExists(pin.upstream.sha, "pin.upstream.sha");
    ensureCommitExists(pin.sync.beforeSha, "pin.sync.beforeSha");
    ensureCommitExists(pin.sync.afterSha, "pin.sync.afterSha");

    const expectedJson = pinToJson(pin);
    const actualJson = fs.readFileSync(args.outJsonPath, "utf8");
    if (actualJson !== expectedJson) {
      throw new Error("Pin JSON is not normalized (run write-upstream-pin.ts to rewrite)");
    }

    const expectedMd = renderPinMarkdown(pin);
    const actualMd = fs.readFileSync(args.outMdPath, "utf8");
    if (actualMd !== expectedMd) {
      throw new Error("Pin Markdown does not match JSON (run write-upstream-pin.ts to rewrite)");
    }

    return;
  }

  const afterSha = args.afterSha ?? gitHeadSha();
  const beforeSha = args.beforeSha;
  if (!beforeSha) {
    throw new Error("Missing required --before <sha> (sync-upstream.sh should pass this)");
  }

  const upstreamSha = execGit(["rev-parse", args.targetRef]);
  const conflicts = maybeReadConflicts(args.conflictsJsonPath);

  const pin: UpstreamPin = {
    upstream: { remote: "upstream", ref: args.targetRef, sha: upstreamSha },
    sync: {
      beforeSha,
      afterSha,
      at: args.at ?? new Date().toISOString(),
      strategy: args.strategy,
    },
    conflicts,
  };

  fs.mkdirSync(path.dirname(args.outJsonPath), { recursive: true });
  fs.writeFileSync(args.outJsonPath, pinToJson(pin));
  fs.writeFileSync(args.outMdPath, renderPinMarkdown(pin));
}

await main();
