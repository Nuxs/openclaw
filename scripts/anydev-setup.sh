#!/usr/bin/env bash
set -euo pipefail

# AnyDev one-key dev setup for OpenClaw
# - Persist everything under /data (AnyDev persistence volume)
# - Avoid writing into read-only system dirs (/codev, /opt/codev)
# - Idempotent: safe to rerun

REPO_DIR="${1:-/data/workspace/openclaw}"

DATA_ROOT="/data"
DEVENV_DIR="$DATA_ROOT/dev-env"
ENV_FILE="$DEVENV_DIR/openclaw.sh"
DEVTOOLS_BIN="$DATA_ROOT/.devtools/bin"

PNPM_HOME="$DATA_ROOT/.pnpm"
PNPM_STORE_DIR="$DATA_ROOT/.pnpm-store/v10"
NPM_CONFIG_CACHE="$DATA_ROOT/.npm-cache"
COREPACK_HOME="$DATA_ROOT/.corepack"
NPM_GLOBAL_PREFIX="$DATA_ROOT/.npm-global"
NPM_GLOBAL_BIN="$NPM_GLOBAL_PREFIX/bin"

OPENCLAW_HOME="$DATA_ROOT"
OPENCLAW_STATE_DIR="$DATA_ROOT/.openclaw"
OPENCLAW_CONFIG_PATH="$OPENCLAW_STATE_DIR/openclaw.json"
OPENCLAW_WORKSPACE_DIR="$OPENCLAW_STATE_DIR/workspace"


# Repo-bundled Node (fallback when base image lacks Node/corepack)
LOCAL_NODE_DIST="node-v22.12.0-linux-x64"
LOCAL_NODE_DIR="$REPO_DIR/.local/$LOCAL_NODE_DIST"
LOCAL_NODE_BIN="$LOCAL_NODE_DIR/bin"
LOCAL_NODE_TARBALL="$REPO_DIR/.local/$LOCAL_NODE_DIST.tar.gz"

want_cmd() {
  command -v "$1" >/dev/null 2>&1
}

say() {
  printf '[anydev-setup] %s\n' "$*" >&2
}

fail() {
  printf '[anydev-setup] ERROR: %s\n' "$*" >&2
  exit 1
}

ensure_dirs() {
  say "Creating persistent dirs under $DATA_ROOT"
  mkdir -p \
    "$DEVENV_DIR" \
    "$DEVTOOLS_BIN" \
    "$PNPM_HOME" \
    "$PNPM_STORE_DIR" \
    "$NPM_CONFIG_CACHE" \
    "$COREPACK_HOME" \
    "$NPM_GLOBAL_PREFIX" \
    "$OPENCLAW_STATE_DIR" \
    "$OPENCLAW_WORKSPACE_DIR" \
    "$OPENCLAW_STATE_DIR/credentials"
}

ensure_repo_bundled_node() {
  # If corepack already exists, nothing to do.
  if want_cmd corepack; then
    return
  fi

  # Prefer an already-extracted node dir.
  if [[ -x "$LOCAL_NODE_BIN/corepack" ]]; then
    say "Using repo-bundled Node: $LOCAL_NODE_DIR"
    return
  fi

  # Try to extract bundled tarball if present.
  if [[ -f "$LOCAL_NODE_TARBALL" ]]; then
    if ! want_cmd tar; then
      fail "tar not found; cannot extract bundled Node: $LOCAL_NODE_TARBALL"
    fi
    say "Extracting repo-bundled Node: $LOCAL_NODE_TARBALL"
    mkdir -p "$REPO_DIR/.local"
    tar -xzf "$LOCAL_NODE_TARBALL" -C "$REPO_DIR/.local" >/dev/null 2>&1 || true
  fi

  if [[ -x "$LOCAL_NODE_BIN/corepack" ]]; then
    say "Repo-bundled Node ready: $LOCAL_NODE_DIR"
  else
    say "WARN: corepack not found, and no usable bundled Node at $LOCAL_NODE_DIR"
    say "      Fix: install Node.js in the base image, or ensure $LOCAL_NODE_TARBALL is present."
  fi
}

