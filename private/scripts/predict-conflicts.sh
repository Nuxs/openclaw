#!/usr/bin/env bash
# ============================================================================
# predict-conflicts.sh — 同步前预测 merge 冲突文件（不修改工作区）
# ============================================================================
# 用法:
#   ./private/scripts/predict-conflicts.sh                 # 默认: HEAD vs upstream/main
#   ./private/scripts/predict-conflicts.sh --tag v2026.2.1
#   ./private/scripts/predict-conflicts.sh --target <ref>
#   ./private/scripts/predict-conflicts.sh --no-fetch
#
# 输出:
# - 打印预计会发生冲突的文件列表，并按“品牌相关/非品牌相关”分组。
#
# 实现:
# - 使用 `git merge-tree --write-tree --messages` 做只读三方合并。
# - 解析 "CONFLICT ...: Merge conflict in <path>" 行得到冲突文件路径。
# - 全程不 touch index、不 checkout 文件。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

TARGET_REF="upstream/main"
DO_FETCH=true

usage() {
  cat <<'EOF'
用法: predict-conflicts.sh [--tag <ref>] [--target <ref>] [--no-fetch]

选项:
  --tag <ref>      预测与指定 tag/ref 的 merge 冲突
  --target <ref>   预测与指定 ref 的 merge 冲突（默认 upstream/main）
  --no-fetch       不执行 git fetch（使用本地已有 refs）
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TARGET_REF="$2"
      shift 2
      ;;
    --target)
      TARGET_REF="$2"
      shift 2
      ;;
    --no-fetch)
      DO_FETCH=false
      shift
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

if $DO_FETCH; then
  if git remote get-url upstream >/dev/null 2>&1; then
    echo "🔄 Fetching upstream..."
    git fetch upstream --tags --prune
  else
    echo "⚠️  未配置 upstream remote，跳过 fetch（仅使用本地 refs）。"
    echo "    如需添加 upstream，请手动执行: git remote add upstream https://github.com/openclaw/openclaw.git"
  fi
fi

if ! git rev-parse "$TARGET_REF" >/dev/null 2>&1; then
  echo "❌ 找不到 ref: $TARGET_REF"
  exit 1
fi

conflicts_tmp="$(mktemp)"
brand_tmp="$(mktemp)"
trap 'rm -f "$conflicts_tmp" "$brand_tmp"' EXIT

# `git merge-tree` 在冲突场景下可能返回非 0（不同 Git 版本行为不完全一致），
# 所以这里显式忽略 exit code，只解析输出中的冲突行。
{
  git merge-tree --write-tree --messages --name-only HEAD "$TARGET_REF" || true
} \
  | sed -n 's/^CONFLICT .*: Merge conflict in //p' \
  | sort -u >"$conflicts_tmp"

if [[ ! -s "$conflicts_tmp" ]]; then
  echo "✅ 未检测到 merge 冲突（HEAD vs ${TARGET_REF}）"
  exit 0
fi

# 品牌目标文件列表（可选）
if [[ -x "private/scripts/list-brand-targets.sh" ]]; then
  private/scripts/list-brand-targets.sh | sort -u >"$brand_tmp"
else
  : >"$brand_tmp"
fi

brand_conflicts="$(comm -12 "$conflicts_tmp" "$brand_tmp" || true)"
other_conflicts="$(comm -23 "$conflicts_tmp" "$brand_tmp" || true)"

count_all="$(wc -l <"$conflicts_tmp" | tr -d ' ')"
count_brand="$(printf '%s\n' "$brand_conflicts" | sed '/^$/d' | wc -l | tr -d ' ')"
count_other="$(printf '%s\n' "$other_conflicts" | sed '/^$/d' | wc -l | tr -d ' ')"

echo ""
echo "⚠️  预计会发生冲突（HEAD vs ${TARGET_REF}）：${count_all} 个文件"

if [[ -n "${brand_conflicts// }" ]]; then
  echo ""
  echo "=== 品牌相关冲突（${count_brand}） ==="
  printf '%s\n' "$brand_conflicts" | sed '/^$/d' | sed 's/^/  - /'
fi

if [[ -n "${other_conflicts// }" ]]; then
  echo ""
  echo "=== 非品牌冲突（${count_other}） ==="
  printf '%s\n' "$other_conflicts" | sed '/^$/d' | sed 's/^/  - /'
fi

echo ""
echo "提示：这是 merge 冲突预测（只读）。实际 rebase 冲突集合可能略有不同。"
