# Web3 Market 完整实施计划（一次性落地）

> **版本**：v1.0
> **创建日期**：2026-03-17
> **目标**：根据 WEB3_FINAL_PRODUCT_SPEC.md 将所有可立即实施的工作一次性落地
> **执行原则**：薄入口、Overlay-first、叶子模块隔离、敏感信息零泄露

---

## 0. 执行策略

### 0.1 分层执行顺序

```
Week 1-2: P0 阻断项（GA 门禁）
Week 3-4: Provider 上架闭环成品化
Week 5-6: Buyer 购买闭环成品化
Week 7: Control 面成品化
Week 8: 契约统一与发布口径收敛
Week 9: 集成测试与文档完善
```

### 0.2 架构约束（必须遵守）

- **薄入口**：入口文件只做路由/导出/装配，不承载业务逻辑
- **Overlay-first**：新增功能通过新文件实现，不修改上游热点文件
- **叶子模块隔离**：新功能放在叶子节点，不修改被多方依赖的文件
- **敏感信息零泄露**：token、endpoint、真实路径永不暴露
- **web3._ 公开、market._ 内部**：公开契约稳定，内部实现可演进

### 0.3 文件组织原则

```
extensions/market-core/src/market/
├── handlers/
│   ├── offer.ts           # Offer 权威层（已存在）
│   ├── order.ts           # Order 权威层（已存在）
│   ├── settlement.ts      # Settlement 权威层（已存在）
│   ├── dispute.ts         # Dispute 权威层（已存在）
│   ├── acceptance.ts      # 新增：验收权威层
│   ├── execution.ts       # 新增：执行状态查询
│   └── provider.ts        # 新增：Provider 管理
├── validators/
│   ├── offer.validator.ts # Offer 校验
│   └── order.validator.ts # Order 校验
└── types.ts               # 类型定义（已存在）

extensions/web3-core/src/
├── market/
│   └── handlers.ts        # web3.market.* 门面层
└── capabilities/catalog/
    └── market.ts          # 能力描述（已存在）

ui/src/ui/
├── views/
│   ├── market-offer-create.ts    # Provider 上架 UI
│   ├── market-service-browse.ts  # Buyer 浏览 UI
│   ├── market-order-detail.ts    # 订单详情 UI
│   └── market-control-panel.ts   # 控制面 UI
└── controllers/
    └── market-controllers.ts     # 市场数据控制器
```

---

## 1. Week 1-2: P0 阻断项（GA 门禁）

### 1.1 回滚演练记录

**目标**：建立可复现的回滚流程与演练记录模板

**实施内容**：

| 任务         | 说明                                   | 代码位置 |
| ------------ | -------------------------------------- | -------- |
| 回滚脚本     | `scripts/rollback-web3-market.sh`      | 新建     |
| 演练记录模板 | `docs/web3/ROLLBACK_DRILL_TEMPLATE.md` | 新建     |
| 回滚检查清单 | `docs/web3/ROLLBACK_CHECKLIST.md`      | 新建     |

**回滚脚本框架**：

```bash
#!/bin/bash
# scripts/rollback-web3-market.sh

set -e

ROLLBACK_VERSION="${1:-}"
DRY_RUN="${2:-false}"

if [ -z "$ROLLBACK_VERSION" ]; then
  echo "Usage: $0 <version> [--dry-run]"
  exit 1
fi

echo "=== Web3 Market Rollback Script ==="
echo "Target version: $ROLLBACK_VERSION"
echo "Dry run: $DRY_RUN"

# 1. Pre-rollback health check
echo "[1/6] Pre-rollback health check..."
openclaw web3 status --json > /tmp/pre-rollback-status.json

# 2. Backup current state
echo "[2/6] Backing up current state..."
cp -r ~/.openclaw/web3 ~/.openclaw/web3.backup.$(date +%Y%m%d%H%M%S)

# 3. Stop gateway
echo "[3/6] Stopping gateway..."
pkill -f openclaw-gateway || true

# 4. Revert to target version
echo "[4/6] Reverting to version $ROLLBACK_VERSION..."
if [ "$DRY_RUN" = "false" ]; then
  npm install -g openclaw@$ROLLBACK_VERSION
else
  echo "[DRY RUN] Would install openclaw@$ROLLBACK_VERSION"
fi

# 5. Restart gateway
echo "[5/6] Restarting gateway..."
nohup openclaw gateway run --bind loopback --port 18789 --force > /tmp/openclaw-gateway.log 2>&1 &

# 6. Post-rollback health check
echo "[6/6] Post-rollback health check..."
sleep 5
openclaw web3 status --json > /tmp/post-rollback-status.json

echo "=== Rollback complete ==="
```

**演练记录模板**：

```markdown
# Web3 Market 回滚演练记录

## 演练信息

- 日期：YYYY-MM-DD
- 演练人：
- 演练版本：vX.Y.Z → vA.B.C
- 环境：[dev/staging/prod]

## 演练步骤

1. [ ] 确认当前版本
2. [ ] 执行回滚脚本
3. [ ] 验证服务恢复
4. [ ] 记录回滚时间

## 验证结果

- [ ] Gateway 正常启动
- [ ] web3.status 命令正常
- [ ] 历史数据完整
- [ ] 钱包余额正确

## 回滚耗时

- 总耗时：X 分钟
- 脚本执行：X 秒
- 服务恢复：X 秒

## 问题记录

- 无 / [描述问题]

## 改进建议

- [改进建议]
```

**验收标准**：