write_env_file() {
  say "Writing $ENV_FILE"
  cat >"$ENV_FILE" <<EOF
# AnyDev persistent OpenClaw env (source this file)
export OPENCLAW_REPO_DIR=$REPO_DIR

# Use repo-bundled Node if present (required for corepack/pnpm on minimal images)
if [ -d "$REPO_DIR/.local/$LOCAL_NODE_DIST/bin" ]; then
  export PATH="$REPO_DIR/.local/$LOCAL_NODE_DIST/bin:\$PATH"
fi

export PNPM_HOME=$PNPM_HOME
export NPM_CONFIG_CACHE=$NPM_CONFIG_CACHE
export PNPM_STORE_DIR=$PNPM_STORE_DIR
export COREPACK_HOME=$COREPACK_HOME
export NPM_CONFIG_PREFIX=$NPM_GLOBAL_PREFIX

# PATH: devtools shims > npm-global bin > pnpm home (and pnpm home bin, if any)
export PATH="$DEVTOOLS_BIN:$NPM_GLOBAL_BIN:$PNPM_HOME:$PNPM_HOME/bin:\$PATH"

# Make OpenClaw's default ~-derived paths resolve under /data (persistent)
export OPENCLAW_HOME=$OPENCLAW_HOME
export OPENCLAW_STATE_DIR=$OPENCLAW_STATE_DIR
export OPENCLAW_CONFIG_PATH=$OPENCLAW_CONFIG_PATH
EOF
  chmod 0644 "$ENV_FILE"
}

ensure_bashrc_sources_env() {
  local bashrc
  bashrc="${HOME:-/root}/.bashrc"
  say "Ensuring $bashrc auto-loads $ENV_FILE"
  touch "$bashrc"
  if ! grep -q "source $ENV_FILE" "$bashrc" 2>/dev/null; then
    {
      printf '\n# OpenClaw AnyDev persistent env (loads tools + config from /data)\n'
      printf 'if [ -f %q ]; then\n  source %q\nfi\n' "$ENV_FILE" "$ENV_FILE"
    } >>"$bashrc"
  fi
}

source_env_now() {
  # shellcheck disable=SC1090
  source "$ENV_FILE"
}

ensure_lsof() {
  if want_cmd lsof; then
    return
  fi
  if want_cmd apt-get; then
    say "Installing lsof (required for gateway --force)"
    apt-get update -y >/dev/null 2>&1 || true
    DEBIAN_FRONTEND=noninteractive apt-get install -y lsof >/dev/null 2>&1 || true
  fi
  if ! want_cmd lsof; then
    say "WARN: lsof is missing. gateway:watch uses --force and will fail without lsof."
    say "      Fix: install lsof, or run: node scripts/watch-node.mjs gateway (no --force)"
  fi
}

install_corepack_shims() {
  if ! want_cmd corepack; then
    fail "corepack not found in PATH. Ensure Node is available in the base image."
  fi

  # Avoid EROFS: install shims into a writable dir.
  say "Installing corepack shims into $DEVTOOLS_BIN"
  if corepack enable --install-directory "$DEVTOOLS_BIN" >/dev/null 2>&1; then
    :
  else
    say "corepack enable --install-directory failed; writing a pnpm wrapper script instead"
    cat >"$DEVTOOLS_BIN/pnpm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec corepack pnpm "$@"
EOF
    chmod +x "$DEVTOOLS_BIN/pnpm"
  fi
}

run_corepack_prepare() {
  local spec="$1"
  local tmp
  tmp="$(mktemp)"
  if corepack prepare "$spec" --activate >"$tmp" 2>&1; then
    rm -f "$tmp"
    return 0
  fi

  say "WARN: corepack prepare failed for $spec"
  sed 's/^/[anydev-setup]   /' "$tmp" >&2 || true
  rm -f "$tmp"
  return 1
}

activate_pnpm_version() {
  # Prefer repo-pinned pnpm, but also set a sane default.
  local pinned
  pinned=""
  if [ -f "$REPO_DIR/package.json" ]; then
    pinned=$(node -e "const p=require(process.argv[1]); console.log((p.packageManager||'').trim())" "$REPO_DIR/package.json" 2>/dev/null || true)
  fi

  local spec
  spec="pnpm@10.23.0"
  if [[ "$pinned" == pnpm@* ]]; then
    spec="$pinned"
    say "Activating pinned $spec via corepack"
  else
    say "No pinned pnpm@x.y.z found; activating $spec via corepack"
  fi

  if run_corepack_prepare "$spec"; then
    return
  fi

  # Fallback: install pnpm via npm into a writable prefix.
  if want_cmd npm; then
    say "Falling back to npm install -g $spec (prefix=$NPM_GLOBAL_PREFIX)"
    npm_config_prefix="$NPM_GLOBAL_PREFIX" npm install -g "$spec"
    hash -r || true

    # IMPORTANT:
    # - corepack may be broken on some networks (signature key rotation / MITM / blocked registry)
    # - avoid running the corepack-generated pnpm shim again, otherwise it will crash
    if [[ -x "$NPM_GLOBAL_BIN/pnpm" ]]; then
      cat >"$DEVTOOLS_BIN/pnpm" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "$NPM_GLOBAL_BIN/pnpm" "\$@"
EOF
      chmod +x "$DEVTOOLS_BIN/pnpm"
    fi

    if want_cmd pnpm; then
      say "pnpm ready (fallback via npm)"
      return
    fi
  fi

  fail "pnpm not available. Network to npm registry may be blocked, or Node/npm missing."
}

