/**
 * Optional dependency detection and on-demand installation.
 *
 * Pattern follows `extensions/matrix/src/matrix/deps.ts`:
 * detect → prompt → install → verify.
 *
 * Currently covers:
 * - `viem` (EVM chains)
 * - `@solana/web3.js` (Solana — reserved)
 * - `@mysten/sui.js` (Sui — reserved)
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BlockchainError, ErrorCode } from "./types/error.js";

// ---------------------------------------------------------------------------
// Package names
// ---------------------------------------------------------------------------

const VIEM_PACKAGE = "viem";
const SOLANA_PACKAGE = "@solana/web3.js";
const SUI_PACKAGE = "@mysten/sui.js";

// ---------------------------------------------------------------------------
// Availability checks
// ---------------------------------------------------------------------------

function isPackageAvailable(pkg: string): boolean {
  try {
    const req = createRequire(import.meta.url);
    req.resolve(pkg);
    return true;
  } catch {
    return false;
  }
}

/** Check whether `viem` can be resolved at runtime. */
export function isViemAvailable(): boolean {
  return isPackageAvailable(VIEM_PACKAGE);
}

/** Check whether `@solana/web3.js` can be resolved at runtime. */
export function isSolanaAvailable(): boolean {
  return isPackageAvailable(SOLANA_PACKAGE);
}

/** Check whether `@mysten/sui.js` can be resolved at runtime. */
export function isSuiAvailable(): boolean {
  return isPackageAvailable(SUI_PACKAGE);
}

/** Return a map of chain type → availability. */
export function getChainAvailability(): Record<string, boolean> {
  return {
    ton: true, // TON deps are hard dependencies, always available
    evm: isViemAvailable(),
    solana: isSolanaAvailable(),
    sui: isSuiAvailable(),
  };
}

// ---------------------------------------------------------------------------
// Install helpers
// ---------------------------------------------------------------------------

function resolveExtensionRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  // src/ -> extension root
  return path.resolve(currentDir, "..");
}

interface InstallDepsParams {
  /** Logging callback (optional). */
  log?: (message: string) => void;
  /** Custom command runner. Falls back to child_process spawn. */
  runCommand?: (opts: {
    argv: string[];
    cwd: string;
    timeoutMs: number;
    env?: Record<string, string>;
  }) => Promise<{ code: number | null; stdout: string; stderr: string }>;
}

async function defaultRunCommand(opts: {
  argv: string[];
  cwd: string;
  timeoutMs: number;
  env?: Record<string, string>;
}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const [cmd, ...args] = opts.argv;
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: "pipe",
      env: { ...process.env, ...opts.env },
      timeout: opts.timeoutMs,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", (err) => resolve({ code: 1, stdout, stderr: err.message }));
  });
}

/**
 * Ensure `viem` is installed. If missing, attempt automatic installation.
 *
 * @throws BlockchainError if installation fails or package remains unavailable.
 */
export async function ensureViemInstalled(params: InstallDepsParams = {}): Promise<void> {
  if (isViemAvailable()) return;

  const root = resolveExtensionRoot();
  const runCommand = params.runCommand ?? defaultRunCommand;
  const pkg = `${VIEM_PACKAGE}@^2.0.0`;

  params.log?.(`blockchain-adapter: EVM chains require '${VIEM_PACKAGE}'. Installing ${pkg}…`);

  const result = await runCommand({
    argv: ["npm", "install", "--save", pkg, "--omit=dev", "--silent"],
    cwd: root,
    timeoutMs: 120_000,
    env: { COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
  });

  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "unknown error";
    throw new BlockchainError(
      `Failed to install ${VIEM_PACKAGE}: ${detail}. Install manually: npm install ${pkg}`,
      ErrorCode.NOT_SUPPORTED,
      "evm",
    );
  }

  if (!isViemAvailable()) {
    throw new BlockchainError(
      `Installation completed but ${VIEM_PACKAGE} is still unavailable. Try: npm install ${pkg}`,
      ErrorCode.NOT_SUPPORTED,
      "evm",
    );
  }

  params.log?.(`blockchain-adapter: ${VIEM_PACKAGE} installed successfully.`);
}

/**
 * Assert that viem is available, throwing a user-friendly error if not.
 * Unlike `ensureViemInstalled`, this does NOT attempt automatic installation.
 */
export function assertViemAvailable(): void {
  if (!isViemAvailable()) {
    throw new BlockchainError(
      `EVM chain support requires '${VIEM_PACKAGE}'. Install it with: npm install ${VIEM_PACKAGE}`,
      ErrorCode.NOT_SUPPORTED,
      "evm",
    );
  }
}

// ---------------------------------------------------------------------------
// Dynamic EVM module loader
// ---------------------------------------------------------------------------

/** Lazily import the EVM provider module. Throws if viem is missing. */
export async function loadEvmProvider(): Promise<typeof import("./providers/evm/index.js")> {
  assertViemAvailable();
  return import("./providers/evm/index.js");
}
