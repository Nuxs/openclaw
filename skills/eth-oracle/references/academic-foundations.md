# Academic Foundations & Research

Theoretical framework behind the ETH Oracle multi-factor decision model.

## 1. Core Academic Models

### 1.1 Multi-Factor Asset Pricing (Fama-French Extended)

**Paper:** Fama & French (1993, 2015) "Common risk factors in the returns on stocks and bonds"

Applied to crypto: traditional factors (size, value, momentum) are adapted:

- **Size factor** → Market cap relative to total crypto market
- **Value factor** → NVT Ratio (Network Value to Transactions), analogous to P/E
- **Momentum factor** → 30/90-day return momentum
- **Network factor** (crypto-specific) → Active addresses, tx count, TVL growth

**Key insight:** Single-factor models (just price or just on-chain) systematically underperform multi-factor. Our 7-dimension approach is an implementation of multi-factor pricing for crypto, with payment rails promoted to a first-class factor alongside price, macro, and ecosystem structure.

### 1.2 MVRV Z-Score Model

**Paper:** Awe & Khelifi (2019) "Bitcoin Market-Value-to-Realized-Value (MVRV) Ratio"

```
MVRV = Market Cap / Realized Cap
Z-Score = (Market Cap - Realized Cap) / StdDev(Market Cap)
```

- Z < 0: Historically strong buy zone (price below aggregate cost basis)
- Z > 7: Historically strong sell zone (massive unrealized profit)
- Applied to ETH: use ETH-specific realized cap from CoinMetrics

### 1.3 NVT Signal (Network Value to Transactions)

**Paper:** Woo (2017) "NVT Ratio — Detecting Bubbles in Bitcoin"

```
NVT = Network Value (Market Cap) / Daily Transaction Volume (USD)
NVT Signal = NVT with 90-day MA of tx volume (smoother)
```

- NVT > 150: Overvalued (price outpacing network usage)
- NVT < 30: Undervalued (network usage outpacing price)

### 1.4 Stock-to-Flow (Modified for ETH Post-Merge)

**Origin:** PlanB (2019) "Modeling Bitcoin Value with Scarcity"

Post-merge ETH is sometimes deflationary (EIP-1559 burn > issuance). Modified S2F:

```
S2F = Current Supply / Annual Net Issuance
     (where Net Issuance = Staking Rewards - Burned ETH)
```

When burn > issuance, S2F → ∞ (infinite scarcity signal). Use as binary: deflationary = bullish, inflationary = neutral.

## 2. Geopolitical Risk & Crypto

### 2.1 GPR-Crypto Correlation

**Paper:** Będowska-Sójka et al. (2024) "Uncertainty and cryptocurrency returns: A lesson from turbulent times" — _International Review of Financial Analysis_

Key findings:

- Geopolitical risk (GPR index by Caldara & Iacoviello) negatively correlates with crypto returns during acute crises
- Economic Policy Uncertainty (EPU) shows weaker but persistent negative correlation
- Crypto acts as risk asset during geopolitical shocks (contra "digital gold" narrative)
- GPR spikes > 200 historically precede 15–30% BTC/ETH drawdowns within 30 days

### 2.2 Tariff-Crypto Transmission

**Paper:** Journal of Operations Research (2023) "Research on the Influence of Geopolitical Risk on the Cryptocurrency Market Volatility: GARCH-MIDAS Model"

Transmission mechanism:

```
Trade War Escalation
  → DXY strengthens (safe haven to USD)
  → Risk-off across all risk assets
  → Crypto correlation with S&P500 increases (0.6+)
  → ETH drops harder than BTC (higher beta)
  → Liquidation cascade amplifies move
  → ETH/BTC ratio declines (flight to quality within crypto)
```

**Feb 2026 application:** Trump tariff escalation → DXY spike → ETH -31% crash from $2,534 to $1,747. This is textbook geopolitical risk transmission.

### 2.3 SCIRP (2024) "Investigating the Impact of Geopolitical Risks and Uncertainty Factors on Bitcoin"

Using daily/weekly data 2015–2023:

- Short-term: GPR shocks cause 7–14 day negative returns
- Medium-term: Markets recover within 30–60 days if no structural change
- **Actionable rule:** Enter contrarian positions 14–21 days after GPR spike peak

## 3. Behavioral Finance in Crypto

### 3.1 Prospect Theory (Kahneman & Tversky, 1979)

Applied to crypto:

- **Loss aversion** (2.25x): Investors feel losses 2.25x more than equivalent gains
- **Implication:** After -30% crash, panic selling overshoots fundamentals by ~15–20%
- **Trading rule:** After capitulation (volume > 3x average + price < -25%), mean reversion probability is 65%+ within 14 days

### 3.2 Reflexivity Theory (Soros, 1987)

**Core idea:** Price movements themselves change fundamentals in crypto more than traditional markets:

