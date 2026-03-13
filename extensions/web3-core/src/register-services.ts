/**
 * Background services registration.
 *
 * Service: web3-anchor-service (archive flush, anchor retry, settlement retry)
 */

import { flushPendingAnchors, flushPendingArchives } from "./audit/hooks.js";
import { flushPendingSettlements } from "./billing/settlement.js";
import type { RegistrationContext } from "./register-types.js";

export function registerServices({ api, store, config }: RegistrationContext): void {
  api.registerService({
    id: "web3-anchor-service",
    async start(ctx) {
      ctx.logger.info("Web3 anchor service started");
      const interval = setInterval(async () => {
        try {
          await flushPendingArchives(store, config);
        } catch (err) {
          ctx.logger.warn(`Archive flush error: ${err}`);
        }

        try {
          await flushPendingAnchors(store, config);
        } catch (err) {
          ctx.logger.warn(`Anchor retry error: ${err}`);
        }

        try {
          await flushPendingSettlements(store, config);
        } catch (err) {
          ctx.logger.warn(`Settlement retry error: ${err}`);
        }
      }, 60_000);

      (ctx as Record<string, unknown>)._anchorInterval = interval;
    },
    stop(ctx) {
      const interval = (ctx as Record<string, unknown>)._anchorInterval as
        | ReturnType<typeof setInterval>
        | undefined;
      if (interval) clearInterval(interval);
      ctx.logger.info("Web3 anchor service stopped");
    },
  });
}
