/**
 * Monitor Commands
 *
 * User-facing commands for alert monitoring.
 */

import type { CommandHandler } from "openclaw/plugin-sdk";
import type { Web3StateStore } from "../state/store.js";
import { AlertEngine } from "./engine.js";
import { AlertLevel, AlertStatus } from "./types.js";

/**
 * /alerts - Show recent alerts
 */
export function createAlertsCommand(store: Web3StateStore): CommandHandler {
  const engine = new AlertEngine(store);

  return async () => {
    try {
      const metrics = await engine.getMetrics();
      const criticalAlerts = await engine.getCriticalAlerts();

      let output = "📊 **Web3 Alerts Status**\n\n";

      // Summary
      output += "**Summary**\n";
      output += `- Total alerts: ${metrics.totalAlerts}\n`;
      output += `- Active alerts: ${metrics.activeAlerts}\n`;
      output += `- P0 (Critical): ${metrics.alertsByLevel[AlertLevel.P0]}\n`;
      output += `- P1 (Important): ${metrics.alertsByLevel[AlertLevel.P1]}\n`;
      output += `- P2 (Warning): ${metrics.alertsByLevel[AlertLevel.P2]}\n`;
      output += "\n";

      // Critical alerts (if any)
      if (criticalAlerts.length > 0) {
        output += "🚨 **Critical Alerts (P0)**\n\n";
        for (const alert of criticalAlerts) {
          output += `- **${alert.message}**\n`;
          output += `  - ID: \`${alert.id}\`\n`;
          output += `  - Time: ${new Date(alert.timestamp).toLocaleString()}\n`;
          output += "\n";
        }
      } else {
        output += "✅ No critical alerts\n\n";
      }

      // Recent alerts
      if (metrics.recentAlerts.length > 0) {
        output += "**Recent Alerts** (last 5)\n\n";
        for (const alert of metrics.recentAlerts.slice(0, 5)) {
          const statusEmoji =
            alert.status === AlertStatus.ACTIVE
              ? "🔴"
              : alert.status === AlertStatus.ACKNOWLEDGED
                ? "🟡"
                : "🟢";
          output += `${statusEmoji} [${alert.level}] ${alert.message}\n`;
          output += `   ${new Date(alert.timestamp).toLocaleString()}\n`;
        }
      } else {
        output += "No recent alerts\n";
      }

      return output;
    } catch (error) {
      return `❌ Failed to get alerts: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  };
}

/**
 * /alert_ack <alertId> - Acknowledge an alert
 */
export function createAlertAcknowledgeCommand(store: Web3StateStore): CommandHandler {
  const engine = new AlertEngine(store);

  return async (args?: string) => {
    const alertId = args?.trim();
    if (!alertId) {
      return "❌ Usage: /alert_ack <alertId>";
    }

    try {
      await engine.acknowledgeAlert(alertId);
      return `✅ Alert ${alertId} acknowledged`;
    } catch (error) {
      return `❌ Failed to acknowledge alert: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  };
}

/**
 * /alert_resolve <alertId> [note] - Resolve an alert
 */
export function createAlertResolveCommand(store: Web3StateStore): CommandHandler {
  const engine = new AlertEngine(store);

  return async (args?: string) => {
    const parts = args?.trim().split(/\s+/);
    if (!parts || parts.length === 0) {
      return "❌ Usage: /alert_resolve <alertId> [note]";
    }

    const alertId = parts[0];
    const note = parts.slice(1).join(" ");

    try {
      await engine.resolveAlert(alertId, undefined, note || undefined);
      return `✅ Alert ${alertId} resolved` + (note ? ` with note: "${note}"` : "");
    } catch (error) {
      return `❌ Failed to resolve alert: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  };
}

/**
 * /health - Check Web3 service health
 */
export function createHealthCommand(store: Web3StateStore): CommandHandler {
  return async () => {
    try {
      const alerts = store.getAlerts();
      const criticalAlerts = alerts.filter(
        (a) => a.level === AlertLevel.P0 && a.status === AlertStatus.ACTIVE,
      );

      const recentEvents = store.readAuditEvents(10);
      const lastActivity =
        recentEvents.length > 0 ? new Date(recentEvents[0]?.timestamp ?? "") : null;

      let output = "🏥 **Web3 Service Health**\n\n";

      if (criticalAlerts.length === 0) {
        output += "✅ **Status**: Healthy\n";
      } else {
        output += `⚠️ **Status**: Degraded (${criticalAlerts.length} critical alerts)\n`;
      }

      output += `- Last activity: ${lastActivity ? lastActivity.toLocaleString() : "No recent activity"}\n`;
      output += `- Active alerts: ${alerts.filter((a) => a.status === AlertStatus.ACTIVE).length}\n`;
      output += `- Audit events: ${recentEvents.length} recent\n`;

      return output;
    } catch (error) {
      return `❌ Failed to check health: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  };
}
