#!/bin/bash
# scripts/kill-switch-web3-market.sh
#
# Web3 Market 熔断脚本
# 用法: ./scripts/kill-switch-web3-market.sh <action>
#
# 动作:
#   status        - 查看当前熔断状态
#   disable-all   - 禁用所有 Web3 Market 功能
#   disable-autopay - 仅禁用 x402 自动支付
#   enable-all    - 启用所有 Web3 Market 功能
#
# 示例:
#   ./scripts/kill-switch-web3-market.sh status
#   ./scripts/kill-switch-web3-market.sh disable-all

set -e

ACTION="${1:-status}"
CONFIG_FILE="$HOME/.openclaw/config.json"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_status() {
  local key="$1"
  local value="$2"

  if [ "$value" = "true" ]; then
    echo -e "  ${key}: ${GREEN}enabled${NC}"
  elif [ "$value" = "false" ]; then
    echo -e "  ${key}: ${RED}disabled${NC}"
  else
    echo -e "  ${key}: ${YELLOW}${value}${NC}"
  fi
}

get_config() {
  local key="$1"
  local default="${2:-not set}"

  if command -v openclaw &>/dev/null; then
    openclaw config get "$key" 2>/dev/null || echo "$default"
  else
    echo "$default"
  fi
}

set_config() {
  local key="$1"
  local value="$2"

  if command -v openclaw &>/dev/null; then
    openclaw config set "$key" "$value"
  else
    echo "Error: openclaw command not found"
    exit 1
  fi
}

case "$ACTION" in
  status)
    echo -e "${CYAN}=== Web3 Market Kill Switch Status ===${NC}"
    echo ""

    echo "Core Features:"
    print_status "web3.enabled" "$(get_config web3.enabled 'false')"
    print_status "web3.market.enabled" "$(get_config web3.market.enabled 'false')"
    print_status "web3.kya.enabled" "$(get_config web3.kya.enabled 'false')"
    echo ""

    echo "Payment Features:"
    print_status "web3.x402.autopay.enabled" "$(get_config web3.x402.autopay.enabled 'false')"
    print_status "web3.x402.maxRetries" "$(get_config web3.x402.maxRetries '3')"
    echo ""

    echo "Budget Controls:"
    print_status "web3.maxDailySpend" "$(get_config web3.maxDailySpend '100')"
    print_status "web3.maxOrderAmount" "$(get_config web3.maxOrderAmount '50')"
    echo ""

    echo "Circuit Breaker:"
    print_status "web3.circuitBreaker.failureRateThreshold" "$(get_config web3.circuitBreaker.failureRateThreshold '0.5')"
    print_status "web3.circuitBreaker.openDuration" "$(get_config web3.circuitBreaker.openDuration '60000')"
    echo ""

    # 检查 Gateway 状态
    echo "Gateway Status:"
    if pgrep -f openclaw-gateway > /dev/null; then
      echo -e "  Gateway: ${GREEN}running${NC}"
    else
      echo -e "  Gateway: ${RED}stopped${NC}"
    fi
    ;;

  disable-all)
    echo -e "${RED}=== Disabling all Web3 Market features ===${NC}"
    echo ""

    echo "Disabling core features..."
    set_config web3.x402.autopay.enabled false
    set_config web3.market.enabled false

    echo ""
    echo -e "${GREEN}All Web3 Market features disabled.${NC}"
    echo ""
    echo "To take effect, restart the gateway:"
    echo "  pkill -f openclaw-gateway"
    echo "  openclaw gateway run --bind loopback --port 18789 --force &"
    echo ""
    echo "To re-enable:"
    echo "  $0 enable-all"
    ;;

  disable-autopay)
    echo -e "${YELLOW}=== Disabling x402 Auto-Pay ===${NC}"
    echo ""

    echo "Disabling autopay..."
    set_config web3.x402.autopay.enabled false

    echo ""
    echo -e "${GREEN}x402 Auto-Pay disabled.${NC}"
    echo ""
    echo "Existing payments will complete, but new 402 responses will not be auto-paid."
    echo ""
    echo "To re-enable:"
    echo "  openclaw config set web3.x402.autopay.enabled true"
    ;;

  enable-all)
    echo -e "${GREEN}=== Enabling all Web3 Market features ===${NC}"
    echo ""

    echo "Enabling core features..."
    set_config web3.x402.autopay.enabled true
    set_config web3.market.enabled true
    set_config web3.kya.enabled true

    echo ""
    echo -e "${GREEN}All Web3 Market features enabled.${NC}"
    echo ""
    echo "To take effect, restart the gateway:"
    echo "  pkill -f openclaw-gateway"
    echo "  openclaw gateway run --bind loopback --port 18789 --force &"
    ;;

  emergency-stop)
    # 紧急停止：禁用所有功能并停止 Gateway
    echo -e "${RED}=== EMERGENCY STOP ===${NC}"
    echo ""
    echo "This will:"
    echo "  1. Disable all Web3 Market features"
    echo "  2. Stop the Gateway"
    echo ""
    read -p "Proceed? (y/N) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
      echo ""
      echo "Disabling features..."
      set_config web3.x402.autopay.enabled false || true
      set_config web3.market.enabled false || true

      echo "Stopping gateway..."
      pkill -f openclaw-gateway 2>/dev/null || true

      echo ""
      echo -e "${GREEN}Emergency stop complete.${NC}"
      echo ""
      echo "To restore:"
      echo "  1. $0 enable-all"
      echo "  2. openclaw gateway run --bind loopback --port 18789 --force &"
    else
      echo "Aborted."
    fi
    ;;

  *)
    echo "Usage: $0 <action>"
    echo ""
    echo "Actions:"
    echo "  status          - Show current kill switch status"
    echo "  disable-all     - Disable all Web3 Market features"
    echo "  disable-autopay - Disable x402 auto-pay only"
    echo "  enable-all      - Enable all Web3 Market features"
    echo "  emergency-stop  - Emergency stop (disable + stop gateway)"
    echo ""
    echo "Examples:"
    echo "  $0 status"
    echo "  $0 disable-all"
    echo "  $0 disable-autopay"
    echo "  $0 enable-all"
    exit 1
    ;;
esac
