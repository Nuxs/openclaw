---
name: eth-oracle
description: "Multi-factor ETH/crypto decision oracle combining on-chain metrics, technical analysis, macro-geopolitics, sentiment, and behavioral finance into actionable trade signals. Use when: user asks about ETH/crypto price analysis, market timing, position sizing, risk management, or multi-dimensional market assessment. Triggers: 'ETH', 'ethereum', 'crypto analysis', 'market signal', 'trade decision', 'on-chain', 'macro crypto', 'fear greed', 'position size', 'crypto risk'."
---

# ETH Oracle — Multi-Factor Decision System

Comprehensive decision system for ETH analysis. Integrates 6 signal dimensions into a unified scoring framework that outputs actionable BUY / HOLD / SELL / HEDGE signals with position sizing.

## Decision Principles: Faith, Clarity, and Precision (信达雅)

To ensure high-quality signals, the Oracle adheres to the "Three Pillars" of professional analysis:

1. **Faithfulness (信 - Veracity)**: Decisions must be grounded in verified facts. We apply a **Data Confidence Tiering** system (Tier 1/2/3) to filter out AI hallucinations and speculative hype.
2. **Clarity (达 - Logic)**: The decision flow must be transparent and algorithmic. Avoid "gut feelings" or vague narratives; every signal must have a traceable numerical score and a clear "why".
3. **Precision (雅 - Rigor)**: Use academic-grade geopolitical and behavioral models. Risk management is not an afterthought but a hard-coded constraint (e.g., 25% max position, Tier 1 veto).

## Decision Framework Overview

```
┌─────────────────────────────────────────────────────┐
│                 ETH Oracle Engine                    │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ On-Chain  │ │Technical │ │  Macro   │           │
│  │  20%     │ │  25%     │ │  20%     │           │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘           │
│       │             │             │                 │
│  ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐           │
│  │Sentiment │ │Behavioral│ │DeFi/Eco  │           │
│  │  15%     │ │  10%     │ │  10%     │           │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘           │
│       │             │             │                 │
│       └─────────────┼─────────────┘                 │
│                     ▼                               │
│          ┌──────────────────┐                       │
│          │ Composite Score  │                       │
│          │  -100 ↔ +100    │                       │
│          └────────┬─────────┘                       │
│                   ▼                                 │
│          ┌──────────────────┐                       │
│          │ Signal + Position│                       │
│          │ + Risk Mgmt      │                       │
│          └──────────────────┘                       │
└─────────────────────────────────────────────────────┘
```

## Quick Start — Run Full Analysis

Execute the analysis script to gather all signals and produce a decision:

```bash
python3 "$(dirname "$0")/../skills/eth-oracle/scripts/eth_oracle.py" --full
```

Or get machine-readable JSON (recommended for automation):

```bash
python3 scripts/eth_oracle.py --json
```

Or run individual dimensions:

```bash
python3 scripts/eth_oracle.py --dimension onchain
python3 scripts/eth_oracle.py --dimension technical
python3 scripts/eth_oracle.py --dimension macro
python3 scripts/eth_oracle.py --dimension sentiment
```

## Backtest & Calibration (Industrial Workflow)

Run the historical spot-check backtest (defaults: 10y window, 100 samples) or evaluate the full history:

```bash
# 100-sample spot check
python3 scripts/eth_oracle_backtest.py --years 10 --samples 100 --horizon 30

# Full evaluation across all eligible days (2017→now for ETHUSDT on Binance)
python3 scripts/eth_oracle_backtest.py --years 9 --all --horizon 30 --show 0

# Grid-search a practical risk profile
python3 scripts/eth_oracle_backtest.py --years 9 --all --horizon 30 --show 0 --optimize
```

**Tuning knobs (env vars, safe defaults):**

- `ETH_ORACLE_TRADE_THRESHOLD` (default `10`): enter long/short only when \(|score| \ge T\)
- `ETH_ORACLE_MAX_POSITION_PCT` (default `25`): max position size (% of portfolio)
- `ETH_ORACLE_SIZING_EXP` (default `1.0`): sizing curve exponent; use `<1` to be more active (e.g. `0.5`)

> Note: Binance long/short ratio history is limited to the latest 500 days without `startTime/endTime`; the backtest auto-disables that signal for older dates.

## Six Signal Dimensions

### 1. On-Chain Metrics (Weight: 20%)

