/**
 * Alert Engine
 *
 * Evaluates alert rules, triggers alerts, and manages alert lifecycle.
 */

import { randomBytes } from "node:crypto";
import type { Web3PluginConfig } from "../config.js";
import type { Web3StateStore } from "../state/store.js";
import { AlertNotifier } from "./notifications.js";
import { ALERT_RULES, formatAlertMessage, getEnabledRules } from "./rules.js";
import {
  AlertStatus,
  type AlertContext,
  type AlertEvent,
  type AlertQuery,
  type AlertMetrics,
  AlertLevel,
  AlertCategory,
} from "./types.js";

/**
 * Track last alert time for cooldown enforcement
 */
const lastAlertTime = new Map<string, number>();

/**
 * Alert engine
 */
export class AlertEngine {
  private readonly notifier: AlertNotifier;

  constructor(
    private readonly store: Web3StateStore,
    private readonly config: Web3PluginConfig,
  ) {
    this.notifier = new AlertNotifier(config);
  }

  /**
   * Clear all cooldown timers (for testing)
   */
  clearCooldowns(): void {
    lastAlertTime.clear();
  }

  /**
   * Check all alert rules and trigger if conditions are met
   */
  async checkAlerts(context: AlertContext): Promise<AlertEvent[]> {
    const triggeredAlerts: AlertEvent[] = [];
    const now = Date.now();
    const rules = getEnabledRules();

    for (const rule of rules) {
      try {
        // Check cooldown
        const lastTime = lastAlertTime.get(rule.name);
        if (lastTime && rule.cooldownMs && now - lastTime < rule.cooldownMs) {
          continue; // skip - still in cooldown
        }

        // Evaluate condition
        const shouldAlert = await rule.condition(context);
        if (shouldAlert) {
          const alert = this.createAlert(rule.name, context);
          this.store.appendAlert(alert);
          triggeredAlerts.push(alert);
          lastAlertTime.set(rule.name, now);
        }
      } catch (error) {
        console.error(`[AlertEngine] Error evaluating rule ${rule.name}:`, error);
      }
    }

    return triggeredAlerts;
  }

  /**
   * Check a specific alert rule
   */
  async checkRule(ruleName: string, context: AlertContext): Promise<AlertEvent | null> {
    const rule = ALERT_RULES[ruleName];
    if (!rule || !rule.enabled) {
      return null;
    }

    const now = Date.now();

    // Check cooldown
    const lastTime = lastAlertTime.get(ruleName);
    if (lastTime && rule.cooldownMs && now - lastTime < rule.cooldownMs) {
      return null;
    }

    // Evaluate condition
    const shouldAlert = await rule.condition(context);
    if (!shouldAlert) {
      return null;
    }

    const alert = this.createAlert(ruleName, context);
    this.store.appendAlert(alert);
    lastAlertTime.set(ruleName, now);

    return alert;
  }

  /**
   * Create an alert event
   */
  private createAlert(ruleName: string, context: AlertContext): AlertEvent {
    const rule = ALERT_RULES[ruleName];
    if (!rule) {
      throw new Error(`Unknown alert rule: ${ruleName}`);
    }

    const message = formatAlertMessage(rule.messageTemplate, context);

    const alert: AlertEvent = {
      id: `alert-${randomBytes(8).toString("hex")}`,
      level: rule.level,
      category: rule.category,
      status: AlertStatus.ACTIVE,
      ruleName,
      message,
      details: this.extractContextDetails(context),
      timestamp: new Date().toISOString(),
    };

    // Send notifications asynchronously (don't wait)
    if (this.config?.monitor?.notifications?.enabled) {
      this.notifier.notify(alert).catch((error) => {
        console.error(`[AlertEngine] Failed to send notification:`, error);
      });
    }

    return alert;
  }

