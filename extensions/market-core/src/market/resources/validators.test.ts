import { describe, expect, it } from "vitest";
import {
  requireBigNumberishString,
  requireEnum,
  requireLimit,
  requireOptionalEnum,
  requireOptionalIsoTimestamp,
  requireOptionalPositiveInt,
  requireOptionalStringArray,
  requirePositiveInt,
  requireStringArray,
} from "./validators.js";

describe("requireEnum", () => {
  const allowed = ["model", "search", "storage"] as const;

  it("returns valid enum value", () => {
    expect(requireEnum({ kind: "model" }, "kind", allowed)).toBe("model");
  });

  it("throws on missing key", () => {
    expect(() => requireEnum({}, "kind", allowed)).toThrow("E_INVALID_ARGUMENT");
  });

  it("throws on empty string", () => {
    expect(() => requireEnum({ kind: "" }, "kind", allowed)).toThrow("kind is required");
  });

  it("throws on invalid enum value", () => {
    expect(() => requireEnum({ kind: "unknown" }, "kind", allowed)).toThrow("invalid enum");
  });

  it("throws on non-string", () => {
    expect(() => requireEnum({ kind: 42 }, "kind", allowed)).toThrow("kind is required");
  });
});

describe("requireOptionalEnum", () => {
  const allowed = ["active", "revoked"] as const;

  it("returns undefined for missing value", () => {
    expect(requireOptionalEnum({}, "status", allowed)).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(requireOptionalEnum({ status: null }, "status", allowed)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(requireOptionalEnum({ status: "" }, "status", allowed)).toBeUndefined();
  });

  it("returns valid value", () => {
    expect(requireOptionalEnum({ status: "active" }, "status", allowed)).toBe("active");
  });

  it("throws on invalid value", () => {
    expect(() => requireOptionalEnum({ status: "bad" }, "status", allowed)).toThrow("invalid enum");
  });

  it("throws on non-string type", () => {
    expect(() => requireOptionalEnum({ status: 1 }, "status", allowed)).toThrow("invalid enum");
  });
});

describe("requireStringArray", () => {
  it("returns trimmed non-empty strings", () => {
    expect(requireStringArray({ tags: ["a", " b ", "c"] }, "tags")).toEqual(["a", "b", "c"]);
  });

  it("filters out empty strings", () => {
    expect(requireStringArray({ tags: ["a", "", "  "] }, "tags")).toEqual(["a"]);
  });

  it("throws on non-array", () => {
    expect(() => requireStringArray({ tags: "oops" }, "tags")).toThrow("must be an array");
  });

  it("throws when all items are empty", () => {
    expect(() => requireStringArray({ tags: ["", "  "] }, "tags")).toThrow(
      "must include at least one value",
    );
  });

  it("throws when exceeding maxItems", () => {
    expect(() => requireStringArray({ tags: ["a", "b", "c"] }, "tags", { maxItems: 2 })).toThrow(
      "at most 2 items",
    );
  });

  it("throws when item exceeds maxLen", () => {
    expect(() => requireStringArray({ tags: ["toolong"] }, "tags", { maxLen: 3 })).toThrow(
      "must be <= 3 chars",
    );
  });

  it("throws on duplicate when unique=true", () => {
    expect(() => requireStringArray({ tags: ["a", "a"] }, "tags", { unique: true })).toThrow(
      "must be unique",
    );
  });
});

describe("requireOptionalStringArray", () => {
  it("returns undefined for missing key", () => {
    expect(requireOptionalStringArray({}, "tags")).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(requireOptionalStringArray({ tags: null }, "tags")).toBeUndefined();
  });

  it("delegates to requireStringArray when present", () => {
    expect(requireOptionalStringArray({ tags: ["x"] }, "tags")).toEqual(["x"]);
  });
});

describe("requirePositiveInt", () => {
  it("returns valid integer", () => {
    expect(requirePositiveInt({ ttl: 42 }, "ttl")).toBe(42);
  });

  it("throws on NaN", () => {
    expect(() => requirePositiveInt({ ttl: Number.NaN }, "ttl")).toThrow("must be an integer");
  });

  it("throws on float", () => {
    expect(() => requirePositiveInt({ ttl: 1.5 }, "ttl")).toThrow("must be an integer");
  });

  it("throws on string", () => {
    expect(() => requirePositiveInt({ ttl: "42" }, "ttl")).toThrow("must be an integer");
  });

  it("enforces min constraint", () => {
    expect(() => requirePositiveInt({ ttl: 5 }, "ttl", { min: 10 })).toThrow("must be >= 10");
  });

  it("enforces max constraint", () => {
    expect(() => requirePositiveInt({ ttl: 100 }, "ttl", { max: 50 })).toThrow("must be <= 50");
  });
});

describe("requireOptionalPositiveInt", () => {
  it("returns undefined for missing", () => {
    expect(requireOptionalPositiveInt({}, "limit")).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(requireOptionalPositiveInt({ limit: null }, "limit")).toBeUndefined();
  });

  it("delegates validation when present", () => {
    expect(requireOptionalPositiveInt({ limit: 10 }, "limit")).toBe(10);
  });
});

describe("requireBigNumberishString", () => {
  it("returns valid numeric string", () => {
    expect(requireBigNumberishString({ amount: "12345" }, "amount")).toBe("12345");
  });

  it("throws on empty", () => {
    expect(() => requireBigNumberishString({ amount: "" }, "amount")).toThrow("amount is required");
  });

  it("throws on missing", () => {
    expect(() => requireBigNumberishString({}, "amount")).toThrow("amount is required");
  });

  it("throws on non-numeric", () => {
    expect(() => requireBigNumberishString({ amount: "12.5" }, "amount")).toThrow(
      "must be a numeric string",
    );
  });

  it("throws on negative", () => {
    expect(() => requireBigNumberishString({ amount: "-1" }, "amount")).toThrow(
      "must be a numeric string",
    );
  });

  it("throws on zero by default", () => {
    expect(() => requireBigNumberishString({ amount: "0" }, "amount")).toThrow(
      "must be greater than 0",
    );
  });

  it("allows zero with allowZero option", () => {
    expect(requireBigNumberishString({ amount: "0" }, "amount", { allowZero: true })).toBe("0");
  });
});

describe("requireOptionalIsoTimestamp", () => {
  it("returns undefined for missing", () => {
    expect(requireOptionalIsoTimestamp({}, "since")).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(requireOptionalIsoTimestamp({ since: null }, "since")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(requireOptionalIsoTimestamp({ since: "" }, "since")).toBeUndefined();
  });

  it("returns valid ISO timestamp", () => {
    const ts = "2025-01-15T10:30:00.000Z";
    expect(requireOptionalIsoTimestamp({ since: ts }, "since")).toBe(ts);
  });

  it("throws on non-string", () => {
    expect(() => requireOptionalIsoTimestamp({ since: 123 }, "since")).toThrow(
      "must be an ISO timestamp",
    );
  });

  it("throws on unparseable string", () => {
    expect(() => requireOptionalIsoTimestamp({ since: "not-a-date" }, "since")).toThrow(
      "must be an ISO timestamp",
    );
  });
});

describe("requireLimit", () => {
  it("returns default when missing", () => {
    expect(requireLimit({}, "limit", 50, 200)).toBe(50);
  });

  it("returns default when null", () => {
    expect(requireLimit({ limit: null }, "limit", 50, 200)).toBe(50);
  });

  it("clamps to max", () => {
    expect(requireLimit({ limit: 500 }, "limit", 50, 200)).toBe(200);
  });

  it("clamps to minimum of 1", () => {
    expect(requireLimit({ limit: -5 }, "limit", 50, 200)).toBe(1);
  });

  it("floors fractional values", () => {
    expect(requireLimit({ limit: 10.9 }, "limit", 50, 200)).toBe(10);
  });

  it("throws on non-number", () => {
    expect(() => requireLimit({ limit: "abc" }, "limit", 50, 200)).toThrow("must be a number");
  });

  it("throws on NaN", () => {
    expect(() => requireLimit({ limit: Number.NaN }, "limit", 50, 200)).toThrow("must be a number");
  });
});
