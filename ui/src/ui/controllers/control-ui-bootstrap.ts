import {
  CONTROL_UI_BOOTSTRAP_CONFIG_PATH,
  type ControlUiBootstrapConfig,
} from "../../../../src/gateway/control-ui-contract.js";
import { normalizeAssistantIdentity } from "../assistant-identity.ts";
import { normalizeBasePath } from "../navigation.ts";

export type ControlUiBootstrapState = {
  basePath: string;
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
};

export async function loadControlUiBootstrapConfig(state: ControlUiBootstrapState) {
  if (typeof window === "undefined") {
    return;
  }
  if (typeof fetch !== "function") {
    return;
  }

  const basePath = normalizeBasePath(state.basePath ?? "");
  const url = basePath
    ? `${basePath}${CONTROL_UI_BOOTSTRAP_CONFIG_PATH}`
    : CONTROL_UI_BOOTSTRAP_CONFIG_PATH;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!res.ok) {
      return;
    }
    const parsed = (await res.json()) as ControlUiBootstrapConfig;
    const normalized = normalizeAssistantIdentity({
      agentId: parsed.assistantAgentId ?? null,
      name: parsed.assistantName,
      avatar: parsed.assistantAvatar ?? null,
    });
    state.assistantName = normalized.name;
    state.assistantAvatar = normalized.avatar;
    state.assistantAgentId = normalized.agentId ?? null;

    const productName = (parsed.productName ?? "OpenClaw").trim() || "OpenClaw";
    const productTitle = (parsed.productTitle ?? productName).trim() || productName;

    applyControlUiBrandDom({ productName, productTitle });
  } catch {
    // Ignore bootstrap failures; UI will update identity after connecting.
  }
}

function applyControlUiBrandDom(opts: { productName: string; productTitle: string }) {
  if (typeof document === "undefined") {
    return;
  }

  // Persist branding in DOM so other modules can read it without widening AppViewState.
  document.documentElement.dataset.openclawProductName = opts.productName;
  document.documentElement.dataset.openclawProductTitle = opts.productTitle;
  document.title = `${opts.productTitle} Control`;

  // Avoid touching merge-magnet files by patching the rendered sidebar brand in-place.
  // This relies on stable CSS classes.
  const applyNow = () => {
    let changed = false;

    const title = document.querySelector(".sidebar-brand__title");
    if (title && title.textContent !== opts.productName) {
      title.textContent = opts.productName;
      changed = true;
    }

    const logo = document.querySelector(".sidebar-brand__logo");
    if (logo instanceof HTMLImageElement && logo.alt !== opts.productName) {
      logo.alt = opts.productName;
      changed = true;
    }

    return changed;
  };

  if (applyNow()) {
    return;
  }

  if (!document.body) {
    return;
  }

  const observer = new MutationObserver(() => {
    if (applyNow()) {
      observer.disconnect();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Hard stop to avoid leaking observers.
  window.setTimeout(() => observer.disconnect(), 5_000);
}
