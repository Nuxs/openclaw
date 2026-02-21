import type { ChatCommandDefinition } from "./commands-registry.js";

export type CommandSuggestion = {
  canonical: string;
  distance: number;
};

function boundedLevenshtein(a: string, b: string, maxDistance: number): number {
  if (a === b) {
    return 0;
  }
  if (maxDistance <= 0) {
    return maxDistance + 1;
  }

  const aLen = a.length;
  const bLen = b.length;
  const lenDiff = Math.abs(aLen - bLen);
  if (lenDiff > maxDistance) {
    return maxDistance + 1;
  }

  // Always make `b` the shorter string to reduce memory.
  if (bLen > aLen) {
    return boundedLevenshtein(b, a, maxDistance);
  }

  let prev = Array.from({ length: bLen + 1 }, (_, j) => j);
  let curr = Array.from({ length: bLen + 1 }, () => 0);

  for (let i = 1; i <= aLen; i += 1) {
    curr[0] = i;

    // Track the smallest value in this row for early exit.
    let rowMin = curr[0];

    const aChar = a.charCodeAt(i - 1);
    for (let j = 1; j <= bLen; j += 1) {
      const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      const next = Math.min(del, ins, sub);
      curr[j] = next;
      if (next < rowMin) {
        rowMin = next;
      }
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }

    [prev, curr] = [curr, prev];
  }

  return prev[bLen] ?? maxDistance + 1;
}

function toCommandToken(commandBodyNormalized: string): string {
  const trimmed = commandBodyNormalized.trim();
  if (!trimmed) {
    return "";
  }
  const token = trimmed.split(/\s+/).filter(Boolean)[0] ?? "";
  return token.trim().toLowerCase();
}

function looksLikePathCommand(token: string): boolean {
  // Avoid suggesting when the user likely pasted a path like /Users/... or /var/log/... .
  if (!token.startsWith("/")) {
    return false;
  }
  const remainder = token.slice(1);
  return remainder.includes("/");
}

export function suggestUnknownCommand(params: {
  commandBodyNormalized: string;
  commands: ChatCommandDefinition[];
  maxDistance?: number;
  maxSuggestions?: number;
}): CommandSuggestion[] {
  const maxDistance = params.maxDistance ?? 2;
  const maxSuggestions = params.maxSuggestions ?? 3;

  const token = toCommandToken(params.commandBodyNormalized);
  if (!token.startsWith("/")) {
    return [];
  }
  if (!token || token.length > 64) {
    return [];
  }
  if (looksLikePathCommand(token)) {
    return [];
  }

  const scored: CommandSuggestion[] = [];
  for (const command of params.commands) {
    const canonical = command.textAliases[0]?.trim();
    if (!canonical) {
      continue;
    }

    let best = maxDistance + 1;
    for (const alias of command.textAliases) {
      const candidate = alias.trim().toLowerCase();
      if (!candidate) {
        continue;
      }
      const dist = boundedLevenshtein(token, candidate, maxDistance);
      if (dist < best) {
        best = dist;
      }
      if (best === 0) {
        break;
      }
    }

    if (best > 0 && best <= maxDistance) {
      scored.push({ canonical, distance: best });
    }
  }

  scored.sort((a, b) => a.distance - b.distance || a.canonical.localeCompare(b.canonical));

  const unique: CommandSuggestion[] = [];
  for (const entry of scored) {
    if (unique.some((prev) => prev.canonical.toLowerCase() === entry.canonical.toLowerCase())) {
      continue;
    }
    unique.push(entry);
    if (unique.length >= maxSuggestions) {
      break;
    }
  }

  return unique;
}
