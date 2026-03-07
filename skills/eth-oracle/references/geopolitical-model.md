# Geopolitical-Crypto Correlation Model

Systematic framework for assessing geopolitical event impact on ETH prices.

## Theoretical Foundation

Based on three academic streams:

1. **Caldara & Iacoviello (2022)** — GPR Index construction and financial asset impact
2. **Będowska-Sójka et al. (2024)** — Uncertainty-crypto returns relationship
3. **GARCH-MIDAS (2023)** — Mixed-frequency volatility modeling for geopolitical → crypto transmission

## Event Classification Matrix

### Tier 1: Direct Crypto Impact (Highest Weight)

| Event Type                        | Example                    | ETH Impact   | Lag      | Duration   |
| --------------------------------- | -------------------------- | ------------ | -------- | ---------- |
| Crypto regulation (major economy) | SEC enforcement, China ban | -15% to -40% | 0–2 days | 2–8 weeks  |
| Exchange collapse/hack            | FTX, major hack > $500M    | -20% to -50% | 0–1 day  | 4–12 weeks |
| Stablecoin de-peg                 | USDT/USDC < $0.95          | -25% to -60% | 0 days   | 1–4 weeks  |
| ETF approval/rejection            | Spot ETH ETF decision      | ±10% to ±25% | 0–1 day  | 2–6 weeks  |

### Tier 2: Macro-Financial & Infrastructure Transmission (Medium Weight)

| Event Type                 | Example                             | ETH Impact                   | Lag           | Duration       |
| -------------------------- | ----------------------------------- | ---------------------------- | ------------- | -------------- |
| Trade war escalation       | Tariff rounds, sanctions            | -10% to -30%                 | 1–5 days      | 2–8 weeks      |
| Central bank surprise      | Unexpected hike/cut                 | ±5% to ±20%                  | 0–2 days      | 1–4 weeks      |
| Banking crisis             | SVB-type event                      | -15% to -25% (then reversal) | 0–3 days      | 1–2 weeks      |
| **Payment Network Shocks** | **FedNow expansion, mBridge pilot** | **±5% to ±15%**              | **5–14 days** | **Persistent** |
| Sovereign debt stress      | Japan yield spike, EU crisis        | -10% to -20%                 | 2–7 days      | 4–12 weeks     |
| Currency crisis (major)    | GBP/JPY/CNY crisis                  | -10% to -25%                 | 1–5 days      | 2–6 weeks      |

### Tier 3: Geopolitical Shocks (Variable Weight)

| Event Type               | Example                           | ETH Impact                   | Lag      | Duration             |
| ------------------------ | --------------------------------- | ---------------------------- | -------- | -------------------- |
| Military conflict (new)  | Ukraine, Middle East              | -5% to -20% (initial)        | 0–3 days | Resolution-dependent |
| Military escalation      | Nuclear rhetoric, major offensive | -10% to -25%                 | 0–1 day  | 1–4 weeks            |
| Sanctions (major)        | Russia SWIFT, energy sanctions    | -5% to -15%                  | 1–7 days | Persistent           |
| Election shock           | Unexpected outcome                | ±10% to ±20%                 | 0–1 day  | 2–8 weeks            |
| Pandemic / health crisis | New variant, lockdowns            | -10% to -30% (then recovery) | 0–3 days | 2–6 weeks            |

### Tier 4: Social / Religious / Cultural (Lowest Direct Weight, Highest Behavioral Amplification)

| Factor                          | Mechanism                                                                             | Detection                           |
| ------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------- |
| Religious calendar effects      | Ramadan, Chinese New Year → reduced trading volume → wider spreads → flash crash risk | Check cultural calendar             |
| Social media contagion          | Viral fear/euphoria → retail herding                                                  | Monitor social volume spikes        |
| Generational wealth transfer    | Millennials/GenZ crypto allocation trends                                             | Long-term structural, not tradeable |
| Trust in institutions           | Declining → pro-crypto narrative                                                      | Survey data, slow-moving            |
| Technological anxiety (AI/jobs) | Risk-off if severe → also pro-Bitcoin narrative                                       | Mixed signal, context-dependent     |

## Payment Infrastructure & CBDC Narrative (Corrective Logic)

To avoid "Narrative Traps" (AI Hallucinations/Hype), the following logic applies:

### 1. FedNow vs. Stablecoins

- **Narrative**: "FedNow will kill USDC/USDT because it's a government CBDC." (False)
- **Reality**: FedNow is an **Instant Payment Rail (RTGS)**, not a currency. It operates on bank reserves.
- **Oracle Logic**:
  - Expansion of FedNow = **Bullish/Neutral** for regulated stablecoins (on/off-ramp efficiency).
  - Risk = Displacement of _private_ retail payment apps, not the _liquidity_ (USDC) themselves.

### 2. mBridge & De-dollarization

