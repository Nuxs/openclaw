import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { resolveServiceWrapper } from "../service-wrapper.js";
import { requireString } from "../validators.js";
import { assertAccess, formatGatewayErrorResponse, resolveDeliveryPayload } from "./_shared.js";

export function createLeaseMountHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      // Mount resolution returns secret material and must stay on the write/internal surface.
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const leaseId = requireString(input.leaseId, "leaseId");
      const lease = store.getLease(leaseId);
      if (!lease) {
        throw new Error("E_NOT_FOUND: lease not found");
      }
      if (lease.status !== "lease_active") {
        throw new Error("E_CONFLICT: lease not active");
      }
      if (Date.parse(lease.expiresAt) <= Date.now()) {
        throw new Error("E_EXPIRED: lease expired");
      }

      const delivery = lease.deliveryId ? store.getDelivery(lease.deliveryId) : undefined;
      if (!delivery) {
        throw new Error("E_NOT_FOUND: delivery not found");
      }
      const payload = await resolveDeliveryPayload(config, delivery);
      if (!payload || payload.type !== "api" || payload.accessToken.trim().length === 0) {
        throw new Error("E_CONFLICT: delivery does not expose a mountable api token");
      }

      const resource = store.getResource(lease.resourceId);
      const serviceWrapper = resource
        ? resolveServiceWrapper({
            serviceSchema: resource.serviceSchema,
            serviceWrapper: resource.serviceWrapper,
          })
        : undefined;

      respond(true, {
        leaseId: lease.leaseId,
        orderId: lease.orderId,
        resourceId: lease.resourceId,
        kind: lease.kind,
        providerActorId: lease.providerActorId,
        consumerActorId: lease.consumerActorId,
        expiresAt: lease.expiresAt,
        status: lease.status,
        accessToken: payload.accessToken,
        serviceCategory: serviceWrapper?.category ?? null,
        proofTypes: serviceWrapper?.proof.families ?? [],
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
