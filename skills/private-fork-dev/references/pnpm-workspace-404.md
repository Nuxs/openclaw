## pnpm workspace 404（镜像 registry 拉不到 @openclaw/\*）排障

### 症状

- 在仓库根目录执行 `pnpm install`，报：
  - `ERR_PNPM_FETCH_404 GET https://repo.huaweicloud.com/.../@openclaw%2Fblockchain-adapter`
- 但仓库内其实存在对应 workspace 包：`extensions/blockchain-adapter`。

### 典型根因（pnpm v10）

- `pnpm` 默认不会把 `"@openclaw/blockchain-adapter": "1.0.0"` 这种依赖自动链接到 workspace 包，除非启用 workspace linking。
- 当默认 registry 被设置为镜像（如 `https://repo.huaweicloud.com/repository/npm/`），镜像可能没有 `@openclaw/*` 作用域包，导致 404。

### 推荐修复（仓库级，抗覆盖）

在仓库根 `.npmrc` 增加：

- `link-workspace-packages=true`
- `prefer-workspace-packages=true`
- `@openclaw:registry=https://registry.npmjs.org/`（可选兜底：只影响 `@openclaw/*` 作用域）

### 验证步骤

- `pnpm -w config get registry`
- `pnpm -w config get link-workspace-packages`
- `pnpm -w config get prefer-workspace-packages`
- `pnpm install`

期望结果：不再访问 registry 拉取 workspace 内的 `@openclaw/*` 包。

### 备注

- 如果需要继续使用镜像作为默认 registry，可以只保留 `@openclaw:registry=...` 作为 scoped override。
- 如果某个插件要支持单独 `npm install --omit=dev` 安装，则其 `dependencies` 不应依赖未发布到 npm 的 `@openclaw/*` 包。此类依赖应保持为 workspace-only 或改为内置/打包策略。
