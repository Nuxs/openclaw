import { nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { loadChannels } from "./controllers/channels.ts";
import { updateConfigFormValue } from "./controllers/config.ts";
import { renderChannels } from "./views/channels.ts";

export function renderChannelsTab(state: AppViewState) {
  if (state.tab !== "channels") {
    return nothing;
  }

  return renderChannels({
    connected: state.connected,
    loading: state.channelsLoading,
    snapshot: state.channelsSnapshot,
    lastError: state.channelsError,
    lastSuccessAt: state.channelsLastSuccess,
    whatsappMessage: state.whatsappLoginMessage,
    whatsappQrDataUrl: state.whatsappLoginQrDataUrl,
    whatsappConnected: state.whatsappLoginConnected,
    whatsappBusy: state.whatsappBusy,
    configSchema: state.configSchema,
    configSchemaLoading: state.configSchemaLoading,
    configForm: state.configForm,
    configUiHints: state.configUiHints,
    configSaving: state.configSaving,
    configFormDirty: state.configFormDirty,
    nostrProfileFormState: state.nostrProfileFormState,
    nostrProfileAccountId: state.nostrProfileAccountId,
    onRefresh: (probe) => loadChannels(state, probe),
    onWhatsAppStart: (force) => state.handleWhatsAppStart(force),
    onWhatsAppWait: () => state.handleWhatsAppWait(),
    onWhatsAppLogout: () => state.handleWhatsAppLogout(),
    onConfigPatch: (path, value) => updateConfigFormValue(state, path, value),
    onConfigSave: () => state.handleChannelConfigSave(),
    onConfigReload: () => state.handleChannelConfigReload(),
    onNostrProfileEdit: (accountId, profile) => state.handleNostrProfileEdit(accountId, profile),
    onNostrProfileCancel: () => state.handleNostrProfileCancel(),
    onNostrProfileFieldChange: (field, value) => state.handleNostrProfileFieldChange(field, value),
    onNostrProfileSave: () => state.handleNostrProfileSave(),
    onNostrProfileImport: () => state.handleNostrProfileImport(),
    onNostrProfileToggleAdvanced: () => state.handleNostrProfileToggleAdvanced(),
  });
}