- [ ] 回滚脚本可执行且幂等
- [ ] 演练记录模板完整
- [ ] 至少完成一次真实演练

---

### 1.2 发布说明草案

**目标**：建立发布说明模板与风险披露框架

**实施内容**：

| 文档         | 说明                                  | 位置 |
| ------------ | ------------------------------------- | ---- |
| 发布说明模板 | `docs/web3/RELEASE_NOTES_TEMPLATE.md` | 新建 |
| Beta FAQ     | `docs/web3/BETA_FAQ.md`               | 新建 |
| 风险披露     | `docs/web3/RISK_DISCLOSURE.md`        | 新建 |

**发布说明模板**：

````markdown
# OpenClaw Web3 Market vX.Y.Z Release Notes

## 发布日期

YYYY-MM-DD

## 发布类型

- [ ] Stable
- [ ] Beta
- [ ] Experimental

## 新功能

### Feature 1: [名称]

**描述**：[功能描述]
**配置**：`web3.feature.enabled = true`
**影响范围**：[范围]

### Feature 2: [名称]

...

## 改进

- [改进项]

## 修复

- [修复项]

## 已知问题

- [已知问题]

## 破坏性变更

- [破坏性变更说明]

## 升级指南

1. [升级步骤]

## 回滚方案

```bash
scripts/rollback-web3-market.sh <previous-version>
```
````

## 风险提示

- **熔断机制**：`web3.x402.autopay.enabled` 可全局禁用自动支付
- **回滚时间**：预计 X 分钟
- **数据兼容**：[兼容性说明]

````

**Beta FAQ 框架**：

```markdown
# OpenClaw Web3 Market Beta FAQ

## 什么是 Web3 Market？
OpenClaw Web3 Market 是一个可问责的数字服务市场，让 AI 管家可以自主发现、购买、验证和结算外部服务。

## Beta 期间有哪些限制？
1. **邀请制**：仅限受邀用户使用
2. **功能范围**：仅支持数字服务（搜索、数据增强、模型推理等）
3. **支付限制**：单日支出上限可配置
4. **争议处理**：需人工介入

## 如何启用 Web3 Market？
```bash
openclaw config set web3.market.enabled true
openclaw config set web3.kya.enabled true
````

## 如何设置预算？

```bash
openclaw wallet policy set --daily-cap 100
```

## 如何禁用自动支付？

```bash
openclaw config set web3.x402.autopay.enabled false
```

## 遇到问题如何回滚？

```bash
scripts/rollback-web3-market.sh <previous-version>
```

## 支持的支付链

- **EVM**：Ethereum、Polygon、Arbitrum 等
- **TON**：TON Mainnet

## 安全保障

- **策略引擎**：所有支出受 KYA 策略约束
- **敏感信息保护**：token、endpoint 永不泄露
- **审计日志**：所有操作可追溯

````

**验收标准**：

- [ ] 发布说明模板完整
- [ ] Beta FAQ 覆盖常见问题
- [ ] 风险披露清晰

---

### 1.3 kill switch 脚本固化

**目标**：建立可靠的紧急熔断机制

**实施内容**：

| 任务 | 说明 | 代码位置 |
|------|------|----------|
| kill switch 脚本 | `scripts/kill-switch-web3-market.sh` | 新建 |
| 熔断配置 | `config/web3-kill-switch.json` | 新建 |
| 熔断文档 | `docs/web3/KILL_SWITCH_GUIDE.md` | 新建 |

**kill switch 脚本**：

```bash
#!/bin/bash
# scripts/kill-switch-web3-market.sh

set -e

ACTION="${1:-status}"
SCOPE="${2:-all}"

CONFIG_FILE="$HOME/.openclaw/config.json"

case "$ACTION" in
  status)
    echo "=== Web3 Market Kill Switch Status ==="
    echo "x402 autopay: $(openclaw config get web3.x402.autopay.enabled)"
    echo "market enabled: $(openclaw config get web3.market.enabled)"
    echo "KYA enabled: $(openclaw config get web3.kya.enabled)"
    ;;

  disable-all)
    echo "=== Disabling all Web3 Market features ==="
    openclaw config set web3.x402.autopay.enabled false
    openclaw config set web3.market.enabled false
    echo "All features disabled. Restart gateway to take effect."
    ;;

  disable-autopay)
    echo "=== Disabling x402 Auto-Pay ==="
    openclaw config set web3.x402.autopay.enabled false
    echo "Auto-pay disabled. Restart gateway to take effect."
    ;;

  enable-all)
    echo "=== Enabling all Web3 Market features ==="
    openclaw config set web3.x402.autopay.enabled true
    openclaw config set web3.market.enabled true
    echo "All features enabled. Restart gateway to take effect."
    ;;

  *)
    echo "Usage: $0 {status|disable-all|disable-autopay|enable-all}"
    exit 1
    ;;
esac
````

**验收标准**：

- [ ] kill switch 脚本可执行
- [ ] 熔断状态可查询
- [ ] 操作文档完整

---

## 2. Week 3-4: Provider 上架闭环成品化

### 2.1 Offer 创建流程

**目标**：Provider 可通过 CLI/UI 创建服务报价

**新增文件**：

```
extensions/market-core/src/market/handlers/offer-create.ts
extensions/market-core/src/market/validators/offer.validator.ts
extensions/web3-core/src/market/handlers/offer-facade.ts
src/commands/market-offer-create.ts
ui/src/ui/views/market-offer-create.ts
```

**类型定义**（已存在于 `market-core/types.ts`，需补充）：

```typescript
// extensions/market-core/src/market/types.ts

