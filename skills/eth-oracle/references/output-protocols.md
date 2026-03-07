# Output Protocols

本文件规定 `eth-oracle` 的四类标准交付物。

## 1. Strict Research Report

### 目标

建立完整认知，而非直接催促交易。

### 必填结构

1. `Mandate`
2. `Bottom Line`
3. `Evidence Ledger`
4. `Facts`
5. `Interpretations`
6. `Scenarios`
7. `Counterargument`
8. `Unknowns`
9. `Review Trigger`

### 风格要求

- 先证据，后判断
- 允许长，但不允许散
- 每个核心结论要能回溯证据 tier

## 2. Investment Memo

### 目标

把研究转化为资本动作。

### 必填结构

1. `Conclusion`
2. `Portfolio Stance`
3. `Recommended Size`
4. `Key Drivers`
5. `Risk Triggers`
6. `Invalidation`
7. `Next Review`

### 风格要求

- 简洁
- 明确
- 可执行

## 3. Board Brief

### 目标

让 Principal 或董事会在最短时间理解现在该怎么想、怎么防、怎么做。

### 必填结构

1. `One-Line Judgment`
2. `Three Key Points`
3. `Principal Risk`
4. `Recommended Action`
5. `Next Watchpoint`

### 篇幅要求

- 默认 5–12 行
- 不堆技术指标
- 每句话都应可被老板复述

## 4. Auditable JSON

### 顶层结构

```json
{
  "timestamp": "ISO-8601",
  "mandate": {},
  "dimensions": [],
  "composite": {},
  "evidence": {},
  "confidence": {},
  "portfolio_governance": {},
  "deliverables": {}
}
```

### 字段要求

#### `mandate`

```json
{
  "asset_scope": ["ETH", "stablecoins", "macro"],
  "time_horizon": "swing|position|long-term",
  "mode": ["research", "decision", "brief", "automation"]
}
```

#### `confidence`

```json
{
  "level": "high|medium|low",
  "summary": "string",
  "unknowns": ["string"],
  "counterarguments": ["string"]
}
```

#### `portfolio_governance`

```json
{
  "stance": "risk_on|selective_risk_on|neutral|selective_risk_off|risk_off",
  "position_size_pct": 0,
  "max_position_pct": 25,
  "veto_triggered": false,
  "veto_reason": null,
  "review_cadence": "24h|72h|7d|event-driven"
}
```

#### `deliverables`

```json
{
  "research_report": "string",
  "investment_memo": "string",
  "board_brief": "string"
}
```

## 5. 统一语言要求

无论哪种格式，均应满足：

- 给出结论
- 给出边界
- 给出反方
- 给出下一步

## 6. 禁止事项

- 禁止文本结论与 JSON 结论不一致
- 禁止在 JSON 中省略反方观点和未知项
- 禁止为了简短而删去失效条件
