/**
 * Task Market capability descriptors for the web3.market.task.* namespace.
 */
import type { Web3PluginConfig } from "../../config.js";
import type { CapabilityDescriptor } from "../types.js";
import { availability } from "./shared.js";

export function marketTaskCapabilities(config: Web3PluginConfig): CapabilityDescriptor[] {
  const available = availability(config.resources.enabled, "resources disabled");

  return [
    {
      name: "web3.market.task.publish",
      summary: "Publish a new task to the market with title, requirements, budget and expiry.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
      risk: {
        level: "medium",
        notes: ["Creates a task with locked budget; requires actor identity."],
      },
      paramsSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          requirements: {
            type: "array",
            items: { type: "string" },
            description: "Requirement list",
          },
          budget: {
            type: "object",
            properties: {
              amount: { type: "string", description: "Budget amount (integer string)" },
              currency: { type: "string", description: "Currency code" },
            },
          },
          expiryAt: { type: "string", description: "ISO 8601 expiry timestamp" },
        },
      },
    },
    {
      name: "web3.market.task.get",
      summary: "Retrieve a single task by taskId.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
    },
    {
      name: "web3.market.task.list",
      summary: "List tasks with optional filters (status, creator, limit).",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
    },
    {
      name: "web3.market.task.cancel",
      summary: "Cancel an open task. Only the creator may cancel.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
      risk: { level: "medium", notes: ["Cancels the task and prevents further bids."] },
    },
    {
      name: "web3.market.task.expireSweep",
      summary: "Sweep and expire tasks past their expiry date.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
    },
    {
      name: "web3.market.task.bid.place",
      summary: "Place a bid on an open task with price, currency and optional ETA.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
      risk: { level: "medium", notes: ["Commits the bidder to deliver if awarded."] },
    },
    {
      name: "web3.market.task.bid.list",
      summary: "List bids for a task with optional filters.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
    },
    {
      name: "web3.market.task.bid.award",
      summary: "Award a bid — synthesises offer, order and settlement lock.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
      risk: {
        level: "high",
        notes: ["Locks funds in escrow and transitions task to awarded."],
      },
    },
    {
      name: "web3.market.task.result.submit",
      summary: "Submit work result with artifacts and optional proof IDs.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
    },
    {
      name: "web3.market.task.result.review",
      summary: "Accept or reject a submitted result. Accept triggers settlement release.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
      risk: {
        level: "high",
        notes: ["Accepting releases escrowed funds; rejecting may open dispute."],
      },
    },
    {
      name: "web3.market.task.receipt.get",
      summary: "Retrieve a task receipt by receiptId.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
    },
    {
      name: "web3.market.task.receipt.list",
      summary: "List task receipts with optional filters.",
      kind: "gateway",
      group: "market",
      availability: available,
      stability: "experimental",
    },
  ];
}
