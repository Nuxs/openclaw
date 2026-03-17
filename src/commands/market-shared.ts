import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import readline from "node:readline";
import { callGatewayCli } from "../gateway/call.js";
import { getTerminalTableWidth, renderTable, type TableColumn } from "../terminal/table.js";

export async function callCliGateway<T = Record<string, unknown>>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return await callGatewayCli<T>({ method, params });
}

export function resolveUserPath(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return resolve(homedir(), filePath.slice(2));
  }
  if (filePath === "~") {
    return homedir();
  }
  return resolve(filePath);
}

export function readJsonObjectFile(filePath: string): Record<string, unknown> {
  const resolvedPath = resolveUserPath(filePath);
  const parsed = JSON.parse(readFileSync(resolvedPath, "utf-8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Expected a JSON object in ${resolvedPath}`);
  }
  return parsed as Record<string, unknown>;
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function printTable(columns: TableColumn[], rows: Array<Record<string, string>>): void {
  console.log(
    renderTable({
      columns,
      rows,
      width: getTerminalTableWidth(),
    }),
  );
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function asDisplayString(value: unknown): string | null {
  const stringValue = asString(value);
  if (stringValue) {
    return stringValue;
  }
  const numberValue = asNumber(value);
  return numberValue === null ? null : String(numberValue);
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function shortId(value: unknown, length = 12): string {
  const raw = asString(value);
  if (!raw) {
    return "n/a";
  }
  return raw.length > length ? raw.slice(0, length) : raw;
}

export function formatTimestamp(value: unknown): string {
  const raw = asString(value);
  if (!raw) {
    return "n/a";
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : raw;
}

export function parseCsv(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function requireStringOption(value: unknown, label: string): string {
  const normalized = asString(value);
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

export function optionalNumberOption(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = asNumber(value);
  if (parsed === null) {
    throw new Error(`${label} must be a number`);
  }
  return parsed;
}

export function optionalIntegerOption(value: unknown, label: string): number | undefined {
  const parsed = optionalNumberOption(value, label);
  if (parsed === undefined) {
    return undefined;
  }
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer`);
  }
  return parsed;
}

export function formatUnitPrice(price: Record<string, unknown> | null): string {
  if (!price) {
    return "n/a";
  }
  const amount = asString(price.amount) ?? "n/a";
  const currency = asString(price.currency) ?? "n/a";
  const unit = asString(price.unit) ?? "unit";
  return `${amount} ${currency}/${unit}`;
}

export function buildAssetMeta(params: {
  existing?: Record<string, unknown> | null;
  title?: string | null;
  description?: string | null;
  tags?: string[];
}): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = { ...params.existing };
  if (params.title) {
    next.title = params.title;
  }
  if (params.description) {
    next.description = params.description;
  }
  if (params.tags && params.tags.length > 0) {
    next.tags = params.tags;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export async function promptConfirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return await new Promise<boolean>((resolvePromise) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolvePromise(answer.trim().toLowerCase() === "y");
    });
  });
}
