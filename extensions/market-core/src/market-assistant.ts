// extensions/market-core/src/market-assistant.ts
// Compatibility re-export.
//
// This file used to contain the full MarketAssistant implementation (~700 LOC).
// It has been split into smaller modules under `src/assistant/` to avoid file bloat
// and to keep the assistant output paste-safe (no raw error leakage).

export { MarketAssistant } from "./assistant/market-assistant.js";
export { IntentType } from "./assistant/types.js";
export type { MarketAssistantRuntime, ParsedIntent } from "./assistant/types.js";