export type OfferStatus = "draft" | "published" | "unpublished" | "closed";

export type ServiceOffer = {
  id: string;
  providerId: string;
  serviceSchema: ServiceSchema;
  pricing: PricingModel;
  supply: number | "unlimited";
  deliveryMode: "sync" | "async" | "scheduled";
  proofType: ProofType;
  settlementTerms: SettlementTerms;
  status: OfferStatus;
  publishedAt?: string;
  closedAt?: string;
  metadata: Record<string, unknown>;
};

export type PricingModel =
  | { type: "fixed"; amount: string; currency: string }
  | { type: "metered"; unitPrice: string; currency: string; unit: string }
  | { type: "tiered"; tiers: PricingTier[] };

export type ProofType = "tlsnotary" | "signed_receipt" | "api_response" | "custom";

export type CreateOfferInput = {
  serviceSchema: ServiceSchema;
  pricing: PricingModel;
  supply?: number | "unlimited";
  deliveryMode: "sync" | "async" | "scheduled";
  proofType: ProofType;
  settlementTerms: SettlementTerms;
  metadata?: Record<string, unknown>;
};
```

**权威层实现**（`market-core/handlers/offer-create.ts`）：

```typescript
// extensions/market-core/src/market/handlers/offer-create.ts

import type { ServiceOffer, CreateOfferInput, OfferStatus } from "../types";
import { validateOffer } from "../validators/offer.validator";
import { generateId } from "../utils/id";
import { store } from "../store";

export async function createOffer(
  providerId: string,
  input: CreateOfferInput,
): Promise<ServiceOffer> {
  // 1. 校验输入
  const validation = validateOffer(input);
  if (!validation.valid) {
    throw new Error(`Invalid offer: ${validation.errors.join(", ")}`);
  }

  // 2. 创建 Offer
  const offer: ServiceOffer = {
    id: generateId("offer"),
    providerId,
    serviceSchema: input.serviceSchema,
    pricing: input.pricing,
    supply: input.supply ?? "unlimited",
    deliveryMode: input.deliveryMode,
    proofType: input.proofType,
    settlementTerms: input.settlementTerms,
    status: "draft",
    metadata: input.metadata ?? {},
  };

  // 3. 持久化
  await store.offers.set(offer.id, offer);

  // 4. 记录审计
  await recordAudit({
    action: "offer.create",
    entityType: "offer",
    entityId: offer.id,
    operator: providerId,
    newValue: offer,
  });

  return offer;
}

export async function publishOffer(offerId: string): Promise<ServiceOffer> {
  const offer = await store.offers.get(offerId);
  if (!offer) {
    throw new Error(`Offer not found: ${offerId}`);
  }

  if (offer.status !== "draft" && offer.status !== "unpublished") {
    throw new Error(`Cannot publish offer in status: ${offer.status}`);
  }

  // 发布前检查
  await validatePublishReadiness(offer);

  offer.status = "published";
  offer.publishedAt = new Date().toISOString();

  await store.offers.set(offerId, offer);

  await recordAudit({
    action: "offer.publish",
    entityType: "offer",
    entityId: offerId,
    operator: offer.providerId,
    newValue: offer,
  });

  return offer;
}

async function validatePublishReadiness(offer: ServiceOffer): Promise<void> {
  // 1. 检查 Provider 身份验证
  const provider = await store.providers.get(offer.providerId);
  if (!provider?.verifiedAt) {
    throw new Error("Provider not verified");
  }

  // 2. 检查结算账户配置
  if (!provider.settlementAccount) {
    throw new Error("Provider settlement account not configured");
  }

  // 3. 检查服务 schema
  const schemaValid = await validateServiceSchema(offer.serviceSchema);
  if (!schemaValid) {
    throw new Error("Invalid service schema");
  }
}
```

**门面层实现**（`web3-core/market/handlers.ts`）：

```typescript
// extensions/web3-core/src/market/handlers.ts（追加）

import {
  createOffer as marketCreateOffer,
  publishOffer as marketPublishOffer,
} from "@openclaw/market-core";

// web3.market.offer.create
export async function handleOfferCreate(input: CreateOfferInput): Promise<ServiceOffer> {
  const providerId = await getCurrentProviderId();
  return marketCreateOffer(providerId, input);
}

// web3.market.offer.publish
export async function handleOfferPublish(offerId: string): Promise<ServiceOffer> {
  return marketPublishOffer(offerId);
}

// web3.market.offer.update
export async function handleOfferUpdate(
  offerId: string,
  updates: Partial<ServiceOffer>,
): Promise<ServiceOffer> {
  return marketUpdateOffer(offerId, updates);
}

// web3.market.offer.unpublish
export async function handleOfferUnpublish(offerId: string): Promise<ServiceOffer> {
  return marketUnpublishOffer(offerId);
}

// web3.market.offer.close
export async function handleOfferClose(offerId: string): Promise<ServiceOffer> {
  return marketCloseOffer(offerId);
}
```

**CLI 命令**（`src/commands/market-offer-create.ts`）：

```typescript
// src/commands/market-offer-create.ts

import { Command } from "commander";
import { callGateway } from "../gateway/call";
import { readFileSync } from "fs";

