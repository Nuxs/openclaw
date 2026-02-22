/**
 * Monitor Gateway Handlers
 *
 * Provides RPC handlers for alert monitoring and management.
 */

import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayError, formatWeb3GatewayErrorResponse } from "../errors.js";
import type { Web3StateStore } from "../state/store.js";
import { AlertEngine } from "./engine.js";
import { AlertCategory, AlertLevel, AlertStatus, type AlertQuery } from "./types.js";

function respondGatewayError(
  opts: GatewayRequestHandlerOptions,
  err: unknown,
  message: string,
): void {
  opts.respond(false, {
    error: formatWeb3GatewayError(err),
    message,
  });
}

/**
 * web3.monitor.alerts.list
 *
 * List alerts with optional filtering.
 */
export function createAlertsListHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  const engine = new AlertEngine(store, config);

  return async (opts: GatewayRequestHandlerOptions) => {
    try {
      const p = opts.params;
      const query: AlertQuery = {
        level: p.level as AlertLevel | undefined,
        category: p.category as AlertCategory | undefined,
        status: p.status as AlertStatus | undefined,
        since: p.since as number | undefined,
        until: p.until as number | undefined,
        limit: (p.limit as number | undefined) ?? 100,
      };

      const alerts = await engine.queryAlerts(query);
      opts.respond(true, {
        alerts,
        count: alerts.length,
      });
    } catch (err) {
      respondGatewayError(opts, err, "Failed to list alerts");
    }
  };
}

/**
 * web3.monitor.alerts.get
 *
 * Get a specific alert by ID.
 */
export function createAlertGetHandler(
  store: Web3StateStore,
  _config: Web3PluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    try {
      const alertId = opts.params.alertId as string | undefined;
      if (!alertId) {
        opts.respond(false, formatWeb3GatewayErrorResponse("alertId is required"));
        return;
      }

      const alerts = store.getAlerts();
      const alert = alerts.find((a) => a.id === alertId);

      if (!alert) {
        opts.respond(false, formatWeb3GatewayErrorResponse("not found"));
        return;
      }

      opts.respond(true, { alert });
    } catch (err) {
      respondGatewayError(opts, err, "Failed to get alert");
    }
  };
}

/**
 * web3.monitor.alerts.acknowledge
 */
export function createAlertAcknowledgeHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  const engine = new AlertEngine(store, config);

  return async (opts: GatewayRequestHandlerOptions) => {
    try {
      const alertId = opts.params.alertId as string | undefined;
      if (!alertId) {
        opts.respond(false, formatWeb3GatewayErrorResponse("alertId is required"));
        return;
      }

      await engine.acknowledgeAlert(alertId);
      opts.respond(true, { message: `Alert ${alertId} acknowledged` });
    } catch (err) {
      respondGatewayError(opts, err, "Failed to acknowledge alert");
    }
  };
}

/**
 * web3.monitor.alerts.resolve
 */
export function createAlertResolveHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  const engine = new AlertEngine(store, config);

  return async (opts: GatewayRequestHandlerOptions) => {
    try {
      const alertId = opts.params.alertId as string | undefined;
      if (!alertId) {
        opts.respond(false, formatWeb3GatewayErrorResponse("alertId is required"));
        return;
      }

      const resolvedBy = opts.params.resolvedBy as string | undefined;
      const resolutionNote = opts.params.resolutionNote as string | undefined;

      await engine.resolveAlert(alertId, resolvedBy, resolutionNote);
      opts.respond(true, { message: `Alert ${alertId} resolved` });
    } catch (err) {
      respondGatewayError(opts, err, "Failed to resolve alert");
    }
  };
}

/**
 * web3.monitor.metrics
 */
export function createMonitorMetricsHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  const engine = new AlertEngine(store, config);

  return async (opts: GatewayRequestHandlerOptions) => {
    try {
      const metrics = await engine.getMetrics();
      opts.respond(true, { metrics });
    } catch (err) {
      respondGatewayError(opts, err, "Failed to get metrics");
    }
  };
}

/**
 * web3.monitor.health
 */
export function createHealthCheckHandler(
  store: Web3StateStore,
  _config: Web3PluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    try {
      const now = Date.now();
      const alerts = store.getAlerts();
      const criticalAlerts = alerts.filter(
        (a) => a.level === AlertLevel.P0 && a.status === AlertStatus.ACTIVE,
      );

      const recentEvents = store.readAuditEvents(10);
      const lastActivity =
        recentEvents.length > 0 ? Date.parse(recentEvents[0]?.timestamp ?? "") : 0;

      const healthy = criticalAlerts.length === 0;
      const status = healthy ? "healthy" : "degraded";

      opts.respond(true, {
        status,
        healthy,
        criticalAlerts: criticalAlerts.length,
        lastActivity: lastActivity > 0 ? new Date(lastActivity).toISOString() : null,
        timestamp: new Date(now).toISOString(),
      });
    } catch (err) {
      respondGatewayError(opts, err, "Failed to compute health status");
    }
  };
}
