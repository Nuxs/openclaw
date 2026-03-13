import { nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { callDebugMethod, loadDebug } from "./controllers/debug.ts";
import { renderDebug } from "./views/debug.ts";

export function renderDebugTab(state: AppViewState) {
  if (state.tab !== "debug") {
    return nothing;
  }

  const methods = Array.isArray(
    (state.hello as { features?: { methods?: unknown } } | null)?.features?.methods,
  )
    ? (
        (state.hello as { features?: { methods?: unknown[] } } | null)?.features?.methods ?? []
      ).filter((method): method is string => typeof method === "string")
    : [];

  return renderDebug({
    loading: state.debugLoading,
    status: state.debugStatus,
    health: state.debugHealth,
    models: state.debugModels,
    heartbeat: state.debugHeartbeat,
    web3Audit: state.debugWeb3Audit,
    web3AuditError: state.debugWeb3AuditError,
    eventLog: state.eventLog,
    methods,
    callMethod: state.debugCallMethod,
    callParams: state.debugCallParams,
    callResult: state.debugCallResult,
    callError: state.debugCallError,
    onCallMethodChange: (next) => (state.debugCallMethod = next),
    onCallParamsChange: (next) => (state.debugCallParams = next),
    onRefresh: () => loadDebug(state),
    onCall: () => callDebugMethod(state),
  });
}
