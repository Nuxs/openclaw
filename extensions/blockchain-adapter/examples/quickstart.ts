/**
 * OpenClaw Blockchain Adapter - Quick Start Examples
 * 快速上手示例代码
 */

import {
  initBlockchainFactory,
  getProvider,
  getSupportedChains,
  type IBlockchainProvider,
  type TxLog,
} from "../src/index.js";

// ============================================================================
// 示例1: 初始化并连接TON钱包
// ============================================================================

async function example1_connectTONWallet() {
  console.log("=== Example 1: Connect TON Wallet ===\n");

  // 1. 初始化工厂
  initBlockchainFactory();

  // 2. 获取TON Provider
  const tonProvider = getProvider("ton-mainnet");

  // 3. 连接TonConnect钱包
  const wallet = await tonProvider.connect({
    manifestUrl: "https://openclaw.io/tonconnect-manifest.json",
  });

  console.log("Connected wallet:", wallet.address);
  console.log("Chain:", tonProvider.chainName);

  // 4. 查询TON余额
  const balance = await tonProvider.getBalance(wallet.address);
  console.log("TON Balance:", Number(balance) / 1e9, "TON");

  return { tonProvider, wallet };
}

// ============================================================================
// 示例2: 查询$OCT代币余额
// ============================================================================

async function example2_checkOCTBalance(provider: IBlockchainProvider, address: string) {
  console.log("\n=== Example 2: Check OCT Token Balance ===\n");

  const OCT_TOKEN_ADDRESS = "EQD..."; // 替换为实际的$OCT代币地址

  const octBalance = await provider.getBalance(address, OCT_TOKEN_ADDRESS);

  console.log("OCT Balance:", Number(octBalance) / 1e9, "OCT");

  return octBalance;
}

// ============================================================================
// 示例3: 发布任务并锁定结算
// ============================================================================

async function example3_publishTaskAndLockSettlement(provider: IBlockchainProvider) {
  console.log("\n=== Example 3: Publish Task and Lock Settlement ===\n");

  // 1. 生成订单ID
  const orderId = `order-${Date.now()}`;
  const orderHash = hashString(orderId); // 需要实现hash函数

  // 2. 锁定50 OCT作为预算
  const budget = BigInt(50) * BigInt(1e9); // 50 OCT

  console.log("Publishing task:", orderId);
  console.log("Budget:", Number(budget) / 1e9, "OCT");

  const txHash = await provider.lockSettlement(orderId, budget);

  console.log("Settlement locked!");
  console.log("Transaction:", provider.getExplorerUrl(txHash));

  // 3. 等待交易确认
  console.log("Waiting for confirmation...");
  await provider.waitForTransaction(txHash);

  console.log("✅ Transaction confirmed!");

  return { orderId, orderHash, txHash };
}

// ============================================================================
// 示例4: 任务完成，释放结算
// ============================================================================

async function example4_releaseSettlement(provider: IBlockchainProvider, orderId: string) {
  console.log("\n=== Example 4: Release Settlement ===\n");

  // 1. 任务实际使用35 OCT
  const actualUsage = BigInt(35) * BigInt(1e9);

  // 2. 生成可验证证明
  const proof = {
    taskId: orderId,
    result: "Task completed successfully",
    usage: {
      tokens: 35000, // 35K tokens
      time: 120, // 120 seconds
    },
    signature: "signature_here", // 实际需要节点签名
    timestamp: Date.now(),
  };

  console.log("Releasing settlement...");
  console.log("Actual usage:", Number(actualUsage) / 1e9, "OCT");
  console.log("Refund:", 50 - 35, "OCT");

  const txHash = await provider.releaseSettlement(orderId, actualUsage, proof);

  console.log("Settlement released!");
  console.log("Transaction:", provider.getExplorerUrl(txHash));

  await provider.waitForTransaction(txHash);

  console.log("✅ Payment sent to node, refund sent to client!");

  return txHash;
}

// ============================================================================
// 示例5: 任务超时，退款
// ============================================================================

async function example5_refundSettlement(provider: IBlockchainProvider, orderId: string) {
  console.log("\n=== Example 5: Refund Settlement ===\n");

  console.log("Task timeout, requesting refund...");

  const txHash = await provider.refundSettlement(orderId, "timeout");

  console.log("Refund processed!");
  console.log("Transaction:", provider.getExplorerUrl(txHash));

  await provider.waitForTransaction(txHash);

  console.log("✅ Full refund sent back to client!");

  return txHash;
}

// ============================================================================
// 示例6: 查询结算状态
// ============================================================================

async function example6_checkSettlementStatus(provider: IBlockchainProvider, orderId: string) {
  console.log("\n=== Example 6: Check Settlement Status ===\n");

  const settlement = await provider.getSettlementStatus(orderId);

  console.log("Settlement Info:");
  console.log("  Order ID:", settlement.orderId);
  console.log("  Status:", settlement.status);
  console.log("  Locked Amount:", Number(settlement.lockedAmount) / 1e9, "OCT");
  console.log("  Payer:", settlement.payer);
  console.log("  Payee:", settlement.payee);
  console.log("  Locked At:", new Date(settlement.lockedAt * 1000).toISOString());

  return settlement;
}

// ============================================================================
// 示例7: 监听结算事件
// ============================================================================

