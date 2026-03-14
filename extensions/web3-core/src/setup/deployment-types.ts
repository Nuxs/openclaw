/**
 * Deployment planning / verification types for Web3 Market setup.
 *
 * These types are runtime-facing only: they describe how we plan, apply,
 * and verify market deployment presets without changing the public `web3.*`
 * contract shape outside the dedicated deployment methods.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk/config-types";

export type MarketDeploymentMode = "single-node" | "trusted-circle" | "hybrid-cloud-edge";

export type MarketDeploymentIntent = "consumer" | "provider" | "hybrid";

export type MarketRuntimeHintKind = "ollama" | "lmstudio" | "openai-compat" | "custom";

export type MarketDeploymentRuntimeHint = {
  kind: MarketRuntimeHintKind;
  label?: string;
  models?: string[];
  maxConcurrent?: number;
};

export type MarketDeploymentOperation = {
  op: "set" | "setIfMissing" | "setIfEmpty" | "mergeStringSet";
  path: Array<string | number>;
  value: unknown;
  summary: string;
};

export type MarketDeploymentRole = {
  id: string;
  label: string;
  responsibility: string;
};

export type MarketDeploymentCheck = {
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

export type MarketDeploymentTopology = {
  pattern: string;
  trustDomain: string;
  roles: MarketDeploymentRole[];
  validationScenarios: string[];
};

export type MarketDeploymentPlan = {
  mode: MarketDeploymentMode;
  intent: MarketDeploymentIntent;
  summary: string;
  topology: MarketDeploymentTopology;
  detectedProviders: MarketDetectedProvider[];
  operations: MarketDeploymentOperation[];
  checks: MarketDeploymentCheck[];
  nextSteps: string[];
};

export type MarketDeploymentReadiness = {
  ready: boolean;
  passCount: number;
  warnCount: number;
  failCount: number;
  checks: MarketDeploymentCheck[];
};

export type MarketDeploymentVerification = {
  mode: MarketDeploymentMode;
  healthy: boolean;
  summary: string;
  readiness: MarketDeploymentReadiness;
  metrics: {
    publishedResources: number;
    activeLeases: number;
    activeAlerts: number;
    discoveryEnabled: boolean;
    consumerEnabled: boolean;
    advertiseToMarket: boolean;
    providerListenEnabled: boolean;
    providerBind?: string;
  };
  recommendedActions: string[];
};

export type MarketDeploymentPlanParams = {
  mode?: MarketDeploymentMode;
  intent?: MarketDeploymentIntent;
  currentConfig?: OpenClawConfig | Record<string, unknown>;
  runtimeHints?: MarketDeploymentRuntimeHint[];
  nodeLabel?: string;
};
