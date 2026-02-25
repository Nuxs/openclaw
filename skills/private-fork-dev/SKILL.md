---
name: private-fork-dev
description: 维护 OpenClaw 私有化 fork（overlay-first），降低与 upstream/main 的长期合流成本。
---

# private-fork-dev

## 适用场景（Trigger）

当你在维护一个**私有化 fork**（当前仓库 `main`）并且需要周期性同步 `upstream/main` 时使用本 Skill，尤其是：

- 合流冲突集中在“上游热文件”（入口/编排/注册表/协议/构建脚本）。
- 私有化需求包含：品牌化、部署脚本、裁剪扩展、环境变量/密钥注入。
- 你希望把私有化差异收敛为 overlay/插件，而不是长期堆在 `src/`。

## 核心原则（Principles）

- **Overlay-first**：私有化差异优先落在 `private/`（部署、brand、helm、systemd、脚本）。
- **Plugin-first**：业务差异优先做成插件/扩展；避免改 `src/` 的“合并磁铁”文件。
- **Secrets never in Git**：机密只允许：`private/env/*.env.local` 或 CI/K8s Secret 注入。
- **上游优先**：凡是通用修复（测试稳定性、错误处理、hook 能力点）优先做成上游可接受的 PR。

## 推荐工作流（Workflow）

### 1) 同步上游前先预测冲突

- `bash private/scripts/predict-conflicts.sh`

输出会按“品牌相关/非品牌”分组。优先把“品牌相关”继续迁移到运行时（减少改源码）。

### 2) 同步上游（merge 或 rebase）

- `bash private/scripts/sync-upstream.sh`（默认 merge）
- `bash private/scripts/sync-upstream.sh --rebase`

注意：脚本要求工作区干净，且不会自动 stash（multi-agent 安全）。

### 3) 私有化品牌化

- 运行时品牌（推荐）：修改 `private/brand.json`。
- `apply-brand.sh` 只负责 `apps/` 层品牌化（`--scope apps`）。
- 避免用脚本批量改写 `src/`（这是长期冲突热点）。

### 4) 环境变量与密钥

- 模板文件（可提交）：`private/env/dev.env` / `staging.env` / `prod.env`
- 机密文件（禁止提交）：`private/env/<env>.env.local`

优先级：显式传入 env > `.env.local` > `.env`

### 5) 部署

统一入口：`bash private/scripts/deploy.sh <target> <env>`

- AnyDev：`deploy.sh anydev dev`
- Docker：`deploy.sh docker dev`
- K8s：`deploy.sh k8s staging` 或 `deploy.sh k8s-onekey prod`
- 裸机：`deploy.sh bare prod`

### 6) 合流后的最低验证

- `pnpm install`
- `pnpm build`
- `pnpm test`

### 7) 更新 Skill 后的同步（仅当你改了 `skills/*`）

- `bash scripts/sync-codebuddy.sh`

---

## 常见踩坑（Pitfalls）

- **把 token 写进 `private/env/prod.env` 并提交**：禁止。请用 `prod.env.local` 或 Secret。
- **品牌化通过改 `src/`**：会导致每次合流都冲突；优先改运行时品牌入口。
- **提交 `pnpm-workspace.yaml` 的裁剪改动**：除非你非常确定，否则不要把“裁剪 workspace 包”的变更进主线。
