## OpenClaw 私有化 Fork Playbook（支持上游提 PR）

> 适用：你们当前的 `main`/`origin/main` 就是私有化 fork，并通过 `private/scripts/sync-upstream.sh` 同步上游。
>
> 目标：既能 **快速吸收 upstream/main**，又能 **长期私有化**，并且把“可上游化”的变更持续以 PR 形式回馈上游（降低未来合流成本）。

---

## 0. 一句话原则（团队共识）

- **默认插件化**：私有能力优先落到 `extensions/*`、`private/plugins/*`、`skills/*`。
- **必要才改核心**：必须改核心热点文件时，使用 **Overlay Hooks/patch-overlay**，把差异压缩到 **`import` + 1–3 行 hook 调用**。
- **能上游就上游**：只要不涉及机密、品牌、私有协议/集成，就拆 PR 回 upstream（让补丁栈越来越薄）。

---

## 1. 两层策略（最优默认架构）

### 1.1 Layer A：Extension/Skill-first（零合流成本层）

**适合承载**：

- 新 Provider / 新 Channel / 新 Tool / 新 Command
- 私有模型网关/路由、企业认证适配、审计日志
- 私有业务能力（Web3/Market 这类也优先在扩展内部做）
- Prompt/流程/最佳实践（优先用 `skills/*`）

**约束**：

- 任何跨边界依赖优先走包名（`@openclaw/*` 或官方 SDK/插件机制），避免相对路径跨包耦合。

### 1.2 Layer B：Overlay Hooks（冲突面压缩层）

**适合承载**：

- 上游热点文件（merge magnets）里“必须”插入私有逻辑的场景
- 需要改变入口编排/注册表的场景（但只允许薄改）

**硬约束**：

- 热点文件中只允许：
  - +1 `import`（引入 overlay/hook 模块）
  - +1–3 行 hook 调用/`spread`/re-export
- 私有实现必须在新文件/叶子模块中完成（`private/*`、`src/**/private-*`、`extensions/**` 内部模块）。

**参考（你们仓库已有实践）**：

- `overlay-hooks.mdc` 与 `upstream-sync-conflict-prevention.mdc` 的规范
- web_search 的 `private-hooks + private/*` 结构（标准范式）

---

## 2. “允许提 PR”如何融入：Upstream-first 分层策略

把任何改动按 4 类分流：

### 2.1 必须上游（Upstream PR）

**特征**：

- 修复通用 bug / 提升测试稳定性（hermetic、避免 flaky）
- 增加通用 hook/扩展点（让私有能力能插件化落地）
- 修正错误提示/诊断（提高可维护性）

**要求**：

- PR 内容必须去品牌化/去私有化（不引入 `private/`、不依赖私有环境）
- 只保留“通用可接受”的抽象：例如 runtime caps、接口注入点、可选依赖探测。

### 2.2 可尝试上游（Upstream PR optional）

**特征**：

- 兼容更多运行时/环境差异（例如缺少某内置能力时 graceful error）
- 更好的默认行为/安全默认

**策略**：

- 先拆成“更小、更中性”的 PR（例如只做延迟 require + 更明确错误），
- 把“私有需求强相关”的 fallback/降级留在 fork。

### 2.3 必须私有（Private only）

**特征**：

- 品牌/发行版差异（名称、资源、UI 标题、默认域名）
- 机密、内部系统、企业专属协议
- 仅你们部署环境才需要的行为（例如 AnyDev 目录、内网镜像）

**落点**：

- 全部放在 `private/` 或私有插件/扩展，不进 `src/` 热点文件。

### 2.4 先私有后上游（Graduation path）

**特征**：

- 初期快速交付，但未来可能抽象成通用 hook

**策略**：

- 先在 fork 用 overlay hooks 实现
- 稳定后把 hook 抽象 PR 给 upstream
- upstream 合入后，fork 删除对应差异（补丁栈变薄）

---

## 3. 分支与同步模型（你们当前脚本为中心）

### 3.1 Remote 约定

建议固定：

- `origin`：你们私有化 fork
- `upstream`：官方 OpenClaw

### 3.2 同步机制（建议默认）

- 日常同步：使用 `private/scripts/sync-upstream.sh`（merge 或 rebase 均可，但团队必须统一）
- 同步前：运行 `private/scripts/predict-conflicts.sh` 只读预测冲突
- 同步后：必须跑 `pnpm test`（或至少跑变更相关的测试集）

### 3.3 建议的“同步节奏”

- **固定节奏**：每周 2–3 次同步（或每日同步但只在固定窗口合入主线）
- **同步 PR 禁止夹带功能开发**：同步只做 sync + 冲突解决 + 必要的缩面重构（把冲突压回 import/hook）

---

## 4. 冲突最小化：文件分级与工程约束

你们仓库已有规则文件（强烈建议团队统一遵守）：

- `.codebuddy/rules/upstream-sync-conflict-prevention.mdc`
- `.codebuddy/rules/overlay-hooks.mdc`
- `.codebuddy/rules/private-fork.mdc`

### 4.1 合并磁铁（Merge Magnets）处理方式

- 只允许“追加式”变更（文件末尾追加 import/registry item），禁止在中间插入大段逻辑
- 若必须改中间逻辑：先拆出叶子模块，再在原文件留 1 行调用

### 4.2 典型“最小改动模板”

- `src/*` 热点文件：
  - `import { executePrivateX } from "./private-hooks.js";`
  - `const overridden = maybeExecutePrivateX(...);`

---

## 5. 品牌化：只做运行时注入（降低与 upstream 冲突）

