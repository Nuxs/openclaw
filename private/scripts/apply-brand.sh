#!/usr/bin/env bash
# ============================================================================
# apply-brand.sh — 从 private/brand.json 读取品牌配置，批量替换品牌标识
# ============================================================================
# 用法:
#   ./private/scripts/apply-brand.sh
#   ./private/scripts/apply-brand.sh --dry-run
#   ./private/scripts/apply-brand.sh --scope apps
#   ./private/scripts/apply-brand.sh --scope src
#   ./private/scripts/apply-brand.sh --scope full
#
# Scope 说明:
# - apps: 仅应用包层面品牌化（Info.plist / bundleId / Android appName 等）【默认】
# - src:  （已弃用）曾用于替换 src/ 内用户可见字符串与 API 来源标识；现已迁移为运行时注入/解析
# - full: apps + src
#
# 注意:
# - UI（ui/）品牌已迁移为运行时 bootstrap 注入，不再通过本脚本直接改写 UI 源文件。
# - 依赖: jq, sed (macOS/GNU 均可)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BRAND_FILE="$REPO_ROOT/private/brand.json"

DRY_RUN=false
SCOPE="apps"

usage() {
  cat <<'EOF'
用法: apply-brand.sh [--dry-run] [--scope apps|src|full]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
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

if [[ ! -f "$BRAND_FILE" ]]; then
  echo "❌ 找不到 $BRAND_FILE"
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "❌ 需要 jq，请先安装: brew install jq"
  exit 1
fi

# --- 读取品牌配置 -----------------------------------------------------------
NAME=$(jq -r '.name' "$BRAND_FILE")
NAME_LOWER=$(jq -r '.nameLower' "$BRAND_FILE")
DESCRIPTION=$(jq -r '.description' "$BRAND_FILE")
MACOS_APP_NAME=$(jq -r '.macos.appName' "$BRAND_FILE")
MACOS_BUNDLE_ID=$(jq -r '.macos.bundleId' "$BRAND_FILE")
IOS_APP_NAME=$(jq -r '.ios.appName' "$BRAND_FILE")
IOS_BUNDLE_ID=$(jq -r '.ios.bundleId' "$BRAND_FILE")
ANDROID_APP_NAME=$(jq -r '.android.appName' "$BRAND_FILE")
ANDROID_APP_ID=$(jq -r '.android.applicationId' "$BRAND_FILE")
DOCKER_REGISTRY=$(jq -r '.docker.registry' "$BRAND_FILE")
DOCKER_IMAGE=$(jq -r '.docker.imageName' "$BRAND_FILE")

# 如果 brand 就是默认值 "OpenClaw"，跳过
if [[ "$NAME" == "OpenClaw" ]]; then
  echo "ℹ️  brand.json 仍为默认 OpenClaw，跳过品牌替换。"
  echo "    请先编辑 private/brand.json 后重新运行。"
  exit 0
fi

echo "🎨 应用品牌: $NAME ($NAME_LOWER)"
echo "   描述: $DESCRIPTION"
echo "   scope: $SCOPE"
$DRY_RUN && echo "   [DRY RUN — 仅打印，不修改]"

# --- 跨平台 sed -i 兼容 -----------------------------------------------------
sedi() {
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

# --- 替换函数 ---------------------------------------------------------------
replace_in() {
  local file="$1" old="$2" new="$3"
  if [[ ! -f "$REPO_ROOT/$file" ]]; then
    echo "  ⚠️  跳过 (文件不存在): $file"
    return
  fi
  if grep -q "$old" "$REPO_ROOT/$file" 2>/dev/null; then
    if $DRY_RUN; then
      echo "  📝 [dry-run] $file: '$old' → '$new'"
    else
      sedi "s|$old|$new|g" "$REPO_ROOT/$file"
      echo "  ✅ $file"
    fi
  fi
}

# ============================================================================
# 0. UI 品牌（已迁移到运行时注入）
# ============================================================================
echo ""
echo "=== UI ==="
echo "  ℹ️  UI 品牌名/标题已通过 Control UI bootstrap 在运行时注入。"
echo "     本脚本不再直接改写 ui/*（减少与 upstream 的冲突）。"

# ============================================================================
# 1. macOS/iOS/Android（apps scope）
# ============================================================================
if [[ "$SCOPE" == "apps" || "$SCOPE" == "full" ]]; then
  echo ""
  echo "=== macOS ==="
  replace_in "apps/macos/Sources/OpenClaw/Resources/Info.plist" \
    "<string>OpenClaw</string>" "<string>$MACOS_APP_NAME</string>"
  replace_in "apps/macos/Sources/OpenClaw/Resources/Info.plist" \
    "ai.openclaw.mac" "$MACOS_BUNDLE_ID"

  # 权限描述中的 "OpenClaw"
  for PLIST in "apps/macos/Sources/OpenClaw/Resources/Info.plist"; do
    if [[ -f "$REPO_ROOT/$PLIST" ]]; then
      if $DRY_RUN; then
        echo "  📝 [dry-run] $PLIST: 'OpenClaw needs/can/uses/captures...' → '$NAME ...'"
      else
        sedi "s/OpenClaw needs/$NAME needs/g" "$REPO_ROOT/$PLIST"
        sedi "s/OpenClaw can/$NAME can/g" "$REPO_ROOT/$PLIST"
        sedi "s/OpenClaw uses/$NAME uses/g" "$REPO_ROOT/$PLIST"
        sedi "s/OpenClaw captures/$NAME captures/g" "$REPO_ROOT/$PLIST"
        sedi "s/OpenClaw discovers/$NAME discovers/g" "$REPO_ROOT/$PLIST"
        echo "  ✅ $PLIST (权限描述)"
      fi
    fi
  done

  echo ""
  echo "=== iOS ==="
  replace_in "apps/ios/Sources/Info.plist" \
    "<string>OpenClaw</string>" "<string>$IOS_APP_NAME</string>"
  replace_in "apps/ios/project.yml" \
    "CFBundleDisplayName: OpenClaw" "CFBundleDisplayName: $IOS_APP_NAME"
  replace_in "apps/ios/project.yml" \
    "name: OpenClaw" "name: $IOS_APP_NAME"
  replace_in "apps/ios/project.yml" \
    "bundleIdPrefix: ai.openclaw" "bundleIdPrefix: ${IOS_BUNDLE_ID%.*}"

  # iOS 权限描述
  for PLIST in "apps/ios/Sources/Info.plist" "apps/ios/project.yml"; do
    if [[ -f "$REPO_ROOT/$PLIST" ]]; then
      if $DRY_RUN; then
        echo "  📝 [dry-run] $PLIST: 权限描述品牌替换"
      else
        sedi "s/OpenClaw needs/$NAME needs/g" "$REPO_ROOT/$PLIST"
        sedi "s/OpenClaw can/$NAME can/g" "$REPO_ROOT/$PLIST"
        sedi "s/OpenClaw uses/$NAME uses/g" "$REPO_ROOT/$PLIST"
        sedi "s/OpenClaw captures/$NAME captures/g" "$REPO_ROOT/$PLIST"
        sedi "s/OpenClaw discovers/$NAME discovers/g" "$REPO_ROOT/$PLIST"
        echo "  ✅ $PLIST (权限描述)"
      fi
    fi
  done

  echo ""
  echo "=== Android ==="
  replace_in "apps/android/app/src/main/res/values/strings.xml" \
    ">OpenClaw Node<" ">$ANDROID_APP_NAME<"
  replace_in "apps/android/app/build.gradle.kts" \
    "ai.openclaw.android" "$ANDROID_APP_ID"
fi

# ============================================================================
# 2. src/ 用户可见文本（src scope）
# ============================================================================
if [[ "$SCOPE" == "src" || "$SCOPE" == "full" ]]; then
  echo ""
  echo "=== src/ 用户可见文本 ==="
  echo "  ℹ️  为了降低与 upstream 的长期合流冲突，src/ 品牌化已迁移为运行时解析："
  echo "     - Control UI: src/gateway/control-ui.ts 读取 private/brand.json"
  echo "     - Canvas/default HTML 与第三方请求头：由 src/infra/brand.ts 统一提供"
  echo "  因此本脚本不再改写 src/*。"
fi

# ============================================================================
# 3. Docker
# ============================================================================
echo ""
echo "=== Docker ==="
echo "  ℹ️  Docker 镜像名通过 private/env/*.env 和 CI workflow 配置，无需替换源码。"
echo "     当前配置: $DOCKER_REGISTRY/$DOCKER_IMAGE"

echo ""
echo "🎉 品牌替换完成！"

echo ""
echo "⚠️  以下内部标识符 *未* 自动替换（通常不需要改）:"
echo "   - npm 包名 'openclaw'（影响 npm install 命令）"
echo "   - CLI 命令名 'openclaw'（影响用户文档和脚本）"
echo "   - OPENCLAW_* 环境变量名（影响现有部署兼容性）"
echo "   - localStorage key（变更会丢失用户设置）"
echo "   - Web Component 标签 <openclaw-app>"
echo "   如需修改这些，请手动编辑对应文件。"
