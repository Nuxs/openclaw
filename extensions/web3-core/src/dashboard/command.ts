/**
 * /web3 slash command: one-page Web3 dashboard.
 * Aggregates identity, billing, audit, and market status into a paste-safe summary.
 */

import type { PluginCommandHandler } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import { AlertLevel } from "../monitor/types.js";
import type { Web3StateStore } from "../state/store.js";
import {
  alertLevelBadge,
  buildStatLine,
  formatCredits,
  formatNextActions,
  sectionHeader,
  truncateAddress,
  truncateList,
} from "./format.js";

export function createWeb3DashboardCommand(
  store: Web3StateStore,
  config: Web3PluginConfig,
): PluginCommandHandler {
  return async () => {
    // Gather state slices
    const bindings = store.getBindings();
    const usage = store.getUsage?.("global") ?? store.listUsageRecords?.()[0];
    const auditRecent = store.readAuditEvents?.(5) ?? [];
    const alerts = store.getAlerts?.(3) ?? [];

    // Identity section
    const identityLines: string[] = [];
    const hasIdentity = bindings.length > 0;
    identityLines.push(buildStatLine("Wallets", String(bindings.length), hasIdentity));
    if (bindings.length > 0) {
      const primary = bindings[0];
      identityLines.push(
        `  Primary: ${truncateAddress(primary.address)}${primary.ensName ? ` (${primary.ensName})` : ""}`,
      );
    }
    if (config.identity.allowSiwe) {
      identityLines.push("  SIWE: enabled");
    }

    // Billing section
    const billingLines: string[] = [];
    const creditsUsed =
      typeof usage === "object" && usage !== null
        ? (usage as { creditsUsed?: number }).creditsUsed
        : 0;
    const creditsQuota =
      typeof usage === "object" && usage !== null
        ? (usage as { creditsQuota?: number }).creditsQuota
        : undefined;
    const displayQuota = creditsQuota ?? config.billing.quotaPerSession ?? 0;
    const remainingCredits = Math.max(0, displayQuota - (creditsUsed ?? 0));
    const hasCredits = remainingCredits > 0;
    billingLines.push(
      buildStatLine(
        "Credits",
        `${formatCredits(remainingCredits)} / ${formatCredits(displayQuota)}`,
        hasCredits,
      ),
    );
    if (displayQuota > 0) {
      const pct = Math.round((remainingCredits / displayQuota) * 100);
      if (pct < 20) billingLines.push("  ⚠️ Low credits");
    }

    // Audit section
    const auditLines: string[] = [];
    const pendingAnchors = store.getPendingTxs?.() ?? [];
    const pendingArchives = store.getPendingArchives?.() ?? [];
    const hasPending = pendingAnchors.length + pendingArchives.length > 0;
    auditLines.push(buildStatLine("Pending anchors", String(pendingAnchors.length), !hasPending));
    auditLines.push(buildStatLine("Pending archives", String(pendingArchives.length), !hasPending));
    if (auditRecent.length > 0) {
      const last = auditRecent[auditRecent.length - 1];
      auditLines.push(`  Last audit: ${new Date(last.timestamp).toLocaleDateString()}`);
    }

    // Alerts section
    const alertLines: string[] = [];
    const criticalAlerts = alerts.filter(
      (a) => a.level === AlertLevel.P0 || a.level === AlertLevel.P1,
    );
    if (alerts.length === 0) {
      alertLines.push("  No recent alerts");
    } else {
      const { shown, more } = truncateList(alerts, 3);
      for (const a of shown) {
        const label = a.message || a.ruleName;
        alertLines.push(`  ${alertLevelBadge(a.level)} ${label}`);
      }
      if (more > 0) alertLines.push(`  …and ${more} more`);
    }

    // Market section
    const marketLines: string[] = [];
    const marketEnabled = config.resources.enabled;
    marketLines.push(
      buildStatLine("Market", marketEnabled ? "enabled" : "disabled", marketEnabled),
    );
    if (marketEnabled) {
      const providerOn = config.resources.provider.listen.enabled;
      const consumerOn = config.resources.consumer.enabled;
      marketLines.push(
        `  Provider: ${providerOn ? "on" : "off"} | Consumer: ${consumerOn ? "on" : "off"}`,
      );
    }

    // Compose output
    const parts: string[] = ["🕸️ Web3 Dashboard"];

    parts.push(sectionHeader("Identity"));
    parts.push(identityLines.join("\n"));

    parts.push(sectionHeader("Billing"));
    parts.push(billingLines.join("\n"));

    parts.push(sectionHeader("Audit"));
    parts.push(auditLines.join("\n"));

    if (alerts.length > 0) {
      parts.push(sectionHeader("Alerts"));
      parts.push(alertLines.join("\n"));
    }

    parts.push(sectionHeader("Market"));
    parts.push(marketLines.join("\n"));

    // Next actions
    const nextActions: string[] = [];
    if (bindings.length === 0) {
      nextActions.push("/bind_wallet 0x… to link your wallet");
    }
    if (displayQuota > 0 && remainingCredits / displayQuota < 0.2) {
      nextActions.push("/credits to review usage and top-up");
    }
    if (hasPending) {
      nextActions.push("/audit_status to review pending items");
    }
    if (criticalAlerts.length > 0) {
      nextActions.push("/alerts to check critical issues");
    }
    if (!marketEnabled) {
      nextActions.push("/web3-market start to enable marketplace");
    } else {
      nextActions.push("/web3-market status for market details");
    }

    if (nextActions.length > 0) {
      parts.push(formatNextActions(nextActions.slice(0, 3)));
    }

    return { text: parts.join("\n") };
  };
}
