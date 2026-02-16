#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/searxng}"
SEARXNG_PORT="${SEARXNG_PORT:-8080}"
SEARXNG_BASE_URL="${SEARXNG_BASE_URL:-}"
SEARXNG_API_KEY="${SEARXNG_API_KEY:-}"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

log() {
  echo "[searxng] $*"
}

ensure_packages() {
  $SUDO apt-get update -y
  $SUDO apt-get install -y ca-certificates curl gnupg lsb-release
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    return
  fi
  log "Installing Docker engine and compose plugin..."
  ensure_packages
  $SUDO install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
  $SUDO apt-get update -y
  $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  $SUDO systemctl enable --now docker
}

docker_cmd() {
  if docker info >/dev/null 2>&1; then
    echo "docker"
    return
  fi
  echo "sudo docker"
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
    return
  fi
  date +%s%N | sha256sum | awk '{print $1}'
}

install_docker
DOCKER="$(docker_cmd)"

$SUDO mkdir -p "$INSTALL_DIR" "$INSTALL_DIR/searxng/config" "$INSTALL_DIR/searxng/data" "$INSTALL_DIR/nginx"
$SUDO chmod 755 "$INSTALL_DIR"

if [ -z "$SEARXNG_BASE_URL" ]; then
  PUBLIC_IP="$(curl -fsSL https://api.ipify.org || true)"
  if [ -n "$PUBLIC_IP" ]; then
    SEARXNG_BASE_URL="http://${PUBLIC_IP}:${SEARXNG_PORT}"
  fi
fi

if [ -z "$SEARXNG_API_KEY" ]; then
  SEARXNG_API_KEY="$(generate_secret)"
fi

SECRET_KEY="$(generate_secret)"

if [ -z "$SEARXNG_BASE_URL" ]; then
  log "SEARXNG_BASE_URL not provided and public IP lookup failed."
  log "Set SEARXNG_BASE_URL then re-run, or edit settings.yml after deploy."
  SEARXNG_BASE_URL="http://YOUR_HOST_OR_IP:${SEARXNG_PORT}"
fi

cat > /tmp/searxng-settings.yml <<EOF
use_default_settings: true

server:
  limiter: false
  base_url: "${SEARXNG_BASE_URL}"
  secret_key: "${SECRET_KEY}"
  public_instance: false

search:
  safe_search: 0
  formats:
    - html
    - json
EOF

cat > /tmp/nginx.conf <<EOF
map_hash_bucket_size 128;

map \$arg_apikey \$searxng_auth_ok {
  default 0;
  "${SEARXNG_API_KEY}" 1;
}

server {
  listen 8080;
  location / {
    if (\$searxng_auth_ok = 0) { return 403; }
    proxy_pass http://searxng:8080;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF

cat > /tmp/docker-compose.yml <<EOF
services:
  searxng:
    image: ghcr.io/searxng/searxng
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 1g
    volumes:
      - ./searxng/config:/etc/searxng
      - ./searxng/data:/var/cache/searxng
  searxng-proxy:
    image: nginx:alpine
    restart: unless-stopped
    depends_on:
      - searxng
    ports:
      - "${SEARXNG_PORT}:8080"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
EOF

$SUDO mv /tmp/searxng-settings.yml "$INSTALL_DIR/searxng/config/settings.yml"
$SUDO mv /tmp/nginx.conf "$INSTALL_DIR/nginx/nginx.conf"
$SUDO mv /tmp/docker-compose.yml "$INSTALL_DIR/docker-compose.yml"

$SUDO chown -R "${USER:-root}":"${USER:-root}" "$INSTALL_DIR" || log "Warning: chown failed (non-critical)"

log "Starting SearxNG via Docker Compose..."
cd "$INSTALL_DIR"
$DOCKER compose pull
$DOCKER compose up -d

cat <<EOF

SearxNG is up.

Base URL: ${SEARXNG_BASE_URL}
API key (query param apikey): ${SEARXNG_API_KEY}

Firewall: if ufw is active, run:  sudo ufw allow ${SEARXNG_PORT}/tcp

OpenClaw config snippet:
{
  tools: {
    web: {
      search: {
        provider: "searxng",
        searxng: {
          baseUrl: "${SEARXNG_BASE_URL}",
          apiKey: "${SEARXNG_API_KEY}",
        }
      }
    }
  }
}
EOF
