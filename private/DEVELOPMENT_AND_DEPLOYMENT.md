# 私有化 Fork：开发与部署（Overlay-first）

本文面向维护本仓库 `main`（私有化 fork）并定期同步 `upstream/main` 的同学。

核心目标：**把私有化差异收敛在 `private/` 与插件层**，让同步上游时冲突最小、可预测、可重复。

## 目录结构（你需要记住的 4 个入口）

- `private/scripts/sync-upstream.sh`: 同步上游（`upstream/main` 或某个 tag）到当前分支。
- `private/scripts/predict-conflicts.sh`: 同步前只读预测冲突文件，并按“品牌相关/非品牌”分组。
- `private/scripts/deploy.sh`: 统一部署入口（AnyDev / Docker / K8s / Systemd）。
- `private/brand.json`: 品牌配置（UI 等运行时读取；尽量不要通过脚本批量改写 `src/`）。

## 约定与原则（强烈建议遵守）

- **Overlay-first**：私有化差异优先放到 `private/`（部署、品牌资产、chart、systemd unit、脚本）与插件。
- **Plugin-first**：业务差异优先做成插件/扩展，不要把私有逻辑堆进 `src/` 的“上游热文件”。
- **Secrets never in Git**：机密只能来自：
  - `private/env/*.env.local`（本地文件，已在 `.gitignore` 忽略），或
  - CI/K8s Secret 注入。
- **减少“改源码品牌化”**：Control UI / Canvas 标题 / 第三方请求头等品牌展示，统一走运行时解析（见下文）。

---

## 1) 上游同步（合流）

### 初始化 upstream remote（只需一次）

脚本会自动提示添加 upstream：

- `git remote add upstream https://github.com/openclaw/openclaw.git`

### 同步前：预测冲突

- `bash private/scripts/predict-conflicts.sh`  
  默认比较 `HEAD` vs `upstream/main`，输出预计冲突文件列表，并区分“品牌相关”。

### 同步：merge（默认）或 rebase

- `bash private/scripts/sync-upstream.sh`
- `bash private/scripts/sync-upstream.sh --rebase`

注意：脚本要求工作区干净，且不会自动 stash（multi-agent 安全）。

---

## 2) 品牌化（推荐：运行时；脚本只做 apps 层）

### 推荐做法：修改 `private/brand.json`

- Control UI 会读取 `private/brand.json`（可选文件，不存在会回退到默认 `OpenClaw`）。
- Canvas Host 默认页面标题与部分第三方请求头，会通过 `src/infra/brand.ts` 统一解析品牌名。

### `apply-brand.sh` 的定位

- `bash private/scripts/apply-brand.sh --scope apps`（默认）
  - 仅做 `apps/` 层品牌化（Info.plist / bundleId / Android appName 等）。
- `--scope src` 已弃用：为了减少与上游冲突，脚本不再改写 `src/*`。

---

## 3) 环境变量与密钥管理（重点）

### 文件约定

- `private/env/dev.env` / `private/env/staging.env` / `private/env/prod.env`：
  - **可提交**（只能放非机密默认值与示例占位）。
- `private/env/<env>.env.local`：
  - **禁止提交**（`.gitignore` 已忽略）
  - 用于本地/机器级别注入 token、API keys 等机密。

### 优先级

部署脚本会按以下优先级加载：

- 显式传入的环境变量 > `<env>.env.local` > `<env>.env`

---

## 4) 部署

### Windows 原生（PowerShell）

新增入口：`private/scripts/windows-dev.ps1`

适用目标：**Windows 原生开发/调试**，同时保持官方默认 CLI / Gateway / workspace 架构，不改默认路径布局。

前提：**这是一份仓库内脚本**。使用它之前，你需要先把私有仓库 clone 到本地并进入仓库目录；它负责的是 clone 之后的 bootstrap / build / gateway / docker 流程，不负责自动 clone 仓库。

推荐分两阶段使用：

0. **阶段 0：先 clone 仓库**
   - `git clone <your-private-repo-url>`
   - `cd openclaw`
1. **阶段 1：在仓库内执行脚本**
   - 先 `init-template`（可选但推荐）
   - 再 `bootstrap`

典型用法：

- 初始化开发环境：
  - `powershell -File private/scripts/windows-dev.ps1 -Action bootstrap -Environment dev`
- 安装 Windows 托管启动（官方 `openclaw gateway install`）：
  - `powershell -File private/scripts/windows-dev.ps1 -Action gateway-install -Environment dev`
- 在当前终端直接启动 Gateway：
  - `powershell -File private/scripts/windows-dev.ps1 -Action gateway-run -Environment dev`
- Docker Compose 部署：
  - `powershell -File private/scripts/windows-dev.ps1 -Action docker-up -Environment dev`
- 查看状态：
  - `powershell -File private/scripts/windows-dev.ps1 -Action status -Environment dev`

模板工作流（推荐给公司内部同事）：

1. 运行 `init-template` 生成 `private/windows-dev.local.psd1`：
   - `powershell -File private/scripts/windows-dev.ps1 -Action init-template`
