#!/usr/bin/env bash
# ============================================================================
# apply-brand.sh — 从 private/brand.json 读取品牌配置，批量替换所有硬编码位置
# ============================================================================
# 用法: ./private/scripts/apply-brand.sh [--dry-run]
# 依赖: jq, sed (macOS/GNU 均可)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BRAND_FILE="$REPO_ROOT/private/brand.json"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

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
UI_TITLE=$(jq -r '.ui.title' "$BRAND_FILE")
UI_PRIMARY_COLOR=$(jq -r '.ui.primaryColor' "$BRAND_FILE")
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
# 1. UI 品牌
# ============================================================================
echo ""
echo "=== UI ==="
replace_in "ui/index.html" "<title>OpenClaw Control</title>" "<title>$UI_TITLE Control</title>"
replace_in "ui/src/ui/app-render.ts" 'alt="OpenClaw"' "alt=\"$NAME\""
replace_in "ui/src/ui/app-render.ts" '>OPENCLAW<' ">$(echo "$NAME" | tr '[:lower:]' '[:upper:]')<"

# ============================================================================
# 2. macOS App
# ============================================================================
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

# ============================================================================
# 3. iOS App
# ============================================================================
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

# ============================================================================
# 4. Android App
# ============================================================================
echo ""
echo "=== Android ==="
replace_in "apps/android/app/src/main/res/values/strings.xml" \
  ">OpenClaw Node<" ">$ANDROID_APP_NAME<"
replace_in "apps/android/app/build.gradle.kts" \
  "ai.openclaw.android" "$ANDROID_APP_ID"

# ============================================================================
# 5. src/ 用户可见文本
# ============================================================================
echo ""
echo "=== src/ 用户可见文本 ==="
replace_in "src/daemon/constants.ts" '"OpenClaw Gateway"' "\"$NAME Gateway\""
replace_in "src/daemon/constants.ts" '"OpenClaw Node"' "\"$NAME Node\""
replace_in "src/daemon/constants.ts" '"OpenClaw Node Host"' "\"$NAME Node Host\""
replace_in "src/gateway/server-discovery.ts" 'return "OpenClaw"' "return \"$NAME\""
replace_in "src/infra/bonjour.ts" 'return "OpenClaw"' "return \"$NAME\""
replace_in "src/canvas-host/server.ts" "<title>OpenClaw Canvas</title>" "<title>$NAME Canvas</title>"
replace_in "src/canvas-host/server.ts" "<h1>OpenClaw Canvas</h1>" "<h1>$NAME Canvas</h1>"
replace_in "src/canvas-host/a2ui/index.html" "<title>OpenClaw Canvas</title>" "<title>$NAME Canvas</title>"

# CLI 用户提示中的品牌名
for F in \
  "src/cli/update-cli/update-command.ts" \
  "src/cli/update-cli/status.ts" \
  "src/wizard/onboarding.finalize.ts" \
  "src/browser/client-fetch.ts" \
  "src/infra/tailscale.ts" \
  "src/channels/plugins/onboarding/whatsapp.ts" \
  "src/channels/plugins/onboarding/slack.ts" \
  "src/channels/plugins/onboarding/signal.ts"; do
  if [[ -f "$REPO_ROOT/$F" ]]; then
    if grep -q "OpenClaw" "$REPO_ROOT/$F" 2>/dev/null; then
      if $DRY_RUN; then
        echo "  📝 [dry-run] $F: 'OpenClaw' → '$NAME'"
      else
        # 只替换用户可见字符串中的 OpenClaw，不改变 import/require/env var 名
        sedi "s/Updating OpenClaw/Updating $NAME/g" "$REPO_ROOT/$F"
        sedi "s/OpenClaw update status/$NAME update status/g" "$REPO_ROOT/$F"
        sedi "s/this OpenClaw install/this $NAME install/g" "$REPO_ROOT/$F"
        sedi "s/so OpenClaw can/so $NAME can/g" "$REPO_ROOT/$F"
        sedi "s/the OpenClaw gateway/the $NAME gateway/g" "$REPO_ROOT/$F"
        sedi "s/OpenClaw uses/\"$NAME uses/g" "$REPO_ROOT/$F"
        sedi "s/for OpenClaw/for $NAME/g" "$REPO_ROOT/$F"
        sedi "s/\"OpenClaw\"/\"$NAME\"/g" "$REPO_ROOT/$F"
        echo "  ✅ $F"
      fi
    fi
  fi
done

# ============================================================================
# 6. API 来源标识
# ============================================================================
echo ""
echo "=== API 来源标识 ==="
replace_in "src/agents/pi-embedded-runner/extra-params.ts" '"X-Title": "OpenClaw"' "\"X-Title\": \"$NAME\""
replace_in "src/agents/minimax-vlm.ts" '"MM-API-Source": "OpenClaw"' "\"MM-API-Source\": \"$NAME\""
replace_in "src/infra/provider-usage.fetch.minimax.ts" '"MM-API-Source": "OpenClaw"' "\"MM-API-Source\": \"$NAME\""

# ============================================================================
# 7. Docker 镜像名（docker-compose override 和 CI 中自动使用 brand.json）
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
