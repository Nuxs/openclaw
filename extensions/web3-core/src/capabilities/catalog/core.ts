/**
 * Core capability descriptors: capabilities, identity, audit, billing, status.
 */
import type { Web3PluginConfig } from "../../config.js";
import type { CapabilityDescriptor } from "../types.js";
import { availability } from "./shared.js";

export function coreCapabilities(config: Web3PluginConfig): CapabilityDescriptor[] {
  const identityEnabled = config.identity.allowSiwe;
  const billingEnabled = config.billing.enabled;

  return [
    {
      name: "web3.capabilities.list",
      summary: "List web3 capability summaries and availability.",
      kind: "gateway",
      group: "capabilities",
      availability: availability(true),
      stability: "stable",
      paramsSchema: {
        includeUnavailable: "boolean",
        includeDetails: "boolean",
        group: "string",
      },
      returns: "Array of capability summaries or full descriptors.",
      examples: [{ summary: "List enabled capabilities" }],
    },
    {
      name: "web3.capabilities.describe",
      summary: "Describe a single web3 capability by name.",
      kind: "gateway",
      group: "capabilities",
      availability: availability(true),
      stability: "stable",
      paramsSchema: { name: "string", includeUnavailable: "boolean" },
      returns: "Capability descriptor with parameters, guards, and pricing hints.",
      examples: [
        {
          summary: "Describe web3.market.resource.publish",
          params: { name: "web3.market.resource.publish" },
        },
      ],
    },
    {
      name: "web3.siwe.challenge",
      summary: "Issue a SIWE challenge for wallet authentication.",
      kind: "gateway",
      group: "identity",
      availability: availability(identityEnabled, "siwe disabled"),
      stability: "stable",
      paramsSchema: {
        type: "object",
        required: ["address"],
        properties: {
          address: {
            type: "string",
            description: "Ethereum wallet address to authenticate",
            pattern: "^0x[a-fA-F0-9]{40}$",
            example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
          },
          chainId: {
            type: "number",
            description: "EVM chain ID (default: 1 for Ethereum mainnet)",
            example: 1,
          },
          statement: {
            type: "string",
            description: "Custom statement to include in challenge (optional)",
            maxLength: 200,
            example: "Sign in to OpenClaw Web3 Market",
          },
        },
      },
      returns: "SIWE challenge payload (message to sign with wallet).",
      risk: { level: "medium", notes: ["Identity binding - user must sign with private key"] },
      examples: [
        {
          summary: "Issue challenge for Ethereum address",
          params: {
            address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
            chainId: 1,
          },
        },
      ],
    },
    {
      name: "web3.siwe.verify",
      summary: "Verify a SIWE signed message.",
      kind: "gateway",
      group: "identity",
      availability: availability(identityEnabled, "siwe disabled"),
      stability: "stable",
      paramsSchema: {
        type: "object",
        required: ["message", "signature"],
        properties: {
          message: {
            type: "string",
            description: "SIWE message from challenge (plain text)",
            minLength: 50,
            example: "example.com wants you to sign in...",
          },
          signature: {
            type: "string",
            description: "Hex-encoded signature from wallet",
            pattern: "^0x[a-fA-F0-9]{130}$",
            example: "0x1234abcd...",
          },
        },
      },
      returns: "Verification result (success/failure) and bound actorId if valid.",
      risk: { level: "medium", notes: ["Identity binding - creates authenticated session"] },
      examples: [
        {
          summary: "Verify SIWE signature",
          params: {
            message: "example.com wants you to sign in with your Ethereum account...",
            signature: "0x1234567890abcdef...",
          },
        },
      ],
    },
    {
      name: "web3.audit.query",
      summary: "Query recent audit events.",
      kind: "gateway",
      group: "audit",
      availability: availability(true),
      stability: "stable",
      paramsSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max events to return (default: 50)",
            minimum: 1,
            maximum: 500,
            example: 50,
          },
          after: {
            type: "string",
            description: "Filter events after timestamp (ISO8601, optional)",
            example: "2026-02-01T00:00:00Z",
          },
          actorId: {
            type: "string",
            description: "Filter by actor ID (optional)",
            pattern: "^0x[a-fA-F0-9]{40}$",
            example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
          },
          action: {
            type: "string",
            description: "Filter by action type (optional)",
            enum: [
              "resource.publish",
              "resource.unpublish",
              "lease.issue",
              "lease.revoke",
              "billing.charge",
            ],
            example: "lease.issue",
          },
        },
      },
      returns: "Recent audit events list with timestamps and actors.",
      risk: { level: "low" },
      examples: [
        {
          summary: "Query last 50 audit events",
          params: { limit: 50 },
        },
        {
          summary: "Query lease events for specific actor",
          params: { actorId: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1", action: "lease.issue" },
        },
      ],
    },
    {
      name: "web3.billing.status",
      summary: "Check billing status by session hash.",
      kind: "gateway",
      group: "billing",
      availability: availability(true, billingEnabled ? undefined : "billing disabled"),
      stability: "stable",
      paramsSchema: {
        type: "object",
        required: ["sessionIdHash"],
        properties: {
          sessionIdHash: {
            type: "string",
            description: "SHA256 hash of session ID (hex string)",
            pattern: "^[a-fA-F0-9]{64}$",
            example: "a3c5e8d1b2f4...9f7e6d3c1a0b",
          },
        },
      },
      returns: "Billing enabled flag and current usage/credits snapshot.",
      risk: { level: "low" },
      examples: [
        {
          summary: "Check billing status for session",
          params: {
            sessionIdHash: "a3c5e8d1b2f4c7e9a1b3d5f7e9c1a3b5d7f9e1c3a5b7d9f1e3c5a7b9d1f3e5c7",
          },
        },
      ],
    },
    {
      name: "web3.billing.summary",
      summary: "Resolve billing summary by session identifiers.",
      kind: "gateway",
      group: "billing",
      availability: availability(true, billingEnabled ? undefined : "billing disabled"),
      stability: "stable",
      paramsSchema: {
        sessionKey: "string",
        sessionId: "string",
        senderId: "string",
        sessionIdHash: "string",
      },
      returns: "Billing enabled flag and remaining credits.",
      risk: { level: "low" },
    },
    {
      name: "web3.status.summary",
      summary: "Summarize web3-core status (audit, storage, anchoring).",
      kind: "gateway",
      group: "status",
      availability: availability(true),
      stability: "stable",
      returns: "Status snapshot for web3-core services.",
    },
  ];
}