Fetch data via free APIs. Key indicators:

| Metric                  | Bullish              | Neutral | Bearish             | Source                       |
| ----------------------- | -------------------- | ------- | ------------------- | ---------------------------- |
| MVRV Z-Score            | < 0                  | 0–3     | > 7                 | Blockchain.com / CoinMetrics |
| Net Exchange Flow       | Outflow > 5k ETH/day | Flat    | Inflow > 5k ETH/day | CryptoQuant / Etherscan      |
| Active Addresses (7d Δ) | > +10%               | ±5%     | < -10%              | Etherscan API                |
| Gas (avg gwei, 7d MA)   | > 30 (demand)        | 10–30   | < 10 (dead chain)   | Etherscan API                |
| Staking Ratio Δ (30d)   | Increasing > 0.5%    | Stable  | Decreasing          | Beaconcha.in                 |
| Supply on Exchanges %   | < 10% declining      | 10–15%  | > 15% rising        | CryptoQuant                  |

**API endpoints** — see `references/data-sources.md`.

### 2. Technical Analysis (Weight: 25%)

Run `scripts/eth_oracle.py --dimension technical` or manually check:

| Indicator             | Bullish                 | Neutral        | Bearish                |
| --------------------- | ----------------------- | -------------- | ---------------------- |
| Price vs MA(7/25/99)  | Above all 3             | Mixed          | Below all 3            |
| RSI(14)               | 30–45 (oversold bounce) | 45–65          | > 80 or < 20 extreme   |
| MACD                  | Bullish crossover       | Near zero      | Bearish crossover      |
| Bollinger Band        | Touch lower + rebound   | Inside         | Touch upper + reject   |
| Volume Profile        | High vol at support     | Average        | High vol at resistance |
| Fibonacci Retracement | Holds 0.618             | Between levels | Breaks 0.786           |
| Weekly Structure      | Higher highs/lows       | Range          | Lower highs/lows       |

**From the chart (2026-02-01):** ETH opened $2,534, high $2,551, low $2,250, closed $2,382. MA(7)=$2,626, MA(25)=$2,349, MA(99)=$3,019. Price below all MAs = strong bearish structure. Subsequently fell to $1,747 low before partial recovery.

### 3. Macro-Geopolitical (Weight: 20%)

| Factor                | Tier  | Bullish                     | Neutral        | Bearish                    |
| --------------------- | ----- | --------------------------- | -------------- | -------------------------- |
| Fed Rate Path         | 1     | Cutting / dovish            | Hold           | Hiking / hawkish           |
| DXY (Dollar Index)    | 1     | < 100 declining             | 100–105        | > 105 rising               |
| US-China Trade        | 2     | De-escalation               | Status quo     | New tariffs / sanctions    |
| **Payment Networks**  | **1** | **RTGS (FedNow) expansion** | **Status quo** | **Regulatory ban on USDC** |
| GPR Index             | 2     | Low / declining             | Moderate       | Spikes > 200               |
| BTC ETF Flows         | 2     | Net inflows > $500M         | Mixed          | Net outflows               |
| Regulatory Climate    | 1     | Pro-crypto legislation      | Quiet          | Enforcement actions        |
| Global Liquidity (M2) | 1     | Expanding                   | Stable         | Contracting                |

> **Audit Note**: "FedNow = CBDC" is an unverified narrative (Tier 3) and is excluded from Tier 1 decision weights.

**Key insight (Feb 2026 context):** Trump tariff escalation + strong dollar + global risk-off. GPR index elevated. This combination is historically bearish for crypto.

**Data sources:** FRED API (free), news aggregation via web_search tool.

### 4. Sentiment (Weight: 15%)

| Metric                    | Bullish                              | Neutral | Bearish                        |
| ------------------------- | ------------------------------------ | ------- | ------------------------------ |
| Fear & Greed Index        | < 20 (Extreme Fear = contrarian buy) | 20–60   | > 80 (Extreme Greed = sell)    |
| Funding Rate (perps)      | Negative (shorts paying longs)       | Near 0  | > 0.05% (overleveraged)        |
| Open Interest Δ (7d)      | Declining after liquidation flush    | Stable  | Rapid increase with price rise |
| Social Volume (Santiment) | Low (capitulation)                   | Average | Spike (euphoria/panic)         |
| ETH/BTC Ratio Trend       | Rising                               | Stable  | Declining (ETH underperform)   |
| Put/Call Ratio (Deribit)  | > 1.2 (extreme hedging = contrarian) | 0.7–1.0 | < 0.5 (complacency)            |

