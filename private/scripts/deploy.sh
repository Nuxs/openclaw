#!/usr/bin/env bash
# ============================================================================
# deploy.sh — 统一部署入口脚本
# ============================================================================
# 用法:
#   ./private/scripts/deploy.sh anydev [dev|staging|prod]
#   ./private/scripts/deploy.sh docker [dev|staging|prod]
#   ./private/scripts/deploy.sh k8s [dev|staging|prod]
#   ./private/scripts/deploy.sh k8s-onekey [dev|staging|prod]
#   ./private/scripts/deploy.sh bare [dev|staging|prod]
#   ./private/scripts/deploy.sh mac
#   ./private/scripts/deploy.sh status
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

DEPLOY_TARGET="${1:-}"
DEPLOY_ENV="${2:-dev}"

usage() {
  cat <<'EOF'
用法: deploy.sh <target> [environment]

Targets:
  anydev      [dev|staging|prod]   AnyDev/开发机 一键运行（无 Docker/K8s 依赖）
  docker      [dev|staging|prod]   Docker Compose 部署
  k8s         [dev|staging|prod]   Kubernetes (Helm) 部署（只做 helm upgrade/install）
  k8s-onekey  [dev|staging|prod]   Kubernetes 一键部署（build+push+helm，可用于正式发布）
  bare        [dev|staging|prod]   裸机 Systemd 部署
  mac                             macOS App 构建
  status                          查看所有环境部署状态

Environment (默认 dev):
  dev       开发环境
  staging   预发布环境
  prod      生产环境

AnyDev 一键运行可选环境变量（建议写在 private/env/<env>.env）:
  OPENCLAW_GATEWAY_BIND=loopback|lan（默认 loopback）
  OPENCLAW_GATEWAY_PORT=18789（默认 18789）
  OPENCLAW_SKIP_BUILD=1（可选，跳过 pnpm build/ui:build）

K8s 一键部署所需环境变量（建议写在 private/env/<env>.env，机密用 CI/Secret 注入）:
  OPENCLAW_IMAGE=ghcr.io/your-org/openclaw:tag
  OPENCLAW_GATEWAY_TOKEN=...（若 existingSecret 不存在且需要自动创建）
  OPENCLAW_STORAGE_CLASS=...（可选）
  OPENCLAW_INGRESS_HOST=gateway.example.com（可选，覆盖 values 里的 host）

示例:
  deploy.sh anydev dev              # AnyDev/开发机 一键跑起来
  deploy.sh docker dev              # Docker 开发环境
  deploy.sh k8s staging             # K8s 预发布环境（只 helm）
  deploy.sh k8s-onekey prod         # K8s 生产一键部署（build+push+helm）
  OPENCLAW_ONEKEY=1 deploy.sh k8s prod  # 兼容写法：让 k8s 走一键模式
  deploy.sh bare prod               # 裸机生产部署
  deploy.sh mac                     # 构建 macOS App
EOF
  exit 1
}

[[ -z "$DEPLOY_TARGET" ]] && usage

# --- 通用: 构建 --------------------------------------------------------------
build_app() {
  echo "📦 构建应用..."

  # 部署/运行脚本默认不应修改 git 配置（本仓库 package.json 的 prepare 会写 core.hooksPath）
  export OPENCLAW_DISABLE_GIT_HOOKS=1

  # 默认不使用 frozen-lockfile（避免 lockfile 不同步导致误报失败）。
  # 如需严格模式：OPENCLAW_PNPM_FROZEN_LOCKFILE=1 或在 CI=true 下。
  if [[ "${OPENCLAW_PNPM_FROZEN_LOCKFILE:-0}" == "1" || "${CI:-}" == "true" ]]; then
    pnpm install --frozen-lockfile
  else
    pnpm install --no-frozen-lockfile
  fi

  pnpm build
  pnpm ui:build
  echo "✅ 构建完成"
}

