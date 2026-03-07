import { compareSnapshots, type ContractIssue, type Web3ContractSnapshot } from "./governance.js";

const MAX_SECTION_ITEMS = 12;
const DOC_LAYER_ORDER = ["reference", "guide", "status", "historical", "unspecified"] as const;
const RUNTIME_FIELDS = ["commands", "gatewayMethods", "httpRoutes", "services"] as const;

type RuntimeField = (typeof RUNTIME_FIELDS)[number];

type SnapshotReportOptions = {
  currentSnapshot: Web3ContractSnapshot | null;
  nextSnapshot: Web3ContractSnapshot;
  governanceIssues?: ContractIssue[];
  snapshotIssues?: ContractIssue[];
};

type DiffResult = {
  added: string[];
  removed: string[];
};

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].toSorted(compareStrings);
}

function formatCountMap(entries: Array<[string, number]>): string {
  return entries.map(([name, count]) => `${name}=${count}`).join(", ");
}

function formatSection(title: string, values: string[]): string[] {
  if (values.length === 0) {
    return [`${title}: none`];
  }
  const lines = [`${title} (${values.length})`];
  for (const value of values.slice(0, MAX_SECTION_ITEMS)) {
    lines.push(`  - ${value}`);
  }
  if (values.length > MAX_SECTION_ITEMS) {
    lines.push(`  - … and ${values.length - MAX_SECTION_ITEMS} more`);
  }
  return lines;
}

function diffSorted(before: Iterable<string>, after: Iterable<string>): DiffResult {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: [...afterSet].filter((entry) => !beforeSet.has(entry)).toSorted(compareStrings),
    removed: [...beforeSet].filter((entry) => !afterSet.has(entry)).toSorted(compareStrings),
  };
}

function getDocLayerCounts(snapshot: Web3ContractSnapshot): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const doc of snapshot.docs) {
    const key = doc.docLayer ?? "unspecified";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return DOC_LAYER_ORDER.map((layer) => [layer, counts.get(layer) ?? 0]);
}

function getPluginRuntimeMap(snapshot: Web3ContractSnapshot) {
  return new Map(snapshot.plugins.map((plugin) => [plugin.id, plugin.runtime]));
}

function formatRuntimeFieldName(field: RuntimeField): string {
  switch (field) {
    case "commands":
      return "commands";
    case "gatewayMethods":
      return "gateway methods";
    case "httpRoutes":
      return "HTTP routes";
    case "services":
      return "services";
  }
}

function formatCapabilityNameFromIssue(message: string): string {
  const match = message.match(/`([^`]+)`/);
  return match?.[1] ?? message;
}

export function formatSnapshotOverview(snapshot: Web3ContractSnapshot): string {
  const lines = ["Web3 contract snapshot overview"];
  lines.push(`- plugins: ${snapshot.plugins.length}`);
  for (const plugin of snapshot.plugins) {
    lines.push(
      `  - ${plugin.id}: commands=${plugin.runtime.commands.length}, gatewayMethods=${plugin.runtime.gatewayMethods.length}, httpRoutes=${plugin.runtime.httpRoutes.length}, services=${plugin.runtime.services.length}`,
    );
  }
  lines.push(
    `- capabilities: default=${snapshot.capabilities.defaultConfig.length}, max-enabled=${snapshot.capabilities.maxEnabled.length}, stable=${snapshot.capabilities.stableNames.length}`,
  );
  lines.push(`- docs: ${formatCountMap(getDocLayerCounts(snapshot))}`);
  return lines.join("\n");
}

export function formatSnapshotDiff(
  currentSnapshot: Web3ContractSnapshot | null,
  nextSnapshot: Web3ContractSnapshot,
): string {
  const lines = ["Web3 contract diff"];
  if (!currentSnapshot) {
    lines.push("- committed snapshot: missing");
    return lines.join("\n");
  }

  const capabilityDiff = diffSorted(
    currentSnapshot.capabilities.maxEnabled.map((entry) => entry.name),
    nextSnapshot.capabilities.maxEnabled.map((entry) => entry.name),
  );
  lines.push(...formatSection("- capabilities added", capabilityDiff.added));
  lines.push(...formatSection("- capabilities removed", capabilityDiff.removed));

  const stableDrift = compareSnapshots(currentSnapshot, nextSnapshot)
    .filter((issue) => issue.kind === "stable_capability")
    .map((issue) => formatCapabilityNameFromIssue(issue.message));
  lines.push(...formatSection("- stable capability drift", uniqueSorted(stableDrift)));

  const currentPluginRuntime = getPluginRuntimeMap(currentSnapshot);
  const nextPluginRuntime = getPluginRuntimeMap(nextSnapshot);
  const pluginIds = uniqueSorted([...currentPluginRuntime.keys(), ...nextPluginRuntime.keys()]);
  for (const pluginId of pluginIds) {
    const currentRuntime = currentPluginRuntime.get(pluginId);
    const nextRuntime = nextPluginRuntime.get(pluginId);
    if (!currentRuntime || !nextRuntime) {
      continue;
    }
    for (const field of RUNTIME_FIELDS) {
      const fieldDiff = diffSorted(currentRuntime[field], nextRuntime[field]);
      if (fieldDiff.added.length === 0 && fieldDiff.removed.length === 0) {
        continue;
      }
      lines.push(
        ...formatSection(`- ${pluginId} ${formatRuntimeFieldName(field)} added`, fieldDiff.added),
      );
      lines.push(
        ...formatSection(
          `- ${pluginId} ${formatRuntimeFieldName(field)} removed`,
          fieldDiff.removed,
        ),
      );
    }
  }

  const docDiff = diffSorted(
    currentSnapshot.docs.map((doc) => doc.path),
    nextSnapshot.docs.map((doc) => doc.path),
  );
  lines.push(...formatSection("- docs added", docDiff.added));
  lines.push(...formatSection("- docs removed", docDiff.removed));

  return lines.join("\n");
}

export function formatIssueSection(title: string, issues: ContractIssue[]): string {
  const lines = [title];
  if (issues.length === 0) {
    lines.push("- none");
    return lines.join("\n");
  }
  for (const issue of issues) {
    lines.push(`- ${issue.path ? `${issue.path}: ` : ""}${issue.message}`);
  }
  return lines.join("\n");
}

export function formatGovernanceReport({
  currentSnapshot,
  nextSnapshot,
  governanceIssues = [],
  snapshotIssues = [],
}: SnapshotReportOptions): string {
  return [
    formatSnapshotOverview(nextSnapshot),
    formatSnapshotDiff(currentSnapshot, nextSnapshot),
    formatIssueSection("Governance issues", governanceIssues),
    formatIssueSection("Snapshot issues", snapshotIssues),
  ].join("\n\n");
}