**Contrarian logic:** Extreme fear + negative funding + declining OI after liquidation cascade = high-probability reversal zone.

### 5. Behavioral Finance (Weight: 10%)

Key behavioral patterns to detect:

| Pattern             | Signal             | Detection                                                           |
| ------------------- | ------------------ | ------------------------------------------------------------------- |
| Capitulation Candle | Bullish reversal   | High volume + long lower wick + closes above open                   |
| Disbelief Rally     | Trend continuation | Price rising + social sentiment still bearish                       |
| FOMO Entry          | Distribution       | Rapid price + rapid social/search volume spike                      |
| Anchoring Bias      | False support      | Crowd fixated on round numbers ($2,000, $3,000)                     |
| Recency Bias        | Overreaction       | Media narratives extrapolating recent trend forever                 |
| Disposition Effect  | Selling pressure   | Price recovers to prior breakdown = heavy selling                   |
| Calendar Effects    | Timing             | "Sell in May", post-halving cycles, tax-loss harvesting (Dec/Jan)   |
| Reflexivity (Soros) | Momentum           | Price action itself changes fundamentals (DeFi TVL, staking yields) |

**Feb 2026 analysis:** $2,534 → $1,747 = -31% crash with massive volume = capitulation signature. Post-crash recovery to ~$2,000 in low-conviction environment = disbelief stage.

### 6. DeFi & Ecosystem (Weight: 10%)

| Metric                         | Bullish                        | Neutral          | Bearish      |
| ------------------------------ | ------------------------------ | ---------------- | ------------ |
| TVL (Total Value Locked) Δ 30d | > +15%                         | ±5%              | < -15%       |
| DEX Volume / CEX Volume        | Rising                         | Stable           | Declining    |
| L2 Activity (txns/day)         | Growing > 20% MoM              | Stable           | Declining    |
| ETH Burn Rate (EIP-1559)       | Deflationary (burn > issuance) | Near equilibrium | Inflationary |
| Developer Activity (GitHub)    | Commits increasing             | Stable           | Declining    |
| NFT/Gaming Volume              | Recovery                       | Quiet            | Collapsing   |

## Composite Score Calculation

```
Score = Σ (dimension_score × weight)

Where each dimension_score ∈ [-100, +100]:
  -100 = maximally bearish
     0 = neutral
  +100 = maximally bullish

Weights:
  on_chain:    0.20
  technical:   0.25
  macro:       0.20
  sentiment:   0.15
  behavioral:  0.10
  defi_eco:    0.10
```

## Signal Interpretation

| Composite Score | Signal             | Action                              |
| --------------- | ------------------ | ----------------------------------- |
| +60 to +100     | **STRONG BUY**     | Deploy 80–100% of allocated capital |
| +30 to +59      | **BUY**            | Deploy 40–60% (DCA in)              |
| +10 to +29      | **LEAN BUY**       | Deploy 20–30%, tight stops          |
| -9 to +9        | **NEUTRAL / HOLD** | No new positions, maintain existing |
| -29 to -10      | **LEAN SELL**      | Reduce 20–30%, raise stops          |
| -59 to -30      | **SELL**           | Reduce 50–70%, hedge with puts      |
| -100 to -60     | **STRONG SELL**    | Exit 80%+, consider short hedge     |

## Position Sizing (Kelly-Inspired)

```
position_pct = base_pct × confidence_multiplier × volatility_adjustment

Where:
  base_pct = signal_strength / 100 × max_allocation
  confidence_multiplier = agreement_ratio  (how many dimensions agree)
  volatility_adjustment = target_vol / current_vol  (scale down in high vol)
```

Max single-position: **25% of portfolio** (never go all-in).

## Risk Management Rules (Hard Constraints)

