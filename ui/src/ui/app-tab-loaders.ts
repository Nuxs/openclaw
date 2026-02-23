/**
 * Tab data-loading orchestration functions.
 *
 * Extracted from app-settings.ts to break the circular dependency
 * between tab-registry.ts and app-settings.ts. Both import from here.
 */

import type { OpenClawApp } from "./app.ts";
import { loadChannels } from "./controllers/channels.ts";
import { loadConfig, loadConfigSchema } from "./controllers/config.ts";
import { loadCronJobs, loadCronStatus } from "./controllers/cron.ts";
import { loadDebug } from "./controllers/debug.ts";
import { loadMarketStatus } from "./controllers/market-status.ts";
import { loadWeb3MarketSummary } from "./controllers/market-summary.ts";
import { loadPresence } from "./controllers/presence.ts";
import { loadSessions } from "./controllers/sessions.ts";
import { loadSkills } from "./controllers/skills.ts";
import { loadUsage } from "./controllers/usage.ts";
import { loadWeb3BillingSummary } from "./controllers/web3-billing.ts";
import { loadWeb3Dashboard } from "./controllers/web3-dashboard.ts";
import { loadWeb3Status } from "./controllers/web3-status.ts";
import type { AttentionItem } from "./types.ts";

type LoadHost = {
  tab: string;
  connected: boolean;
  chatHasAutoScrolled: boolean;
  logsAtBottom: boolean;
  eventLog: unknown[];
  eventLogBuffer: unknown[];
  agentsList?: { agents?: { id: string }[]; defaultId?: string } | null;
  agentsSelectedId?: string | null;
  agentsPanel?: string;
};

export async function loadOverview(host: LoadHost) {
  const app = host as unknown as OpenClawApp;
  await Promise.allSettled([
    loadChannels(app, false),
    loadPresence(app),
    loadSessions(app),
    loadCronStatus(app),
    loadCronJobs(app),
    loadDebug(app),
    loadSkills(app),
    loadUsage(app),
    loadOverviewLogs(app),
    loadWeb3Status(app),
  ]);
  buildAttentionItems(app);
}

async function loadOverviewLogs(host: OpenClawApp) {
  if (!host.client || !host.connected) {
    return;
  }
  try {
    const res = await host.client.request("logs.tail", {
      cursor: host.overviewLogCursor || undefined,
      limit: 100,
      maxBytes: 50_000,
    });
    const payload = res as {
      cursor?: number;
      lines?: unknown;
    };
    const lines = Array.isArray(payload.lines)
      ? payload.lines.filter((line): line is string => typeof line === "string")
      : [];
    host.overviewLogLines = [...host.overviewLogLines, ...lines].slice(-500);
    if (typeof payload.cursor === "number") {
      host.overviewLogCursor = payload.cursor;
    }
  } catch {
    /* non-critical */
  }
}

function buildAttentionItems(host: OpenClawApp) {
  const items: AttentionItem[] = [];

  if (host.lastError) {
    items.push({
      severity: "error",
      icon: "x",
      title: "Gateway Error",
      description: host.lastError,
    });
  }

  const hello = host.hello;
  const auth = (hello as { auth?: { scopes?: string[] } } | null)?.auth;
  if (auth?.scopes && !auth.scopes.includes("operator.read")) {
    items.push({
      severity: "warning",
      icon: "key",
      title: "Missing operator.read scope",
      description:
        "This connection does not have the operator.read scope. Some features may be unavailable.",
      href: "https://docs.openclaw.ai/web/dashboard",
      external: true,
    });
  }

  const skills = host.skillsReport?.skills ?? [];
  const missingDeps = skills.filter((s) => !s.disabled && Object.keys(s.missing).length > 0);
  if (missingDeps.length > 0) {
    const names = missingDeps.slice(0, 3).map((s) => s.name);
    const more = missingDeps.length > 3 ? ` +${missingDeps.length - 3} more` : "";
    items.push({
      severity: "warning",
      icon: "zap",
      title: "Skills with missing dependencies",
      description: `${names.join(", ")}${more}`,
    });
  }

  const blocked = skills.filter((s) => s.blockedByAllowlist);
  if (blocked.length > 0) {
    items.push({
      severity: "warning",
      icon: "shield",
      title: `${blocked.length} skill${blocked.length > 1 ? "s" : ""} blocked`,
      description: blocked.map((s) => s.name).join(", "),
    });
  }

  const cronJobs = host.cronJobs ?? [];
  const failedCron = cronJobs.filter((j) => j.state?.lastStatus === "error");
  if (failedCron.length > 0) {
    items.push({
      severity: "error",
      icon: "clock",
      title: `${failedCron.length} cron job${failedCron.length > 1 ? "s" : ""} failed`,
      description: failedCron.map((j) => j.name).join(", "),
    });
  }

  const now = Date.now();
  const overdue = cronJobs.filter(
    (j) => j.enabled && j.state?.nextRunAtMs != null && now - j.state.nextRunAtMs > 300_000,
  );
  if (overdue.length > 0) {
    items.push({
      severity: "warning",
      icon: "clock",
      title: `${overdue.length} overdue job${overdue.length > 1 ? "s" : ""}`,
      description: overdue.map((j) => j.name).join(", "),
    });
  }

  host.attentionItems = items;
}

export async function loadMarket(host: LoadHost) {
  await loadMarketStatus(host as unknown as OpenClawApp);
}

export async function loadWeb3(host: LoadHost) {
  const app = host as unknown as OpenClawApp;
  app.web3Loading = true;
  let anySuccess = false;
  const results = await Promise.allSettled([
    loadWeb3Dashboard(app),
    loadWeb3BillingSummary(app),
    loadWeb3MarketSummary(app),
  ]);
  for (const result of results) {
    if (result.status === "fulfilled") {
      anySuccess = true;
    }
  }
  if (anySuccess) {
    app.web3LastSuccess = Date.now();
  }
  app.web3Loading = false;
}

export async function loadChannelsTabData(host: LoadHost) {
  await Promise.all([
    loadChannels(host as unknown as OpenClawApp, true),
    loadConfigSchema(host as unknown as OpenClawApp),
    loadConfig(host as unknown as OpenClawApp),
  ]);
}

export async function loadCronData(host: LoadHost) {
  await Promise.all([
    loadChannels(host as unknown as OpenClawApp, false),
    loadCronStatus(host as unknown as OpenClawApp),
    loadCronJobs(host as unknown as OpenClawApp),
  ]);
}