### 5.1 运行时品牌输入

- `private/brand.json`：作为品牌数据源
- `src/infra/brand.ts`：作为统一品牌解析入口（避免散落硬编码）

### 5.2 退役脚本改写 `src/`

- `private/scripts/apply-brand.sh` 仅允许操作 `apps/` 层（BundleId/appName 等）
- `src/` 范围的品牌文本必须走运行时（否则同步时必冲突）

---

## 6. 机密与环境变量：env.local + Secret 注入（必须）

### 6.1 文件约定

- `private/env/<env>.env`：可提交（非机密默认值/模板）
- `private/env/<env>.env.local`：本地/环境专属（机密），必须被 `.gitignore` 忽略

### 6.2 加载优先级

- **显式环境变量 > `<env>.env.local` > `<env>.env`**

### 6.3 部署侧要求

- Docker Compose：同时加载 `.env` + `.env.local`
- K8s：优先 `existingSecret` / `envFrom` 注入
- systemd：`/etc/openclaw/.env` 建议安装 `.env.local`（如果存在）

---

## 7. 扩展裁剪：不要把 workspace 根文件改动当常态

- `private/scripts/filter-extensions.sh` 默认必须是 dry-run
- 只有临时场景才 `--apply/--write`，且建议不要把 `pnpm-workspace.yaml` 的裁剪结果提交到主线

更优替代：

- 在 CI/打包阶段使用 `pnpm --filter ...` 控制构建范围
- 发布镜像只复制必要产物（而不是从源码层面删 workspace 包）

---

## 8. 测试与环境差异（对上游 PR 尤其重要）

- 测试必须 hermetic：不要依赖开发机/CI 的 `OPENCLAW_HOME`、`OPENCLAW_STATE_DIR` 等全局变量
- 对可选能力（例如某些运行时内置模块）
  - upstream：优先做“延迟加载 + 更明确错误”
  - fork：允许做“降级/fallback”，但要可观测（warn + 指导配置）

---

## 9. PR 规范（你们向 upstream 提 PR 时的落地流程）

### 9.1 拆 PR 原则（让 upstream 更容易收）

- 一个 PR 只解决一个主题：
  - 例如“测试 hermetic”是一个 PR；“引入 hook 抽象”是另一个 PR
- 先发小 PR：只引入 hook/接口，不引入私有实现
- 私有实现保持在 fork（或私有插件）

### 9.2 提 PR 的“可接受性检查”

- [ ] 没有 `private/` 依赖
- [ ] 没有品牌化字符串/私有域名
- [ ] 没有机密/内部系统
- [ ] 对默认用户无破坏（向后兼容，必要时仅新增配置项）
- [ ] 测试可复现，且在干净环境可通过

### 9.3 提 PR 的“维护性检查”

- [ ] 改动是否降低未来冲突（更少 diff、更薄入口）
- [ ] 是否把“我们必须的差异”转换成通用 hook（让 fork 变薄）

---

## 10. 规划落实（你后续让我按文档执行时的任务清单）

> 你确认后，我们按以下顺序逐项落地（每项都尽量做成小 PR/小提交，便于回滚与审查）。

### 10.1 基础配置（一次性）

- **remote 标准化**：确保存在 `upstream` remote，并在脚本中固定使用（`private/scripts/sync-upstream.sh` 会自动补齐）。
- **上游锁定点（pin）**：
  - **权威来源**：`private/upstream-pin.json`
  - **审阅摘要**：`private/upstream-pin.md`（由脚本生成，禁止手改）
  - **生成/校验**：`node --import tsx private/scripts/write-upstream-pin.ts`（CI 用 `--check`；需要严格校验时加 `--require-head`）
- **同步后自动写 pin**：同步成功后会自动写入 pin，并把 `predict-conflicts.sh --json` 的结果写入 `conflicts.predicted`，用于回溯本次同步的冲突面。
- **CI 强制**：启用 `.github/workflows/private-fork-governance.yml`，在 fork 仓库中强制 `pnpm check` + pin 文件一致性校验（上游仓库自动跳过）。

### 10.2 冲突缩面改造（持续）

- 逐个识别 merge magnet 文件，把私有逻辑抽到叶子模块
- 热点文件只保留 import + hook/spread/re-export

### 10.3 Upstream-first：把通用修复拆 PR 回 upstream（持续）

- 把“测试 hermetic / 更可诊断的失败 / 通用 hook”优先 PR 上游
- 上游合入后，从 fork 删除对应差异

### 10.4 部署与密钥（强制）

- 统一 `.env` + `.env.local` 机制
- 确保 `prod` 机密不入库，改为 Secret/CI 注入

### 10.5 发布/裁剪（优化）

- 将扩展裁剪从“修改 workspace 文件”迁移到“构建/打包阶段过滤”

---

## 11. 附：相关入口（你们仓库现状）

- 同步脚本：`private/scripts/sync-upstream.sh`
- 冲突预测：`private/scripts/predict-conflicts.sh`（`--json` 供脚本/CI 消费）
- pin 生成器：`private/scripts/write-upstream-pin.ts`
- pin 产物：`private/upstream-pin.json`（权威） + `private/upstream-pin.md`（摘要）
- fork 治理 CI：`.github/workflows/private-fork-governance.yml`
- 品牌输入：`private/brand.json`
- 品牌解析入口：`src/infra/brand.ts`
- 规则文件：
  - `.codebuddy/rules/upstream-sync-conflict-prevention.mdc`
  - `.codebuddy/rules/overlay-hooks.mdc`
  - `.codebuddy/rules/private-fork.mdc`
