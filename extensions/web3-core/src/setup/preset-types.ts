/**
 * Preset preview / baseline verification types for Web3 Market setup.
 *
 * These types describe the compatibility preset layer used to preview,
 * apply, and verify baseline market configuration without pretending to
 * be a full topology planner.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk/config-types";

export type MarketPresetMode = "single-node" | "trusted-circle" | "hybrid-cloud-edge";

export type MarketPresetIntent = "consumer" | "provider" | "hybrid";

export type MarketRuntimeHintKind = "ollama" | "lmstudio" | "openai-compat" | "custom";

export type MarketPresetRuntimeHint = {
  kind: MarketRuntimeHintKind;
  label?: string;
  models?: string[];
  maxConcurrent?: number;
};

export type MarketPresetOperation = {
  op: "set" | "setIfMissing" | "setIfEmpty" | "mergeStringSet";
  path: Array<string | number>;
  value: unknown;
  summary: string;
};

export type MarketPresetRole = {
  id: string;
  label: string;
  responsibility: string;
};

export type MarketPresetCheck = {
  name: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
  action?: string;
};

export type MarketDetectedProvider = {
  label: string;
  source: "configured" | "hint";
  runtime: MarketRuntimeHintKind;
  offerBackend: "openai-compat" | "custom";
  models: string[];
  publishable: boolean;
  note?: string;
};

export type MarketPresetLayout = {
  pattern: string;
  trustDomain: string;
  roles: MarketPresetRole[];
  validationScenarios: string[];
};

export type MarketPresetPreview = {
  mode: MarketPresetMode;
  intent: MarketPresetIntent;
  summary: string;
  layout: MarketPresetLayout;
  detectedProviders: MarketDetectedProvider[];
  operations: MarketPresetOperation[];
  checks: MarketPresetCheck[];
  nextSteps: string[];
};

export type MarketPresetReadiness = {
  ready: boolean;
  passCount: number;
  warnCount: number;
  failCount: number;
  checks: MarketPresetCheck[];
};

export type MarketPresetVerification = {
  mode: MarketPresetMode;
  healthy: boolean;
  summary: string;
  readiness: MarketPresetReadiness;
  metrics: {
    publishedResources: number;
    activeLeases: number;
    activeAlerts: number;
    discoveryEnabled: boolean;
    consumerEnabled: boolean;
    advertiseToMarket: boolean;
    providerListenEnabled: boolean;
    providerBind?: string;
    walletReady: boolean;
    paymentReady: boolean;
    billingEnabled: boolean;
    autopayEnabled: boolean;
  };
  recommendedActions: string[];
};

export type MarketPresetPreviewParams = {
  mode?: MarketPresetMode;
  intent?: MarketPresetIntent;
  currentConfig?: OpenClawConfig | Record<string, unknown>;
  runtimeHints?: MarketPresetRuntimeHint[];
  nodeLabel?: string;
};