2. 编辑其中的：
   - `Repository.OriginUrl`：你们私有仓库地址（用于 bootstrap 时校验 origin）。
   - `Branding.Json`：品牌名、镜像仓库、域名、端口等。
   - `EnvironmentDefaults.<env>`：本地 `.env.local` 默认值（模型 Key / 镜像 / Web3 常用变量等）。
   - `OpenClawConfig.Root`：要种入官方 `~/.openclaw/openclaw.json` 的缺省配置。
3. 再执行 `bootstrap`。脚本会：
   - 继续复用官方 `pnpm install` / `pnpm build` / `openclaw setup` / `openclaw doctor`；
   - 只在缺失时补齐 `openclaw.json` 配置，不覆盖开发者已经存在的值；
   - 默认把 `web3-core` / `market-core` 的启用与基础配置写到官方 `plugins.entries.*` 路径下；
   - 按需把 `Branding.Json` overlay 到 `private/brand.json`（当 `Branding.ApplyOnBootstrap=true`）。

说明：

- 脚本会优先复用**官方默认命令**：`pnpm install`、`pnpm ui:build`、`pnpm build`、`openclaw setup`、`openclaw doctor`、`openclaw gateway install`。
- 脚本会按私有化约定创建/加载 `private/env/<env>.env.local`，但**不会**改动官方默认目录布局；若不显式覆盖，state 仍走官方默认 `USERPROFILE/.openclaw` 逻辑。
- 若存在 `private/windows-dev.local.psd1`（或显式传 `-PresetFile`），脚本会读取公司内模板，把缺失的 env 默认值补进 `.env.local`，并把缺失的 Web3 / Market 缺省配置种到官方 `~/.openclaw/openclaw.json` 的 `plugins.entries.*` 路径下。
- 脚本**不会**执行 `filter-extensions.sh`，因此会保留官方全部 workspace 包，同时保留私有 Web3 扩展（如 `web3-core` / `market-core`）。
- Windows 原生入口主要覆盖 `bootstrap` / 本地 Gateway / Docker Compose；`AnyDev`、`bare`、`k8s` 仍继续使用现有 `private/scripts/deploy.sh`。

### A) AnyDev / 开发机（推荐本地跑通用）

- `bash private/scripts/deploy.sh anydev dev`

说明：

- 脚本会用 `scripts/anydev-setup.sh` 初始化 `/data` 的持久化环境。
- `OPENCLAW_STATE_DIR` 默认 `/data/.openclaw`（可通过 env 覆盖）。
- 非 loopback 暴露必须设置 `OPENCLAW_GATEWAY_TOKEN` 或 `OPENCLAW_GATEWAY_PASSWORD`。

一键生成 token（写入 `prod.env.local`）：

- `bash private/scripts/onekey-anydev-prod.sh`

### B) Docker Compose

- `bash private/scripts/deploy.sh docker dev`

说明：

- Compose 会读取：`private/env/<env>.env` + `private/env/<env>.env.local`。
- 若 `.env.local` 不存在，脚本会创建一个空文件，避免 compose 报错。

### C) Kubernetes（Helm）

只做 Helm apply：

- `bash private/scripts/deploy.sh k8s staging`

一键 build+push+helm：

- `bash private/scripts/deploy.sh k8s-onekey prod`

建议：生产机密用 `existingSecret` 或 CI 注入，不要写入 values。

### D) 裸机 Systemd

- `bash private/scripts/deploy.sh bare prod`

说明：

- 会优先安装 `private/env/<env>.env.local`（若存在），否则使用 `<env>.env`。

---

## 5) 扩展/插件开发（建议路径）

- 私有插件模板：`private/plugins/example-plugin`
- 推荐做法：把私有功能做成插件，通过配置启用；避免改 `src/` 核心路径。

---

## 6) 私有化 Web Search 文档约定（SearxNG / 私有重排）

- 私有搜索能力（如 `searxng` provider、自建 rerank 服务）文档只放在 `private/` 下，不进入 `docs/tools/web.md`。
- 官方文档 `docs/tools/web.md` 仅保留 upstream 通用能力，合流冲突时优先保留 upstream 版本。
- 私有配置示例建议写在本文件或 `private/PRIVATE_FORK_PLAYBOOK.md`，并在代码错误提示中使用私有文档链接（不要改官方 docs 链接）。

建议私有配置示例（仅 fork 使用）：

```json5
{
  tools: {
    web: {
      search: {
        provider: "searxng",
        searxng: {
          baseUrl: "http://search.example.com:8080",
          apiKey: "optional-token",
          rerank: {
            mode: "auto",
            endpoint: "http://127.0.0.1:8899/rerank",
            timeoutSeconds: 1,
            maxCandidates: 20,
            maxLength: 256,
          },
        },
      },
    },
  },
}
```

---

## 7) 本地检查（建议）

- `pnpm install`
- `pnpm build`
- `pnpm test`

（合流后优先跑一遍测试，尤其是 gateway 相关 e2e。）
