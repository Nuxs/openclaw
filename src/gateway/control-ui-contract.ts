export const CONTROL_UI_BOOTSTRAP_CONFIG_PATH = "/__openclaw/control-ui-config.json";

export type ControlUiBootstrapConfig = {
  basePath: string;
  assistantName: string;
  assistantAvatar: string;
  assistantAgentId: string;
  /** Product display name (e.g. "OpenClaw"). Optional for backwards compatibility. */
  productName?: string;
  /** UI title base (e.g. "OpenClaw"). Optional for backwards compatibility. */
  productTitle?: string;
};
