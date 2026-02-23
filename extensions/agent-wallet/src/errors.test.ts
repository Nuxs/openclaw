import { describe, expect, it } from "vitest";
import { formatAgentWalletGatewayErrorResponse, redactAgentWalletSensitiveInfo } from "./errors.js";

describe("agent-wallet errors", () => {
  it("redacts common sensitive patterns", () => {
    const input = [
      "failed to read /Users/alice/.openclaw/credentials/agent-wallet/wallet.json",
      "POST https://rpc.example.com?token=secret",
      "Bearer abc.def.ghi",
      "tok_1234567890abcdef",
      "PINATA_JWT=supersecret",
      "0x0123456789abcdef0123456789abcdef01234567",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaa.bbbb",
      "C:\\Users\\Alice\\Secrets\\wallet.json",
    ].join(" | ");

    const redacted = redactAgentWalletSensitiveInfo(input);

    expect(redacted).not.toContain("/Users/alice");
    expect(redacted).not.toContain("https://rpc.example.com");
    expect(redacted).not.toContain("Bearer abc.def.ghi");
    expect(redacted).not.toContain("tok_1234567890abcdef");
    expect(redacted).not.toContain("PINATA_JWT=supersecret");
    expect(redacted).not.toContain("0x0123456789abcdef0123456789abcdef01234567");
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(redacted).not.toContain("C:\\Users\\Alice");

    expect(redacted).toContain("[PATH]");
    expect(redacted).toContain("[URL]");
    expect(redacted).toContain("Bearer [REDACTED]");
    expect(redacted).toContain("tok_***");
    expect(redacted).toContain("[ENV]");
    expect(redacted).toContain("[HEX]");
    expect(redacted).toContain("[TOKEN]");
  });

  it("returns stable error responses without leaking error message", () => {
    const err = new Error(
      "invalid request: failed at /Users/alice/.openclaw/credentials/agent-wallet/wallet.json Bearer abc.def",
    );

    const resp = formatAgentWalletGatewayErrorResponse(err);

    expect(resp.error).toMatch(/^E_/);
    expect(resp.message).toBeTruthy();
    expect(resp.message).not.toContain("/Users/alice");
    expect(resp.message).not.toContain("Bearer");
  });
});
