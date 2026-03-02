#!/usr/bin/env bash
# ============================================================================
# sync-upstream.sh — 从上游 main 同步最新变更到私有分支
# ============================================================================
# 用法:
#   ./private/scripts/sync-upstream.sh                # 默认: merge upstream/main
#   ./private/scripts/sync-upstream.sh --rebase        # 使用 rebase 策略
#   ./private/scripts/sync-upstream.sh --check         # 仅检查差距，不合并
#   ./private/scripts/sync-upstream.sh --tag v2026.2.1 # 合并指定 tag
#
# 前提:
#   git remote add upstream https://github.com/openclaw/openclaw.git
#   （首次运行会自动提示添加）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

STRATEGY="merge"
CHECK_ONLY=false
PREDICT_ONLY=false
TARGET_REF="upstream/main"
UPSTREAM_URL="https://github.com/openclaw/openclaw.git"

# --- 参数解析 ---------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rebase)    STRATEGY="rebase"; shift ;;
    --check)     CHECK_ONLY=true; shift ;;
    --predict-conflicts|--conflicts) PREDICT_ONLY=true; shift ;;
    --tag)       TARGET_REF="$2"; shift 2 ;;
    --upstream)  UPSTREAM_URL="$2"; shift 2 ;;
    -h|--help)
      echo "用法: $0 [--rebase] [--check] [--predict-conflicts] [--tag <ref>] [--upstream <url>]"
      exit 0
      ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

# --- 确保 upstream remote 存在 ----------------------------------------------
if ! git remote get-url upstream &>/dev/null; then
  echo "📡 添加 upstream remote: $UPSTREAM_URL"
  git remote add upstream "$UPSTREAM_URL"
fi

# --- Fetch 最新 -------------------------------------------------------------
echo "🔄 Fetching upstream..."
git fetch upstream --tags --prune

# --- 如果指定了 tag，验证其存在 -----------------------------------------------
if [[ "$TARGET_REF" != "upstream/main" ]]; then
  if ! git rev-parse "$TARGET_REF" &>/dev/null; then
    echo "❌ 找不到 ref: $TARGET_REF"
    echo "   可用的最近 tags:"
    # Avoid pipefail+head SIGPIPE failures.
    git tag --sort=-creatordate | sed -n '1,10p'
    exit 1
  fi
fi

# --- 检查差距 ---------------------------------------------------------------
CURRENT_BRANCH=$(git branch --show-current)
BEHIND=$(git rev-list --count "HEAD..$TARGET_REF" 2>/dev/null || echo "?")
AHEAD=$(git rev-list --count "$TARGET_REF..HEAD" 2>/dev/null || echo "?")

echo ""
echo "📊 同步状态:"
echo "   当前分支: $CURRENT_BRANCH"
echo "   目标: $TARGET_REF"
echo "   落后 upstream: $BEHIND 个提交"
echo "   领先 upstream: $AHEAD 个提交"

if [[ "$BEHIND" == "0" ]]; then
  echo ""
  echo "✅ 已经是最新的！"
  exit 0
fi

if $PREDICT_ONLY; then
  echo ""
  echo "🔎 预测冲突文件（不修改工作区）..."
  if [[ -x "private/scripts/predict-conflicts.sh" ]]; then
    bash private/scripts/predict-conflicts.sh --target "$TARGET_REF" --no-fetch
    exit 0
  fi
  echo "❌ 缺少脚本: private/scripts/predict-conflicts.sh"
  echo "   请先拉取/生成该脚本后重试。"
  exit 1
fi

if $CHECK_ONLY; then
  echo ""
  echo "📋 最近的 upstream 变更:"
  # Avoid pipefail+head SIGPIPE failures.
  git --no-pager log --oneline -n 20 "HEAD..$TARGET_REF"
  [[ "$BEHIND" -gt 20 ]] && echo "   ... 还有 $((BEHIND - 20)) 个提交"
  exit 0
fi

# --- 检查工作区状态 ----------------------------------------------------------
if [[ -n "$(git status --porcelain)" ]]; then
  echo ""
  echo "⚠️  工作区有未提交的改动："
  git status --short
  echo ""
  echo "请先提交或暂存你的改动后再同步。"
  echo "（出于 multi-agent 安全，脚本不会自动 stash）"
  exit 1
fi

BEFORE_SHA="$(git rev-parse HEAD)"
SYNC_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

PREDICT_JSON_FILE=""
if [[ -x "private/scripts/predict-conflicts.sh" ]]; then
  tmp_predict="$(mktemp)"
  if bash private/scripts/predict-conflicts.sh --target "$TARGET_REF" --no-fetch --json >"$tmp_predict"; then
    PREDICT_JSON_FILE="$tmp_predict"
  else
    rm -f "$tmp_predict"
  fi
fi

# --- 执行合并 ---------------------------------------------------------------
echo ""
echo "🔀 使用 $STRATEGY 策略合并 $TARGET_REF..."

if [[ "$STRATEGY" == "rebase" ]]; then
  if ! git rebase "$TARGET_REF"; then
    echo ""
    echo "❌ Rebase 遇到冲突！"
    echo ""
    echo "解决步骤:"
    echo "  1. 解决冲突文件（git status 查看）"
    echo "  2. git add <已解决的文件>"
    echo "  3. git rebase --continue"
    echo "  4. 如果 pnpm-lock.yaml 冲突: 接受上游版本后运行 pnpm install"
    echo ""
    echo "放弃: git rebase --abort"
    exit 1
  fi
