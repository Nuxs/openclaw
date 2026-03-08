/**
 * Privacy & Consent Replay capability descriptors for web3.market.consent.* and web3.market.privacy.*
 */
import type { Web3PluginConfig } from "../../config.js";
import type { CapabilityDescriptor } from "../types.js";
import { availability } from "./shared.js";

export function marketPrivacyCapabilities(config: Web3PluginConfig): CapabilityDescriptor[] {
  const available = availability(config.resources.enabled, "resources disabled");

  return [
    {
      name: "web3.market.consent.list",
      summary: "List all consent records with status, scope and retention info.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
    },
    {
      name: "web3.market.consent.get",
      summary: "Retrieve a single consent by consentId.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
    },
    {
      name: "web3.market.privacy.assets",
      summary: "List knowledge assets under consent governance with scope, purpose and retention.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
    },
    {
      name: "web3.market.privacy.replay.generate",
      summary: "Generate a privacy-compliant replay summary for a consent, fully redacted.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
      risk: {
        level: "low",
        notes: ["Read-only audit replay; all sensitive fields are redacted."],
      },
    },
    {
      name: "web3.market.privacy.replay.list",
      summary: "List previously generated privacy replay records.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
    },
    {
      name: "web3.market.privacy.erase",
      summary: "Erase data associated with a revoked consent per retention policy.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
      risk: {
        level: "high",
        notes: ["Irreversible data deletion. Requires consent to be revoked."],
      },
    },
  ];
}
