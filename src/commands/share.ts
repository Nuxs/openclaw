import { Web3StateStore } from "../../extensions/web3-core/src/state/store.js";
import { formatCliCommand } from "../cli/command-format.js";
import { readConfigFileSnapshot, writeConfigFile } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import { danger, info } from "../globals.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { theme } from "../terminal/theme.js";
import { shortenHomePath } from "../utils.js";

export type ShareStartOptions = {
  providerId?: string;
  report?: boolean;
  ttlMs?: number;
  runtime?: RuntimeEnv;
};

type Web3PluginConfigShape = {
  resources?: {
    enabled?: boolean;
    advertiseToMarket?: boolean;
    provider?: {
      listen?: {
        enabled?: boolean;
        bind?: string;
        port?: number;
        publicBaseUrl?: string;
      };
      offers?: {
        models?: Array<{
          id: string;
          label?: string;
          price?: { amount: number; unit: string; currency: string };
        }>;
        search?: Array<{
          id: string;
          label?: string;
          price?: { amount: number; unit: string; currency: string };
        }>;
        storage?: Array<{
          id: string;
          label?: string;
          price?: { amount: number; unit: string; currency: string };
        }>;
      };
    };
  };
};

type IndexedResource = {
  resourceId: string;
  kind: "model" | "search" | "storage";
  label?: string;
  price?: string;
  unit?: string;
  metadata?: Record<string, unknown>;
};

function ensureRecord<T extends Record<string, unknown>>(target: unknown, fallback: T): T {
  if (!target || typeof target !== "object") {
    return fallback;
  }
  return target as T;
}

async function loadValidConfig(runtime: RuntimeEnv) {
  const snapshot = await readConfigFileSnapshot();
  if (!snapshot.valid) {
    runtime.error(danger(`Config invalid at ${shortenHomePath(snapshot.path)}.`));
    for (const issue of snapshot.issues) {
      runtime.error(danger(`- ${issue.path || "<root>"}: ${issue.message}`));
    }
    runtime.error(`Run ${formatCliCommand("openclaw doctor")} to repair, then retry.`);
    runtime.exit(1);
  }
  return snapshot;
}

function resolveWeb3Config(snapshot: { resolved: Record<string, unknown> }): Web3PluginConfigShape {
  const plugins = ensureRecord(snapshot.resolved.plugins, {} as Record<string, unknown>);
  const entries = ensureRecord(plugins.entries, {} as Record<string, unknown>);
  const web3 = ensureRecord(entries["web3-core"], {} as Record<string, unknown>);
  return ensureRecord(web3.config, {} as Web3PluginConfigShape);
}

function buildIndexResources(config: Web3PluginConfigShape): IndexedResource[] {
  const offers = config.resources?.provider?.offers;
  const resources: IndexedResource[] = [];
  const pushOffer = (
    kind: IndexedResource["kind"],
    offer?: {
      id: string;
      label?: string;
      price?: { amount: number; unit: string; currency: string };
    },
  ) => {
    if (!offer || !offer.id) {
      return;
    }
    resources.push({
      resourceId: offer.id,
      kind,
      label: offer.label,
      price: offer.price ? String(offer.price.amount) : undefined,
      unit: offer.price?.unit,
      metadata: offer.price?.currency ? { currency: offer.price.currency } : undefined,
    });
  };
  offers?.models?.forEach((offer) => pushOffer("model", offer));
  offers?.search?.forEach((offer) => pushOffer("search", offer));
  offers?.storage?.forEach((offer) => pushOffer("storage", offer));
  return resources;
}

export async function shareStartCommand(opts: ShareStartOptions) {
  const runtime = opts.runtime ?? defaultRuntime;
  const snapshot = await loadValidConfig(runtime);
  const next = structuredClone(snapshot.resolved) as Record<string, unknown>;

  const plugins = ensureRecord(next.plugins, {} as Record<string, unknown>);
  plugins.enabled = plugins.enabled ?? true;
  const entries = ensureRecord(plugins.entries, {} as Record<string, unknown>);
  const web3Entry = ensureRecord(entries["web3-core"], {} as Record<string, unknown>);
  web3Entry.enabled = true;

  const web3Config = ensureRecord(web3Entry.config, {} as Record<string, unknown>);
  const resources = ensureRecord(web3Config.resources, {} as Record<string, unknown>);
  resources.enabled = true;
  resources.advertiseToMarket = true;

  const provider = ensureRecord(resources.provider, {} as Record<string, unknown>);
  const listen = ensureRecord(provider.listen, {} as Record<string, unknown>);
  listen.enabled = true;
  listen.bind = listen.bind ?? "loopback";

  provider.listen = listen;
  resources.provider = provider;
  web3Config.resources = resources;
  web3Entry.config = web3Config;
  entries["web3-core"] = web3Entry;
  plugins.entries = entries;
  next.plugins = plugins;

  await writeConfigFile(next);
  runtime.log(info("Enabled web3-core resource sharing. Restart the gateway to apply."));

  const stateDir = resolveStateDir();
  const store = new Web3StateStore(stateDir);
  const providerId = opts.providerId?.trim() || store.ensureProviderId();
  if (opts.providerId) {
    store.saveProviderId(providerId);
  }
  runtime.log(info(`Provider ID: ${providerId}`));

  if (opts.report === false) {
    return;
  }

  const web3ConfigResolved = resolveWeb3Config({ resolved: next });
  const resourcesIndex = buildIndexResources(web3ConfigResolved);
  if (resourcesIndex.length === 0) {
    runtime.log(
      theme.muted(
        "No resource offers configured. Add offers under plugins.entries['web3-core'].config.resources.provider.offers and re-run share start.",
      ),
    );
    return;
  }

  try {
    const { callGatewayCli } = await import("../gateway/call.js");
    await callGatewayCli({
      method: "web3.index.report",
      params: {
        providerId,
        resources: resourcesIndex,
        ttlMs: opts.ttlMs,
        endpoint: web3ConfigResolved.resources?.provider?.listen?.publicBaseUrl,
      },
    });
    runtime.log(info("Reported signed index entry."));
  } catch (err) {
    runtime.error(
      danger(
        `Index report failed: ${err instanceof Error ? err.message : String(err)}. Start the gateway and re-run ${formatCliCommand("openclaw share start")}.`,
      ),
    );
  }
}