else
  if ! git merge "$TARGET_REF" --no-edit; then
    echo ""
    echo "❌ Merge 遇到冲突！"
    echo ""

    # pnpm-lock.yaml 自动处理（生成文件，accept theirs + pnpm install 即可）
    if git diff --name-only --diff-filter=U | grep -q "pnpm-lock.yaml"; then
      echo "🔧 检测到 pnpm-lock.yaml 冲突，尝试自动解决..."
      git checkout --theirs pnpm-lock.yaml
      pnpm install --no-frozen-lockfile 2>/dev/null && {
        git add pnpm-lock.yaml
        echo "  ✅ pnpm-lock.yaml 已自动解决"
      } || {
        echo "  ⚠️  pnpm install 失败，请手动处理 pnpm-lock.yaml"
      }
    fi

    # labeler.yml 轻量 union 处理（双方通常只是追加不同的 label key）
    for labeler_file in .github/labeler.yml .github/workflows/labeler.yml; do
      if git diff --name-only --diff-filter=U | grep -qF "$labeler_file"; then
        echo "🔧 检测到 $labeler_file 冲突，尝试 union merge..."

        base_stage="$(mktemp)"
        ours_stage="$(mktemp)"
        theirs_stage="$(mktemp)"
        merged_stage="$(mktemp)"

        if git show ":1:$labeler_file" >"$base_stage" 2>/dev/null \
          && git show ":2:$labeler_file" >"$ours_stage" 2>/dev/null \
          && git show ":3:$labeler_file" >"$theirs_stage" 2>/dev/null; then
          cp "$ours_stage" "$merged_stage"

          if git merge-file --union "$merged_stage" "$base_stage" "$theirs_stage" >/dev/null 2>&1 \
            && ! grep -qE '^(<<<<<<<|=======|>>>>>>>)' "$merged_stage"; then
            cp "$merged_stage" "$labeler_file"
            git add "$labeler_file"
            echo "  ✅ $labeler_file 已 union 合并"
          else
            echo "  ⚠️  $labeler_file union merge 后仍有冲突标记，需手动处理"
          fi
        else
          echo "  ⚠️  $labeler_file 无法读取冲突 stage(:1/:2/:3)，需手动处理"
        fi

        rm -f "$base_stage" "$ours_stage" "$theirs_stage" "$merged_stage"
      fi
    done

    # 检查是否还有其他冲突
    REMAINING=$(git diff --name-only --diff-filter=U | grep -v "pnpm-lock.yaml" || true)
    if [[ -n "$REMAINING" ]]; then
      echo ""
      echo "⚠️  以下文件仍有冲突，需要手动解决:"

      if [[ -x "private/scripts/list-brand-targets.sh" ]]; then
        tmp_conflicts="$(mktemp)"
        tmp_brand="$(mktemp)"

        printf '%s\n' "$REMAINING" | sed '/^$/d' | sort -u >"$tmp_conflicts"
        private/scripts/list-brand-targets.sh | sort -u >"$tmp_brand"

        BRAND_REMAINING=$(comm -12 "$tmp_conflicts" "$tmp_brand" || true)
        OTHER_REMAINING=$(comm -23 "$tmp_conflicts" "$tmp_brand" || true)

        rm -f "$tmp_conflicts" "$tmp_brand"

        if [[ -n "${BRAND_REMAINING// }" ]]; then
          echo ""
          echo "   [品牌相关]"
          printf '%s\n' "$BRAND_REMAINING" | sed '/^$/d' | sed 's/^/   - /'
        fi

        if [[ -n "${OTHER_REMAINING// }" ]]; then
          echo ""
          echo "   [非品牌]"
          printf '%s\n' "$OTHER_REMAINING" | sed '/^$/d' | sed 's/^/   - /'
        fi
      else
        echo "$REMAINING" | sed 's/^/   /'
      fi

      echo ""
      echo "解决步骤:"
      echo "  1. 编辑冲突文件"
      echo "  2. git add <已解决的文件>"
      echo "  3. git commit --no-edit   # 或 git commit（自定义 merge message）"
      echo ""
      echo "放弃: git merge --abort"
      exit 1
    else
      # pnpm-lock 已解决且无其他冲突
      git merge --continue --no-edit 2>/dev/null || git commit --no-edit
    fi
  fi
fi

AFTER_SHA="$(git rev-parse HEAD)"

# --- 写入 upstream pin（JSON 为准 + MD 摘要） --------------------------------
if [[ -f "private/scripts/write-upstream-pin.ts" ]]; then
  echo ""
  echo "🧷 写入 upstream pin..."
  if [[ -n "$PREDICT_JSON_FILE" ]]; then
    node --import tsx private/scripts/write-upstream-pin.ts \
      --target "$TARGET_REF" \
      --strategy "$STRATEGY" \
      --before "$BEFORE_SHA" \
      --after "$AFTER_SHA" \
      --at "$SYNC_AT" \
      --conflicts-json "$PREDICT_JSON_FILE"
  else
    node --import tsx private/scripts/write-upstream-pin.ts \
      --target "$TARGET_REF" \
      --strategy "$STRATEGY" \
      --before "$BEFORE_SHA" \
      --after "$AFTER_SHA" \
      --at "$SYNC_AT"
  fi

  [[ -n "$PREDICT_JSON_FILE" ]] && rm -f "$PREDICT_JSON_FILE"
fi

# --- 后续步骤 ---------------------------------------------------------------
echo ""
echo "✅ 同步完成！"
echo ""
echo "📋 后续步骤:"
echo "  1. pnpm install      # 更新依赖"
echo "  2. pnpm build        # 重新构建"
echo "  3. pnpm test         # 运行测试确认无回归"
echo "  4. 检查 private/brand.json 是否需要更新（上游可能新增了品牌位置）"
echo "  5. ./private/scripts/apply-brand.sh --dry-run  # 检查品牌替换"
