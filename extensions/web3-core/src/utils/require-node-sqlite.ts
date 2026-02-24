import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function tryRequireNodeSqlite(): typeof import("node:sqlite") | null {
  try {
    return require("node:sqlite") as typeof import("node:sqlite");
  } catch {
    return null;
  }
}

export function requireNodeSqlite(): typeof import("node:sqlite") {
  const sqlite = tryRequireNodeSqlite();
  if (sqlite) {
    return sqlite;
  }
  throw new Error(
    "SQLite support is unavailable in this Node runtime (missing node:sqlite). " +
      'Either run a Node build that includes it, or set market-core store.mode="file".',
  );
}
