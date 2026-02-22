import fs from "node:fs/promises";
import path from "node:path";
import { withFileLock } from "openclaw/plugin-sdk";

const DEFAULT_LOCK_OPTIONS = {
  retries: {
    retries: 6,
    factor: 1.6,
    minTimeout: 40,
    maxTimeout: 800,
    randomize: true,
  },
  stale: 15_000,
};

type DirectorySnapshot = {
  files: Map<string, Buffer>;
};

const TRANSACTION_DEPTH = new Map<string, number>();

function isLockFile(name: string): boolean {
  return name.endsWith(".lock") || name.includes(".lock.");
}

async function snapshotDirectory(dir: string): Promise<DirectorySnapshot> {
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = new Map<string, Buffer>();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (isLockFile(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    files.set(entry.name, await fs.readFile(fullPath));
  }
  return { files };
}

async function restoreDirectory(dir: string, snapshot: DirectorySnapshot): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (isLockFile(entry.name)) continue;
    if (!snapshot.files.has(entry.name)) {
      await fs.rm(path.join(dir, entry.name), { force: true });
    }
  }
  for (const [name, data] of snapshot.files.entries()) {
    await fs.writeFile(path.join(dir, name), data);
  }
}

export async function runFileStoreTransaction(
  dir: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  const lockTarget = path.join(dir, "market-store");
  await fs.mkdir(dir, { recursive: true });
  await withFileLock(lockTarget, DEFAULT_LOCK_OPTIONS, async () => {
    const depth = (TRANSACTION_DEPTH.get(lockTarget) ?? 0) + 1;
    TRANSACTION_DEPTH.set(lockTarget, depth);
    try {
      if (depth > 1) {
        await fn();
        return;
      }
      const snapshot = await snapshotDirectory(dir);
      try {
        await fn();
      } catch (err) {
        await restoreDirectory(dir, snapshot);
        throw err;
      }
    } finally {
      const nextDepth = (TRANSACTION_DEPTH.get(lockTarget) ?? 1) - 1;
      if (nextDepth <= 0) {
        TRANSACTION_DEPTH.delete(lockTarget);
      } else {
        TRANSACTION_DEPTH.set(lockTarget, nextDepth);
      }
    }
  });
}