export const marketOfferCreateCommand = new Command("create")
  .description("Create a new service offer")
  .option("-f, --file <path>", "Offer definition file (JSON)")
  .option("--name <name>", "Service name")
  .option("--price <price>", "Price (e.g., 0.01)")
  .option("--currency <currency>", "Currency (e.g., USDC)", "USDC")
  .option("--supply <supply>", "Supply limit (or 'unlimited')", "unlimited")
  .action(async (options) => {
    let input: CreateOfferInput;

    if (options.file) {
      input = JSON.parse(readFileSync(options.file, "utf-8"));
    } else {
      // 交互式创建
      input = await interactiveCreateOffer(options);
    }

    const result = await callGateway("web3.market.offer.create", [input]);
    console.log(`Offer created: ${result.id}`);
    console.log(`Status: ${result.status}`);
    console.log(`Publish with: openclaw market offer publish ${result.id}`);
  });

async function interactiveCreateOffer(options: any): Promise<CreateOfferInput> {
  const inquirer = await import("inquirer");
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "Service name:",
      default: options.name,
    },
    {
      type: "input",
      name: "description",
      message: "Service description:",
    },
    {
      type: "list",
      name: "pricingType",
      message: "Pricing model:",
      choices: ["fixed", "metered"],
      default: "fixed",
    },
    {
      type: "input",
      name: "price",
      message: "Price:",
      default: options.price,
    },
    {
      type: "list",
      name: "deliveryMode",
      message: "Delivery mode:",
      choices: ["sync", "async", "scheduled"],
      default: "sync",
    },
    {
      type: "list",
      name: "proofType",
      message: "Proof type:",
      choices: ["tlsnotary", "signed_receipt", "api_response"],
      default: "tlsnotary",
    },
  ]);

  return buildCreateOfferInput(answers);
}
```

**验收标准**：

- [ ] `openclaw market offer create --file ./offer.json` 可创建 Offer
- [ ] `openclaw market offer publish <id>` 可发布 Offer
- [ ] 发布前自动校验 Provider 资质
- [ ] 敏感字段（endpoint、token）不泄露

---

### 2.2 Offer 编辑与生命周期管理

**新增方法**：

```typescript
// web3.market.offer.edit
export async function handleOfferEdit(
  offerId: string,
  updates: Partial<ServiceOffer>,
): Promise<ServiceOffer> {
  const offer = await store.offers.get(offerId);
  if (!offer) {
    throw new Error(`Offer not found: ${offerId}`);
  }

  // 编辑限制
  if (offer.status === "published") {
    // 已发布状态仅允许修改 supply 和 metadata
    const allowedKeys = ["supply", "metadata"];
    const invalidKeys = Object.keys(updates).filter((k) => !allowedKeys.includes(k));
    if (invalidKeys.length > 0) {
      throw new Error(
        `Cannot edit ${invalidKeys.join(", ")} in published status. ` +
          `Unpublish first to edit price or service schema.`,
      );
    }
  }

  Object.assign(offer, updates);
  await store.offers.set(offerId, offer);

  return offer;
}

// web3.market.offer.unpublish
export async function handleOfferUnpublish(offerId: string): Promise<ServiceOffer> {
  const offer = await store.offers.get(offerId);
  if (!offer || offer.status !== "published") {
    throw new Error(`Cannot unpublish offer in status: ${offer?.status}`);
  }

  offer.status = "unpublished";
  await store.offers.set(offerId, offer);

  return offer;
}

// web3.market.offer.close
export async function handleOfferClose(offerId: string): Promise<ServiceOffer> {
  const offer = await store.offers.get(offerId);
  if (!offer) {
    throw new Error(`Offer not found: ${offerId}`);
  }

  // 检查是否有未完成订单
  const activeOrders = await store.orders.query({
    offerId,
    status: ["pending", "confirmed", "delivering"],
  });

  if (activeOrders.length > 0) {
    console.warn(`Warning: ${activeOrders.length} active orders exist for this offer.`);
    // 需要确认
  }

  offer.status = "closed";
  offer.closedAt = new Date().toISOString();
  await store.offers.set(offerId, offer);

  return offer;
}
```

**CLI 命令**：

```bash
openclaw market offer edit <offer-id> --price 0.02
openclaw market offer unpublish <offer-id>
openclaw market offer close <offer-id>
```

---

### 2.3 首次上架向导

**目标**：引导新 Provider 完成首次上架流程

**CLI 实现**：

```typescript
// src/commands/market-onboard-provider.ts

export const marketOnboardProviderCommand = new Command("onboard-provider")
  .description("Guide new provider through first offer creation")
  .action(async () => {
    console.log("=== Provider Onboarding Wizard ===\n");

    const inquirer = await import("inquirer");

    // Step 1: 检查身份验证
    const identity = await checkProviderIdentity();
    if (!identity.verified) {
      console.log("Step 1: Verify your identity");
      await guideIdentityVerification();
    }

    // Step 2: 配置结算账户
    const settlement = await checkSettlementAccount();
    if (!settlement.configured) {
      console.log("Step 2: Configure settlement account");
      await guideSettlementSetup();
    }

    // Step 3: 创建第一个 Offer
    console.log("Step 3: Create your first offer");
    const offer = await guideCreateFirstOffer();

    // Step 4: 发布
    console.log("Step 4: Publish your offer");
    await publishOffer(offer.id);

    console.log("\n=== Onboarding Complete! ===");
    console.log(`Your offer is now live: ${offer.id}`);
  });

