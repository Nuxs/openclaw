import { describe, expect, it } from "vitest";
import { splitTonMnemonic } from "./mnemonic.js";

describe("splitTonMnemonic", () => {
  it("splits a valid 12-word mnemonic", () => {
    const words = splitTonMnemonic(
      "one two three four five six seven eight nine ten eleven twelve",
    );
    expect(words).toHaveLength(12);
    expect(words[0]).toBe("one");
  });

  it("normalises extra whitespace", () => {
    const words = splitTonMnemonic(
      "  one  two   three four five six seven eight nine ten eleven twelve  ",
    );
    expect(words).toHaveLength(12);
    expect(words[0]).toBe("one");
    expect(words[11]).toBe("twelve");
  });

  it("throws for fewer than 12 words", () => {
    expect(() => splitTonMnemonic("one two three")).toThrow("at least 12 words");
  });

  it("throws for empty string", () => {
    expect(() => splitTonMnemonic("")).toThrow("at least 12 words");
  });

  it("accepts 24-word mnemonic", () => {
    const input = Array.from({ length: 24 }, (_, i) => `word${i}`).join(" ");
    expect(splitTonMnemonic(input)).toHaveLength(24);
  });
});
