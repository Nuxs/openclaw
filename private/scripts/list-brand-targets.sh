#!/usr/bin/env bash
# ============================================================================
# list-brand-targets.sh — 列出私有品牌化脚本会“主动改写”的文件路径
# ============================================================================
# 用法:
#   ./private/scripts/list-brand-targets.sh
#   ./private/scripts/list-brand-targets.sh --scope apps
#   ./private/scripts/list-brand-targets.sh --scope src
#   ./private/scripts/list-brand-targets.sh --scope full
#
# 说明：
# - 该清单用于同步前冲突预测的分类（品牌相关 vs 非品牌相关）。
# - 这里刻意使用“显式列表”而不是从 apply-brand.sh 解析：
#   1) 避免脚本结构调整导致解析失效
#   2) 让维护者一眼能看出品牌入侵面
# - 当你修改 private/scripts/apply-brand.sh 的替换范围时，请同步更新此文件。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

SCOPE="apps"

usage() {
  cat <<'EOF'
用法: list-brand-targets.sh [--scope apps|src|full]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)
      SCOPE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数: $1"
      usage
      exit 1
      ;;
  esac
done

case "$SCOPE" in
  apps|src|full) ;;
  *)
    echo "❌ 无效 scope: $SCOPE（可选: apps|src|full）"
    exit 1
    ;;
esac

# apps scope: 包层面品牌化
if [[ "$SCOPE" == "apps" || "$SCOPE" == "full" ]]; then
  cat <<'EOF'
apps/macos/Sources/OpenClaw/Resources/Info.plist
apps/ios/Sources/Info.plist
apps/ios/project.yml
apps/android/app/src/main/res/values/strings.xml
apps/android/app/build.gradle.kts
EOF
fi

# src scope: 用户可见字符串/来源标识
if [[ "$SCOPE" == "src" || "$SCOPE" == "full" ]]; then
  cat <<'EOF'
src/daemon/constants.ts
src/gateway/server-discovery.ts
src/infra/bonjour.ts
src/canvas-host/server.ts
src/canvas-host/a2ui/index.html
src/cli/update-cli/update-command.ts
src/cli/update-cli/status.ts
src/wizard/onboarding.finalize.ts
src/browser/client-fetch.ts
src/infra/tailscale.ts
src/channels/plugins/onboarding/whatsapp.ts
src/channels/plugins/onboarding/slack.ts
src/channels/plugins/onboarding/signal.ts
src/agents/pi-embedded-runner/extra-params.ts
src/agents/minimax-vlm.ts
src/infra/provider-usage.fetch.minimax.ts
EOF
fi