# --- 通用: 品牌替换 -----------------------------------------------------------
apply_brand_if_needed() {
  if [[ -f "private/brand.json" ]]; then
    local name
    name=$(jq -r '.name' private/brand.json 2>/dev/null || echo "OpenClaw")
    if [[ "$name" != "OpenClaw" ]]; then
      echo "🎨 应用品牌: $name"
      bash private/scripts/apply-brand.sh
    fi
  fi
}

# --- 通用: 命令检查 --------------------------------------------------------------
require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "❌ 缺少命令: $cmd"
    exit 1
  fi
}

# --- 通用: 加载环境配置（可选）---------------------------------------------------
# 说明：
# - 会把 private/env/<env>.env 和 private/env/<env>.env.local 作为 bash 文件 source 进来（因此该文件必须是纯变量赋值）
# - 优先级: 显式传入的环境变量 > <env>.env.local > <env>.env
# - 建议把非机密默认值放 env 文件；机密放到 *.env.local 或 CI/K8s Secret 注入

# 记录脚本启动时就已存在的环境变量 key（这些 key 视为“显式传入”，后续 source 不应覆盖）
# 注意：必须只记录一次，否则会把 <env>.env 写入的值也当成“显式传入”，导致 <env>.env.local 无法覆盖。
PRESET_ENV_KEYS_INIT=0
# shellcheck disable=SC2034
declare -A PRESET_ENV_KEYS

remember_preset_env_keys() {
  if [[ "$PRESET_ENV_KEYS_INIT" == "1" ]]; then
    return 0
  fi
  PRESET_ENV_KEYS_INIT=1

  while IFS='=' read -r k _; do
    [[ -n "$k" ]] && PRESET_ENV_KEYS["$k"]=1
  done < <(env)
}

load_env_file_path() {
  local env_file="$1"
  [[ -f "$env_file" ]] || return 0

  # 规则：显式传入的环境变量优先（避免被 env 文件覆盖）。
  # 做法：先解析 env 文件里出现的 key，记录“脚本启动时就已存在”的 key/value，source 后再恢复。
  local -a keys saved
  keys=()
  saved=()

  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)= ]]; then
      keys+=("${BASH_REMATCH[1]}")
    fi
  done <"$env_file"

  for k in "${keys[@]}"; do
    if [[ -n "${PRESET_ENV_KEYS[$k]+x}" ]]; then
      saved+=("$k")
    fi
  done

  local restore_file
  restore_file="$(mktemp)"
  for k in "${saved[@]}"; do
    # %q 会生成可被 bash 安全解析的转义字符串
    printf 'export %s=%q\n' "$k" "${!k}" >>"$restore_file"
  done

  # shellcheck disable=SC1090
  set -a
  source "$env_file"
  set +a

  # shellcheck disable=SC1090
  source "$restore_file"
  rm -f "$restore_file"
}

load_env_file() {
  local env="$1"
  remember_preset_env_keys

  load_env_file_path "private/env/$env.env"
  load_env_file_path "private/env/$env.env.local"
}

# --- 通用: 从 image 引用里拆出 repository + tag ---------------------------------
# 支持: ghcr.io/org/openclaw:tag, registry:5000/openclaw:tag
# 不支持: digest(@sha256:...)
split_image_ref() {
  local image="$1"

  if [[ "$image" == *"@"* ]]; then
    echo "❌ 不支持 digest 形式的镜像引用: $image"
    return 1
  fi

  local repo tag
  # 只在最后一段(去掉路径)含 ':' 时，才认为有 tag（避免 registry:5000 端口被误判）
  if [[ "$image" == *":"* && "${image##*/}" == *":"* ]]; then
    tag="${image##*:}"
    repo="${image%:*}"
  else
    repo="$image"
    tag="latest"
  fi

  printf '%s %s\n' "$repo" "$tag"
}

