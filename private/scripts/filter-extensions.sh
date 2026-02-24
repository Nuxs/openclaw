#!/usr/bin/env bash
# ============================================================================
# filter-extensions.sh — 裁剪渠道/扩展，只保留指定的 extensions
# ============================================================================
# 用法:
#   ./private/scripts/filter-extensions.sh --list
#   ./private/scripts/filter-extensions.sh --keep telegram,discord,slack              # 默认 dry-run
#   ./private/scripts/filter-extensions.sh --apply --keep telegram,discord,slack      # 真正写入 pnpm-workspace.yaml
#   ./private/scripts/filter-extensions.sh --apply --keep-file private/extensions.keep
#
# 注意：
# - 该脚本会改写 pnpm-workspace.yaml（上游高频变动文件），请谨慎提交这类改动；默认仅 dry-run。
#
# 原理:
#   1. 读取 extensions/ 下所有子目录（即可用扩展列表）
#   2. 对比 --keep 列表，将不需要的扩展从 pnpm-workspace.yaml 中移除
#   3. 可选地删除不需要的扩展目录（--remove-dirs）
#   4. 运行 pnpm install 更新依赖
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKSPACE_FILE="$REPO_ROOT/pnpm-workspace.yaml"
EXTENSIONS_DIR="$REPO_ROOT/extensions"

DRY_RUN=true
REMOVE_DIRS=false
KEEP_LIST=""
KEEP_FILE=""
LIST_ONLY=false

# --- 参数解析 ---------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep)
      KEEP_LIST="$2"
      shift 2
      ;;
    --keep-file)
      KEEP_FILE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --apply|--write)
      DRY_RUN=false
      shift
      ;;
    --remove-dirs)
      REMOVE_DIRS=true
      shift
      ;;
    --list)
      LIST_ONLY=true
      shift
      ;;
    -h|--help)
      echo "用法: $0 [--keep ext1,ext2] [--keep-file path] [--apply|--write] [--dry-run] [--remove-dirs] [--list]"
      exit 0
      ;;
    *)
      echo "未知参数: $1"
      exit 1
      ;;
  esac
done

# --- 获取所有可用扩展 -------------------------------------------------------
ALL_EXTENSIONS=()
for dir in "$EXTENSIONS_DIR"/*/; do
  [[ -d "$dir" ]] || continue
  ext_name=$(basename "$dir")
  ALL_EXTENSIONS+=("$ext_name")
done

if $LIST_ONLY; then
  echo "📦 可用扩展 (${#ALL_EXTENSIONS[@]} 个):"
  printf '  %s\n' "${ALL_EXTENSIONS[@]}"
  exit 0
fi

# --- 构建保留列表 -----------------------------------------------------------
KEEP_SET=()

if [[ -n "$KEEP_FILE" ]]; then
  if [[ ! -f "$KEEP_FILE" ]]; then
    echo "❌ 找不到 keep 文件: $KEEP_FILE"
    exit 1
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"    # 去掉注释
    line="${line// /}"    # 去掉空格
    [[ -z "$line" ]] && continue
    KEEP_SET+=("$line")
  done < "$KEEP_FILE"
fi

if [[ -n "$KEEP_LIST" ]]; then
  IFS=',' read -ra PARTS <<< "$KEEP_LIST"
  for part in "${PARTS[@]}"; do
    part="${part// /}"
    [[ -n "$part" ]] && KEEP_SET+=("$part")
  done
fi

if [[ ${#KEEP_SET[@]} -eq 0 ]]; then
  echo "❌ 必须通过 --keep 或 --keep-file 指定至少一个要保留的扩展"
  echo "   用 --list 查看所有可用扩展"
  exit 1
fi

# --- 校验保留列表 -----------------------------------------------------------
for keep in "${KEEP_SET[@]}"; do
  found=false
  for ext in "${ALL_EXTENSIONS[@]}"; do
    [[ "$ext" == "$keep" ]] && found=true && break
  done
  if ! $found; then
    echo "⚠️  警告: '$keep' 不在 extensions/ 目录中，将被忽略"
  fi
done

# --- 计算要移除的扩展 -------------------------------------------------------
REMOVE_SET=()
for ext in "${ALL_EXTENSIONS[@]}"; do
  should_keep=false
  for keep in "${KEEP_SET[@]}"; do
    [[ "$ext" == "$keep" ]] && should_keep=true && break
  done
  if ! $should_keep; then
    REMOVE_SET+=("$ext")
  fi
done

echo "🔧 渠道裁剪:"
echo "   保留 (${#KEEP_SET[@]}): ${KEEP_SET[*]}"
echo "   移除 (${#REMOVE_SET[@]}): ${REMOVE_SET[*]}"
echo ""

if [[ ${#REMOVE_SET[@]} -eq 0 ]]; then
  echo "✅ 没有需要移除的扩展"
  exit 0
fi

$DRY_RUN && echo "[DRY RUN — 仅打印，不修改]"

# --- 生成新的 pnpm-workspace.yaml ------------------------------------------
# 策略: 注释掉被移除的 extensions/* 行，而非删除，便于恢复
if $DRY_RUN; then
  echo ""
  echo "📝 将修改 pnpm-workspace.yaml:"
  for ext in "${REMOVE_SET[@]}"; do
    echo "   注释: extensions/$ext"
  done
else
  for ext in "${REMOVE_SET[@]}"; do
    if grep -q "extensions/$ext" "$WORKSPACE_FILE" 2>/dev/null; then
      # macOS/GNU sed 兼容
      if [[ "$(uname)" == "Darwin" ]]; then
        sed -i '' "s|^  - extensions/$ext|  # - extensions/$ext  # filtered-out|" "$WORKSPACE_FILE"
      else
        sed -i "s|^  - extensions/$ext|  # - extensions/$ext  # filtered-out|" "$WORKSPACE_FILE"
      fi
    fi
  done
  echo "✅ pnpm-workspace.yaml 已更新"
fi

# --- 可选: 移除目录 ---------------------------------------------------------
if $REMOVE_DIRS; then
  echo ""
  for ext in "${REMOVE_SET[@]}"; do
    dir="$EXTENSIONS_DIR/$ext"
    if [[ -d "$dir" ]]; then
      if $DRY_RUN; then
        echo "📝 [dry-run] 将删除: $dir"
      else
        rm -rf "$dir"
        echo "🗑️  已删除: extensions/$ext"
      fi
    fi
  done
fi

# --- 重新安装依赖 -----------------------------------------------------------
if ! $DRY_RUN; then
  echo ""
  echo "📦 运行 pnpm install 更新依赖..."
  cd "$REPO_ROOT"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  echo "✅ 依赖已更新"
fi

echo ""
echo "🎉 渠道裁剪完成！"
echo ""
echo "💡 提示:"
echo "   - 恢复被移除的扩展: 编辑 pnpm-workspace.yaml 取消注释"
echo "   - 保留列表文件模板: private/extensions.keep"
