/**
 * Alert Rules Configuration
 *
 * Defines P0, P1, P2 alert rules for Web3 monitoring.
 */

import { AlertLevel, AlertCategory, type AlertRule, type AlertContext } from "./types.js";

/**
 * P0 Alert Rules - Critical
 */
const P0_RULES: AlertRule[] = [
  {
    name: "service_unavailable",
    level: AlertLevel.P0,
    category: AlertCategory.SERVICE,
    description: "Web3 service is unavailable or unhealthy",
    condition: (ctx) => ctx.serviceHealthy === false,
    messageTemplate: "🚨 Web3 service is unavailable - immediate attention required",
    enabled: true,
    cooldownMs: 5 * 60 * 1000, // 5 minutes
  },
  {
    name: "unauthorized_access",
    level: AlertLevel.P0,
    category: AlertCategory.SECURITY,
    description: "Unauthorized access attempt detected",
    condition: (ctx) => ctx.unauthorizedAccess === true,
    messageTemplate: "🔒 Security Alert: Unauthorized access attempt detected",
    enabled: true,
    cooldownMs: 1 * 60 * 1000, // 1 minute
  },
  {
    name: "chain_connection_failed",
    level: AlertLevel.P0,
    category: AlertCategory.CHAIN,
    description: "Cannot connect to blockchain network",
    condition: (ctx) => ctx.chainHealthy === false,
    messageTemplate: "⛓️ Blockchain connection failed - anchoring disabled",
    enabled: true,
    cooldownMs: 10 * 60 * 1000, // 10 minutes
  },
  {
    name: "critical_error",
    level: AlertLevel.P0,
    category: AlertCategory.SERVICE,
    description: "Critical system error occurred",
    condition: (ctx) => {
      if (!ctx.error) return false;
      // Check for critical error codes
      const criticalCodes = ["E_SYSTEM_FAILURE", "E_DATABASE_CORRUPTED", "E_SECURITY_BREACH"];
      return criticalCodes.includes(ctx.errorCode ?? "");
    },
    messageTemplate: "💥 Critical Error: {errorCode} - {errorMessage}",
    enabled: true,
    cooldownMs: 5 * 60 * 1000, // 5 minutes
  },
];

/**
 * P1 Alert Rules - Important
 */
const P1_RULES: AlertRule[] = [
  {
    name: "quota_exceeded",
    level: AlertLevel.P1,
    category: AlertCategory.BILLING,
    description: "Session quota has been exceeded",
    condition: (ctx) => {
      if (!ctx.usage) return false;
      return ctx.usage.creditsUsed >= ctx.usage.creditsQuota;
    },
    messageTemplate: "💳 Quota Exceeded: {creditsUsed}/{creditsQuota} credits used",
    enabled: true,
    cooldownMs: 30 * 60 * 1000, // 30 minutes
  },
  {
    name: "settlement_failed",
    level: AlertLevel.P1,
    category: AlertCategory.SETTLEMENT,
    description: "Settlement transaction failed",
    condition: (ctx) => ctx.settlementFailed === true,
    messageTemplate: "💰 Settlement Failed: transaction could not be processed",
    enabled: true,
    cooldownMs: 10 * 60 * 1000, // 10 minutes
  },
  {
    name: "storage_full",
    level: AlertLevel.P1,
    category: AlertCategory.STORAGE,
    description: "Storage usage exceeds 90% of limit",
    condition: (ctx) => {
      if (!ctx.storageUsageMb || !ctx.storageLimitMb) return false;
      return ctx.storageUsageMb >= ctx.storageLimitMb * 0.9;
    },
    messageTemplate: "💾 Storage Alert: {storageUsageMb}MB / {storageLimitMb}MB (>90% full)",
    enabled: true,
    cooldownMs: 60 * 60 * 1000, // 1 hour
  },
  {
    name: "pending_tx_backlog",
    level: AlertLevel.P1,
    category: AlertCategory.CHAIN,
    description: "Too many pending transactions in retry queue",
    condition: (ctx) => {
      if (!ctx.pendingTxCount) return false;
      return ctx.pendingTxCount > 50;
    },
    messageTemplate: "⏳ Transaction Backlog: {pendingTxCount} pending transactions",
    enabled: true,
    cooldownMs: 30 * 60 * 1000, // 30 minutes
  },
  {
    name: "disputes_accumulating",
    level: AlertLevel.P1,
    category: AlertCategory.DISPUTE,
    description: "Too many open disputes require attention",
    condition: (ctx) => {
      if (!ctx.openDisputesCount) return false;
      return ctx.openDisputesCount > 20;
    },
    messageTemplate: "⚖️ Dispute Alert: {openDisputesCount} open disputes need resolution",
    enabled: true,
    cooldownMs: 60 * 60 * 1000, // 1 hour
  },
];

