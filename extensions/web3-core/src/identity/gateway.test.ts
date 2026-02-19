import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SiweMessage } from "siwe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import { Web3StateStore } from "../state/store.js";
import { createSiweChallengeHandler, createSiweVerifyHandler } from "./gateway.js";

describe("SIWE gateway handlers", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("issues a challenge and verifies to create a binding", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "openclaw-web3-siwe-"));
    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({ identity: { allowSiwe: true } });

    const challengeHandler = createSiweChallengeHandler(store, config);
    const verifyHandler = createSiweVerifyHandler(store, config);

    const { respond, result } = createResponder();
    await challengeHandler({
      params: { address: "0x0000000000000000000000000000000000000001" },
      respond,
    } as any);

    const challenge = result()?.payload as { message: string; nonce: string };
    expect(result()?.ok).toBe(true);
    expect(challenge?.message).toBeTruthy();

    vi.spyOn(SiweMessage.prototype, "verify").mockResolvedValue({ success: true } as any);

    const verifyResult = createResponder();
    await verifyHandler({
      params: { message: challenge.message, signature: "0xdead" },
      respond: verifyResult.respond,
    } as any);

    expect(verifyResult.result()?.ok).toBe(true);
    expect(store.getBindings()).toHaveLength(1);
    expect(store.getSiweChallenge(challenge.nonce)).toBeUndefined();
  });
});

type HandlerResult = { ok: boolean; payload: Record<string, unknown> } | undefined;

function createResponder() {
  let result: HandlerResult;
  return {
    respond: (ok: boolean, payload: Record<string, unknown>) => {
      result = { ok, payload };
    },
    result: () => result,
  };
}
