#!/usr/bin/env bash
# sync-codebuddy.sh — 将 skills/ 下的 Skill 目录通过 symlink 映射到 .codebuddy/skills/
# 幂等：重复运行安全，已存在的链接会跳过，非链接文件不覆盖
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_SRC="$REPO_ROOT/skills"
CB_SKILLS="$REPO_ROOT/.codebuddy/skills"
CB_RULES="$REPO_ROOT/.codebuddy/rules"

# 确保目标目录存在
mkdir -p "$CB_SKILLS" "$CB_RULES"

created=0
skipped=0
skipped_existing=0
warned=0

for skill_dir in "$SKILLS_SRC"/*/; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  target="$CB_SKILLS/$skill_name"
  # 相对路径: .codebuddy/skills/<name> -> ../../skills/<name>
  rel_path="../../skills/$skill_name"

  if [ -L "$target" ]; then
    # 已是 symlink，检查是否指向正确目标
    existing="$(readlink "$target")"
    if [ "$existing" = "$rel_path" ]; then
      skipped=$((skipped + 1))
    else
      echo "⚠  $skill_name: symlink 已存在但指向 $existing（期望 $rel_path），跳过"
      warned=$((warned + 1))
    fi
  elif [ -e "$target" ]; then
    skipped_existing=$((skipped_existing + 1))
  else
    ln -s "$rel_path" "$target"
    created=$((created + 1))
  fi
done

echo ""
echo "✅ 同步完成: 新建 $created 个链接, 跳过 $skipped 个, 警告 $warned 个"
if [ "$skipped_existing" -gt 0 ]; then
  echo "ℹ️  另外: $skipped_existing 个条目已存在且不是 symlink，未改动"
fi
echo "   Skills 目录: $CB_SKILLS"
echo "   Rules 目录:  $CB_RULES"
