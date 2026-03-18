import { describe, expect, it, vi } from "vitest";
import {
  loadCallGateway,
  loadConfigWriteHelpers,
  loadCoreConfig,
  loadSessionStoreHelpers,
  loadStewardGrowthRuntimeHelpers,
} from "./core-imports.js";

const {
  callGatewayMock,
  loadConfigMock,
  resolveSessionStoreKeyMock,
  resolveStorePathMock,
  updateSessionStoreEntryMock,
  resolveSessionAgentIdMock,
  resolveChannelConfigWritesMock,
  normalizeChannelIdMock,
  getConfigValueAtPathMock,
  setConfigValueAtPathMock,
  readConfigFileSnapshotMock,
  validateConfigObjectWithPluginsMock,
  writeConfigFileMock,
  syncStewardGrowthLoopMock,
} = vi.hoisted(() => ({
  callGatewayMock: vi.fn(),
  loadConfigMock: vi.fn(),
  resolveSessionStoreKeyMock: vi.fn(),
  resolveStorePathMock: vi.fn(),
  updateSessionStoreEntryMock: vi.fn(),
  resolveSessionAgentIdMock: vi.fn(),
  resolveChannelConfigWritesMock: vi.fn(),
  normalizeChannelIdMock: vi.fn(),
  getConfigValueAtPathMock: vi.fn(),
  setConfigValueAtPathMock: vi.fn(),
  readConfigFileSnapshotMock: vi.fn(),
  validateConfigObjectWithPluginsMock: vi.fn(),
  writeConfigFileMock: vi.fn(),
  syncStewardGrowthLoopMock: vi.fn(),
}));

vi.mock("openclaw/plugin-sdk/web3-host", () => ({
  callGateway: callGatewayMock,
  loadConfig: loadConfigMock,
  resolveSessionStoreKey: resolveSessionStoreKeyMock,
  resolveStorePath: resolveStorePathMock,
  updateSessionStoreEntry: updateSessionStoreEntryMock,
  resolveSessionAgentId: resolveSessionAgentIdMock,
  resolveChannelConfigWrites: resolveChannelConfigWritesMock,
  normalizeChannelId: normalizeChannelIdMock,
  getConfigValueAtPath: getConfigValueAtPathMock,
  setConfigValueAtPath: setConfigValueAtPathMock,
  readConfigFileSnapshot: readConfigFileSnapshotMock,
  validateConfigObjectWithPlugins: validateConfigObjectWithPluginsMock,
  writeConfigFile: writeConfigFileMock,
  syncStewardGrowthLoop: syncStewardGrowthLoopMock,
}));

describe("web3 core-imports", () => {
  it("loads gateway and config helpers from the stable plugin-sdk host bridge", async () => {
    const config = { session: { store: "memory" } };
    loadConfigMock.mockReturnValue(config);

    const callGateway = await loadCallGateway();
    const loadedConfig = await loadCoreConfig();
    const sessionHelpers = await loadSessionStoreHelpers();
    const configHelpers = await loadConfigWriteHelpers();
    const growthHelpers = await loadStewardGrowthRuntimeHelpers();

    expect(callGateway).toBe(callGatewayMock);
    expect(loadedConfig).toBe(config);
    expect(sessionHelpers.resolveSessionStoreKey).toBe(resolveSessionStoreKeyMock);
    expect(sessionHelpers.resolveStorePath).toBe(resolveStorePathMock);
    expect(sessionHelpers.updateSessionStoreEntry).toBe(updateSessionStoreEntryMock);
    expect(sessionHelpers.resolveSessionAgentId).toBe(resolveSessionAgentIdMock);
    expect(configHelpers.resolveChannelConfigWrites).toBe(resolveChannelConfigWritesMock);
    expect(configHelpers.normalizeChannelId).toBe(normalizeChannelIdMock);
    expect(configHelpers.getConfigValueAtPath).toBe(getConfigValueAtPathMock);
    expect(configHelpers.setConfigValueAtPath).toBe(setConfigValueAtPathMock);
    expect(configHelpers.readConfigFileSnapshot).toBe(readConfigFileSnapshotMock);
    expect(configHelpers.validateConfigObjectWithPlugins).toBe(validateConfigObjectWithPluginsMock);
    expect(configHelpers.writeConfigFile).toBe(writeConfigFileMock);
    expect(growthHelpers.syncStewardGrowthLoop).toBe(syncStewardGrowthLoopMock);
  });
});
