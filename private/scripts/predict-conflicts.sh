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
# - 打印预计会发生冲突的文件列表，并按"品牌相关/非品牌相关"分组。
# - 对非品牌冲突文件提示是否需要进一步做 overlay 拆分。
#
# 实现:
# - 优先使用 git merge-tree --write-tree（Git 2.38+）；不支持时 fallback 到
#   git merge-tree <base> <ours> <theirs>（旧语法）。
# - 全程不 touch index、不 checkout 文件。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

TARGET_REF="upstream/main"
DO_FETCH=true
OUTPUT_MODE="text" # text | json

usage() {
  cat <<'EOF'
用法: predict-conflicts.sh [--tag <ref>] [--target <ref>] [--no-fetch] [--json]

选项:
  --tag <ref>      预测与指定 tag/ref 的 merge 冲突
  --target <ref>   预测与指定 ref 的 merge 冲突（默认 upstream/main）
  --no-fetch       不执行 git fetch（使用本地已有 refs）
  --json           输出 JSON（仅输出 JSON，不打印提示信息），供脚本/CI 消费
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
    --json)
      OUTPUT_MODE="json"
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
    [[ "$OUTPUT_MODE" == "text" ]] && echo "🔄 Fetching upstream..."
    git fetch upstream --tags --prune
  else
    if [[ "$OUTPUT_MODE" == "text" ]]; then
      echo "⚠️  未配置 upstream remote，跳过 fetch（仅使用本地 refs）。"
      echo "    如需添加 upstream，请手动执行: git remote add upstream https://github.com/openclaw/openclaw.git"
    fi
  fi
fi

if ! git rev-parse "$TARGET_REF" >/dev/null 2>&1; then
  echo "❌ 找不到 ref: $TARGET_REF"
  exit 1
fi

conflicts_tmp="$(mktemp)"
brand_tmp="$(mktemp)"
trap 'rm -f "$conflicts_tmp" "$brand_tmp"' EXIT

BASE="$(git merge-base HEAD "$TARGET_REF" 2>/dev/null || true)"
if [[ -z "$BASE" ]]; then
  echo "❌ 无法计算 merge-base（HEAD vs ${TARGET_REF}）"
  exit 1
fi

# 尝试 Git 2.38+ 的 merge-tree --write-tree，不支持时 fallback 到旧语法
merge_tree_output=""
if git merge-tree --write-tree --messages --name-only HEAD "$TARGET_REF" >/dev/null 2>&1; then
  # 新语法可用（注意：有冲突时可能返回非 0）
  merge_tree_output="$(git merge-tree --write-tree --messages --name-only HEAD "$TARGET_REF" 2>/dev/null || true)"
  printf '%s\n' "$merge_tree_output" \
    | sed -n 's/^CONFLICT .*: Merge conflict in //p' \
    | sort -u >"$conflicts_tmp"
else
  # Fallback: 旧版 Git 的 merge-tree 输出格式不稳定，直接使用近似预测：
  # 取 base->HEAD 与 base->TARGET_REF 的变更文件交集。
  ours_changed="$(mktemp)"
  theirs_changed="$(mktemp)"
  git diff --name-only "$BASE" HEAD | sort -u >"$ours_changed"
  git diff --name-only "$BASE" "$TARGET_REF" | sort -u >"$theirs_changed"
  comm -12 "$ours_changed" "$theirs_changed" >"$conflicts_tmp"
  rm -f "$ours_changed" "$theirs_changed"

  if [[ -s "$conflicts_tmp" && "$OUTPUT_MODE" == "text" ]]; then
    echo "⚠️  Git 版本较旧（$(git --version)），冲突预测为近似结果（双方都修改的文件）。"
  fi
fi

if [[ ! -s "$conflicts_tmp" ]]; then
  if [[ "$OUTPUT_MODE" == "json" ]]; then
    echo '{ "predicted": { "total": 0, "brand": 0, "other": 0, "files": [], "brandFiles": [], "otherFiles": [] } }'
    exit 0
  fi
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

if [[ "$OUTPUT_MODE" == "json" ]]; then
  CONFLICTS_FILE="$conflicts_tmp" BRAND_TARGETS_FILE="$brand_tmp" node - <<'NODE'
const fs = require("node:fs");

function readLines(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function normalize(filePath) {
  return filePath.replaceAll("\\\\", "/");
}

const conflictsFile = process.env.CONFLICTS_FILE;
const brandTargetsFile = process.env.BRAND_TARGETS_FILE;

const files = readLines(conflictsFile).map(normalize);
const brandTargets = new Set(readLines(brandTargetsFile).map(normalize));
const brandFiles = files.filter((f) => brandTargets.has(f));
const otherFiles = files.filter((f) => !brandTargets.has(f));

const payload = {
  predicted: {
    total: files.length,
    brand: brandFiles.length,
    other: otherFiles.length,
    files,
    brandFiles,
    otherFiles,
  },
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
NODE
  exit 0
fi

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
  echo ""
  echo "💡 非品牌冲突提示："
  echo "   如果冲突文件是上游热点文件，说明 overlay 拆分还不够彻底。"
  echo "   建议：先将私有逻辑拆到独立叶子模块，再同步上游（参考 AGENTS.md 的 overlay 规范）。"
fi

echo ""
echo "提示：这是 merge 冲突预测（只读）。实际 rebase 冲突集合可能略有不同。"
echo "      pnpm-lock.yaml 冲突会在 sync-upstream.sh 中自动处理（accept theirs + pnpm install）。"
