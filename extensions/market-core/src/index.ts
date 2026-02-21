/**
 * Market Core Plugin
 *
 * Architecture Design:
 * - This plugin provides INTERNAL market capabilities
 * - All external access should go through web3-core's web3.market.* gateway
 * - This plugin does NOT register its own gateway methods
 * - Instead, it exports a Facade API for web3-core to consume
 *
 * Design Principles (OpenClaw-first):
 * - Plugin can be complex internally, but must be safe and controllable
 * - External interface must be simple and stable (through web3.* namespace)
 * - No direct user-facing commands (users only see /pay_status, /credits, etc.)
 * - All security gates are enforced at web3-core level
 */

import type { OpenClawPluginDefinition } from "openclaw/plugin-sdk";
import { resolveConfig } from "./config.js";
import { createMarketFacade } from "./facade.js";
import { MarketStateStore } from "./state/store.js";

// Re-export facade types for web3-core to use
export type { MarketFacade } from "./facade.js";
export { createMarketFacade } from "./facade.js";

const plugin: OpenClawPluginDefinition = {
  id: "market-core",
  name: "Market Core",
  description:
    "Internal marketplace engine for decentralized resource trading (accessed via web3.market.*)",
  version: "2026.2.21",

  register(api) {
    const config = resolveConfig(api.pluginConfig);
    const stateDir = api.runtime.state.resolveStateDir();
    const store = new MarketStateStore(stateDir, config);

    // Create facade instance and attach to plugin exports
    // This allows web3-core to import and use the market capabilities
    const facade = createMarketFacade(store, config);

    // Store facade in global plugin registry for web3-core to access
    // @ts-expect-error - Extending plugin API for inter-plugin communication
    api.runtime.plugins._marketCoreFacade = facade;

    api.logger.info(
      "Market Core engine initialized (gateway methods exposed through web3-core only)",
    );
  },
};

export default plugin;