/**
 * P2 Alert Rules - Warning
 */
const P2_RULES: AlertRule[] = [
  {
    name: "quota_warning",
    level: AlertLevel.P2,
    category: AlertCategory.BILLING,
    description: "Session approaching quota limit (>80%)",
    condition: (ctx) => {
      if (!ctx.usage) return false;
      const percentUsed = ctx.usage.creditsUsed / ctx.usage.creditsQuota;
      return percentUsed >= 0.8 && percentUsed < 1.0;
    },
    messageTemplate: "⚠️ Quota Warning: {creditsUsed}/{creditsQuota} credits ({percent}% used)",
    enabled: true,
    cooldownMs: 60 * 60 * 1000, // 1 hour
  },
  {
    name: "storage_warning",
    level: AlertLevel.P2,
    category: AlertCategory.STORAGE,
    description: "Storage usage exceeds 70% of limit",
    condition: (ctx) => {
      if (!ctx.storageUsageMb || !ctx.storageLimitMb) return false;
      const percentUsed = ctx.storageUsageMb / ctx.storageLimitMb;
      return percentUsed >= 0.7 && percentUsed < 0.9;
    },
    messageTemplate:
      "💾 Storage Warning: {storageUsageMb}MB / {storageLimitMb}MB ({percent}% used)",
    enabled: true,
    cooldownMs: 2 * 60 * 60 * 1000, // 2 hours
  },
  {
    name: "high_error_rate",
    level: AlertLevel.P2,
    category: AlertCategory.SERVICE,
    description: "Error rate is elevated (>5%)",
    condition: (ctx) => {
      // This would need error rate tracking in practice
      // Placeholder for now
      return false;
    },
    messageTemplate: "⚠️ High Error Rate: {errorRate}% errors detected",
    enabled: false, // disabled until error rate tracking implemented
    cooldownMs: 30 * 60 * 1000, // 30 minutes
  },
  {
    name: "pending_settlements",
    level: AlertLevel.P2,
    category: AlertCategory.SETTLEMENT,
    description: "Multiple settlements pending in retry queue",
    condition: (ctx) => {
      if (!ctx.settlementPending) return false;
      return ctx.settlementPending > 10;
    },
    messageTemplate: "⏳ Settlement Warning: {settlementPending} pending settlements in queue",
    enabled: true,
    cooldownMs: 60 * 60 * 1000, // 1 hour
  },
];

/**
 * All alert rules registry
 */
export const ALERT_RULES: Record<string, AlertRule> = {};

// Register all rules
[...P0_RULES, ...P1_RULES, ...P2_RULES].forEach((rule) => {
  ALERT_RULES[rule.name] = rule;
});

/**
 * Get rules by level
 */
export function getRulesByLevel(level: AlertLevel): AlertRule[] {
  return Object.values(ALERT_RULES).filter((rule) => rule.level === level && rule.enabled);
}

/**
 * Get rules by category
 */
export function getRulesByCategory(category: AlertCategory): AlertRule[] {
  return Object.values(ALERT_RULES).filter((rule) => rule.category === category && rule.enabled);
}

/**
 * Get enabled rules
 */
export function getEnabledRules(): AlertRule[] {
  return Object.values(ALERT_RULES).filter((rule) => rule.enabled);
}

/**
 * Format alert message with context variables
 */
export function formatAlertMessage(template: string, ctx: AlertContext): string {
  let message = template;

  // Replace placeholders
  if (ctx.error) {
    message = message.replace("{errorCode}", ctx.errorCode ?? "UNKNOWN");
    message = message.replace("{errorMessage}", ctx.error.message);
  }
  if (ctx.usage) {
    message = message.replace("{creditsUsed}", ctx.usage.creditsUsed.toString());
    message = message.replace("{creditsQuota}", ctx.usage.creditsQuota.toString());
    const percent = Math.round((ctx.usage.creditsUsed / ctx.usage.creditsQuota) * 100);
    message = message.replace("{percent}", percent.toString());
  }
  if (ctx.storageUsageMb && ctx.storageLimitMb) {
    message = message.replace("{storageUsageMb}", ctx.storageUsageMb.toString());
    message = message.replace("{storageLimitMb}", ctx.storageLimitMb.toString());
    const percent = Math.round((ctx.storageUsageMb / ctx.storageLimitMb) * 100);
    message = message.replace("{percent}", percent.toString());
  }
  if (ctx.pendingTxCount) {
    message = message.replace("{pendingTxCount}", ctx.pendingTxCount.toString());
  }
  if (ctx.openDisputesCount) {
    message = message.replace("{openDisputesCount}", ctx.openDisputesCount.toString());
  }
  if (ctx.settlementPending) {
    message = message.replace("{settlementPending}", ctx.settlementPending.toString());
  }

  return message;
}
