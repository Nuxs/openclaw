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

## 6) 本地检查（建议）

- `pnpm install`
- `pnpm build`
- `pnpm test`

（合流后优先跑一遍测试，尤其是 gateway 相关 e2e。）
