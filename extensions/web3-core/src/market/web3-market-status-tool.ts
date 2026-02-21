import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import {
  buildWeb3MarketStatusSummary,
  resetWeb3MarketStatusCacheForTests,
  type Web3MarketStatusProfile,
} from "./market-status.js";

type AgentToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
};

function jsonResult(payload: unknown): AgentToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

const PROFILES = ["fast", "deep"] as const;

const Web3MarketStatusToolSchema = Type.Object(
  {
    profile: Type.Optional(
      Type.String({
        enum: [...PROFILES],
        description: "Probe profile: fast (summary-only) or deep (lists resources/leases).",
      }),
    ),
  },
  { additionalProperties: false },
);

type ToolParams = { profile?: Web3MarketStatusProfile };

export function createWeb3MarketStatusTool(config: Web3PluginConfig): AnyAgentTool {
  return {
    name: "web3_market_status",
    label: "Web3 Market Status",
    description:
      "Show a redacted Web3 Market status summary (fast/deep). Safe to paste/share; never includes tokens, endpoints, or real file paths.",
    parameters: Web3MarketStatusToolSchema,
    execute: async (_toolCallId, params: ToolParams) => {
      const summary = await buildWeb3MarketStatusSummary({
        config,
        profile: params.profile ?? "fast",
      });
      return jsonResult(summary);
    },
  } as AnyAgentTool;
}

export const __testing = {
  resetWeb3MarketStatusCacheForTests,
} as const;