1. **Max Single-Position**: **25% of total portfolio**. No exceptions for "high conviction" plays.
2. **Tier 1 Veto (One-Strike Rule)**: If any Tier 1 risk triggers (e.g., major stablecoin de-peg > 5%, regulatory ban in US/EU), the signal is **INSTANT STRONG SELL** regardless of technical or sentiment scores.
3. **Event-Driven De-risking**: Reduce position by **50%** 48h before high-uncertainty events (FOMC, CPI release, major trade policy windows).
4. **Stop-loss**: Mandatory. Default = -8% from entry for swing, -3% for day trade.
5. **Max Drawdown**: If portfolio drawdown > 15%, reduce all positions by 50% immediately.
6. **Liquidation Cascade**: If OI drops > 20% in 24h, wait 48h for market stabilization before new entry.

## Workflow — How the Agent Should Use This

1. **Gather data** — Run `scripts/eth_oracle.py --full` (human-readable) or `scripts/eth_oracle.py --json` (automation)
2. **Score each dimension** — Use the rubrics above, assign -100 to +100 per dimension
3. **Compute composite** — Weighted average
4. **Generate signal** — Map composite to action per the table
5. **Size position** — Apply Kelly-inspired formula
6. **Check risk rules** — Verify no rules violated
7. **Output recommendation** — Include scores, rationale per dimension, confidence level, and specific entry/exit/stop levels
8. **Schedule re-evaluation** — Set reminder to re-run in 24h (volatile) or 7d (stable)

## Long-Term Execution (4y) — Small-Capital, Thesis-Driven

When the user wants a _4-year long-term_ plan (e.g. $1,000 test), prefer a **2-tranche entry** (avoid perfect-timing risk) plus **rule-based profit-taking**.

### Why we avoid single-shot by default

Even with a correct thesis, entry timing can change outcomes by multiples. This skill implements a 2-tranche entry so we can still buy fear, but reduce regret if there is a second leg down.

### Automation helper script

Use `scripts/eth_oracle_longterm.py` to generate _buy/sell instructions_ and maintain a local state file (paper execution). It does **not** connect to exchanges.

```bash
# 1) Initialize a $1,000 / 2-tranche plan
python3 scripts/eth_oracle_longterm.py init --budget-usd 1000 --first-tranche-usd 500 --second-tranche-usd 500

# 2) Run the decision once (human-readable)
python3 scripts/eth_oracle_longterm.py run

# 3) If you executed the suggested orders, record them into state (paper)
python3 scripts/eth_oracle_longterm.py run --apply

# 4) Inspect tracked position and recent executions
python3 scripts/eth_oracle_longterm.py status
```

### Embedded thesis checkpoint (payments rails)

The long-term helper also pulls **stablecoin chain distribution** (DefiLlama API) and prints the current share of "ETH-aligned" chains vs competitors like TRON/Solana. This is _not_ a price signal; it is a **thesis health check** for cross-border payment narratives.

## Output Format

```
═══════════════════════════════════════════
  ETH Oracle Report — {date}
═══════════════════════════════════════════

  Composite Score:  {score}/100
  Signal:           {STRONG BUY|BUY|LEAN BUY|HOLD|LEAN SELL|SELL|STRONG SELL}
  Confidence:       {HIGH|MEDIUM|LOW} ({n}/6 dimensions agree)

  ┌─────────────┬────────┬──────────────────────────┐
  │ Dimension   │ Score  │ Key Factor               │
  ├─────────────┼────────┼──────────────────────────┤
  │ On-Chain    │ {±xx}  │ {one-line summary}       │
  │ Technical   │ {±xx}  │ {one-line summary}       │
  │ Macro       │ {±xx}  │ {one-line summary}       │
  │ Sentiment   │ {±xx}  │ {one-line summary}       │
  │ Behavioral  │ {±xx}  │ {one-line summary}       │
  │ DeFi/Eco    │ {±xx}  │ {one-line summary}       │
  └─────────────┴────────┴──────────────────────────┘

  Action Plan:
    Entry:     ${price} (limit) / market if breaks ${level}
    Stop:      ${price} (-{pct}%)
    Target 1:  ${price} (+{pct}%)
    Target 2:  ${price} (+{pct}%)
    Size:      {pct}% of portfolio ({rationale})
    Timeframe: {swing|position|long-term}

  Risk Alerts:
    - {any triggered risk rules}

  Next Review: {date/time}
═══════════════════════════════════════════
```

## References

- **Data sources & API endpoints**: `references/data-sources.md`
- **Academic foundations & research**: `references/academic-foundations.md`
- **Feb 2026 ETH case study**: `references/eth-feb2026-analysis.md`
- **Geopolitical-crypto correlation model**: `references/geopolitical-model.md`
