/**
 * Shared wording for preset baseline verification versus release gates.
 *
 * Keep CLI output, readiness summaries, and operator-facing guidance aligned
 * without overstating what `/web3-market verify` proves.
 */

import { modeLabel } from "./preset-layout.js";
import type { MarketPresetMode } from "./preset-types.js";

export const MARKET_RELEASE_GATE_ACTIONS = [
  "执行 `web3.wallet.balance` 真探针并记录可分享摘要。",
  "确认 `web3.index.list` 返回非空，并与 Provider 发布结果一致。",
  "完成一次支付/结算演练，并补齐 go-live evidence 与 release notes。",
  "按 runbook 完成一次降级或回滚演练。",
] as const;

export function buildPresetBaselineScopeLines(mode: MarketPresetMode): string[] {
  return [
    `范围：当前结果仅覆盖 ${modeLabel(mode)} 兼容预设 baseline，不等同于 GA release gate。`,
    "发布前仍需补齐真钱包探针、index.list 非空验证、支付/结算演练、回滚演练与发布说明留痕。",
  ];
}
