#!/usr/bin/env bash
# ============================================================================
# search-forks.sh — 在大量 GitHub forks 中批量搜索“功能特征”
#
# 设计目标：
# - 不需要 clone 每个 fork；只 shallow fetch 目标分支到临时 repo
# - 支持两种 fork 来源：
#   1) stdin 输入 clone_url 列表（每行一个 URL）
#   2) 自动从 GitHub 拉 forks（优先 gh，其次 curl + GITHUB_TOKEN）
#
# 典型用法：
#   # A) 自动拉 forks 并搜索（推荐）
#   ./private/scripts/search-forks.sh --pattern "predict-conflicts.sh" --path "private/scripts"
#
#   # B) 自己提供 fork 列表
#   gh api /repos/openclaw/openclaw/forks --paginate --jq '.[].clone_url' \
#     | ./private/scripts/search-forks.sh --pattern "predict-conflicts.sh" --path "private/scripts"
#
# 注意：
# - 默认搜 openclaw/openclaw 的 forks，默认分支 main
# - 默认按“固定字符串”搜索（git grep -F）；用 --regex 切换成正则
# - 若 fork 没有目标分支，会自动跳过
# ============================================================================
set -euo pipefail

REPO_SLUG="openclaw/openclaw"
BRANCH="main"
PATTERN=""
PATH_FILTER=""
MODE="fixed" # fixed | regex
MAX_REPOS=0
FETCH_DEPTH=1
QUIET=false
DISCOVER=false

usage() {
  cat <<'EOF'
用法:
  search-forks.sh --pattern <text> [options]

选项:
  --pattern <text>        要搜索的特征（必填）
  --repo <owner/name>     目标仓库（默认: openclaw/openclaw）
  --branch <name>         目标分支（默认: main）
  --path <path>           限定目录/文件路径（可选）
  --regex                 用正则搜索（默认是固定字符串）
  --fixed                 用固定字符串搜索（默认）
  --max <n>               最多处理 n 个 fork（0=不限制，默认）
  --depth <n>             git fetch depth（默认: 1）
  --discover              不读 stdin，自动从 GitHub 拉 forks
  --quiet                 降低输出噪声
  -h, --help              显示帮助

fork 来源:
  - 默认：若 stdin 不是 TTY，会从 stdin 读取 clone_url（每行一个）
  - 若加 --discover：会尝试用 gh 拉 forks；没有 gh 则使用 curl + GITHUB_TOKEN

示例:
  ./private/scripts/search-forks.sh --discover --pattern "http-registry" --path "src/plugins"

  gh api /repos/openclaw/openclaw/forks --paginate --jq '.[].clone_url' \
    | ./private/scripts/search-forks.sh --pattern "predict-conflicts.sh" --path "private/scripts"
EOF
}

log() {
  $QUIET && return 0
  echo "$@"
}

err() {
  echo "❌ $*" >&2
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    err "缺少依赖命令: $1"
    exit 1
  }
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pattern) PATTERN="$2"; shift 2 ;;
      --repo) REPO_SLUG="$2"; shift 2 ;;
      --branch) BRANCH="$2"; shift 2 ;;
      --path) PATH_FILTER="$2"; shift 2 ;;
      --regex) MODE="regex"; shift ;;
      --fixed) MODE="fixed"; shift ;;
      --max) MAX_REPOS="$2"; shift 2 ;;
      --depth) FETCH_DEPTH="$2"; shift 2 ;;
      --discover) DISCOVER=true; shift ;;
      --quiet) QUIET=true; shift ;;
      -h|--help) usage; exit 0 ;;
      *) err "未知参数: $1"; usage; exit 1 ;;
    esac
  done

  if [[ -z "$PATTERN" ]]; then
    err "--pattern 必填"
    usage
    exit 1
  fi
}

# 输出 clone_url 列表（每行一个）
list_forks() {
  local owner repo
  owner="${REPO_SLUG%/*}"
  repo="${REPO_SLUG#*/}"

  if command -v gh >/dev/null 2>&1; then
    # gh api 默认支持分页 --paginate
    gh api "/repos/${owner}/${repo}/forks" --paginate --jq '.[].clone_url'
    return 0
  fi

  # curl + GitHub REST API v3（分页: per_page=100 + Link header）
  if [[ -z "${GITHUB_TOKEN:-}" ]]; then
    err "未检测到 gh，且未设置 GITHUB_TOKEN；无法自动拉 forks。"
    err "请：1) 安装并登录 gh（gh auth login），或 2) export GITHUB_TOKEN=...，或 3) 把 clone_url 列表通过 stdin 传入。"
    exit 1
  fi

  local page=1
  while :; do
    # shellcheck disable=SC2155
    local resp
    resp=$(curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      "https://api.github.com/repos/${owner}/${repo}/forks?per_page=100&page=${page}")

    # 只用最基础的解析：提取 "clone_url": "..."，避免依赖 jq
    local urls
    urls=$(printf '%s' "$resp" | sed -n 's/.*"clone_url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

    if [[ -z "$urls" ]]; then
      break
    fi

    printf '%s\n' "$urls"
    page=$((page + 1))
  done
}

main() {
  parse_args "$@"
  need_cmd git

  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  local repo_dir="$tmp/repo"
  git init -q "$repo_dir"
  cd "$repo_dir"

  local grep_args=("-n")
  if [[ "$MODE" == "fixed" ]]; then
    grep_args+=("-F")
  fi

  local count=0

  # 数据来源：stdin or discover
  if $DISCOVER; then
    log "🔎 从 GitHub 拉 forks: ${REPO_SLUG}"
    list_forks | while IFS= read -r url; do
      [[ -z "$url" ]] && continue
      count=$((count + 1))
      if [[ "$MAX_REPOS" -gt 0 && "$count" -gt "$MAX_REPOS" ]]; then
        break
      fi
      search_one "$url" "${grep_args[@]}"
    done
    return 0
  fi

  if [[ -t 0 ]]; then
    err "未提供 stdin（fork clone_url 列表），也未指定 --discover。"
    usage
    exit 1
  fi

  while IFS= read -r url; do
    [[ -z "$url" ]] && continue
    count=$((count + 1))
    if [[ "$MAX_REPOS" -gt 0 && "$count" -gt "$MAX_REPOS" ]]; then
      break
    fi
    search_one "$url" "${grep_args[@]}"
  done
}

search_one() {
  local url="$1"
  shift
  local -a grep_args=("$@")

  log "==> ${url} (${BRANCH})"

  if git remote get-url r >/dev/null 2>&1; then
    git remote set-url r "$url" >/dev/null
  else
    git remote add r "$url" >/dev/null
  fi

  # 只抓目标分支；不需要 tags，不需要 history
  if ! git fetch -q --depth "$FETCH_DEPTH" r "$BRANCH":"refs/remotes/r/$BRANCH" 2>/dev/null; then
    log "    (skip: no branch ${BRANCH} or fetch failed)"
    return 0
  fi

  if [[ -n "$PATH_FILTER" ]]; then
    git grep "${grep_args[@]}" -- "$PATTERN" "refs/remotes/r/$BRANCH" -- "$PATH_FILTER" || true
  else
    git grep "${grep_args[@]}" -- "$PATTERN" "refs/remotes/r/$BRANCH" || true
  fi
}

main "$@"
