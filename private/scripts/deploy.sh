#!/usr/bin/env bash
# ============================================================================
# deploy.sh — 统一部署入口脚本
# ============================================================================
# 用法:
#   ./private/scripts/deploy.sh docker [dev|staging|prod]
#   ./private/scripts/deploy.sh k8s [dev|staging|prod]
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
  docker [dev|staging|prod]   Docker Compose 部署
  k8s    [dev|staging|prod]   Kubernetes (Helm) 部署
  bare   [dev|staging|prod]   裸机 Systemd 部署
  mac                         macOS App 构建
  status                      查看所有环境部署状态

Environment (默认 dev):
  dev       开发环境
  staging   预发布环境
  prod      生产环境

示例:
  deploy.sh docker dev        # Docker 开发环境
  deploy.sh k8s staging       # K8s 预发布环境
  deploy.sh bare prod         # 裸机生产部署
  deploy.sh mac               # 构建 macOS App
EOF
  exit 1
}

[[ -z "$DEPLOY_TARGET" ]] && usage

# --- 通用: 构建 --------------------------------------------------------------
build_app() {
  echo "📦 构建应用..."
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
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
deploy_k8s() {
  local env="$1"
  echo "☸️  Kubernetes 部署 — $env 环境"
  echo ""

  local values_file="private/helm/openclaw/values-$env.yaml"
  if [[ ! -f "$values_file" ]]; then
    echo "❌ 找不到环境 values: $values_file"
    exit 1
  fi

  local namespace="openclaw-$env"

  # 创建 namespace (如果不存在)
  kubectl create namespace "$namespace" --dry-run=client -o yaml | kubectl apply -f -

  # Helm install/upgrade
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
  if [[ -f "$env_file" ]]; then
    sudo mkdir -p /etc/openclaw
    sudo cp "$env_file" /etc/openclaw/.env
    echo "✅ 环境配置已安装到 /etc/openclaw/.env"
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
  docker)  deploy_docker "$DEPLOY_ENV" ;;
  k8s)     deploy_k8s "$DEPLOY_ENV" ;;
  bare)    deploy_bare "$DEPLOY_ENV" ;;
  mac)     deploy_mac ;;
  status)  deploy_status ;;
  *)       usage ;;
esac
