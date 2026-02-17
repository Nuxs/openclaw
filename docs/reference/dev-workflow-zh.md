# OpenClaw 开发环境与提交流程手册（中文）

本手册用于快速搭建 OpenClaw 本地开发环境，并规范格式化与提交流程。

## 适用范围

- 适用仓库：`openclaw`
- 语言：TypeScript (ESM)
- 主要包管理器：`pnpm`

## 开发环境准备

### 运行时与工具

- **Node.js**：版本要求为 **22+**
- **包管理器**：`pnpm`
- **可选工具**：`bun`（用于运行脚本/测试，保持与 `pnpm` 锁文件一致）

### 安装依赖

```bash
pnpm install
```

> 若遇到 `command not found` / `vitest not found` / `node_modules` 缺失，请先执行上面的安装命令，再重试一次原指令。

## 本地开发与构建

### 开发运行

```bash
pnpm dev
```

或运行 CLI：

```bash
pnpm openclaw <command>
```

### 构建与类型检查

```bash
pnpm build
pnpm tsgo
```

## 格式化与检查

### 一次性检查（Lint + Format）

```bash
pnpm check
```

### 仅检查格式

```bash
pnpm format
```

### 自动修复格式

```bash
pnpm format:fix
```

> **提交前建议**：至少执行一次 `pnpm check`，确保格式与 lint 通过。

## 测试

### 单元测试

```bash
pnpm test
```

### 覆盖率

```bash
pnpm test:coverage
```

## 提交流程

### 提交前准备

- **不要** 直接修改或提交 `node_modules`。
- 变更涉及逻辑时，建议先运行 `pnpm test`。
- 确保 `pnpm check` 通过。

### 推荐提交方式（保持提交范围清晰）

使用仓库内置提交脚本：

```bash
scripts/committer "<提交信息>" <file...>
```

- 提交信息应简洁、动作导向，例如：`CLI: add verbose flag to send`
- 避免把无关改动混在同一个提交中

### 可选：安装预提交钩子

```bash
prek install
```

该钩子会在提交前执行与 CI 相同的检查。

## 常见注意事项

- 代码风格：TypeScript 严格类型，避免 `any`。
- 命名规范：产品/文档标题使用 **OpenClaw**，CLI/包名/路径/配置键使用 `openclaw`。
- 如果依赖或锁文件发生变化，确保使用 `pnpm` 统一管理并提交 `pnpm-lock.yaml`。