async function guideCreateFirstOffer(): Promise<ServiceOffer> {
  const inquirer = await import("inquirer");

  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "serviceType",
      message: "What type of service are you offering?",
      choices: [
        "Search (Web search, data retrieval)",
        "Data Enrichment (Data cleaning, annotation)",
        "Model Inference (LLM, image, audio)",
        "Automation (Scheduled tasks, batch processing)",
        "Code Review (Code audit, security scan)",
      ],
    },
    {
      type: "input",
      name: "serviceName",
      message: "Service name:",
    },
    {
      type: "input",
      name: "description",
      message: "Brief description:",
    },
    {
      type: "list",
      name: "pricingType",
      message: "Pricing model:",
      choices: [
        { name: "Fixed price per request", value: "fixed" },
        { name: "Metered (pay per unit)", value: "metered" },
      ],
    },
    {
      type: "input",
      name: "price",
      message: "Price (USDC):",
      default: "0.01",
    },
  ]);

  const input = buildCreateOfferInput(answers);
  return callGateway("web3.market.offer.create", [input]);
}
```

**验收标准**：

- [ ] 新 Provider 可在 30 分钟内完成首次上架
- [ ] 向导自动检查前置条件
- [ ] 每步都有清晰的指引

---

## 3. Week 5-6: Buyer 购买闭环成品化

### 3.1 服务浏览与发现

**新增方法**：

```typescript
// web3.market.browse
export async function handleMarketBrowse(filter?: BrowseFilter): Promise<ServiceListing[]> {
  const offers = await store.offers.query({
    status: "published",
    ...filter,
  });

  return offers.map((offer) => ({
    id: offer.id,
    name: offer.serviceSchema.name,
    description: offer.serviceSchema.description,
    provider: redactProvider(offer.providerId),
    pricing: offer.pricing,
    rating: calculateProviderRating(offer.providerId),
    deliveryMode: offer.deliveryMode,
    proofType: offer.proofType,
  }));
}

type BrowseFilter = {
  category?: ServiceCategory;
  maxPrice?: string;
  deliveryMode?: "sync" | "async" | "scheduled";
  sortBy?: "price" | "rating" | "popularity";
};

type ServiceListing = {
  id: string;
  name: string;
  description: string;
  provider: string; // 脱敏后的 provider ID
  pricing: PricingModel;
  rating: number;
  deliveryMode: string;
  proofType: string;
};
```

**CLI 命令**：

```bash
openclaw market browse
openclaw market browse --category search --sort price
openclaw market show <offer-id>
```

---

### 3.2 报价与下单

**新增方法**：

```typescript
// web3.market.offer.quote
export async function handleOfferQuote(offerId: string, quantity: number = 1): Promise<Quote> {
  const offer = await store.offers.get(offerId);
  if (!offer || offer.status !== "published") {
    throw new Error("Offer not available");
  }

  let totalAmount: string;
  if (offer.pricing.type === "fixed") {
    totalAmount = (parseFloat(offer.pricing.amount) * quantity).toString();
  } else if (offer.pricing.type === "metered") {
    throw new Error("Metered pricing requires usage estimation");
  } else {
    throw new Error("Unsupported pricing model");
  }

  return {
    offerId,
    quantity,
    unitPrice: offer.pricing.type === "fixed" ? offer.pricing.amount : offer.pricing.unitPrice,
    totalAmount,
    currency: offer.pricing.type === "fixed" ? offer.pricing.currency : offer.pricing.currency,
    estimatedDelivery: estimateDeliveryTime(offer.deliveryMode),
    validUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min
  };
}

// web3.market.order.create
export async function handleOrderCreate(input: CreateOrderInput): Promise<Order> {
  const offer = await store.offers.get(input.offerId);
  if (!offer || offer.status !== "published") {
    throw new Error("Offer not available");
  }

  // 下单前检查
  await validateOrderReadiness(input, offer);

  const order: Order = {
    id: generateId("order"),
    offerId: input.offerId,
    buyerId: await getCurrentBuyerId(),
    providerId: offer.providerId,
    quantity: input.quantity ?? 1,
    unitPrice: offer.pricing.type === "fixed" ? offer.pricing.amount : offer.pricing.unitPrice,
    totalAmount: calculateTotal(offer, input.quantity),
    currency: offer.pricing.type === "fixed" ? offer.pricing.currency : offer.pricing.currency,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  await store.orders.set(order.id, order);

  return order;
}

async function validateOrderReadiness(input: CreateOrderInput, offer: ServiceOffer): Promise<void> {
  // 1. 检查预算
  const budget = await getBudgetStatus();
  if (parseFloat(budget.remaining) < parseFloat(offer.pricing.amount)) {
    throw new Error(
      `Insufficient budget. Remaining: ${budget.remaining}, Required: ${offer.pricing.amount}`,
    );
  }

  // 2. 检查供给
  if (offer.supply !== "unlimited") {
    const sold = await countSoldOffers(offer.id);
    if (sold >= offer.supply) {
      throw new Error("Offer sold out");
    }
  }

  // 3. 检查授权限额
  const policy = await getWalletPolicy();
  if (parseFloat(offer.pricing.amount) > policy.maxSingleTransaction) {
    throw new Error(`Transaction exceeds single transaction limit: ${policy.maxSingleTransaction}`);
  }
}
```

---

### 3.3 订单状态跟踪

**新增方法**：

```typescript
// web3.market.order.get
export async function handleOrderGet(orderId: string): Promise<Order> {
  const order = await store.orders.get(orderId);
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }
  return order;
}

