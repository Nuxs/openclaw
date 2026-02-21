/**
 * Monitor & Alert Types
 *
 * Defines alert levels, rules, and events for the Web3 monitoring system.
 */

/**
 * Alert severity levels
 */
export enum AlertLevel {
  /** P0: Critical - service unavailable, security breach */
  P0 = "P0",
  /** P1: Important - quota exceeded, settlement failed */
  P1 = "P1",
  /** P2: Warning - high usage, approaching limits */
  P2 = "P2",
}

/**
 * Alert categories
 */
export enum AlertCategory {
  SERVICE = "service",
  SECURITY = "security",
  BILLING = "billing",
  SETTLEMENT = "settlement",
  STORAGE = "storage",
  CHAIN = "chain",
  DISPUTE = "dispute",
}

/**
 * Alert status
 */
export enum AlertStatus {
  ACTIVE = "active",
  ACKNOWLEDGED = "acknowledged",
  RESOLVED = "resolved",
}

/**
 * Alert event
 */
export type AlertEvent = {
  id: string;
  level: AlertLevel;
  category: AlertCategory;
  status: AlertStatus;
  ruleName: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
};

/**
 * Alert rule definition
 */
export type AlertRule = {
  name: string;
  level: AlertLevel;
  category: AlertCategory;
  description: string;
  condition: (context: AlertContext) => boolean | Promise<boolean>;
  messageTemplate: string;
  enabled: boolean;
  cooldownMs?: number; // prevent duplicate alerts
};

/**
 * Context passed to alert rule conditions
 */
export type AlertContext = {
  timestamp: number;
  sessionIdHash?: string;
  // Service health
  serviceHealthy?: boolean;
  lastHealthCheck?: number;
  // Security
  unauthorizedAccess?: boolean;
  suspiciousActivity?: boolean;
  // Billing
  usage?: {
    creditsUsed: number;
    creditsQuota: number;
    llmCalls: number;
    toolCalls: number;
  };
  // Settlement
  settlementFailed?: boolean;
  settlementPending?: number;
  // Storage
  storageUsageMb?: number;
  storageLimitMb?: number;
  // Chain
  chainHealthy?: boolean;
  pendingTxCount?: number;
  // Dispute
  openDisputesCount?: number;
  // General error
  error?: Error;
  errorCode?: string;
};

/**
 * Alert metrics for monitoring dashboard
 */
export type AlertMetrics = {
  totalAlerts: number;
  activeAlerts: number;
  alertsByLevel: Record<AlertLevel, number>;
  alertsByCategory: Record<AlertCategory, number>;
  recentAlerts: AlertEvent[];
  lastAlertAt?: string;
};

/**
 * Alert query parameters
 */
export type AlertQuery = {
  level?: AlertLevel;
  category?: AlertCategory;
  status?: AlertStatus;
  since?: number;
  until?: number;
  limit?: number;
};
