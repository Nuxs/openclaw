import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import { describeWeb3Capabilities, findWeb3Capability, listWeb3Capabilities } from "./catalog.js";

export function createCapabilitiesListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return ({ params, respond }: GatewayRequestHandlerOptions) => {
    const input = (params ?? {}) as {
      includeUnavailable?: boolean;
      includeDetails?: boolean;
      group?: string;
    };
    const includeUnavailable = Boolean(input.includeUnavailable);
    const includeDetails = Boolean(input.includeDetails);
    const group = typeof input.group === "string" ? input.group : undefined;

    const filter = { includeUnavailable, group };
    const capabilities = includeDetails
      ? describeWeb3Capabilities(config, filter)
      : listWeb3Capabilities(config, filter);

    respond(true, { capabilities });
  };
}

export function createCapabilitiesDescribeHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return ({ params, respond }: GatewayRequestHandlerOptions) => {
    const input = (params ?? {}) as { name?: string; includeUnavailable?: boolean };
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) {
      respond(false, formatWeb3GatewayErrorResponse("name is required"));
      return;
    }
    const capability = findWeb3Capability(config, name, {
      includeUnavailable: Boolean(input.includeUnavailable),
    });
    if (!capability) {
      respond(false, formatWeb3GatewayErrorResponse("capability not found"));
      return;
    }
    respond(true, { capability });
  };
}