// web3.market.order.list
export async function handleOrderList(filter?: OrderFilter): Promise<Order[]> {
  return store.orders.query({
    buyerId: await getCurrentBuyerId(),
    ...filter,
  });
}

// web3.market.order.cancel
export async function handleOrderCancel(orderId: string, reason?: string): Promise<Order> {
  const order = await store.orders.get(orderId);
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // 取消规则
  if (order.status === "pending") {
    // pending 可自由取消
    order.status = "cancelled";
  } else if (order.status === "confirmed") {
    // confirmed 需要 Provider 同意
    throw new Error("Cannot cancel confirmed order without provider approval");
  } else {
    throw new Error(`Cannot cancel order in status: ${order.status}`);
  }

  await store.orders.set(orderId, order);

  // 触发退款（如果有预付款）
  if (order.paymentIntent) {
    await refundPayment(order.paymentIntent);
  }

  return order;
}
```

**CLI 命令**：

```bash
openclaw market order list
openclaw market order list --status pending
openclaw market order status <order-id>
openclaw market order cancel <order-id> --reason "..."
```

---

### 3.4 UI 视图实现

**服务浏览 UI**（`ui/src/ui/views/market-service-browse.ts`）：

```typescript
// ui/src/ui/views/market-service-browse.ts

import { useState, useEffect } from "react";
import { callGateway } from "../gateway/call";

export function MarketServiceBrowse() {
  const [services, setServices] = useState<ServiceListing[]>([]);
  const [filter, setFilter] = useState<BrowseFilter>({});

  useEffect(() => {
    loadServices();
  }, [filter]);

  async function loadServices() {
    const result = await callGateway("web3.market.browse", [filter]);
    setServices(result);
  }

  return (
    <div className="market-browse">
      <div className="filters">
        <select
          onChange={(e) => setFilter({ ...filter, category: e.target.value })}
        >
          <option value="">All Categories</option>
          <option value="search">Search</option>
          <option value="data">Data Enrichment</option>
          <option value="inference">Model Inference</option>
        </select>

        <select
          onChange={(e) => setFilter({ ...filter, sortBy: e.target.value })}
        >
          <option value="rating">Sort by Rating</option>
          <option value="price">Sort by Price</option>
          <option value="popularity">Sort by Popularity</option>
        </select>
      </div>

      <div className="service-list">
        {services.map((service) => (
          <ServiceCard key={service.id} service={service} />
        ))}
      </div>
    </div>
  );
}

function ServiceCard({ service }: { service: ServiceListing }) {
  return (
    <div className="service-card">
      <h3>{service.name}</h3>
      <p>{service.description}</p>
      <div className="meta">
        <span className="price">
          {service.pricing.type === "fixed"
            ? `${service.pricing.amount} ${service.pricing.currency}`
            : `${service.pricing.unitPrice}/${service.pricing.unit}`}
        </span>
        <span className="rating">★ {service.rating.toFixed(1)}</span>
      </div>
      <div className="tags">
        <span className="tag">{service.deliveryMode}</span>
        <span className="tag">{service.proofType}</span>
      </div>
      <button onClick={() => viewService(service.id)}>View Details</button>
    </div>
  );
}
```

**验收标准**：

- [ ] Buyer 可浏览服务列表
- [ ] 可查看服务详情、价格、供给方
- [ ] 可下单并查看订单状态
- [ ] 下单前显示预算影响

---

## 4. Week 7: Control 面成品化

### 4.1 Provider 管理

**新增方法**：

```typescript
// web3.market.provider.list
export async function handleProviderList(filter?: ProviderFilter): Promise<ProviderProfile[]> {
  const providers = await store.providers.query(filter);

  return providers.map((p) => ({
    id: p.id,
    name: p.name,
    did: p.did,
    status: p.status,
    stats: calculateProviderStats(p.id),
    verifiedAt: p.verifiedAt,
  }));
}

// web3.market.provider.suspend
export async function handleProviderSuspend(
  providerId: string,
  reason: string,
): Promise<ProviderProfile> {
  const provider = await store.providers.get(providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }

  provider.status = "suspended";
  provider.suspendedAt = new Date().toISOString();
  provider.suspensionReason = reason;

  await store.providers.set(providerId, provider);

  // 自动下架该 Provider 的所有 Offer
  const offers = await store.offers.query({ providerId, status: "published" });
  for (const offer of offers) {
    await unpublishOffer(offer.id);
  }

  // 记录审计
  await recordAudit({
    action: "provider.suspend",
    entityType: "provider",
    entityId: providerId,
    reason,
  });

  return provider;
}
```

---

### 4.2 风险与预算治理

**新增方法**：

```typescript
// web3.market.policy.get
export async function handlePolicyGet(): Promise<RiskPolicy> {
  const config = await loadConfig();
  return {
    maxDailySpend: config.web3?.maxDailySpend ?? "100",
    maxOrderAmount: config.web3?.maxOrderAmount ?? "50",
    autoAcceptEnabled: config.web3?.autoAcceptEnabled ?? false,
    autoDisputeThreshold: config.web3?.autoDisputeThreshold ?? 0.1,
    circuitBreaker: config.web3?.circuitBreaker ?? {
      failureRateThreshold: 0.5,
      minRequestsForEvaluation: 10,
      openDuration: 60000,
      halfOpenRequests: 3,
    },
  };
}

