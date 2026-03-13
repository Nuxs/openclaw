/**
 * Monitor sub-store — alert events (append-only JSONL with update support).
 *
 * Split from the monolithic `Web3StateStore` to honour single-responsibility.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AlertEvent } from "../monitor/types.js";

export class MonitorStore {
  constructor(private readonly dir: string) {}

  // ── Alerts ───────────────────────────────────────────────────────

  private get alertsPath() {
    return join(this.dir, "alerts.jsonl");
  }

  appendAlert(alert: AlertEvent): void {
    appendFileSync(this.alertsPath, JSON.stringify(alert) + "\n");
  }

  getAlerts(limit = 1000): AlertEvent[] {
    if (!existsSync(this.alertsPath)) return [];
    const lines = readFileSync(this.alertsPath, "utf-8")
      .trim()
      .split("\n")
      .filter((l) => l);
    return lines.slice(-limit).map((l) => JSON.parse(l) as AlertEvent);
  }

  updateAlert(alert: AlertEvent): void {
    const alerts = this.getAlerts();
    const index = alerts.findIndex((a) => a.id === alert.id);
    if (index < 0) {
      throw new Error(`Alert not found: ${alert.id}`);
    }
    alerts[index] = alert;
    // Rewrite entire file (for JSONL we need to update in-place)
    writeFileSync(this.alertsPath, alerts.map((a) => JSON.stringify(a)).join("\n") + "\n");
  }
}