  /**
   * Extract relevant context details for alert storage
   */
  private extractContextDetails(context: AlertContext): Record<string, unknown> {
    const details: Record<string, unknown> = {};

    if (context.sessionIdHash) details.sessionIdHash = context.sessionIdHash;
    if (context.usage) details.usage = context.usage;
    if (context.error) {
      details.error = {
        message: context.error.message,
        code: context.errorCode,
        stack: context.error.stack?.split("\n").slice(0, 3), // first 3 lines
      };
    }
    if (context.storageUsageMb) details.storageUsageMb = context.storageUsageMb;
    if (context.storageLimitMb) details.storageLimitMb = context.storageLimitMb;
    if (context.pendingTxCount) details.pendingTxCount = context.pendingTxCount;
    if (context.openDisputesCount) details.openDisputesCount = context.openDisputesCount;
    if (context.settlementPending) details.settlementPending = context.settlementPending;

    return details;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string): Promise<void> {
    const alerts = this.store.getAlerts();
    const alert = alerts.find((a) => a.id === alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.status = AlertStatus.ACKNOWLEDGED;
    alert.acknowledgedAt = new Date().toISOString();

    this.store.updateAlert(alert);
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, resolvedBy?: string, resolutionNote?: string): Promise<void> {
    const alerts = this.store.getAlerts();
    const alert = alerts.find((a) => a.id === alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.status = AlertStatus.RESOLVED;
    alert.resolvedAt = new Date().toISOString();
    if (resolvedBy) alert.resolvedBy = resolvedBy;
    if (resolutionNote) alert.resolutionNote = resolutionNote;

    this.store.updateAlert(alert);
  }

  /**
   * Query alerts
   */
  async queryAlerts(query: AlertQuery = {}): Promise<AlertEvent[]> {
    let alerts = this.store.getAlerts();

    // Filter by level
    if (query.level) {
      alerts = alerts.filter((a) => a.level === query.level);
    }

    // Filter by category
    if (query.category) {
      alerts = alerts.filter((a) => a.category === query.category);
    }

    // Filter by status
    if (query.status) {
      alerts = alerts.filter((a) => a.status === query.status);
    }

    // Filter by time range
    if (query.since) {
      alerts = alerts.filter((a) => Date.parse(a.timestamp) >= query.since!);
    }
    if (query.until) {
      alerts = alerts.filter((a) => Date.parse(a.timestamp) <= query.until!);
    }

    // Sort by timestamp descending (newest first)
    alerts.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

    // Apply limit
    if (query.limit) {
      alerts = alerts.slice(0, query.limit);
    }

    return alerts;
  }

  /**
   * Get alert metrics for dashboard
   */
  async getMetrics(): Promise<AlertMetrics> {
    const alerts = this.store.getAlerts();
    const activeAlerts = alerts.filter((a) => a.status === AlertStatus.ACTIVE);

    // Count by level
    const alertsByLevel: Record<AlertLevel, number> = {
      [AlertLevel.P0]: 0,
      [AlertLevel.P1]: 0,
      [AlertLevel.P2]: 0,
    };
    for (const alert of alerts) {
      alertsByLevel[alert.level]++;
    }

    // Count by category
    const alertsByCategory: Record<AlertCategory, number> = {
      [AlertCategory.SERVICE]: 0,
      [AlertCategory.SECURITY]: 0,
      [AlertCategory.BILLING]: 0,
      [AlertCategory.SETTLEMENT]: 0,
      [AlertCategory.STORAGE]: 0,
      [AlertCategory.CHAIN]: 0,
      [AlertCategory.DISPUTE]: 0,
    };
    for (const alert of alerts) {
      alertsByCategory[alert.category]++;
    }

    // Get recent alerts (last 10)
    const recentAlerts = [...alerts]
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, 10);

    // Get last alert time
    const lastAlertAt = alerts.length > 0 ? recentAlerts[0]?.timestamp : undefined;

    return {
      totalAlerts: alerts.length,
      activeAlerts: activeAlerts.length,
      alertsByLevel,
      alertsByCategory,
      recentAlerts,
      lastAlertAt,
    };
  }

  /**
   * Get active P0 alerts (critical)
   */
  async getCriticalAlerts(): Promise<AlertEvent[]> {
    return this.queryAlerts({
      level: AlertLevel.P0,
      status: AlertStatus.ACTIVE,
    });
  }
}
