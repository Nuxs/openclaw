/**
 * Web3 status rendering — overlay for status.command.ts
 *
 * Keeps the Web3 panel rendering out of the upstream status command
 * to minimise merge conflicts.
 */

import { formatTimeAgo } from "../infra/format-time/format-relative.js";
import { renderTable } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";
import type { Web3StatusScanSummary } from "./status-scan-web3.js";
import { shortenText } from "./status.format.js";

export function renderWeb3StatusPanel(opts: {
  web3: Web3StatusScanSummary | null;
  web3Error: string | null;
  gatewayReachable: boolean;
  tableWidth: number;
}): string {
  const { web3, web3Error, gatewayReachable, tableWidth } = opts;
  const muted = (value: string) => theme.muted(value);
  const ok = (value: string) => theme.success(value);
  const warn = (value: string) => theme.warn(value);

  const lines: string[] = [];
  lines.push("");
  lines.push(theme.heading("Web3"));

  const web3Rows = (() => {
    if (!gatewayReachable) {
      return [{ Item: "Status", Value: warn("unavailable (gateway unreachable)") }];
    }
    if (web3Error) {
      return [{ Item: "Status", Value: warn(shortenText(web3Error, 160)) }];
    }
    if (!web3) {
      return [{ Item: "Status", Value: muted("unavailable (plugin disabled?)") }];
    }
    const lastAuditAt = web3.auditLastAt ? Date.parse(web3.auditLastAt) : NaN;
    const lastAuditAge = Number.isNaN(lastAuditAt) ? null : Date.now() - lastAuditAt;
    const lastAuditLabel = lastAuditAge == null ? "unknown" : formatTimeAgo(lastAuditAge);
    const archiveLabel = web3.archiveLastCid ? shortenText(web3.archiveLastCid, 20) : "none";
    const anchorLabel = web3.anchorLastTx ? shortenText(web3.anchorLastTx, 20) : "none";
    return [
      { Item: "Audits (24h)", Value: `${web3.auditEventsRecent}` },
      { Item: "Last audit", Value: lastAuditLabel },
      {
        Item: "Archive",
        Value: `${web3.archiveProvider ?? "unknown"} · ${archiveLabel}`,
      },
      {
        Item: "Anchor",
        Value: `${web3.anchorNetwork ?? "unknown"} · ${anchorLabel}`,
      },
      {
        Item: "Anchoring",
        Value: `${web3.anchoringEnabled ? ok("enabled") : muted("disabled")} · pending ${web3.pendingAnchors}`,
      },
    ];
  })();

  lines.push(
    renderTable({
      width: tableWidth,
      columns: [
        { key: "Item", header: "Item", minWidth: 12 },
        { key: "Value", header: "Value", flex: true, minWidth: 32 },
      ],
      rows: web3Rows,
    }).trimEnd(),
  );

  return lines.join("\n");
}
