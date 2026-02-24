import fs from "node:fs";
import path from "node:path";

const DEFAULT_PRODUCT_NAME = "OpenClaw";

export type ProductBrand = {
  productName: string;
  productTitle: string;
};

function isExpectedSafePathError(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  return code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP";
}

function readBrandJson(params?: { cwd?: string; env?: NodeJS.ProcessEnv }): {
  name?: string;
  title?: string;
} {
  const env = params?.env ?? process.env;
  const cwd = params?.cwd ?? process.cwd();

  const explicit = env.OPENCLAW_BRAND_JSON_PATH?.trim();
  const brandPath = explicit
    ? path.resolve(cwd, explicit)
    : path.resolve(cwd, "private/brand.json");

  try {
    const raw = fs.readFileSync(brandPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }

    const maybeName = "name" in parsed ? (parsed as { name?: unknown }).name : undefined;
    const maybeUi = "ui" in parsed ? (parsed as { ui?: unknown }).ui : undefined;
    const maybeTitle =
      typeof maybeUi === "object" && maybeUi !== null && "title" in maybeUi
        ? (maybeUi as { title?: unknown }).title
        : undefined;

    const name = typeof maybeName === "string" ? maybeName.trim() : "";
    const title = typeof maybeTitle === "string" ? maybeTitle.trim() : "";

    return {
      name: name || undefined,
      title: title || undefined,
    };
  } catch (error) {
    // `private/brand.json` is optional.
    if (isExpectedSafePathError(error)) {
      return {};
    }
    const code =
      typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT" || code === "ENOTDIR") {
      return {};
    }
    return {};
  }
}

function coerceEnvString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveProductBrand(params?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): ProductBrand {
  const env = params?.env ?? process.env;
  const envName = coerceEnvString(env.OPENCLAW_PRODUCT_NAME);
  const envTitle = coerceEnvString(env.OPENCLAW_PRODUCT_TITLE);

  const fromJson = readBrandJson(params);
  const productName = envName ?? fromJson.name ?? DEFAULT_PRODUCT_NAME;
  const productTitle = envTitle ?? fromJson.title ?? productName;

  return { productName, productTitle };
}

export function resolveProductName(params?: { cwd?: string; env?: NodeJS.ProcessEnv }): string {
  return resolveProductBrand(params).productName;
}

export function escapeHtml(value: string): string {
  // Minimal escaping for values injected into HTML.
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
