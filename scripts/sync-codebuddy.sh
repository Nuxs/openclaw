#!/usr/bin/env bash
# sync-codebuddy.sh — 同步开发相关的 Skills 到 .codebuddy/skills/
# 仅同步包含架构文档、开发规范的 Skill（白名单模式）。
# 支持双目标：仓库内 .codebuddy/ 和工作区根 .codebuddy/

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_SRC="$REPO_ROOT/skills"

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

echo "🔄 开始同步开发相关 Skills..."
echo "📂 源目录: $SKILLS_SRC"

# 对每个目标目录执行同步
for CB_SKILLS in "${TARGET_DIRS[@]}"; do
  echo ""
  echo "🎯 目标: $CB_SKILLS"
  
  mkdir -p "$CB_SKILLS"

  # 1. 清理不在白名单内的 symlink
  echo "   🧹 清理旧链接..."
  removed=0
  if [ -d "$CB_SKILLS" ]; then
    for existing in "$CB_SKILLS"/*; do
      [ -e "$existing" ] || continue
      name="$(basename "$existing")"
      
      # 检查是否在白名单中
      is_allowed=false
      for allowed in "${ALLOWED_SKILLS[@]}"; do
        if [ "$name" == "$allowed" ]; then
          is_allowed=true
          break
        fi
      done

      if [ "$is_allowed" = false ]; then
        if [ -L "$existing" ]; then
          echo "      🗑️  移除: $name"
          rm "$existing"
          removed=$((removed + 1))
        else
          echo "      ⚠️  跳过非链接: $name"
        fi
      fi
    done
  fi

  # 2. 创建白名单内的 symlink
  echo "   🔗 创建/更新链接..."
  created=0
  skipped=0
  missing_src=0

  for skill_name in "${ALLOWED_SKILLS[@]}"; do
    src_dir="$SKILLS_SRC/$skill_name"
    target="$CB_SKILLS/$skill_name"
    
    # 计算相对路径（从目标目录指向源目录）
    rel_path="$(realpath --relative-to="$CB_SKILLS" "$src_dir" 2>/dev/null || echo "$REPO_ROOT/skills/$skill_name")"

    if [ ! -d "$src_dir" ]; then
      echo "      ⚠️  源不存在: $skill_name"
      missing_src=$((missing_src + 1))
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

  echo "   📊 完成: 新建 $created, 保持 $skipped, 移除 $removed"
  if [ $missing_src -gt 0 ]; then
    echo "   ⚠️  缺失源: $missing_src"
  fi
done

echo ""
echo "🎉 全部同步完成！"