- **Narrative**: "mBridge is an operational SWIFT killer used by all BRICS." (Premature)
- **Reality**: mBridge is a **Prototype/Pilot** by BIS; scalability and political alignment are ongoing hurdles.
- **Oracle Logic**:
  - mBridge success = **Neutral/Slightly Bearish** for USD-denominated stablecoins (diversification of settlement assets).
  - Impact is structural and slow-moving (>24 months).

### 3. "Digital Dollar" (CBDC)

- **Narrative**: "US CBDC launch is imminent." (Unverified)
- **Reality**: Significant political and privacy hurdles in the US. No legislative mandate exists.
- **Oracle Logic**:
  - Only official FOMC/Treasury announcements trigger "CBDC Risk" scores. Social media rumors = Tier 3 (Ignore).

## Scoring Algorithm

### Step 1: Event Identification

Use web_search and news monitoring to identify active events. Categorize each by tier.

### Step 2: Impact Estimation

For each active event:

```
event_score = base_impact × recency_factor × persistence_factor × contagion_multiplier

Where:
  base_impact: from the tables above (map range to -100..+100)
  recency_factor: 1.0 if within 7 days, 0.7 if 7-14 days, 0.4 if 14-30 days, 0.2 if 30-60 days
  persistence_factor: 1.0 if ongoing, 0.5 if resolved but aftermath, 0.2 if fully resolved
  contagion_multiplier: 1.0 if isolated, 1.5 if triggering secondary events, 2.0 if cascade
```

### Step 3: Aggregate

```
macro_geo_score = Σ(event_scores) clamped to [-100, +100]
```

If multiple events compound (e.g., tariffs + rate hike + conflict), use geometric mean of magnitudes to avoid double-counting correlated shocks.

## DXY-ETH Inverse Correlation Model

Historical correlation coefficient: **-0.65 to -0.80** (strong inverse)

```
DXY Impact Rules:
  DXY < 100 and declining → +30 to +50 (bullish for ETH)
  DXY 100-105 stable     → -10 to +10 (neutral)
  DXY > 105 and rising   → -30 to -50 (bearish for ETH)
  DXY > 108 rapid rise   → -50 to -70 (very bearish)
```

**Why it works:** A stronger dollar means:

1. Higher opportunity cost for holding non-yielding assets
2. EM capital outflows (less speculative capital available)
3. Dollar-denominated debt becomes more expensive (global tightening)
4. Crypto is predominantly USD-quoted, so DXY ↑ = crypto ↓ mechanically

## Global Liquidity Model

**M2 (Global Money Supply) → Crypto with 3-6 month lag**

This is the single most important long-term macro indicator for crypto:

```
M2 Growth Rules (YoY):
  M2 growth > 8%  → Strong tailwind (+40 to +60 macro score)
  M2 growth 4-8%  → Moderate tailwind (+10 to +30)
  M2 growth 0-4%  → Neutral (-10 to +10)
  M2 growth < 0%  → Headwind (-30 to -50)
  M2 contraction accelerating → Strong headwind (-50 to -70)
```

**Data source:** FRED M2SL series (updated monthly)

## FOMC Calendar Effect

Crypto volatility systematically increases around FOMC:

```
Day relative to FOMC:
  -3 to -1: Volatility +20%, directional bias unclear → reduce position size
  0 (day of): Volatility +40%, immediate reaction often wrong → don't trade
  +1 to +3: True direction emerges → trade the confirmation
  +4 to +14: Trending move if surprise → ride with trailing stop
```

**Actionable rule:** Cut position size by 30% in the 72 hours before FOMC. Re-enter on day +2 with confirmed direction.

## Case Studies

### Trade War 1.0 (2018-2019)

- Tariff rounds → BTC -60%, ETH -85% (ETH higher beta)
- Recovery began when trade deal talks resumed
- **ETH/BTC ratio collapsed** from 0.08 to 0.016 (ETH underperforms in risk-off)

### COVID Crash (March 2020)

- Geopolitical + health crisis = maximum panic
- ETH -63% in 2 weeks ($285 → $105)
- Recovery: V-shaped, 100% in 60 days
- **Lesson:** Exogenous shocks without structural crypto damage = buy the crash

### Russia-Ukraine (Feb 2022)

- ETH -15% in first week
- Then recovered as "digital gold" narrative briefly held
- Then rolled over as Fed tightening dominated
- **Lesson:** Military events have brief crypto impact unless they trigger broader macro shift

### FTX Collapse (Nov 2022)

- ETH -25% in 2 weeks
- Recovery took 4 months
- **Lesson:** Crypto-native structural events take longer to heal than external shocks

### Trump Tariff 2.0 (Feb 2026)

- ETH -31% over ~1 week ($2,534 → $1,747)
- Combined with: hawkish Fed, strong DXY, elevated GPR
- **Lesson:** The most dangerous setup is when multiple Tier 2 events compound simultaneously
