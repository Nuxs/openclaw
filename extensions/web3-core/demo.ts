#!/usr/bin/env node --import tsx
/**
 * Web3 Core Plugin Demo
 *
 * 演示插件的核心功能:
 * 1. 钱包绑定与身份验证 (SIWE)
 * 2. 审计日志记录与链上锚定
 * 3. 去中心化存储归档 (IPFS)
 * 4. 使用配额与计费
 */

import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AuditEvent } from "./src/audit/types.js";
import type { UsageRecord } from "./src/billing/types.js";
import { resolveConfig, type Web3PluginConfig } from "./src/config.js";
import type { WalletBinding } from "./src/identity/types.js";
import { Web3StateStore } from "./src/state/store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 创建临时测试目录
const DEMO_STATE_DIR = join(__dirname, ".demo-state");
rmSync(DEMO_STATE_DIR, { recursive: true, force: true });
mkdirSync(DEMO_STATE_DIR, { recursive: true });

console.log("🚀 Web3 Core Plugin Demo\n");
console.log(`📁 State directory: ${DEMO_STATE_DIR}\n`);

// 1️⃣ 配置演示
console.log("1️⃣  配置系统");
console.log("━".repeat(60));

const config = resolveConfig({
  chain: {
    network: "base",
    rpcUrl: "https://mainnet.base.org",
  },
  storage: {
    provider: "ipfs",
    gateway: "https://w3s.link",
  },
  privacy: {
    onChainData: "hash_only",
    archiveEncryption: true,
  },
  identity: {
    allowSiwe: true,
    domain: "demo.openclaw.ai",
  },
  billing: {
    enabled: true,
    quotaPerSession: 1000,
    costPerLlmCall: 1,
  },
});

console.log("✅ 链网络:", config.chain.network);
console.log("✅ 存储提供商:", config.storage.provider);
console.log("✅ 隐私策略:", config.privacy.onChainData);
console.log("✅ SIWE 认证:", config.identity.allowSiwe ? "启用" : "禁用");
console.log("✅ 计费功能:", config.billing.enabled ? "启用" : "禁用");
console.log();

// 2️⃣ 状态存储演示
console.log("2️⃣  状态存储");
console.log("━".repeat(60));

const store = new Web3StateStore(DEMO_STATE_DIR);

// 钱包绑定
const demoWallet: WalletBinding = {
  address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  chainId: 8453, // Base
  verifiedAt: new Date().toISOString(),
  siweDomain: config.identity.domain,
  siweUri: "https://demo.openclaw.ai",
  siweStatement: "Demo wallet binding",
};

store.addBinding(demoWallet);
console.log("✅ 钱包绑定:", demoWallet.address);

const bindings = store.getBindings();
console.log(`✅ 已绑定钱包数量: ${bindings.length}`);
console.log();

// 3️⃣ 审计日志演示
console.log("3️⃣  审计追踪");
console.log("━".repeat(60));

const sessionHash = "demo-session-hash-123";

const auditEvents: AuditEvent[] = [
  {
    id: "evt-1",
    kind: "llm_input",
    timestamp: new Date().toISOString(),
    seq: 1,
    sessionIdHash: sessionHash,
    payloadHash: "0xa1b2c3d4...",
    payload: { prompt: "用户输入示例" },
  },
  {
    id: "evt-2",
    kind: "llm_output",
    timestamp: new Date().toISOString(),
    seq: 2,
    sessionIdHash: sessionHash,
    payloadHash: "0xe5f6g7h8...",
    payload: { response: "AI 响应示例", tokens: 150 },
  },
  {
    id: "evt-3",
    kind: "tool_call",
    timestamp: new Date().toISOString(),
    seq: 3,
    sessionIdHash: sessionHash,
    payloadHash: "0xi9j0k1l2...",
    payload: { tool: "web_search", query: "OpenClaw Web3" },
  },
];

auditEvents.forEach((event) => {
  store.appendAuditEvent(event);
  console.log(`✅ 记录审计事件: ${event.kind} (seq=${event.seq})`);
});

const recentEvents = store.readAuditEvents(10);
console.log(`✅ 读取最近事件: ${recentEvents.length} 条`);
console.log();

// 4️⃣ 计费/配额演示
console.log("4️⃣  使用配额与计费");
console.log("━".repeat(60));

const creditsUsed = 5 * config.billing.costPerLlmCall + 3 * config.billing.costPerToolCall;
const creditsQuota = config.billing.quotaPerSession;
const usageRecord: UsageRecord = {
  sessionIdHash: sessionHash,
  llmCalls: 5,
  toolCalls: 3,
  creditsUsed,
  creditsQuota,
  lastActivity: new Date().toISOString(),
};

store.saveUsage(usageRecord);
console.log(`✅ 记录使用量: LLM 调用 ${usageRecord.llmCalls} 次`);
console.log(`✅ 工具调用: ${usageRecord.toolCalls} 次`);
console.log(`✅ 总成本: ${usageRecord.creditsUsed} credits`);
console.log(`✅ 配额: ${usageRecord.creditsQuota} credits`);
console.log(`✅ 剩余: ${usageRecord.creditsQuota - usageRecord.creditsUsed} credits`);
console.log();

// 5️⃣ 归档加密密钥
console.log("5️⃣  归档加密");
console.log("━".repeat(60));

const archiveKey = store.getArchiveKey();
console.log(`✅ 加密密钥生成: ${archiveKey.length} 字节`);
console.log(`✅ 密钥 (Base64 前16字符): ${archiveKey.toString("base64").slice(0, 16)}...`);
console.log();

// 6️⃣ 功能总结
console.log("📊 插件功能概览");
console.log("━".repeat(60));
console.log("✨ 已实现的核心功能:");
console.log("   • 钱包身份绑定 (SIWE EIP-4361)");
console.log("   • 审计日志记录 (本地 JSONL)");
console.log("   • 去中心化存储归档 (IPFS/Arweave/Filecoin)");
console.log("   • 链上审计锚定 (Base/Optimism/Arbitrum)");
console.log("   • 使用配额追踪");
console.log("   • 计费保护机制");
console.log("   • 隐私保护 (加密 + 敏感字段脱敏)");
console.log();

console.log("🎯 命令清单:");
console.log("   • /bind_wallet     - 绑定钱包地址");
console.log("   • /unbind_wallet   - 解绑钱包");
console.log("   • /whoami_web3     - 查看身份");
console.log("   • /credits         - 检查配额");
console.log("   • /pay_status      - 支付状态");
console.log("   • /audit_status    - 审计事件");
console.log();

console.log("🔌 Gateway API:");
console.log("   • web3.siwe.challenge     - SIWE 挑战生成");
console.log("   • web3.siwe.verify        - SIWE 签名验证");
console.log("   • web3.audit.query        - 审计日志查询");
console.log("   • web3.billing.status     - 计费状态");
console.log("   • web3.billing.summary    - 计费汇总");
console.log("   • web3.status.summary     - Web3 状态概览");
console.log();

console.log("🎪 Hook 集成点:");
console.log("   • llm_input          - LLM 输入审计");
console.log("   • llm_output         - LLM 输出审计 + 计费");
console.log("   • before_tool_call   - 工具调用前配额检查");
console.log("   • after_tool_call    - 工具调用后审计");
console.log("   • session_end        - 会话结束归档与锚定");
console.log();

console.log("✅ Demo 完成! 清理临时文件...");
rmSync(DEMO_STATE_DIR, { recursive: true, force: true });
console.log("🧹 已清理临时状态目录");
