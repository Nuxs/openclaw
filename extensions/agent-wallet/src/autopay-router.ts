import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { AgentWalletConfig } from "./config.js";
import { isEVMNetwork, isTONNetwork } from "./config.js";
import { formatAgentWalletGatewayErrorResponse } from "./errors.js";

type CreateAutopayRouterParams = {
  config: AgentWalletConfig;
  evmAutopayHandler: GatewayRequestHandler;
  tonAutopayHandler: GatewayRequestHandler;
};

function resolveRequestedChain(
  options: GatewayRequestHandlerOptions,
): "evm" | "ton" | undefined | string {
  const input = (options.params ?? {}) as Record<string, unknown>;
  if (typeof input.chain !== "string") {
    return undefined;
  }
  const chain = input.chain.trim().toLowerCase();
  return chain.length > 0 ? chain : undefined;
}

export function createAutopayRouterDispatcher({
  config,
  evmAutopayHandler,
  tonAutopayHandler,
}: CreateAutopayRouterParams): GatewayRequestHandler {
  const tonMode = isTONNetwork(config.chain.network);

  return async (options: GatewayRequestHandlerOptions) => {
    const chain = resolveRequestedChain(options);

    if (chain === "evm") {
      if (!isEVMNetwork(config.chain.network)) {
        options.respond(
          false,
          formatAgentWalletGatewayErrorResponse(
            new Error(
              `E_INVALID_ARGUMENT: evm autopay is not supported on ${config.chain.network}`,
            ),
          ),
        );
        return;
      }
      await evmAutopayHandler(options);
      return;
    }

    if (chain === "ton") {
      if (!isTONNetwork(config.chain.network)) {
        options.respond(
          false,
          formatAgentWalletGatewayErrorResponse(
            new Error(
              `E_INVALID_ARGUMENT: ton autopay is not supported on ${config.chain.network}`,
            ),
          ),
        );
        return;
      }
      await tonAutopayHandler(options);
      return;
    }

    if (chain) {
      options.respond(
        false,
        formatAgentWalletGatewayErrorResponse(
          new Error(`E_INVALID_ARGUMENT: unsupported chain ${chain} for autopay`),
        ),
      );
      return;
    }

    if (tonMode) {
      await tonAutopayHandler(options);
      return;
    }
    await evmAutopayHandler(options);
  };
}

export const createAutopayRouterHandler = createAutopayRouterDispatcher;