configure_pnpm_dirs() {
  say "Configuring pnpm store dir: $PNPM_STORE_DIR"
  pnpm config set store-dir "$PNPM_STORE_DIR" >/dev/null
}

install_node_via_pnpm() {
  # If we're already running on Node (repo-bundled or base image), don't force-download another Node.
  # Some AnyDev environments block outbound downloads, which would fail here.
  if want_cmd node; then
    return
  fi

  say "Ensuring Node 22.12.0 is installed under $PNPM_HOME via pnpm env"
  pnpm env use -g 22.12.0 >/dev/null
  hash -r || true
}

ensure_openclaw_state_layout() {
  say "Hardening OpenClaw state dir permissions"
  chmod 700 "$OPENCLAW_STATE_DIR" "$OPENCLAW_STATE_DIR/credentials" || true
  if [ -f "$OPENCLAW_CONFIG_PATH" ]; then
    chmod 600 "$OPENCLAW_CONFIG_PATH" || true
  fi

  # Reduce state splitting: if the user is root (common in AnyDev), make ~/.openclaw point at /data.
  # (OpenClaw respects OPENCLAW_* env vars already; this is an extra safety net.)
  if [ "${HOME:-}" = "/root" ]; then
    if [ -e /root/.openclaw ] && [ ! -L /root/.openclaw ]; then
      say "Found existing /root/.openclaw (non-symlink). Backing it up and merging into $OPENCLAW_STATE_DIR"
      cp -a /root/.openclaw/. "$OPENCLAW_STATE_DIR/" 2>/dev/null || true
      mv /root/.openclaw "/root/.openclaw.bak.$(date +%s)"
    fi
    if [ -e /root/.openclaw ] && [ -L /root/.openclaw ]; then
      :
    else
      ln -s "$OPENCLAW_STATE_DIR" /root/.openclaw
    fi
  fi
}

bootstrap_openclaw_config() {
  if [ ! -d "$REPO_DIR" ]; then
    fail "Repo dir not found: $REPO_DIR"
  fi
  if [ ! -f "$REPO_DIR/package.json" ]; then
    fail "Not an OpenClaw repo (missing package.json): $REPO_DIR"
  fi

  say "Bootstrapping OpenClaw config/state (openclaw setup)"
  pushd "$REPO_DIR" >/dev/null

  # Ensure deps exist for local dev commands.
  if [ ! -d node_modules ]; then
    say "Installing repo dependencies (pnpm install)"
    pnpm install
  fi

  # Generate config template into OPENCLAW_CONFIG_PATH.
  pnpm -s openclaw setup

  # Set standard container dev defaults.
  pnpm -s openclaw config set gateway.mode local
  pnpm -s openclaw config set agents.defaults.workspace "$OPENCLAW_WORKSPACE_DIR"

  popd >/dev/null
}

audit() {
  say "Audit summary"
  source_env_now
  echo "pnpm=$(command -v pnpm)"; pnpm -v
  echo "node=$(command -v node)"; node -v
  echo "corepack=$(command -v corepack)"; corepack --version || true
  echo "lsof=$(command -v lsof || echo missing)"; lsof -v 2>/dev/null | head -n 2 || true
  echo "OPENCLAW_STATE_DIR=$OPENCLAW_STATE_DIR"
  echo "OPENCLAW_CONFIG_PATH=$OPENCLAW_CONFIG_PATH"
  echo "agents.defaults.workspace should be: $OPENCLAW_WORKSPACE_DIR"
  ls -la "$OPENCLAW_CONFIG_PATH" || true
}

main() {
  ensure_dirs
  ensure_repo_bundled_node
  write_env_file
  ensure_bashrc_sources_env
  source_env_now

  install_corepack_shims
  activate_pnpm_version
  ensure_lsof

  # Now pnpm should be on PATH.
  if ! want_cmd pnpm; then
    fail "pnpm still not found after corepack setup. Check PATH and corepack enable output."
  fi

  configure_pnpm_dirs
  install_node_via_pnpm

  ensure_openclaw_state_layout
  bootstrap_openclaw_config
  ensure_openclaw_state_layout

  audit

  say "Done. Open a new terminal (or run: source ~/.bashrc), then: cd $REPO_DIR && pnpm gateway:watch"
}

main "$@"
