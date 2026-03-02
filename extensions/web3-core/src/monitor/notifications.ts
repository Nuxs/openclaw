/**
 * Alert Notifications
 *
 * Handles alert notifications via various channels (webhook, email, etc.)
 */

import { fetchWithSsrFGuard } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import type { AlertEvent } from "./types.js";

/**
 * Notification channel configuration
 */
export type NotificationConfig = {
  enabled: boolean;
  channels: {
    webhook?: WebhookConfig;
    wecom?: WecomConfig; // 企业微信
    // Future: email, SMS, etc.
  };
};

export type WebhookConfig = {
  url: string;
  method?: "POST" | "PUT";
  headers?: Record<string, string>;
  timeout?: number;
};

export type WecomConfig = {
  webhookUrl: string;
  mentionUsers?: string[]; // @specific users
  mentionAll?: boolean; // @all
};

/**
 * Notification result
 */
export type NotificationResult = {
  success: boolean;
  channel: string;
  sentAt: string;
  error?: string;
};

/**
 * Alert notification manager
 */
export class AlertNotifier {
  constructor(private readonly config: Web3PluginConfig) {}

  /**
   * Send alert notification to all enabled channels
   */
  async notify(alert: AlertEvent): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    const notifConfig = this.config.monitor?.notifications;

    if (!notifConfig?.enabled) {
      return results;
    }

    // Send to webhook
    if (notifConfig.channels?.webhook) {
      const result = await this.sendWebhook(alert, notifConfig.channels.webhook);
      results.push(result);
    }

    // Send to 企业微信
    if (notifConfig.channels?.wecom) {
      const result = await this.sendWecom(alert, notifConfig.channels.wecom);
      results.push(result);
    }

    return results;
  }

  /**
   * Send notification via generic webhook
   */
  private async sendWebhook(alert: AlertEvent, config: WebhookConfig): Promise<NotificationResult> {
    const startTime = Date.now();

    try {
      const payload = {
        id: alert.id,
        level: alert.level,
        category: alert.category,
        message: alert.message,
        timestamp: alert.timestamp,
        status: alert.status,
        details: alert.details,
      };

      const { response, release } = await fetchWithSsrFGuard({
        url: config.url,
        init: {
          method: config.method || "POST",
          headers: {
            "Content-Type": "application/json",
            ...config.headers,
          },
          body: JSON.stringify(payload),
        },
        timeoutMs: config.timeout || 10_000,
        auditContext: "web3-monitor-webhook",
      });

      try {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return {
          success: true,
          channel: "webhook",
          sentAt: new Date().toISOString(),
        };
      } finally {
        await release();
      }
    } catch (error) {
      return {
        success: false,
        channel: "webhook",
        sentAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Send notification to 企业微信
   */
  private async sendWecom(alert: AlertEvent, config: WecomConfig): Promise<NotificationResult> {
    try {
      // Format alert for 企业微信 markdown
      let content = `## ${this.getLevelEmoji(alert.level)} ${alert.message}\n\n`;
      content += `- **Level**: ${alert.level}\n`;
      content += `- **Category**: ${alert.category}\n`;
      content += `- **Time**: ${new Date(alert.timestamp).toLocaleString("zh-CN")}\n`;
      content += `- **Alert ID**: \`${alert.id}\`\n`;

      if (alert.details) {
        content += `\n**Details**:\n`;
        for (const [key, value] of Object.entries(alert.details)) {
          content += `- ${key}: ${JSON.stringify(value)}\n`;
        }
      }

      // Add mentions
      if (config.mentionAll) {
        content += "\n@all";
      } else if (config.mentionUsers && config.mentionUsers.length > 0) {
        content += `\n${config.mentionUsers.map((u) => `@${u}`).join(" ")}`;
      }

      const payload = {
        msgtype: "markdown",
        markdown: {
          content,
        },
      };

      const { response, release } = await fetchWithSsrFGuard({
        url: config.webhookUrl,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        timeoutMs: 10_000,
        auditContext: "web3-monitor-wecom",
      });

      try {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        if (result.errcode !== 0) {
          throw new Error(`Wecom API error: ${result.errmsg}`);
        }

        return {
          success: true,
          channel: "wecom",
          sentAt: new Date().toISOString(),
        };
      } finally {
        await release();
      }
    } catch (error) {
      return {
        success: false,
        channel: "wecom",
        sentAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get emoji for alert level
   */
  private getLevelEmoji(level: string): string {
    switch (level) {
      case "P0":
        return "🚨";
      case "P1":
        return "⚠️";
      case "P2":
        return "ℹ️";
      default:
        return "📢";
    }
  }

  /**
   * Test notification configuration
   */
  async testNotification(channel: "webhook" | "wecom"): Promise<NotificationResult> {
    const testAlert: AlertEvent = {
      id: "test-alert",
      level: "P2" as any,
      category: "SERVICE" as any,
      status: "ACTIVE" as any,
      ruleName: "test",
      message: "Test notification from Web3 monitoring system",
      timestamp: new Date().toISOString(),
      details: {
        test: true,
        message: "This is a test alert to verify notification configuration",
      },
    };

    const notifConfig = this.config.monitor?.notifications;
    if (!notifConfig?.enabled) {
      return {
        success: false,
        channel,
        sentAt: new Date().toISOString(),
        error: "Notifications are disabled in configuration",
      };
    }

    if (channel === "webhook" && notifConfig.channels?.webhook) {
      return this.sendWebhook(testAlert, notifConfig.channels.webhook);
    }

    if (channel === "wecom" && notifConfig.channels?.wecom) {
      return this.sendWecom(testAlert, notifConfig.channels.wecom);
    }

    return {
      success: false,
      channel,
      sentAt: new Date().toISOString(),
      error: `Channel ${channel} is not configured`,
    };
  }
}
