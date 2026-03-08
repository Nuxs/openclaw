import { nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { callDebugMethod, loadDebug } from "./controllers/debug.ts";
import { renderDebug } from "./views/debug.ts";

export function renderDebugTab(state: AppViewState) {
  if (state.tab !== "debug") {
    return nothing;
  }

  return renderDebug({
    loading: state.debugLoading,
    status: state.debugStatus,
    health: state.debugHealth,
    models: state.debugModels,
    heartbeat: state.debugHeartbeat,
    web3Audit: state.debugWeb3Audit,
    web3AuditError: state.debugWeb3AuditError,
    eventLog: state.eventLog,
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
