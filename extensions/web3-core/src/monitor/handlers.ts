/**
 * Monitor Gateway Handlers
 *
 * Provides RPC handlers for alert monitoring and management.
 */

import type { GatewayRequestHandler } from "openclaw/plugin-sdk";
import { formatWeb3GatewayError, Web3ErrorCode } from "../_shared.js";
// import type { Web3Config } from "../config.js";
import type { Web3StateStore } from "../state/store.js";
import { AlertEngine } from "./engine.js";
import { AlertLevel, AlertCategory, AlertStatus, type AlertQuery } from "./types.js";

/**
 * web3.monitor.alerts.list
 *
 * List alerts with optional filtering
 */
export function createAlertsListHandler(
  store: Web3StateStore,
  config: Web3Config,
): GatewayRequestHandler {
  const engine = new AlertEngine(store, config);

  return async (params: any, _opts: any, context: any = {}) => {
    try {
      const query: AlertQuery = {
        level: params?.level as AlertLevel | undefined,
        category: params?.category as AlertCategory | undefined,
        status: params?.status as AlertStatus | undefined,
        since: params?.since as number | undefined,
        until: params?.until as number | undefined,
        limit: (params?.limit as number | undefined) ?? 100,
      };

      const alerts = await engine.queryAlerts(query);

      return {
        ok: true,
        alerts,
        count: alerts.length,
      };
    } catch (error) {
      return formatWeb3GatewayError(error, Web3ErrorCode.INTERNAL_ERROR, "Failed to list alerts");
    }
  };
}

/**
 * web3.monitor.alerts.get
 *
 * Get a specific alert by ID
 */
export function createAlertGetHandler(
  store: Web3StateStore,
  config: Web3Config,
): GatewayRequestHandler {
  return async (params: any, _opts: any, context: any = {}) => {
    try {
      const alertId = params?.alertId as string | undefined;
      if (!alertId) {
        return formatWeb3GatewayError(
          new Error("alertId is required"),
          Web3ErrorCode.INVALID_ARGUMENT,
          "Missing alertId parameter",
        );
      }

      const alerts = store.getAlerts();
      const alert = alerts.find((a) => a.id === alertId);

      if (!alert) {
        return formatWeb3GatewayError(
          new Error("Alert not found"),
          Web3ErrorCode.NOT_FOUND,
          `Alert ${alertId} not found`,
        );
      }

      return {
        ok: true,
        alert,
      };
    } catch (error) {
      return formatWeb3GatewayError(error, Web3ErrorCode.INTERNAL_ERROR, "Failed to get alert");
    }
  };
}

/**
 * web3.monitor.alerts.acknowledge
 *
 * Acknowledge an alert
 */
export function createAlertAcknowledgeHandler(
  store: Web3StateStore,
  config: Web3Config,
): GatewayRequestHandler {
  const engine = new AlertEngine(store, config);

  return async (params: any, _opts: any, context: any = {}) => {
    try {
      const alertId = params?.alertId as string | undefined;
      if (!alertId) {
        return formatWeb3GatewayError(
          new Error("alertId is required"),
          Web3ErrorCode.INVALID_ARGUMENT,
          "Missing alertId parameter",
        );
      }

      await engine.acknowledgeAlert(alertId);

      return {
        ok: true,
        message: `Alert ${alertId} acknowledged`,
      };
    } catch (error) {
      return formatWeb3GatewayError(
        error,
        Web3ErrorCode.INTERNAL_ERROR,
        "Failed to acknowledge alert",
      );
    }
  };
}

/**
 * web3.monitor.alerts.resolve
 *
 * Resolve an alert
 */
export function createAlertResolveHandler(
  store: Web3StateStore,
  config: Web3Config,
): GatewayRequestHandler {
  const engine = new AlertEngine(store, config);

  return async (params: any, _opts: any, context: any = {}) => {
    try {
      const alertId = params?.alertId as string | undefined;
      if (!alertId) {
        return formatWeb3GatewayError(
          new Error("alertId is required"),
          Web3ErrorCode.INVALID_ARGUMENT,
          "Missing alertId parameter",
        );
      }

      const resolvedBy = params?.resolvedBy as string | undefined;
      const resolutionNote = params?.resolutionNote as string | undefined;

      await engine.resolveAlert(alertId, resolvedBy, resolutionNote);

      return {
        ok: true,
        message: `Alert ${alertId} resolved`,
      };
    } catch (error) {
      return formatWeb3GatewayError(error, Web3ErrorCode.INTERNAL_ERROR, "Failed to resolve alert");
    }
  };
}

/**
 * web3.monitor.metrics
 *
 * Get monitoring metrics and statistics
 */
export function createMonitorMetricsHandler(
  store: Web3StateStore,
  config: Web3Config,
): GatewayRequestHandler {
  const engine = new AlertEngine(store, config);

  return async (_params: any, _opts: any, context: any = {}) => {
    try {
      const metrics = await engine.getMetrics();

      return {
        ok: true,
        metrics,
      };
    } catch (error) {
      return formatWeb3GatewayError(error, Web3ErrorCode.INTERNAL_ERROR, "Failed to get metrics");
    }
  };
}

/**
 * web3.monitor.health
 *
 * Get service health status
 */
export function createHealthCheckHandler(
  store: Web3StateStore,
  config: Web3Config,
): GatewayRequestHandler {
  return async (_params: any, _opts: any, context: any = {}) => {
    try {
      const now = Date.now();
      const alerts = store.getAlerts();
      const criticalAlerts = alerts.filter(
        (a) => a.level === AlertLevel.P0 && a.status === AlertStatus.ACTIVE,
      );

      // Check recent activity
      const recentEvents = store.readAuditEvents(10);
      const lastActivity =
        recentEvents.length > 0 ? Date.parse(recentEvents[0]?.timestamp ?? "") : 0;

      const healthy = criticalAlerts.length === 0;
      const status = healthy ? "healthy" : "degraded";

      return {
        ok: true,
        status,
        healthy,
        criticalAlerts: criticalAlerts.length,
        lastActivity: lastActivity > 0 ? new Date(lastActivity).toISOString() : null,
        timestamp: new Date(now).toISOString(),
      };
    } catch (error) {
      return {
        ok: false,
        status: "error",
        healthy: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      };
    }
  };
}
