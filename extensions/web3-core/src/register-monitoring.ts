/**
 * Monitoring, Metrics & Alerts domain registration.
 *
 * Commands: alerts, alert_ack, alert_resolve, health
 * Gateway:  web3.metrics.*, web3.monitor.*
 */

import {
  createWeb3MetricsSnapshotHandler,
  createWeb3MonitorSnapshotHandler,
  createWeb3RecordX402AutopayMetricHandler,
} from "./metrics/metrics.js";
import {
  createAlertsCommand,
  createAlertAcknowledgeCommand,
  createAlertResolveCommand,
  createHealthCommand,
} from "./monitor/commands.js";
import {
  createAlertsListHandler,
  createAlertGetHandler,
  createAlertAcknowledgeHandler,
  createAlertResolveHandler,
  createMonitorMetricsHandler,
  createHealthCheckHandler,
} from "./monitor/handlers.js";
import type { RegistrationContext } from "./register-types.js";

export function registerMonitoring({ api, store, config }: RegistrationContext): void {
  // ── Commands ──
  api.registerCommand({
    name: "alerts",
    description: "Show recent alerts and monitoring status",
    handler: createAlertsCommand(store, config),
  });
  api.registerCommand({
    name: "alert_ack",
    description: "Acknowledge an alert by ID",
    acceptsArgs: true,
    handler: createAlertAcknowledgeCommand(store, config),
  });
  api.registerCommand({
    name: "alert_resolve",
    description: "Resolve an alert by ID with optional note",
    acceptsArgs: true,
    handler: createAlertResolveCommand(store, config),
  });
  api.registerCommand({
    name: "health",
    description: "Check Web3 service health status",
    handler: createHealthCommand(store, config),
  });

  // ── Gateway: Metrics ──
  api.registerGatewayMethod(
    "web3.metrics.snapshot",
    createWeb3MetricsSnapshotHandler(store, config),
  );
  api.registerGatewayMethod(
    "web3.metrics.recordX402Autopay",
    createWeb3RecordX402AutopayMetricHandler(store),
  );
  api.registerGatewayMethod(
    "web3.monitor.snapshot",
    createWeb3MonitorSnapshotHandler(store, config),
  );

  // ── Gateway: Alerts ──
  api.registerGatewayMethod("web3.monitor.alerts.list", createAlertsListHandler(store, config));
  api.registerGatewayMethod("web3.monitor.alerts.get", createAlertGetHandler(store, config));
  api.registerGatewayMethod(
    "web3.monitor.alerts.acknowledge",
    createAlertAcknowledgeHandler(store, config),
  );
  api.registerGatewayMethod(
    "web3.monitor.alerts.resolve",
    createAlertResolveHandler(store, config),
  );
  api.registerGatewayMethod("web3.monitor.metrics", createMonitorMetricsHandler(store, config));
  api.registerGatewayMethod("web3.monitor.health", createHealthCheckHandler(store, config));
}
