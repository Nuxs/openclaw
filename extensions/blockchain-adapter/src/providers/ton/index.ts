/**
 * TON Blockchain Provider Implementation
 * 基于TON SDK和TonConnect实现
 */

import {
  Address as TonAddress,
  TonClient,
  WalletContractV4,
  internal,
  beginCell,
  Cell,
  toNano,
  fromNano,
} from "@ton/ton";
import { TonConnect } from "@tonconnect/sdk";
import type {
  IBlockchainProvider,
  ChainId,
  TxHash,
  Address,
  ContractAddress,
  Wallet,
  ConnectionConfig,
  Transaction,
  TxReceipt,
  TxLog,
  Proof,
  TokenInfo,
  EventCallback,
  Unsubscribe,
  SettlementInfo,
  ProviderConfig,
} from "../types/provider";

// ============================================================================
// TON Provider Configuration
// ============================================================================

interface TONProviderOptions {
  testnet?: boolean;
  rpcUrl?: string;
  apiKey?: string;
}

export class TONProvider implements IBlockchainProvider {
  // ==================== 基础属性 ====================

  readonly chainId: ChainId;
  readonly chainName: string = "TON Network";
  readonly nativeToken: TokenInfo = {
    symbol: "TON",
    name: "Toncoin",
    decimals: 9,
  };

  private client: TonClient;
  private tonConnect?: TonConnect;
  private connectedWallet?: Wallet;
  private config: ProviderConfig;
  private eventListeners = new Map<string, Set<EventCallback>>();
  private pollingInterval?: NodeJS.Timeout;

  // ==================== 构造函数 ====================

  constructor(options: TONProviderOptions = {}) {
    this.chainId = options.testnet ? "ton-testnet" : "ton-mainnet";

    // 初始化TON Client
    const rpcUrl =
      options.rpcUrl ||
      (options.testnet
        ? "https://testnet.toncenter.com/api/v2/jsonRPC"
        : "https://toncenter.com/api/v2/jsonRPC");

    this.client = new TonClient({
      endpoint: rpcUrl,
      apiKey: options.apiKey,
    });

    // 加载配置
    this.config = this.loadConfig();
  }

  private loadConfig(): ProviderConfig {
    // TODO: 从配置文件加载
    return {
      chainId: this.chainId,
      rpcUrl: this.client.parameters.endpoint,
      explorerUrl:
        this.chainId === "ton-testnet" ? "https://testnet.tonscan.org" : "https://tonscan.org",
      contracts: {
        settlement: "EQD...", // 待部署
        marketplace: "EQD...",
        token: "EQD...", // $OCT Token
      },
    };
  }

  // ==================== 身份认证 ====================

  async connect(config: ConnectionConfig): Promise<Wallet> {
    if (!config.manifestUrl) {
      throw new Error("TonConnect requires manifestUrl");
    }

    // 初始化TonConnect
    this.tonConnect = new TonConnect({
      manifestUrl: config.manifestUrl,
    });

    // 请求连接
    await this.tonConnect.connect();

    // 获取钱包信息
    const walletInfo = this.tonConnect.wallet;
    if (!walletInfo) {
      throw new Error("Failed to connect wallet");
    }

    this.connectedWallet = {
      address: walletInfo.account.address,
      publicKey: walletInfo.account.publicKey,
      chainId: this.chainId,
    };

    return this.connectedWallet;
  }

  async disconnect(): Promise<void> {
    if (this.tonConnect) {
      await this.tonConnect.disconnect();
      this.tonConnect = undefined;
      this.connectedWallet = undefined;
    }
  }

  async getAddress(): Promise<Address> {
    if (!this.connectedWallet) {
      throw new Error("Wallet not connected");
    }
    return this.connectedWallet.address;
  }

