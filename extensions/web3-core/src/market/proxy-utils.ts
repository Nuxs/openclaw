/**
 * Shared gateway proxy utilities for web3-core proxy handlers.
 *
 * Extracted to avoid duplication across market/handlers.ts and rewards/handlers.ts.
 * All cross-boundary imports are delegated to the centralized `core-imports` adapter.
 */

export {
  loadCallGateway,
  normalizeGatewayResult,
  type CallGatewayFn,
  type GatewayCallResult,
} from "../core-imports.js";
