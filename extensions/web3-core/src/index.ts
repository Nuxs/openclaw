/**
 * OpenClaw Web3 Core Plugin — Thin Entry
 *
 * All domain registrations are delegated to focused modules:
 * - register-identity.ts   — Wallet / SIWE / ENS
 * - register-billing.ts    — Billing / Audit / Capabilities / Rewards
 * - register-market.ts     — Market / Task / Privacy / Consent
 * - register-resources.ts  — Resources / Index / Discovery / Brain / HTTP
 * - register-monitoring.ts — Metrics / Alerts / Health
 * - register-services.ts   — Background services (anchor/archive/settlement)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OpenClawPluginDefinition } from "openclaw/plugin-sdk/plugin-definition";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version: pkgVersion } = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
) as { version: string };
import { resolveConfig } from "./config.js";
import { registerBilling } from "./register-billing.js";
import { registerIdentity } from "./register-identity.js";
import { registerMarket } from "./register-market.js";
import { registerMonitoring } from "./register-monitoring.js";
import { registerResources } from "./register-resources.js";
import { registerServices } from "./register-services.js";
import { Web3StateStore } from "./state/store.js";

const pluginId = "web3-core";

const plugin: OpenClawPluginDefinition = {
  id: pluginId,
  name: "Web3 Core",
  description:
    "Decentralized storage, wallet identity, audit anchoring, billing & marketplace for OpenClaw",
  version: pkgVersion,

  register(api) {
    const config = resolveConfig(api.pluginConfig);
    const stateDir = api.runtime.state.resolveStateDir();
    const store = new Web3StateStore(stateDir);
    const ctx = { api, config, store, stateDir, pluginId };

    registerIdentity(ctx);
    registerBilling(ctx);
    registerMarket(ctx);
    registerResources(ctx);
    registerMonitoring(ctx);
    registerServices(ctx);

    api.logger.info("Web3 Core plugin registered");
  },
};

export default plugin;
