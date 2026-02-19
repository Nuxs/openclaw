type StringArrayOptions = {
  maxItems?: number;
  maxLen?: number;
  unique?: boolean;
};

const invalid = (message: string) => new Error(`E_INVALID_ARGUMENT: ${message}`);

export function requireEnum<T extends string>(
  params: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T {
  const raw = params[key];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw invalid(`${key} is required`);
  }
  if (!allowed.includes(raw as T)) {
    throw invalid(`invalid enum: ${key}`);
  }
  return raw as T;
}

export function requireOptionalEnum<T extends string>(
  params: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const raw = params[key];
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  if (typeof raw !== "string") {
    throw invalid(`invalid enum: ${key}`);
  }
  if (!allowed.includes(raw as T)) {
    throw invalid(`invalid enum: ${key}`);
  }
  return raw as T;
}

export function requireStringArray(
  params: Record<string, unknown>,
  key: string,
  opts: StringArrayOptions = {},
): string[] {
  const raw = params[key];
  if (!Array.isArray(raw)) {
    throw invalid(`${key} must be an array`);
  }
  const items = raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  if (items.length === 0) {
    throw invalid(`${key} must include at least one value`);
  }
  if (opts.unique) {
    const uniqueItems = Array.from(new Set(items));
    if (uniqueItems.length !== items.length) {
      throw invalid(`${key} must be unique`);
    }
  }
  if (opts.maxItems !== undefined && items.length > opts.maxItems) {
    throw invalid(`${key} must have at most ${opts.maxItems} items`);
  }
  const maxLen = opts.maxLen;
  if (maxLen !== undefined && items.some((item) => item.length > maxLen)) {
    throw invalid(`${key} entries must be <= ${maxLen} chars`);
  }
  return items;
}

export function requireOptionalStringArray(
  params: Record<string, unknown>,
  key: string,
  opts: StringArrayOptions = {},
): string[] | undefined {
  const raw = params[key];
  if (raw === undefined || raw === null) {
    return undefined;
  }
  return requireStringArray(params, key, opts);
}

export function requirePositiveInt(
  params: Record<string, unknown>,
  key: string,
  opts: { min?: number; max?: number } = {},
): number {
  const raw = params[key];
  if (typeof raw !== "number" || Number.isNaN(raw) || !Number.isInteger(raw)) {
    throw invalid(`${key} must be an integer`);
  }
  if (opts.min !== undefined && raw < opts.min) {
    throw invalid(`${key} must be >= ${opts.min}`);
  }
  if (opts.max !== undefined && raw > opts.max) {
    throw invalid(`${key} must be <= ${opts.max}`);
  }
  return raw;
}

export function requireOptionalPositiveInt(
  params: Record<string, unknown>,
  key: string,
  opts: { min?: number; max?: number } = {},
): number | undefined {
  const raw = params[key];
  if (raw === undefined || raw === null) {
    return undefined;
  }
  return requirePositiveInt(params, key, opts);
}

export function requireBigNumberishString(
  params: Record<string, unknown>,
  key: string,
  opts: { allowZero?: boolean } = {},
): string {
  const raw = params[key];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw invalid(`${key} is required`);
  }
  if (!/^[0-9]+$/.test(raw)) {
    throw invalid(`${key} must be a numeric string`);
  }
  if (!opts.allowZero && raw === "0") {
    throw invalid(`${key} must be greater than 0`);
  }
  return raw;
}

export function requireOptionalIsoTimestamp(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const raw = params[key];
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  if (typeof raw !== "string") {
    throw invalid(`${key} must be an ISO timestamp`);
  }
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    throw invalid(`${key} must be an ISO timestamp`);
  }
  return raw;
}

export function requireLimit(
  params: Record<string, unknown>,
  key = "limit",
  defaultValue: number,
  max: number,
): number {
  const raw = params[key];
  if (raw === undefined || raw === null) {
    return defaultValue;
  }
  if (typeof raw !== "number" || Number.isNaN(raw)) {
    throw invalid(`${key} must be a number`);
  }
  const normalized = Math.max(1, Math.floor(raw));
  return Math.min(normalized, max);
}
