#!/usr/bin/env bash
set -euo pipefail

# 一键：生成 OPENCLAW_GATEWAY_TOKEN -> 写入 private/env/prod.env -> 部署 anydev prod
# 用法：
#   bash private/scripts/onekey-anydev-prod.sh
# 可选：
#   OPENCLAW_GATEWAY_BIND=lan OPENCLAW_GATEWAY_PORT=18789 bash private/scripts/onekey-anydev-prod.sh
#   OPENCLAW_SKIP_BUILD=1 bash private/scripts/onekey-anydev-prod.sh

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

ENV_NAME="prod"
ENV_FILE="$REPO_ROOT/private/env/${ENV_NAME}.env"
mkdir -p "$(dirname "$ENV_FILE")"

generate_token() {
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
  echo "ERROR: need openssl or python3 to generate token" >&2
  exit 1
}

upsert_env_kv() {
  local file="$1" key="$2" value="$3"
  local tmp
  tmp="$(mktemp)"
  if [[ -f "$file" ]]; then
    awk -v k="$key" -v v="$value" '
      BEGIN { found=0 }
      $0 ~ ("^" k "=") { print k "=" v; found=1; next }
      { print }
      END { if (found==0) print k "=" v }
    ' "$file" > "$tmp"
  else
    printf '%s=%s\n' "$key" "$value" > "$tmp"
  fi
  mv "$tmp" "$file"
}

read_env_value() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0

  awk -v k="$key" '
    $0 ~ ("^" k "=") {
      sub("^" k "=", "", $0)
      sub(/[[:space:]]*#.*/, "", $0)
      gsub(/^[[:space:]]+/, "", $0)
      gsub(/[[:space:]]+$/, "", $0)
      print $0
      exit
    }
  ' "$file"
}

# 生成 token（如果 env 文件里已经有 token，就复用它；空值/注释不算）
# 如 token 泄露/想重置：OPENCLAW_ROTATE_TOKEN=1 会强制生成新 token 覆盖。
if [[ "${OPENCLAW_ROTATE_TOKEN:-0}" == "1" ]]; then
  token="$(generate_token)"
  upsert_env_kv "$ENV_FILE" "OPENCLAW_GATEWAY_TOKEN" "$token"
else
  token="$(read_env_value "$ENV_FILE" "OPENCLAW_GATEWAY_TOKEN" || true)"
  if [[ -z "$token" ]]; then
    token="$(generate_token)"
    upsert_env_kv "$ENV_FILE" "OPENCLAW_GATEWAY_TOKEN" "$token"
  fi
fi

# 如果用户在运行前通过环境变量指定了 bind/port/skip_build，也写入 env 文件方便后续复用
if [[ -n "${OPENCLAW_GATEWAY_BIND:-}" ]]; then
  upsert_env_kv "$ENV_FILE" "OPENCLAW_GATEWAY_BIND" "${OPENCLAW_GATEWAY_BIND}"
fi
if [[ -n "${OPENCLAW_GATEWAY_PORT:-}" ]]; then
  upsert_env_kv "$ENV_FILE" "OPENCLAW_GATEWAY_PORT" "${OPENCLAW_GATEWAY_PORT}"
fi
if [[ -n "${OPENCLAW_SKIP_BUILD:-}" ]]; then
  upsert_env_kv "$ENV_FILE" "OPENCLAW_SKIP_BUILD" "${OPENCLAW_SKIP_BUILD}"
fi

chmod 600 "$ENV_FILE" 2>/dev/null || true

mask() {
  local s="$1"
  if [[ ${#s} -le 10 ]]; then
    echo "***"
  else
    echo "${s:0:6}...${s: -4}"
  fi
}

echo "✅ 已写入/确认 token 到: $ENV_FILE"
if [[ "${OPENCLAW_SHOW_TOKEN:-0}" == "1" ]]; then
  echo "   OPENCLAW_GATEWAY_TOKEN=$token"
else
  echo "   OPENCLAW_GATEWAY_TOKEN=$(mask "$token")"
  echo "   （如需显示完整 token：加 OPENCLAW_SHOW_TOKEN=1）"
fi
echo ""

"$REPO_ROOT/private/scripts/deploy.sh" anydev "$ENV_NAME"
status=$?
if [[ $status -ne 0 ]]; then
  exit $status
fi

# 通过 ssh -L 使用时，需保持连接不退出，否则端口转发会断开。
# 用法示例：OPENCLAW_HOLD=1 ./private/scripts/onekey-anydev-prod.sh
if [[ "${OPENCLAW_HOLD:-0}" == "1" ]]; then
  state_dir="${OPENCLAW_STATE_DIR:-/data/.openclaw}"
  log_file="${OPENCLAW_ANYDEV_LOG:-$state_dir/logs/gateway.log}"
  echo "🔁 保持连接（OPENCLAW_HOLD=1）：tail -F $log_file"
  tail -n 200 -F "$log_file"
fi