async function example7_subscribeSettlementEvents(provider: IBlockchainProvider) {
  console.log("\n=== Example 7: Subscribe to Settlement Events ===\n");

  const SETTLEMENT_CONTRACT = "EQD..."; // 替换为实际合约地址

  // 监听"锁定"事件
  const unsubscribeLock = await provider.subscribeEvents(
    SETTLEMENT_CONTRACT,
    "SettlementLocked",
    (event: TxLog) => {
      console.log("🔒 New settlement locked:", event);
    },
  );

  // 监听"释放"事件
  const unsubscribeRelease = await provider.subscribeEvents(
    SETTLEMENT_CONTRACT,
    "SettlementReleased",
    (event: TxLog) => {
      console.log("💰 Settlement released:", event);
    },
  );

  console.log("Listening for events...");
  console.log("(Press Ctrl+C to stop)");

  // 返回取消订阅函数
  return () => {
    unsubscribeLock();
    unsubscribeRelease();
    console.log("Unsubscribed from events");
  };
}

// ============================================================================
// 示例8: 多链切换
// ============================================================================

async function example8_multiChainSwitch() {
  console.log("\n=== Example 8: Multi-Chain Switch ===\n");

  // 初始化工厂
  initBlockchainFactory();

  // 列出所有支持的链
  const chains = getSupportedChains();
  console.log("Supported chains:", chains);

  // 获取不同链的Provider
  const tonProvider = getProvider("ton-mainnet");
  console.log("\nTON Chain:", tonProvider.chainName);
  console.log("Native Token:", tonProvider.nativeToken.symbol);

  // 未来可以切换到其他链
  // const solanaProvider = getProvider('solana-mainnet');
  // const suiProvider = getProvider('sui-mainnet');
  // const baseProvider = getProvider('base-mainnet');

  // 相同的API，不同的链！
  console.log("\n✅ Multi-chain support ready!");
}

// ============================================================================
// 示例9: 转账$OCT代币
// ============================================================================

async function example9_transferOCT(
  provider: IBlockchainProvider,
  toAddress: string,
  amount: number,
) {
  console.log("\n=== Example 9: Transfer OCT Token ===\n");

  const OCT_TOKEN_ADDRESS = "EQD...";
  const amountInNano = BigInt(amount) * BigInt(1e9);

  console.log("Transferring", amount, "OCT to", toAddress);

  const txHash = await provider.transfer(toAddress, amountInNano, OCT_TOKEN_ADDRESS);

  console.log("Transfer sent!");
  console.log("Transaction:", provider.getExplorerUrl(txHash));

  await provider.waitForTransaction(txHash);

  console.log("✅ Transfer confirmed!");

  return txHash;
}

// ============================================================================
// 示例10: 完整的算力市场流程
// ============================================================================

async function example10_completeMarketplaceFlow() {
  console.log("\n=== Example 10: Complete Marketplace Flow ===\n");

  try {
    // 1. 连接钱包
    const { tonProvider, wallet } = await example1_connectTONWallet();

    // 2. 检查余额
    await example2_checkOCTBalance(tonProvider, wallet.address);

    // 3. 发布任务并锁定结算
    const { orderId } = await example3_publishTaskAndLockSettlement(tonProvider);

    // 4. 模拟任务执行 (实际由节点完成)
    console.log("\n⏳ Task is being executed by compute node...\n");
    await sleep(3000);

    // 5. 任务完成，释放结算
    await example4_releaseSettlement(tonProvider, orderId);

    // 6. 查询最终状态
    await example6_checkSettlementStatus(tonProvider, orderId);

    console.log("\n🎉 Complete marketplace flow finished!");
  } catch (error) {
    console.error("Error:", error);
  }
}

// ============================================================================
// 工具函数
// ============================================================================

function hashString(str: string): number {
  // 简单的hash函数 (生产环境需要使用加密hash)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  console.log("🚀 OpenClaw Blockchain Adapter Examples\n");
  console.log("Choose an example to run:\n");
  console.log("  1. Connect TON Wallet");
  console.log("  2. Check OCT Balance");
  console.log("  3. Publish Task and Lock Settlement");
  console.log("  4. Release Settlement");
  console.log("  5. Refund Settlement");
  console.log("  6. Check Settlement Status");
  console.log("  7. Subscribe to Events");
  console.log("  8. Multi-Chain Switch");
  console.log("  9. Transfer OCT Token");
  console.log("  10. Complete Marketplace Flow");

  const exampleNumber = process.argv[2] || "10";

  switch (exampleNumber) {
    case "1":
      await example1_connectTONWallet();
      break;
    case "8":
      await example8_multiChainSwitch();
      break;
    case "10":
      await example10_completeMarketplaceFlow();
      break;
    default:
      console.log("\nRunning complete marketplace flow by default...\n");
      await example10_completeMarketplaceFlow();
  }
}

// 运行示例
if (require.main === module) {
  main().catch(console.error);
}

// 导出所有示例
export {
  example1_connectTONWallet,
  example2_checkOCTBalance,
  example3_publishTaskAndLockSettlement,
  example4_releaseSettlement,
  example5_refundSettlement,
  example6_checkSettlementStatus,
  example7_subscribeSettlementEvents,
  example8_multiChainSwitch,
  example9_transferOCT,
  example10_completeMarketplaceFlow,
};
