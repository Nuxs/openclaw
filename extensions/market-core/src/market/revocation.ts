import { createHmac } from "node:crypto";
import type { MarketPluginConfig } from "../config.js";
import { hashCanonical } from "./hash.js";
import type { Consent, Delivery, Offer, Order } from "./types.js";

type RevocationContext = {
  delivery: Delivery;
  order?: Order;
  offer?: Offer;
  consent?: Consent;
  reason?: string;
};

type RevocationResult = {
  ok: boolean;
  status?: number;
  error?: string;
};

export async function executeRevocation(
  config: MarketPluginConfig,
  context: RevocationContext,
): Promise<RevocationResult> {
  if (config.revocation.mode !== "webhook") {
    return { ok: true };
  }
  if (!config.revocation.endpoint) {
    return { ok: false, error: "revocation.endpoint is required" };
  }

  const controller = new AbortController();
  const timeoutMs = config.revocation.timeoutMs ?? 8000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const payload = {
    delivery: context.delivery,
    order: context.order,
    offer: context.offer,
    consent: context.consent,
    reason: context.reason,
  };

  const body = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const payloadHash = hashCanonical(payload);
  const signingSecret = config.revocation.signingSecret;
  const signature = signingSecret
    ? createHmac("sha256", signingSecret).update(`${timestamp}.${body}`).digest("hex")
    : undefined;

  try {
    const response = await fetch(config.revocation.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-market-timestamp": timestamp,
        "x-market-payload-hash": payloadHash,
        ...(signature ? { "x-market-signature": signature } : {}),
        ...(config.revocation.apiKey ? { "x-market-api-key": config.revocation.apiKey } : {}),
      },
      body,
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    clearTimeout(timeout);
  }
}
