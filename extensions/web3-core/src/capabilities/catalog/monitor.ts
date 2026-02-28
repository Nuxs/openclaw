/**
 * Monitor capability descriptors.
 */
import type { CapabilityDescriptor } from "../types.js";
import { availability } from "./shared.js";

export function monitorCapabilities(): CapabilityDescriptor[] {
  return [
    {
      name: "web3.metrics.snapshot",
      summary: "Snapshot web3-core metrics and alert signals.",
      kind: "gateway",
      group: "monitor",
      availability: availability(true),
      returns: "Metrics snapshot payload.",
      risk: { level: "low" },
    },
    {
      name: "web3.monitor.snapshot",
      summary: "Aggregate web3 + market metrics for monitoring dashboards.",
      kind: "gateway",
      group: "monitor",
      availability: availability(true),
      returns: "Combined monitoring snapshot (web3 + market).",
      risk: { level: "low" },
    },
    {
      name: "web3.monitor.alerts.list",
      summary: "List monitoring alerts with optional filters.",
      kind: "gateway",
      group: "monitor",
      availability: availability(true),
      paramsSchema: {
        type: "object",
        properties: {
          level: { type: "string", enum: ["info", "warning", "error", "critical"] },
          category: { type: "string" },
          status: { type: "string", enum: ["active", "acknowledged", "resolved"] },
          since: { type: "number", description: "Start timestamp (ms)" },
          until: { type: "number", description: "End timestamp (ms)" },
          limit: { type: "number", minimum: 1, maximum: 1000 },
        },
      },
      returns: "Alert list with count.",
      risk: { level: "low" },
    },
    {
      name: "web3.monitor.alerts.get",
      summary: "Get a monitoring alert by ID.",
      kind: "gateway",
      group: "monitor",
      availability: availability(true),
      paramsSchema: {
        type: "object",
        required: ["alertId"],
        properties: { alertId: { type: "string" } },
      },
      returns: "Alert detail payload.",
      risk: { level: "low" },
    },
    {
      name: "web3.monitor.alerts.acknowledge",
      summary: "Acknowledge a monitoring alert.",
      kind: "gateway",
      group: "monitor",
      availability: availability(true),
      paramsSchema: {
        type: "object",
        required: ["alertId"],
        properties: { alertId: { type: "string" } },
      },
      returns: "Acknowledgement result.",
      risk: { level: "low" },
    },
    {
      name: "web3.monitor.alerts.resolve",
      summary: "Resolve a monitoring alert with optional note.",
      kind: "gateway",
      group: "monitor",
      availability: availability(true),
      paramsSchema: {
        type: "object",
        required: ["alertId"],
        properties: {
          alertId: { type: "string" },
          resolvedBy: { type: "string" },
          resolutionNote: { type: "string" },
        },
      },
      returns: "Resolution result.",
      risk: { level: "low" },
    },
    {
      name: "web3.monitor.metrics",
      summary: "Get monitoring metrics for alerts and system health.",
      kind: "gateway",
      group: "monitor",
      availability: availability(true),
      returns: "Metrics payload for alerts and operational signals.",
      risk: { level: "low" },
    },
    {
      name: "web3.monitor.health",
      summary: "Get monitoring health summary.",
      kind: "gateway",
      group: "monitor",
      availability: availability(true),
      returns: "Health status with critical alert summary.",
      risk: { level: "low" },
    },
  ];
}
