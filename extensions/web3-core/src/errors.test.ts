import { describe, expect, it } from "vitest";
import { formatWeb3GatewayErrorResponse } from "./errors.js";

describe("web3-core error redaction", () => {
  it("does not leak endpoints, tokens, or paths", () => {
    const err = new Error(
      "Request failed at https://secret.example/token?access=tok_secret " +
        "Bearer tok_secret /Users/user/secret/file.txt",
    );

    const response = formatWeb3GatewayErrorResponse(err);
    const serialized = JSON.stringify(response);

    expect(serialized).not.toContain("https://secret.example");
    expect(serialized).not.toContain("tok_secret");
    expect(serialized).not.toContain("/Users/user/secret/file.txt");
    expect(serialized).not.toContain("Bearer");
  });
});
