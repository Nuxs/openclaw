#!/usr/bin/env bash
# sync-codebuddy.sh — 同步开发相关的 Skills 到 .codebuddy/skills/
# 仅同步包含架构文档、开发规范的 Skill（白名单模式）。
# 支持双目标：仓库内 .codebuddy/ 和工作区根 .codebuddy/

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_SRC="$REPO_ROOT/skills"
CHECK_ONLY=false
if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=true
fi

# 目标目录列表（按优先级）
# 1. 工作区根目录的 .codebuddy（IDE 通常从这里读取）
# 2. 仓库内的 .codebuddy（保持兼容）
WORKSPACE_ROOT="$(dirname "$REPO_ROOT")"
TARGET_DIRS=(
  "$WORKSPACE_ROOT/.codebuddy/skills"
  "$REPO_ROOT/.codebuddy/skills"
)

# 白名单：只同步对 IDE 编码/架构理解有帮助的 Skill
ALLOWED_SKILLS=(
  "web3-market"       # 核心业务架构、协议规范
  "web3-butler"       # 运维/资源管理规范
  "private-fork-dev"  # 私有化开发/合流规范
  "skill-creator"     # Skill 开发模板与规范
  "coding-agent"      # 编码代理行为规范
  "clawhub"           # 包管理规范
  "canvas"            # UI 协议规范
)

if [ "$CHECK_ONLY" = true ]; then
  echo "🔍 校验 CodeBuddy Skills 链接状态..."
else
  echo "🔄 开始同步开发相关 Skills..."
fi
echo "📂 源目录: $SKILLS_SRC"

drift_total=0

# 对每个目标目录执行同步/校验
for CB_SKILLS in "${TARGET_DIRS[@]}"; do
  echo ""
  echo "🎯 目标: $CB_SKILLS"

  mkdir -p "$CB_SKILLS"

  if [ "$CHECK_ONLY" = true ]; then
    echo "   🔎 校验链接..."
  else
    echo "   🧹 清理旧链接..."
  fi

  removed=0
  skipped=0
  created=0
  missing_src=0
  drift=0

  if [ -d "$CB_SKILLS" ]; then
    for existing in "$CB_SKILLS"/*; do
      [ -e "$existing" ] || continue
      name="$(basename "$existing")"

      is_allowed=false
      for allowed in "${ALLOWED_SKILLS[@]}"; do
        if [ "$name" == "$allowed" ]; then
          is_allowed=true
          break
        fi
      done

      if [ "$is_allowed" = false ] && [ -L "$existing" ]; then
        if [ "$CHECK_ONLY" = true ]; then
          echo "      ❌ 非白名单链接: $name"
          drift=$((drift + 1))
        else
          echo "      🗑️  移除: $name"
          rm "$existing"
          removed=$((removed + 1))
        fi
      fi
    done
  fi

  if [ "$CHECK_ONLY" = true ]; then
    echo "   🔗 验证白名单链接..."
  else
    echo "   🔗 创建/更新链接..."
  fi

  for skill_name in "${ALLOWED_SKILLS[@]}"; do
    src_dir="$SKILLS_SRC/$skill_name"
    target="$CB_SKILLS/$skill_name"
    rel_path="$(realpath --relative-to="$CB_SKILLS" "$src_dir" 2>/dev/null || echo "$REPO_ROOT/skills/$skill_name")"

    if [ ! -d "$src_dir" ]; then
      echo "      ⚠️  源不存在: $skill_name"
      missing_src=$((missing_src + 1))
      continue
    fi

    if [ "$CHECK_ONLY" = true ]; then
      if [ -L "$target" ] && [ "$(readlink "$target")" == "$rel_path" ]; then
        skipped=$((skipped + 1))
      else
        echo "      ❌ 链接不一致: $skill_name"
        drift=$((drift + 1))
      fi
      continue
    fi

    if [ -L "$target" ]; then
      current_link="$(readlink "$target")"
      if [ "$current_link" == "$rel_path" ]; then
        skipped=$((skipped + 1))
      else
        echo "      🔄 更新: $skill_name"
        ln -sf "$rel_path" "$target"
        created=$((created + 1))
      fi
    elif [ -e "$target" ]; then
      echo "      ❌ 目标已存在非链接: $skill_name"
    else
      echo "      ✅ 链接: $skill_name"
      ln -s "$rel_path" "$target"
      created=$((created + 1))
    fi
  done

  if [ "$CHECK_ONLY" = true ]; then
    echo "   📊 校验: 正常 $skipped, 漂移 $drift"
    drift_total=$((drift_total + drift))
  else
    echo "   📊 完成: 新建 $created, 保持 $skipped, 移除 $removed"
  fi

  if [ $missing_src -gt 0 ]; then
    echo "   ⚠️  缺失源: $missing_src"
  fi
done

echo ""
if [ "$CHECK_ONLY" = true ]; then
  if [ $drift_total -gt 0 ]; then
    echo "❌ 校验失败：发现 $drift_total 处链接漂移"
    exit 1
  fi
  echo "✅ 校验通过：CodeBuddy Skills 链接一致"
else
  echo "🎉 全部同步完成！"
fi