  async signMessage(message: string): Promise<string> {
    if (!this.tonConnect) {
      throw new Error("Wallet not connected");
    }

    // TonConnect签名
    const payload = beginCell()
      .storeUint(0, 32) // opcode
      .storeStringTail(message)
      .endCell();

    const result = await this.tonConnect.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [
        {
          address: await this.getAddress(),
          amount: "0",
          payload: payload.toBoc().toString("base64"),
        },
      ],
    });

    return result.boc;
  }

  async verifySignature(message: string, signature: string, address: Address): Promise<boolean> {
    try {
      // TON签名验证
      const cell = Cell.fromBase64(signature);
      const slice = cell.beginParse();

      // TODO: 实现完整的签名验证逻辑
      return true;
    } catch (error) {
      return false;
    }
  }

  // ==================== 代币操作 ====================

  async getBalance(address: Address, tokenAddress?: ContractAddress): Promise<bigint> {
    const tonAddress = TonAddress.parse(address);

    if (!tokenAddress) {
      // 查询TON余额
      const balance = await this.client.getBalance(tonAddress);
      return balance;
    } else {
      // 查询Jetton (SPL Token)余额
      return await this.getJettonBalance(address, tokenAddress);
    }
  }

  private async getJettonBalance(
    ownerAddress: Address,
    jettonMasterAddress: ContractAddress,
  ): Promise<bigint> {
    // 获取用户的Jetton钱包地址
    const masterAddress = TonAddress.parse(jettonMasterAddress);
    const ownerAddr = TonAddress.parse(ownerAddress);

    // 调用get_wallet_address方法
    const result = await this.client.runMethod(masterAddress, "get_wallet_address", [
      {
        type: "slice",
        cell: beginCell().storeAddress(ownerAddr).endCell(),
      },
    ]);

    const jettonWalletAddress = result.stack.readAddress();

    // 查询Jetton钱包余额
    const balanceResult = await this.client.runMethod(jettonWalletAddress, "get_wallet_data", []);

    const balance = balanceResult.stack.readBigNumber();
    return balance;
  }

  async transfer(to: Address, amount: bigint, tokenAddress?: ContractAddress): Promise<TxHash> {
    if (!this.tonConnect) {
      throw new Error("Wallet not connected");
    }

    const toAddress = TonAddress.parse(to);

    if (!tokenAddress) {
      // 转账TON
      const result = await this.tonConnect.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: to,
            amount: amount.toString(),
          },
        ],
      });

      return result.boc; // 返回交易哈希
    } else {
      // 转账Jetton
      return await this.transferJetton(to, amount, tokenAddress);
    }
  }

  private async transferJetton(
    to: Address,
    amount: bigint,
    jettonMasterAddress: ContractAddress,
  ): Promise<TxHash> {
    if (!this.tonConnect) {
      throw new Error("Wallet not connected");
    }

    const fromAddress = await this.getAddress();
    const toAddress = TonAddress.parse(to);

    // 构建Jetton转账消息
    const jettonTransferBody = beginCell()
      .storeUint(0xf8a7ea5, 32) // Jetton transfer opcode
      .storeUint(0, 64) // query_id
      .storeCoins(amount)
      .storeAddress(toAddress)
      .storeAddress(TonAddress.parse(fromAddress)) // response_destination
      .storeBit(0) // no custom payload
      .storeCoins(toNano("0.05")) // forward_ton_amount
      .storeBit(0) // no forward_payload
      .endCell();

    // 获取用户的Jetton钱包地址
    const masterAddress = TonAddress.parse(jettonMasterAddress);
    const result = await this.client.runMethod(masterAddress, "get_wallet_address", [
      {
        type: "slice",
        cell: beginCell().storeAddress(TonAddress.parse(fromAddress)).endCell(),
      },
    ]);
    const jettonWalletAddress = result.stack.readAddress();

    // 发送交易
    const txResult = await this.tonConnect.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [
        {
          address: jettonWalletAddress.toString(),
          amount: toNano("0.1").toString(), // Gas费
          payload: jettonTransferBody.toBoc().toString("base64"),
        },
      ],
    });

    return txResult.boc;
  }

  // ==================== 智能合约交互 ====================

  async deployContract(bytecode: string, args: any[]): Promise<ContractAddress> {
    if (!this.tonConnect) {
      throw new Error("Wallet not connected");
    }

    // TODO: 实现合约部署
    throw new Error("Not implemented");
  }

  async callContract(address: ContractAddress, method: string, args: any[]): Promise<any> {
    const contractAddress = TonAddress.parse(address);

    // 调用get方法
    const result = await this.client.runMethod(contractAddress, method, args);

    return result.stack;
  }

  async estimateGas(tx: Transaction): Promise<bigint> {
    // TON的Gas费用相对固定
    // 普通转账约0.01 TON，合约调用约0.05-0.1 TON
    return toNano("0.05");
  }

  // ==================== 结算相关 ====================

  async lockSettlement(
    orderId: string,
    amount: bigint,
    tokenAddress?: ContractAddress,
  ): Promise<TxHash> {
    if (!this.tonConnect) {
      throw new Error("Wallet not connected");
    }

    const settlementAddress = TonAddress.parse(this.config.contracts.settlement);

    // 构建锁定消息
    const lockBody = beginCell()
      .storeUint(1, 32) // op: lock_settlement
      .storeUint(0, 64) // query_id
      .storeStringTail(orderId)
      .storeCoins(amount)
      .endCell();

    const result = await this.tonConnect.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [
        {
          address: this.config.contracts.settlement,
          amount: amount.toString(),
          payload: lockBody.toBoc().toString("base64"),
        },
      ],
    });

    return result.boc;
  }

  async releaseSettlement(orderId: string, actualAmount: bigint, proof: Proof): Promise<TxHash> {
    if (!this.tonConnect) {
      throw new Error("Wallet not connected");
    }

    // 构建释放消息
    const releaseBody = beginCell()
      .storeUint(2, 32) // op: release_settlement
      .storeUint(0, 64) // query_id
      .storeStringTail(orderId)
      .storeCoins(actualAmount)
      .storeStringTail(proof.signature)
      .endCell();

    const result = await this.tonConnect.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [
        {
          address: this.config.contracts.settlement,
          amount: toNano("0.05").toString(), // Gas费
          payload: releaseBody.toBoc().toString("base64"),
        },
      ],
    });

    return result.boc;
  }

  async refundSettlement(orderId: string, reason?: string): Promise<TxHash> {
    if (!this.tonConnect) {
      throw new Error("Wallet not connected");
    }

    // 构建退款消息
    const refundBody = beginCell()
      .storeUint(3, 32) // op: refund_settlement
      .storeUint(0, 64) // query_id
      .storeStringTail(orderId)
      .storeStringTail(reason || "")
      .endCell();

    const result = await this.tonConnect.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [
        {
          address: this.config.contracts.settlement,
          amount: toNano("0.05").toString(),
          payload: refundBody.toBoc().toString("base64"),
        },
      ],
    });

    return result.boc;
  }

  async getSettlementStatus(orderId: string): Promise<SettlementInfo> {
    const settlementAddress = TonAddress.parse(this.config.contracts.settlement);

    // 查询结算状态
    const result = await this.client.runMethod(settlementAddress, "get_settlement", [
      {
        type: "slice",
        cell: beginCell().storeStringTail(orderId).endCell(),
      },
    ]);

    // 解析返回值
    const status = result.stack.readNumber();
    const lockedAmount = result.stack.readBigNumber();
    const payer = result.stack.readAddress().toString();
    const payee = result.stack.readAddressOpt()?.toString();
    const lockedAt = result.stack.readNumber();

    return {
      orderId,
      status: this.parseSettlementStatus(status),
      lockedAmount,
      payer,
      payee,
      tokenAddress: this.config.contracts.token!,
      lockedAt,
    };
  }

  private parseSettlementStatus(status: number): "locked" | "released" | "refunded" | "disputed" {
    switch (status) {
      case 1:
        return "locked";
      case 2:
        return "released";
      case 3:
        return "refunded";
      case 4:
        return "disputed";
      default:
        throw new Error(`Unknown settlement status: ${status}`);
    }
  }

  // ==================== 事件监听 ====================

  async subscribeEvents(
    contract: ContractAddress,
    eventName: string,
    callback: EventCallback,
  ): Promise<Unsubscribe> {
    const key = `${contract}:${eventName}`;

    if (!this.eventListeners.has(key)) {
      this.eventListeners.set(key, new Set());
    }

    this.eventListeners.get(key)!.add(callback);

    // 启动轮询 (TON目前没有原生WebSocket事件)
    if (!this.pollingInterval) {
      this.startEventPolling();
    }

    // 返回取消订阅函数
    return () => {
      this.eventListeners.get(key)?.delete(callback);
      if (this.eventListeners.get(key)?.size === 0) {
        this.eventListeners.delete(key);
      }
    };
  }

  private startEventPolling() {
    let lastBlockNumber = 0;

    this.pollingInterval = setInterval(async () => {
      try {
        const currentBlock = await this.getBlockNumber();
        if (currentBlock > lastBlockNumber) {
          // 检查新区块的交易
          await this.checkNewTransactions(lastBlockNumber, currentBlock);
          lastBlockNumber = currentBlock;
        }
      } catch (error) {
        console.error("Event polling error:", error);
      }
    }, 5000); // 每5秒轮询一次
  }

  private async checkNewTransactions(fromBlock: number, toBlock: number) {
    // TODO: 实现交易检查逻辑
    // 遍历合约地址，查找相关交易，解析事件并触发回调
  }

  // ==================== 工具方法 ====================

  async waitForTransaction(txHash: TxHash, confirmations = 1): Promise<TxReceipt> {
    // TON的交易确认较快，通常1-2秒
    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      const receipt = await this.getTransactionReceipt(txHash);
      if (receipt) {
        return receipt;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error("Transaction confirmation timeout");
  }

  async getBlockNumber(): Promise<number> {
    const masterchain = await this.client.getMasterchainInfo();
    return masterchain.last.seqno;
  }

  async getTransactionReceipt(txHash: TxHash): Promise<TxReceipt | null> {
    try {
      // TODO: 通过txHash查询交易详情
      // TON的交易哈希格式与EVM不同，需要特殊处理

      return null; // 暂未实现
    } catch (error) {
      return null;
    }
  }

  getExplorerUrl(txHash: TxHash): string {
    return `${this.config.explorerUrl}/tx/${txHash}`;
  }
}