// web3.market.policy.update
export async function handlePolicyUpdate(updates: Partial<RiskPolicy>): Promise<RiskPolicy> {
  const current = await handlePolicyGet();
  const updated = { ...current, ...updates };

  // 验证
  if (parseFloat(updated.maxDailySpend) < 0) {
    throw new Error("maxDailySpend must be non-negative");
  }

  await saveConfig({ web3: updated });

  // 记录审计
  await recordAudit({
    action: "policy.update",
    entityType: "policy",
    oldValue: current,
    newValue: updated,
  });

  return updated;
}
```

---

### 4.3 审计日志查询

**新增方法**：

```typescript
// web3.market.audit.query
export async function handleAuditQuery(filter?: AuditFilter): Promise<AuditLog[]> {
  return store.audit.query({
    ...filter,
    limit: filter?.limit ?? 100,
    offset: filter?.offset ?? 0,
  });
}

type AuditFilter = {
  entityType?: "order" | "offer" | "dispute" | "provider" | "policy";
  entityId?: string;
  operator?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};
```

---

### 4.4 健康探针

**新增方法**：

```typescript
// web3.market.health.check
export async function handleHealthCheck(): Promise<HealthStatus> {
  const probes: HealthProbe[] = [];

  // 1. 数据库健康
  try {
    await store.healthCheck();
    probes.push({ component: "database", status: "healthy", lastCheck: new Date().toISOString() });
  } catch (e) {
    probes.push({
      component: "database",
      status: "unhealthy",
      lastCheck: new Date().toISOString(),
      details: { error: e.message },
    });
  }

  // 2. Gateway 健康
  try {
    await callGateway("web3.status", []);
    probes.push({ component: "gateway", status: "healthy", lastCheck: new Date().toISOString() });
  } catch (e) {
    probes.push({ component: "gateway", status: "unhealthy", lastCheck: new Date().toISOString() });
  }

  // 3. 区块链连接
  try {
    await checkBlockchainConnection();
    probes.push({
      component: "blockchain",
      status: "healthy",
      lastCheck: new Date().toISOString(),
    });
  } catch (e) {
    probes.push({
      component: "blockchain",
      status: "degraded",
      lastCheck: new Date().toISOString(),
    });
  }

  const overall = probes.every((p) => p.status === "healthy")
    ? "healthy"
    : probes.some((p) => p.status === "unhealthy")
      ? "unhealthy"
      : "degraded";

  return { overall, probes };
}
```

---

## 5. Week 8: 契约统一与发布口径收敛

### 5.1 Capability Stability 统一

**目标**：为所有 `web3.*` 方法添加稳定性标记

**实施**：

```typescript
// extensions/web3-core/src/capabilities/catalog/market.ts

export const marketCapabilities: CapabilityDescriptor[] = [
  {
    method: "web3.market.offer.create",
    namespace: "market",
    summary: "Create a new service offer",
    description: "Create a new service offer as a provider",
    stability: "beta",
    prerequisites: ["web3.market.enabled", "provider.verified"],
    parameters: [{ name: "input", type: "CreateOfferInput", required: true }],
    returns: { type: "ServiceOffer" },
    errors: [
      { code: "INVALID_INPUT", description: "Invalid offer input" },
      { code: "UNAUTHORIZED", description: "Not authorized as provider" },
    ],
    since: "2026.03",
  },
  {
    method: "web3.market.offer.publish",
    stability: "beta",
    // ...
  },
  {
    method: "web3.market.browse",
    stability: "stable",
    // ...
  },
  {
    method: "web3.market.order.create",
    stability: "beta",
    // ...
  },
  // ... 其他方法
];

type StabilityLevel = "stable" | "beta" | "experimental" | "deprecated";
```

---

### 5.2 Catalog Schema 完整化

**目标**：确保 100% 方法有完整 descriptor

**验证脚本**：

```bash
# scripts/validate-catalog.sh

#!/bin/bash

echo "Validating catalog completeness..."

# 获取所有注册的 gateway methods
REGISTERED=$(openclaw catalog list --json | jq -r '.[].method')

