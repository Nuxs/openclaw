import type { SessionEntry } from "../config/sessions.js";

export type ModelOverrideSelection = {
  provider: string;
  model: string;
  isDefault?: boolean;
};

export type ModelOverrideContextEntry = {
  provider?: string;
  model: string;
  authProfileOverride?: string;
  authProfileOverrideSource?: "auto" | "user";
};

export function resolveModelOverrideForContext(params: {
  entry?: SessionEntry;
  contextKey?: string;
}): ModelOverrideContextEntry | null {
  const contextKey = params.contextKey?.trim();
  if (!contextKey) {
    return null;
  }
  const override = params.entry?.modelOverridesByContext?.[contextKey];
  const model = override?.model?.trim();
  if (!model) {
    return null;
  }
  const provider = override?.provider?.trim() || undefined;
  const authProfileOverride = override?.authProfileOverride?.trim() || undefined;
  return {
    provider,
    model,
    authProfileOverride,
    authProfileOverrideSource: override?.authProfileOverrideSource,
  };
}

export function applyModelOverrideToSessionEntryForContext(params: {
  entry: SessionEntry;
  contextKey: string;
  selection: ModelOverrideSelection;
  profileOverride?: string;
  profileOverrideSource?: "auto" | "user";
}): { updated: boolean } {
  const contextKey = params.contextKey.trim();
  if (!contextKey) {
    return { updated: false };
  }
  const profileOverrideSource = params.profileOverrideSource ?? "user";
  const overrides = params.entry.modelOverridesByContext ?? {};
  let updated = false;

  if (params.selection.isDefault) {
    if (overrides[contextKey]) {
      delete overrides[contextKey];
      updated = true;
    }
  } else {
    const next: ModelOverrideContextEntry = {
      provider: params.selection.provider,
      model: params.selection.model,
    };
    if (params.profileOverride) {
      next.authProfileOverride = params.profileOverride;
      next.authProfileOverrideSource = profileOverrideSource;
    }
    const prev = overrides[contextKey];
    if (
      !prev ||
      prev.provider !== next.provider ||
      prev.model !== next.model ||
      prev.authProfileOverride !== next.authProfileOverride ||
      prev.authProfileOverrideSource !== next.authProfileOverrideSource
    ) {
      overrides[contextKey] = next;
      updated = true;
    }
  }

  if (updated) {
    if (Object.keys(overrides).length === 0) {
      delete params.entry.modelOverridesByContext;
    } else {
      params.entry.modelOverridesByContext = overrides;
    }
    params.entry.updatedAt = Date.now();
  }

  return { updated };
}

export function clearModelOverrideForContext(params: { entry: SessionEntry; contextKey: string }): {
  updated: boolean;
} {
  const contextKey = params.contextKey.trim();
  if (!contextKey) {
    return { updated: false };
  }
  const overrides = params.entry.modelOverridesByContext;
  if (!overrides || !overrides[contextKey]) {
    return { updated: false };
  }
  delete overrides[contextKey];
  if (Object.keys(overrides).length === 0) {
    delete params.entry.modelOverridesByContext;
  }
  params.entry.updatedAt = Date.now();
  return { updated: true };
}

export function clearModelProfileOverrideForContext(params: {
  entry: SessionEntry;
  contextKey: string;
}): { updated: boolean } {
  const contextKey = params.contextKey.trim();
  if (!contextKey) {
    return { updated: false };
  }
  const overrides = params.entry.modelOverridesByContext;
  const override = overrides?.[contextKey];
  if (!override) {
    return { updated: false };
  }
  let updated = false;
  if (override.authProfileOverride) {
    delete override.authProfileOverride;
    updated = true;
  }
  if (override.authProfileOverrideSource) {
    delete override.authProfileOverrideSource;
    updated = true;
  }
  if (updated) {
    params.entry.updatedAt = Date.now();
  }
  return { updated };
}

export function applyModelOverrideToSessionEntry(params: {
  entry: SessionEntry;
  selection: ModelOverrideSelection;
  profileOverride?: string;
  profileOverrideSource?: "auto" | "user";
}): { updated: boolean } {
  const { entry, selection, profileOverride } = params;
  const profileOverrideSource = params.profileOverrideSource ?? "user";
  let updated = false;
  let selectionUpdated = false;

  if (selection.isDefault) {
    if (entry.providerOverride) {
      delete entry.providerOverride;
      updated = true;
      selectionUpdated = true;
    }
    if (entry.modelOverride) {
      delete entry.modelOverride;
      updated = true;
      selectionUpdated = true;
    }
  } else {
    if (entry.providerOverride !== selection.provider) {
      entry.providerOverride = selection.provider;
      updated = true;
      selectionUpdated = true;
    }
    if (entry.modelOverride !== selection.model) {
      entry.modelOverride = selection.model;
      updated = true;
      selectionUpdated = true;
    }
  }

  // Model overrides supersede previously recorded runtime model identity.
  // If runtime fields are stale (or the override changed), clear them so status
  // surfaces reflect the selected model immediately.
  const runtimeModel = typeof entry.model === "string" ? entry.model.trim() : "";
  const runtimeProvider = typeof entry.modelProvider === "string" ? entry.modelProvider.trim() : "";
  const runtimePresent = runtimeModel.length > 0 || runtimeProvider.length > 0;
  const runtimeAligned =
    runtimeModel === selection.model &&
    (runtimeProvider.length === 0 || runtimeProvider === selection.provider);
  if (runtimePresent && (selectionUpdated || !runtimeAligned)) {
    if (entry.model !== undefined) {
      delete entry.model;
      updated = true;
    }
    if (entry.modelProvider !== undefined) {
      delete entry.modelProvider;
      updated = true;
    }
  }

  if (profileOverride) {
    if (entry.authProfileOverride !== profileOverride) {
      entry.authProfileOverride = profileOverride;
      updated = true;
    }
    if (entry.authProfileOverrideSource !== profileOverrideSource) {
      entry.authProfileOverrideSource = profileOverrideSource;
      updated = true;
    }
    if (entry.authProfileOverrideCompactionCount !== undefined) {
      delete entry.authProfileOverrideCompactionCount;
      updated = true;
    }
  } else {
    if (entry.authProfileOverride) {
      delete entry.authProfileOverride;
      updated = true;
    }
    if (entry.authProfileOverrideSource) {
      delete entry.authProfileOverrideSource;
      updated = true;
    }
    if (entry.authProfileOverrideCompactionCount !== undefined) {
      delete entry.authProfileOverrideCompactionCount;
      updated = true;
    }
  }

  // Clear stale fallback notice when the user explicitly switches models.
  if (updated) {
    delete entry.fallbackNoticeSelectedModel;
    delete entry.fallbackNoticeActiveModel;
    delete entry.fallbackNoticeReason;
    entry.updatedAt = Date.now();
  }

  return { updated };
}
