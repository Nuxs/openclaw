/**
 * Runtime bridge for the pure TreasuryRoute resolver owned by `market-core`.
 *
 * We keep the cross-extension import isolated in one leaf module so billing
 * code can stay thin while reusing the shared routing model.
 */
export { resolveTreasuryRoute } from "../../../market-core/src/market/treasury-router.js";