# 获取所有 catalog 条目
CATALOGED=$(cat extensions/web3-core/src/capabilities/catalog/*.ts | grep -oP 'method: "\K[^"]+' | sort)

# 检查差异
MISSING=$(comm -23 <(echo "$REGISTERED" | sort) <(echo "$CATALOGED"))

if [ -z "$MISSING" ]; then
  echo "✅ All methods have catalog entries"
else
  echo "❌ Missing catalog entries for:"
  echo "$MISSING"
  exit 1
fi

# 检查幽灵条目
GHOST=$(comm -13 <(echo "$REGISTERED" | sort) <(echo "$CATALOGED"))

if [ -z "$GHOST" ]; then
  echo "✅ No ghost catalog entries"
else
  echo "❌ Ghost catalog entries (not registered):"
  echo "$GHOST"
  exit 1
fi
```

---

### 5.3 UI/Command 文案统一

**术语表**：

| 英文       | 中文       | 说明                |
| ---------- | ---------- | ------------------- |
| Offer      | 服务报价   | Provider 发布的服务 |
| Order      | 订单       | Buyer 的购买记录    |
| Provider   | 服务提供方 | 提供 Offer 的一方   |
| Buyer      | 服务购买方 | 购买 Offer 的一方   |
| Settlement | 结算       | 资金划转            |
| Proof      | 交付证明   | 服务执行的证明      |
| Lease      | 租约       | 资源访问授权        |
| Consent    | 隐私授权   | 数据使用授权        |

---

## 6. Week 9: 集成测试与文档完善

### 6.1 端到端测试场景

**测试场景清单**：

| 场景                  | 步骤                          | 验证点       |
| --------------------- | ----------------------------- | ------------ |
| Provider 完整上架流程 | 创建 → 编辑 → 发布 → 下架     | 状态转换正确 |
| Buyer 完整购买流程    | 浏览 → 下单 → 支付 → 验收     | 订单状态正确 |
| 争议流程              | 下单 → 拒绝 → 发起争议 → 裁决 | 资金正确分配 |
| 预算约束              | 超预算下单                    | 拒绝并提示   |
| 熔断触发              | 连续失败                      | 自动禁用     |
| 回滚演练              | 执行回滚                      | 服务恢复     |

---

### 6.2 文档完善

| 文档              | 说明              | 状态   |
| ----------------- | ----------------- | ------ |
| Provider 快速入门 | 5 分钟上架指南    | 待写   |
| Buyer 快速入门    | 5 分钟购买指南    | 待写   |
| API 参考          | 所有 web3.\* 方法 | 待完善 |
| 运维手册          | 部署、监控、排障  | 待完善 |

---

## 7. 执行清单汇总

### 7.1 新增文件清单

```
scripts/
├── rollback-web3-market.sh       # 回滚脚本
└── kill-switch-web3-market.sh    # 熔断脚本

docs/web3/
├── ROLLBACK_DRILL_TEMPLATE.md    # 回滚演练模板
├── ROLLBACK_CHECKLIST.md         # 回滚检查清单
├── RELEASE_NOTES_TEMPLATE.md     # 发布说明模板
├── BETA_FAQ.md                   # Beta FAQ
├── RISK_DISCLOSURE.md            # 风险披露
└── KILL_SWITCH_GUIDE.md          # 熔断指南

extensions/market-core/src/market/
├── handlers/
│   ├── offer-create.ts           # Offer 创建权威层
│   ├── acceptance.ts             # 验收权威层
│   ├── execution.ts              # 执行状态查询
│   └── provider.ts               # Provider 管理
└── validators/
    └── offer.validator.ts        # Offer 校验

extensions/web3-core/src/market/
└── handlers/
    └── offer-facade.ts           # Offer 门面层

src/commands/
├── market-offer-create.ts        # CLI: 创建 Offer
├── market-offer-edit.ts          # CLI: 编辑 Offer
├── market-order-create.ts        # CLI: 创建订单
└── market-onboard-provider.ts    # CLI: Provider 上架向导

ui/src/ui/
├── views/
│   ├── market-offer-create.tsx   # UI: 创建 Offer
│   ├── market-service-browse.tsx # UI: 浏览服务
│   ├── market-order-detail.tsx   # UI: 订单详情
│   └── market-control-panel.tsx  # UI: 控制面
└── controllers/
    └── market-controllers.ts     # 市场数据控制器
```

### 7.2 修改文件清单

```
extensions/market-core/src/market/types.ts        # 补充 OfferStatus 等类型
extensions/web3-core/src/market/handlers.ts       # 追加门面方法
extensions/web3-core/src/index.ts                 # 注册新方法
extensions/web3-core/src/capabilities/catalog/    # 补充 descriptor
ui/src/ui/tab-registry.ts                         # 注册新 Tab（追加模式）
ui/src/ui/types-web3.ts                           # 补充 UI 类型
```

### 7.3 门禁清单

| 门禁           | 验证方式                        | 完成标准     |
| -------------- | ------------------------------- | ------------ |
| 敏感信息零泄露 | grep -r "accessToken\|endpoint" | 无泄露       |
| 状态机合法     | 单元测试                        | 覆盖率 > 80% |
| API 契约一致   | catalog validate                | 100% 覆盖    |
| 回滚演练可执行 | 实际演练                        | 记录完整     |
| 发布说明完整   | 评审                            | 无遗漏       |

---

## 8. 时间表

| 周次     | 工作内容          | 产出                            |
| -------- | ----------------- | ------------------------------- |
| Week 1-2 | P0 阻断项         | 回滚脚本、发布说明、kill switch |
| Week 3-4 | Provider 上架闭环 | CLI/UI 创建 Offer 流程          |
| Week 5-6 | Buyer 购买闭环    | CLI/UI 购买流程                 |
| Week 7   | Control 面成品化  | 运营后台 UI                     |
| Week 8   | 契约统一          | Catalog 100% 覆盖               |
| Week 9   | 集成测试          | E2E 测试通过                    |

---

## 附录 A：关键约束

### A.1 敏感信息保护（不可违反）

```typescript
// ❌ 错误：暴露 endpoint
return { ...offer, endpoint: provider.endpoint };

// ✅ 正确：脱敏或不返回
return { ...offer, provider: redactProvider(offer.providerId) };
```

### A.2 状态机约束

```
Offer: draft -> published -> unpublished -> closed
Order: pending -> confirmed -> delivering -> delivered -> accepted -> completed
                    \-> cancelled
       delivered -> rejected -> disputed
```

### A.3 审计约束

所有写操作必须记录审计日志：

- 创建、更新、删除
- 状态变更
- 策略修改
- Provider 禁用

---

## 附录 B：参考文档

- `WEB3_FINAL_PRODUCT_SPEC.md` - 完整产品规格
- `WEB3_IMPLEMENTATION_STATUS.md` - 实现状态追踪
- `WEB3_FRONTIER_RESEARCH_REPORT.md` - 前沿调研
- `WEB3_ARCHITECTURE_AUDIT_2026_03.md` - 架构审计
- `SKILL.md` - Skill 执行规范