# --- 通用: 读取 values 文件的顶层标量（极简 YAML 解析）---------------------------
get_values_scalar() {
  local file="$1"
  local key="$2"
  awk -v k="$key" -F':' '
    $1==k {
      sub(/^[^:]*:[[:space:]]*/, "", $0)
      sub(/[[:space:]]*#.*/, "", $0)
      gsub(/^"/, "", $0)
      gsub(/"$/, "", $0)
      print $0
      exit
    }
  ' "$file"
}

# --- Kubernetes: 如需则创建 Secret ---------------------------------------------
ensure_k8s_secret() {
  local namespace="$1"
  local secret_name="$2"

  if [[ -z "$secret_name" ]]; then
    return 0
  fi

  if kubectl -n "$namespace" get secret "$secret_name" >/dev/null 2>&1; then
    return 0
  fi

  if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
    echo "❌ K8s Secret '$secret_name' 不存在，且未提供 OPENCLAW_GATEWAY_TOKEN。"
    echo "   解决: 先手动创建 Secret，或在运行脚本时导出 OPENCLAW_GATEWAY_TOKEN。"
    exit 1
  fi

  echo "🔐 创建 K8s Secret: $secret_name"

  local tmp
  tmp="$(mktemp)"
  chmod 600 "$tmp"

  {
    for k in OPENCLAW_GATEWAY_TOKEN OPENAI_API_KEY ANTHROPIC_API_KEY TELEGRAM_BOT_TOKEN DISCORD_BOT_TOKEN; do
      local v
      v="${!k:-}"
      if [[ -n "$v" ]]; then
        printf '%s=%s\n' "$k" "$v"
      fi
    done
  } >"$tmp"

  kubectl -n "$namespace" create secret generic "$secret_name" --from-env-file="$tmp"
  rm -f "$tmp"
}

# === AnyDev/开发机 ============================================================
# 适用场景：类似你现在这种“有持久盘 /data、没有 Docker daemon、kubectl 未配置集群”的研发设备
# 目标：在同类设备上让每个同事一键把 OpenClaw 跑起来（state/workspace 持久化到 /data）
deploy_anydev() {
  local env="$1"
  echo "🧰 AnyDev/开发机 一键运行 — $env 环境"
  echo ""

  require_cmd node

  # 部署/运行脚本默认不应修改 git 配置（本仓库 package.json 的 prepare 会写 core.hooksPath）
  export OPENCLAW_DISABLE_GIT_HOOKS=1

  # 尽量让环境自洽：安装 corepack shims/pnpm、把 OpenClaw state 固定到 /data
  echo "🧩 初始化 AnyDev 持久化环境（/data）..."
  bash scripts/anydev-setup.sh "$REPO_ROOT"

  # 应用 AnyDev 环境变量（当前 shell 生效）
  if [[ -f /data/dev-env/openclaw.sh ]]; then
    # shellcheck disable=SC1091
    source /data/dev-env/openclaw.sh
  fi

  require_cmd pnpm

  # 允许用 private/env/<env>.env 覆盖端口/bind 等非机密参数
  load_env_file "$env"

  # 生产默认：NODE_ENV=production（可被 env 文件/外部环境覆盖）
  if [[ "$env" == "prod" && -z "${NODE_ENV:-}" ]]; then
    export NODE_ENV=production
  fi

  if [[ "${OPENCLAW_SKIP_BUILD:-0}" != "1" ]]; then
    build_app
    apply_brand_if_needed
  else
    echo "⏭️  跳过构建（OPENCLAW_SKIP_BUILD=1）"
  fi

  local state_dir
  state_dir="${OPENCLAW_STATE_DIR:-/data/.openclaw}"
  mkdir -p "$state_dir/logs"

  local log_file pid_file bind port
  log_file="${OPENCLAW_ANYDEV_LOG:-$state_dir/logs/gateway.log}"
  pid_file="$state_dir/gateway.pid"
  bind="${OPENCLAW_GATEWAY_BIND:-loopback}"
  port="${OPENCLAW_GATEWAY_PORT:-18789}"

  # 安全：非 loopback 暴露必须开启鉴权
  if [[ "$bind" != "loopback" && "$bind" != "127.0.0.1" ]]; then
    if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" && -z "${OPENCLAW_GATEWAY_PASSWORD:-}" ]]; then
      echo "❌ bind=$bind 时必须设置 OPENCLAW_GATEWAY_TOKEN 或 OPENCLAW_GATEWAY_PASSWORD（避免裸奔暴露控制面）。"
      exit 1
    fi
  fi

  local allow_unconfigured
  allow_unconfigured="${OPENCLAW_ALLOW_UNCONFIGURED:-}"
  if [[ -z "$allow_unconfigured" ]]; then
    if [[ "$env" == "prod" ]]; then
      allow_unconfigured="0"
    else
      allow_unconfigured="1"
    fi
  fi

  # 如果有旧进程，尽量优雅停掉
  if [[ -f "$pid_file" ]]; then
    local oldpid
    oldpid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$oldpid" ]] && kill -0 "$oldpid" >/dev/null 2>&1; then
      echo "🛑 停止旧进程: $oldpid"
      kill "$oldpid" >/dev/null 2>&1 || true
      sleep 1
    fi
  fi

  local cmd
  cmd=(node dist/index.js gateway --bind "$bind" --port "$port")


  if [[ "$allow_unconfigured" == "1" ]]; then
    cmd+=(--allow-unconfigured)
  fi

  echo "🚀 启动 OpenClaw Gateway: ${cmd[*]}"
  nohup "${cmd[@]}" >"$log_file" 2>&1 &
  echo $! >"$pid_file"

  echo ""
  echo "✅ 已启动"
  echo "   PID: $(cat "$pid_file" 2>/dev/null || echo unknown)"
  echo "   日志: tail -f $log_file"
  echo "   State: $state_dir"
}

# === Docker Compose ==========================================================
deploy_docker() {
  local env="$1"
  echo "🐳 Docker Compose 部署 — $env 环境"
  echo ""

  # 检查 env 文件
  local env_file="private/env/$env.env"
  if [[ ! -f "$env_file" ]]; then
    echo "❌ 找不到环境配置: $env_file"
    exit 1
  fi

  # 构建镜像（如果不是从 registry 拉取）
  local image
  image=$(grep "^OPENCLAW_IMAGE=" "$env_file" | cut -d= -f2- || echo "")

  local pnpm_force
  pnpm_force=$(grep "^OPENCLAW_PNPM_FORCE=" "$env_file" | cut -d= -f2- || echo "0")

  if [[ "$image" == *":local"* || "$image" == "openclaw:dev" ]]; then
    echo "🔨 构建本地 Docker 镜像..."
    docker build --build-arg OPENCLAW_PNPM_FORCE="${pnpm_force:-0}" -t "${image:-openclaw:dev}" .
  else
    echo "📥 拉取镜像: ${image:-openclaw:latest}"
    docker compose --env-file "$env_file" -f docker-compose.yml -f private/docker-compose.override.yml pull
  fi

  # 启动
  export DEPLOY_ENV="$env"
  docker compose \
    --env-file "$env_file" \
    -f docker-compose.yml \
    -f private/docker-compose.override.yml \
    up -d

  echo ""
  echo "✅ Docker 部署完成"
  echo "   Gateway: http://localhost:$(grep OPENCLAW_GATEWAY_PORT "$env_file" | cut -d= -f2- || echo 18789)"
}

# === Kubernetes (Helm) ========================================================
# 只做 Helm apply：适用于镜像已在 registry、或你不希望本机 build/push 的场景
deploy_k8s() {
  local env="$1"
  echo "☸️  Kubernetes 部署 — $env 环境"
  echo ""

  require_cmd kubectl
  require_cmd helm

  local values_file="private/helm/openclaw/values-$env.yaml"
  if [[ ! -f "$values_file" ]]; then
    echo "❌ 找不到环境 values: $values_file"
    exit 1
  fi

  local namespace="openclaw-$env"

  kubectl create namespace "$namespace" --dry-run=client -o yaml | kubectl apply -f -

  helm upgrade --install openclaw \
    ./private/helm/openclaw \
    -f "$values_file" \
    -n "$namespace" \
    --wait \
    --timeout 5m

  echo ""
  echo "✅ K8s 部署完成"
  echo "   kubectl -n $namespace get pods"
  echo "   kubectl -n $namespace port-forward svc/openclaw 18789:18789"
}

# build+push+helm：用于“正式源码构建后直接生产部署”
deploy_k8s_onekey() {
  local env="$1"
  echo "☸️  Kubernetes 一键部署 — $env 环境"
  echo ""

  require_cmd kubectl
  require_cmd helm
  require_cmd docker

  local values_file="private/helm/openclaw/values-$env.yaml"
  if [[ ! -f "$values_file" ]]; then
    echo "❌ 找不到环境 values: $values_file"
    exit 1
  fi

  load_env_file "$env"

  local image="${OPENCLAW_IMAGE:-}"
  if [[ -z "$image" ]]; then
    echo "❌ 未设置 OPENCLAW_IMAGE。建议在 private/env/$env.env 中设置，例如："
    echo "   OPENCLAW_IMAGE=ghcr.io/your-org/openclaw:$(git rev-parse --short HEAD 2>/dev/null || echo tag)"
    exit 1
  fi

  local repo tag
  read -r repo tag < <(split_image_ref "$image")

  echo "🐳 构建镜像: $image"
  docker build --build-arg OPENCLAW_PNPM_FORCE="${OPENCLAW_PNPM_FORCE:-0}" -t "$image" .

  if [[ "${OPENCLAW_SKIP_PUSH:-0}" != "1" ]]; then
    echo "📤 推送镜像: $image"
    docker push "$image"
  else
    echo "⏭️  跳过 push（OPENCLAW_SKIP_PUSH=1）"
  fi

  local namespace="openclaw-$env"
  kubectl create namespace "$namespace" --dry-run=client -o yaml | kubectl apply -f -

  # 如 values 配了 existingSecret，则确保它存在（可选自动创建）
  local existing_secret
  existing_secret="$(get_values_scalar "$values_file" existingSecret || true)"
  ensure_k8s_secret "$namespace" "$existing_secret"

  local helm_args
  helm_args=(upgrade --install openclaw ./private/helm/openclaw -f "$values_file" -n "$namespace" --wait --timeout 10m --atomic)
  helm_args+=(--set-string "image.repository=$repo" --set-string "image.tag=$tag")

  if [[ -n "${OPENCLAW_STORAGE_CLASS:-}" ]]; then
    helm_args+=(--set-string "persistence.storageClass=$OPENCLAW_STORAGE_CLASS")
  fi

  if [[ -n "${OPENCLAW_INGRESS_HOST:-}" ]]; then
    helm_args+=(--set-string "ingress.enabled=true")
    helm_args+=(--set-string "ingress.hosts[0].host=$OPENCLAW_INGRESS_HOST")
    # 尝试同步 tls host（如果 values 里用了 tls[0]，这样覆盖更直观）
    helm_args+=(--set-string "ingress.tls[0].hosts[0]=$OPENCLAW_INGRESS_HOST")
  fi

  if [[ -n "${OPENCLAW_IMAGE_PULL_SECRET:-}" ]]; then
    helm_args+=(--set-string "imagePullSecrets[0].name=$OPENCLAW_IMAGE_PULL_SECRET")
  fi

  echo "📦 Helm 发布: image=$repo:$tag namespace=$namespace"
  helm "${helm_args[@]}"

  echo ""
  echo "✅ K8s 一键部署完成"
  echo "   kubectl -n $namespace get pods"
}

# === 裸机 Systemd =============================================================
deploy_bare() {
  local env="$1"
  echo "🖥️  裸机部署 — $env 环境"
  echo ""

  # 构建
  build_app
  apply_brand_if_needed

  # 检查 systemd 单元
  local unit_file="/etc/systemd/system/openclaw-gateway.service"
  if [[ ! -f "$unit_file" ]]; then
    echo "📋 安装 systemd 服务..."
    sudo cp private/systemd/openclaw-gateway.service "$unit_file"
    sudo systemctl daemon-reload
  fi

  # 安装环境配置
  local env_file="private/env/$env.env"
  local env_local="private/env/$env.env.local"
  local env_to_install=""

  if [[ -f "$env_local" ]]; then
    env_to_install="$env_local"
  elif [[ -f "$env_file" ]]; then
    env_to_install="$env_file"
  fi

  if [[ -n "$env_to_install" ]]; then
    sudo mkdir -p /etc/openclaw
    sudo cp "$env_to_install" /etc/openclaw/.env
    echo "✅ 环境配置已安装到 /etc/openclaw/.env ($(basename "$env_to_install"))"
  fi

  # 创建 openclaw 用户（如果不存在）
  if ! id openclaw &>/dev/null; then
    sudo useradd -r -s /sbin/nologin -d /var/lib/openclaw openclaw
    sudo mkdir -p /var/lib/openclaw/workspace
    sudo chown -R openclaw:openclaw /var/lib/openclaw
  fi

  # 同步代码到 /opt/openclaw
  sudo mkdir -p /opt/openclaw
  sudo rsync -a --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='private/env/*.env.local' \
    ./ /opt/openclaw/

  # 安装生产依赖
  cd /opt/openclaw
  sudo -u openclaw pnpm install --prod --frozen-lockfile 2>/dev/null || \
    sudo -u openclaw pnpm install --prod

  # 启动/重启
  sudo systemctl enable openclaw-gateway
  sudo systemctl restart openclaw-gateway

  echo ""
  echo "✅ 裸机部署完成"
  echo "   状态: sudo systemctl status openclaw-gateway"
  echo "   日志: journalctl -u openclaw-gateway -f"
}

# === macOS App ================================================================
deploy_mac() {
  echo "🍎 macOS App 构建"
  echo ""

  apply_brand_if_needed
  bash scripts/package-mac-app.sh

  echo ""
  echo "✅ macOS App 构建完成"
  echo "   输出: apps/macos/.build/"
}

# === 状态查看 =================================================================
deploy_status() {
  echo "📊 部署状态概览"
  echo ""

  # Docker
  echo "--- Docker ---"
  if command -v docker &>/dev/null; then
    docker compose -f docker-compose.yml ps 2>/dev/null || echo "  未检测到 Docker Compose 部署"
  else
    echo "  Docker 未安装"
  fi
  echo ""

  # K8s
  echo "--- Kubernetes ---"
  if command -v kubectl &>/dev/null; then
    for ns in openclaw-dev openclaw-staging openclaw-prod; do
      echo "  [$ns]"
      kubectl -n "$ns" get pods --no-headers 2>/dev/null || echo "    未找到"
    done
  else
    echo "  kubectl 未安装"
  fi
  echo ""

  # Systemd
  echo "--- Systemd ---"
  if command -v systemctl &>/dev/null; then
    systemctl status openclaw-gateway --no-pager 2>/dev/null || echo "  服务未安装"
  else
    echo "  非 systemd 系统"
  fi
}

# === 路由 ====================================================================
case "$DEPLOY_TARGET" in
  anydev)
    deploy_anydev "$DEPLOY_ENV"
    ;;
  docker)
    deploy_docker "$DEPLOY_ENV"
    ;;
  k8s)
    if [[ "${OPENCLAW_ONEKEY:-0}" == "1" ]]; then
      deploy_k8s_onekey "$DEPLOY_ENV"
    else
      deploy_k8s "$DEPLOY_ENV"
    fi
    ;;
  k8s-onekey)
    deploy_k8s_onekey "$DEPLOY_ENV"
    ;;
  bare)
    deploy_bare "$DEPLOY_ENV"
    ;;
  mac)
    deploy_mac
    ;;
  status)
    deploy_status
    ;;
  *)
    usage
    ;;
esac
