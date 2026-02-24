## Overlay Hooks（Upstream 合流友好）的落地模板

### 目标

- 把上游热点文件的冲突面压到：`import` + 1–3 行 hook 调用。

### 建议的最小 Hook 点（以 web_search 为例）

1. Provider 选择扩展点：优先选择私有 provider（例如 `searxng`）
2. Provider 运行扩展点：当命中私有 provider 时，委托给私有实现
3. 列表结果后处理扩展点（可选）：评分/重排必须发生在 `writeCache(...)` 之前

### 合流策略

- 先让上游实现块原样落地。
- 再恢复：我们那几行 import + hook 调用。

### 反例

- 在上游热点文件内联大段私有逻辑。
- 在 `writeCache(...)` 之后再改结果（会破坏缓存一致性）。