- ETH price ↑ → DeFi TVL ↑ → More fees → More ETH burned → Supply decreases → Price ↑ (positive reflexivity)
- ETH price ↓ → DeFi liquidations → TVL ↓ → Fees ↓ → Net issuance → Price ↓ (negative reflexivity)

**Detection:** When TVL/price ratio diverges from 6-month mean by > 2 std devs, reflexivity is exhausting.

### 3.3 Herding & Social Contagion

**Paper:** Bouri et al. (2019) "Herding behaviour in cryptocurrencies"

- CSAD (Cross-Sectional Absolute Deviation) method detects herding
- Herding intensifies during high volatility periods
- **Counter-signal:** When herding + extreme fear + high volume = capitulation = buy zone

### 3.4 Calendar Anomalies

**Research synthesis:**

- **January Effect:** Positive in crypto (tax-loss harvesting recovery)
- **Weekend Effect:** Higher returns Sat–Mon (retail buying)
- **Month-end:** Institutional rebalancing creates short-term pressure
- **Post-Halving Cycles:** BTC halving (April 2024) historically precedes 12–18 month bull, ETH follows with 2–4 month lag

## 4. Sentiment Analysis Models

### 4.1 Fear & Greed as Contrarian Indicator

**Paper:** Multiple studies confirm: Extreme Fear (<15) on crypto F&G index has 72% probability of positive 30-day forward return.

Decision matrix:

```
F&G < 10:  Extreme Fear  → Strong contrarian BUY signal
F&G 10-25: Fear          → Moderate BUY signal
F&G 25-50: Neutral       → No signal
F&G 50-75: Greed         → Caution, tighten stops
F&G > 75:  Extreme Greed → Contrarian SELL signal
```

### 4.2 Funding Rate Signal

**Empirical finding:** Negative funding rates sustained > 3 days historically precede 10%+ bounce within 7 days (63% win rate). Mechanism: shorts paying longs = short squeeze setup.

### 4.3 On-Chain Sentiment (Realized P/L)

**Paper:** Glassnode Research "The Week On-Chain" series

- **STH-SOPR < 1:** Short-term holders selling at loss = capitulation
- **LTH-SOPR > 3:** Long-term holders taking massive profit = distribution
- ETH equivalent: track profit-taking via exchange deposits of addresses aged > 6 months

## 5. Machine Learning Approaches (Reference)

### 5.1 LSTM for Time Series

**Architecture used in crypto research:**

```
Input: [price, volume, on-chain metrics, sentiment] × 30 days
→ LSTM(128) → Dropout(0.3)
→ LSTM(64) → Dropout(0.2)
→ Dense(32) → Dense(1)
Output: Next-day return prediction
```

**Performance note:** ML models alone achieve 52–58% directional accuracy on crypto. The multi-factor scoring approach (our model) is more robust because it's interpretable and doesn't overfit.

### 5.2 Ensemble Methods

**Best practice:** Use ML as one signal within the multi-factor framework, not as standalone:

- Random Forest on 50+ features → generates probability score
- Feed probability as one input to the composite scoring model
- Prevents black-box decision making

## 6. Risk Management Theory

### 6.1 Kelly Criterion (Modified)

**Original:** Kelly (1956) "A New Interpretation of Information Rate"

```
f* = (p × b - q) / b

Where:
  f* = fraction of capital to bet
  p  = probability of winning
  b  = net odds (reward/risk ratio)
  q  = 1 - p
```

**Crypto modification:** Use half-Kelly (f\*/2) due to fat tails and regime changes. With typical crypto win rate 55% and 2:1 R:R:

```
f* = (0.55 × 2 - 0.45) / 2 = 0.325
Half-Kelly = 16.25% per trade
```

### 6.2 Maximum Drawdown Control

**Rule of thumb:** If drawdown exceeds 2× expected max drawdown, the strategy regime has changed. Cut positions by 50% and re-evaluate the model.

### 6.3 Value-at-Risk (VaR) for Crypto

**Historical VaR(95%, 1-day) for ETH:** ~8–12% during high volatility periods. Position sizes should ensure that a 2× VaR event doesn't cause portfolio drawdown > 15%.

## 7. Open Source Tools Referenced

| Tool             | Purpose                                      | URL                                       |
| ---------------- | -------------------------------------------- | ----------------------------------------- |
| Freqtrade        | Backtesting + live trading bot (Python)      | github.com/freqtrade/freqtrade            |
| CCXT             | Unified crypto exchange API (200+ exchanges) | github.com/ccxt/ccxt                      |
| pandas-ta        | Technical analysis indicators library        | github.com/twopirllc/pandas-ta            |
| ta-lib           | C-based technical analysis (faster)          | github.com/TA-Lib/ta-lib-python           |
| Hummingbot       | Market-making + strategy framework           | github.com/hummingbot/hummingbot          |
| Zipline-reloaded | Event-driven backtesting                     | github.com/stefan-jansen/zipline-reloaded |
| QuantConnect     | Cloud backtesting platform                   | quantconnect.com                          |
| Santiment API    | Social + on-chain data                       | api.santiment.net                         |
