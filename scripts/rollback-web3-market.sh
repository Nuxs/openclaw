#!/bin/bash
# scripts/rollback-web3-market.sh
#
# Web3 Market 回滚脚本
# 用法: ./scripts/rollback-web3-market.sh <version> [--dry-run]
#
# 示例:
#   ./scripts/rollback-web3-market.sh 2026.3.15         # 回滚到指定版本
#   ./scripts/rollback-web3-market.sh 2026.3.15 --dry-run  # 干跑预演

set -e

ROLLBACK_VERSION="${1:-}"
DRY_RUN="${2:-false}"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
LOG_FILE="/tmp/openclaw-web3-rollback-${TIMESTAMP}.log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
  echo -e "$1" | tee -a "$LOG_FILE"
}

log_info() {
  log "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  log "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  log "${RED}[ERROR]${NC} $1"
}

# 参数校验
if [ -z "$ROLLBACK_VERSION" ]; then
  echo "Usage: $0 <version> [--dry-run]"
  echo ""
  echo "Examples:"
  echo "  $0 2026.3.15            # Rollback to version 2026.3.15"
  echo "  $0 2026.3.15 --dry-run   # Dry run (no actual changes)"
  echo ""
  echo "Available versions:"
  npm view openclaw versions --json 2>/dev/null | jq -r '.[-10:][]' 2>/dev/null || echo "  (unable to fetch)"
  exit 1
fi

# 验证版本是否存在
if ! npm view openclaw@$ROLLBACK_VERSION version &>/dev/null; then
  log_error "Version $ROLLBACK_VERSION not found in npm registry"
  exit 1
fi

log "=========================================="
log "Web3 Market Rollback Script"
log "=========================================="
log "Target version: $ROLLBACK_VERSION"
log "Dry run: $DRY_RUN"
log "Log file: $LOG_FILE"
log "=========================================="
log ""

# 1. Pre-rollback health check
log_info "[1/6] Pre-rollback health check..."

PRE_ROLLBACK_STATUS="/tmp/pre-rollback-status-${TIMESTAMP}.json"

if command -v openclaw &>/dev/null; then
  openclaw web3 status --json > "$PRE_ROLLBACK_STATUS" 2>/dev/null || true
  log_info "Pre-rollback status saved to $PRE_ROLLBACK_STATUS"
else
  log_warn "openclaw command not found, skipping status capture"
fi

# 2. Backup current state
log_info "[2/6] Backing up current state..."

BACKUP_DIR="$HOME/.openclaw/backups/rollback-${TIMESTAMP}"

if [ -d "$HOME/.openclaw/web3" ]; then
  if [ "$DRY_RUN" = "false" ]; then
    mkdir -p "$BACKUP_DIR"
    cp -r "$HOME/.openclaw/web3" "$BACKUP_DIR/web3" 2>/dev/null || true
    cp -r "$HOME/.openclaw/market" "$BACKUP_DIR/market" 2>/dev/null || true
    cp -r "$HOME/.openclaw/ledger" "$BACKUP_DIR/ledger" 2>/dev/null || true
    log_info "Backup saved to $BACKUP_DIR"
  else
    log_info "[DRY RUN] Would backup to $BACKUP_DIR"
  fi
else
  log_warn "No web3 state directory found, skipping backup"
fi

# 3. Stop gateway
log_info "[3/6] Stopping gateway..."

if [ "$DRY_RUN" = "false" ]; then
  pkill -f openclaw-gateway 2>/dev/null || true
  sleep 2
  log_info "Gateway stopped"
else
  log_info "[DRY RUN] Would stop gateway"
fi

# 4. Revert to target version
log_info "[4/6] Reverting to version $ROLLBACK_VERSION..."

if [ "$DRY_RUN" = "false" ]; then
  if command -v pnpm &>/dev/null; then
    pnpm install -g openclaw@$ROLLBACK_VERSION
  elif command -v npm &>/dev/null; then
    npm install -g openclaw@$ROLLBACK_VERSION
  else
    log_error "Neither pnpm nor npm found"
    exit 1
  fi
  log_info "Installed openclaw@$ROLLBACK_VERSION"
else
  log_info "[DRY RUN] Would install openclaw@$ROLLBACK_VERSION"
fi

# 5. Restart gateway
log_info "[5/6] Restarting gateway..."

if [ "$DRY_RUN" = "false" ]; then
  # 等待端口释放
  sleep 3

  # 启动 gateway
  nohup openclaw gateway run --bind loopback --port 18789 --force > /tmp/openclaw-gateway.log 2>&1 &

  # 等待启动
  sleep 5

  # 验证启动
  if pgrep -f openclaw-gateway > /dev/null; then
    log_info "Gateway restarted successfully"
  else
    log_error "Gateway failed to start. Check /tmp/openclaw-gateway.log"
    exit 1
  fi
else
  log_info "[DRY RUN] Would restart gateway"
fi

# 6. Post-rollback health check
log_info "[6/6] Post-rollback health check..."

POST_ROLLBACK_STATUS="/tmp/post-rollback-status-${TIMESTAMP}.json"
ROLLBACK_REPORT="/tmp/rollback-report-${TIMESTAMP}.md"

if [ "$DRY_RUN" = "false" ]; then
  sleep 3

  if command -v openclaw &>/dev/null; then
    openclaw web3 status --json > "$POST_ROLLBACK_STATUS" 2>/dev/null || true
  fi

  # 生成回滚报告
  cat > "$ROLLBACK_REPORT" << EOF
# Web3 Market 回滚报告

## 回滚信息
- 时间: $(date -Iseconds)
- 目标版本: $ROLLBACK_VERSION
- 状态: 成功

## 备份位置
- $BACKUP_DIR

## 日志文件
- $LOG_FILE

## 验证步骤
1. 检查 Gateway 状态: \`openclaw web3 status\`
2. 检查市场状态: \`openclaw market status\`
3. 检查钱包余额: \`openclaw wallet balance\`

## 回滚后状态
\`\`\`json
$(cat "$POST_ROLLBACK_STATUS" 2>/dev/null || echo "状态获取失败")
\`\`\`
EOF

  log_info "Rollback report saved to $ROLLBACK_REPORT"
else
  log_info "[DRY RUN] Would run post-rollback health check"
fi

log ""
log "=========================================="
log "${GREEN}Rollback complete!${NC}"
log "=========================================="
log ""
log "Next steps:"
log "  1. Verify gateway: openclaw web3 status"
log "  2. Check market:   openclaw market status"
log "  3. Review logs:    cat $LOG_FILE"
log ""

if [ "$DRY_RUN" = "false" ]; then
  log "Rollback report: $ROLLBACK_REPORT"
fi
