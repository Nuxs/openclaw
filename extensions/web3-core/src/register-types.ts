/**
 * Shared context for domain-specific registration modules.
 *
 * Each `register-*.ts` module receives this context from the thin
 * plugin entry (`index.ts`) and calls the relevant `api.*` methods.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-definition";
import type { Web3PluginConfig } from "./config.js";
import type { Web3StateStore } from "./state/store.js";

export type RegistrationContext = {
  api: OpenClawPluginApi;
  config: Web3PluginConfig;
  store: Web3StateStore;
  stateDir: string;
  pluginId: string;
};
