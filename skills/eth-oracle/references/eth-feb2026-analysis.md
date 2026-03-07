# ETH February 2026 Case Study — Multi-Factor Post-Mortem

Deep analysis of ETH's crash from $2,534 to $1,747 (-31%) starting Feb 1, 2026.

## Market Snapshot (2026-02-01)

```
Open:    $2,534.20
High:    $2,551.26
Low:     $2,250.00
Close:   $2,382.82
Change:  -5.97%
Range:   11.88%

MA(7):   $2,626.20  ← price below
MA(25):  $2,349.38  ← price near
MA(99):  $3,019.59  ← price far below (bearish structure)

Vol(ETH):  562.612K
Vol(USDT): 1.354B

Subsequent low: $1,747.80 (Feb 6–8 area)
```

## Dimension-by-Dimension Scoring (Retrospective)

### 1. On-Chain: Score = -40

Pre-crash signals:

- Exchange inflows had been rising for 2 weeks (bearish)
- Active addresses declining from January peak (bearish)
- Gas fees low at 8–12 gwei (reduced on-chain demand)
- Staking deposits stable (neutral)
- MVRV Z-Score was already below 1 (approaching undervalued, but momentum was negative)

**Lesson:** On-chain signaled weakness but not the magnitude. Exchange inflow was the strongest pre-crash warning.

### 2. Technical: Score = -70

As of Feb 1:

- Price below ALL three MAs (7/25/99) — strong bearish trend
- MA(7) < MA(25) < MA(99) — death cross formation in progress
- RSI(14) at ~35 — approaching oversold but not extreme
- MACD deeply negative with widening histogram
- Bollinger Bands expanding (increasing volatility)
- No support until $2,000 psychological level, then $1,800

**What happened:** Technical breakdown confirmed with massive volume. $2,250 support broke intraday, cascading to $1,747 over following days.

**Lesson:** Below-all-MAs + increasing volume + no nearby support = expect waterfall.

### 3. Macro-Geopolitical: Score = -65

Key events in late Jan / early Feb 2026:

- **Trump tariff expansion:** New round targeting multiple sectors, markets pricing in trade war 2.0
- **DXY strengthening:** Dollar index rose as safe haven demand increased
- **Fed rhetoric:** Hawkish hold — rates staying higher for longer than expected
- **Treasury yields:** 10Y climbing above 4.5%
- **Global risk-off:** European equities and EM currencies also declining
- **GPR Index:** Elevated above 150 (multiple geopolitical tensions)

**Transmission path:** Tariff fears → strong USD → risk-off → crypto selloff amplified by leverage.

**Lesson:** When DXY, yields, and GPR all move against crypto simultaneously, expect -20% minimum. The combination is historically the most bearish macro setup for ETH.

### 4. Sentiment: Score = -50 (contrarian: approaching buy zone)

- Fear & Greed Index: dropped to 10 ("Extreme Fear") by late Feb
- Funding rates: turned negative (shorts paying longs)
- Open Interest: collapsed ~25% during liquidation cascade
- Social media: "ETH is dead" narratives proliferating
- ETH/BTC ratio: declining — capital flight from ETH to BTC

**Contrarian reading:** These are capitulation markers. Historically, F&G < 15 + negative funding + OI flush = reversal zone within 2–3 weeks.

### 5. Behavioral: Score = -30 (mixed — capitulation underway)

- **Capitulation candle detected** (Feb 3–6): Massive volume, long lower wicks
- **Anchoring:** Heavy selling around $2,000 (round number + prior support)
- **Disposition effect:** Addresses that bought at $2,200–2,500 were panic selling at $1,800–1,900
- **Reflexivity:** ETH price decline → DeFi liquidations → TVL dropped ~18% in 1 week → more sell pressure
- **Recency bias:** Media extrapolating "ETH going to $1,000" based on 4-week trend

**Lesson:** The behavioral cascade (panic → liquidation → more panic) typically exhausts within 5–10 days of the initial shock.

### 6. DeFi/Ecosystem: Score = -35

- TVL dropped from $62B to $51B (-17.7%) in the month
- DEX volumes spiked during crash (panic swaps) then collapsed
- L2 transaction counts declined ~10%
- ETH burn rate dropped below issuance (briefly inflationary)
- Developer commits: stable (builders didn't leave — positive divergence)

**Key insight:** Developer activity as a contrarian indicator — when price crashes but devs stay, the ecosystem is intact. This is a buy signal on 3–6 month horizon.

## Composite Score (Feb 1, 2026)

```
On-Chain:    -40 × 0.20 = -8.0
Technical:   -70 × 0.25 = -17.5
Macro:       -65 × 0.20 = -13.0
Sentiment:   -50 × 0.15 = -7.5  (raw; contrarian adjustment would flip this)
Behavioral:  -30 × 0.10 = -3.0
DeFi/Eco:    -35 × 0.10 = -3.5
─────────────────────────────
Composite:   -52.5  →  SELL signal
```

**What the oracle would have recommended on Feb 1:**

- **Signal:** SELL — reduce exposure by 50–70%
- **Stop:** $2,600 (if somehow recovering, close shorts)
- **Target:** $1,900–$2,000 (first support), $1,750 (second support)
- **Timeframe:** 1–2 weeks for the move to play out

**Accuracy:** The oracle would have correctly signaled exit before the bulk of the -31% decline.

## Post-Crash Reversal Analysis (Feb 10–Mar 7)

By mid-February:

- Composite score shifted to approximately **-25** (LEAN SELL → approaching NEUTRAL)
- Sentiment flipped contrarian bullish (F&G = 10, funding negative)
- Technical: RSI reached 25 (extreme oversold), bullish divergence forming
- On-chain: Exchange outflows resumed (smart money accumulating)
- Macro: Unchanged (still headwind)

**The oracle would shift to:** NEUTRAL with "watch for entry" by Feb 15–20.

By early March:

- Partial recovery visible in chart (price bouncing from $1,747 low)
- Volume declining (typical of basing pattern)
- Score estimate: **-10 to 0** (NEUTRAL/HOLD)

## Key Takeaways for the Model

1. **Macro dominance:** In regime shifts (tariff wars, Fed pivots), macro dimension should get temporary weight boost from 20% → 30%
2. **Cascade detection:** When >4 dimensions agree directionally, increase signal confidence and position size
3. **Contrarian timing:** Sentiment extremes + behavioral capitulation = reliable entry signals, but timing requires patience (wait for volume decline + RSI divergence)
4. **Reflexivity monitoring:** ETH's DeFi reflexivity loop amplifies both directions — monitor TVL/price divergence as leading indicator
5. **Developer divergence:** Stable dev activity during price crashes = strong long-term buy signal (3–6 month horizon)
