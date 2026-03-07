# Data Sources & API Endpoints

## Data Confidence Tiers (Trust Model)

To ensure "Faithfulness" (信), data inputs are weighted by source reliability.

| Tier       | Category                  | Examples                                                                                                         | Weight  | Handling Rule                                    |
| :--------- | :------------------------ | :--------------------------------------------------------------------------------------------------------------- | :------ | :----------------------------------------------- |
| **Tier 1** | **Ground Truth**          | On-chain data (Etherscan), Regulatory Filings (SEC), Central Bank Reports (FED/BIS), Official Docs (Circle.com). | **1.0** | Primary decision driver.                         |
| **Tier 2** | **High Confidence**       | Top-tier Financial Media (Bloomberg, Reuters), CEX Market Data (Binance), Aggregators (CoinGecko, DefiLlama).    | **0.8** | Valid validation source.                         |
| **Tier 3** | **Narrative/Speculative** | Social Media (X/Twitter), Anonymous Research, AI-generated "Deep Dives", Unverified Leaks.                       | **0.3** | **Requires 2x Tier 1/2 confirmation** or ignore. |

> **Audit Policy**: Any "Alpha" from Tier 3 sources must be treated as "Hallucination until Proven Verified".

---

Free and open APIs for each signal dimension. Prefer free-tier endpoints; fall back to web scraping when needed.

## On-Chain Data (Tier 1)

### Etherscan (Free API, 5 calls/sec)

```bash
# API key: register at etherscan.io (free)
BASE="https://api.etherscan.io/api"

# ETH supply
curl "$BASE?module=stats&action=ethsupply2&apikey=$ETHERSCAN_KEY"

# Gas price (oracle)
curl "$BASE?module=gastracker&action=gasoracle&apikey=$ETHERSCAN_KEY"

# Daily active addresses (proxy via block count)
curl "$BASE?module=proxy&action=eth_blockNumber&apikey=$ETHERSCAN_KEY"

# ETH balance of top exchange wallets (track exchange flows)
# Binance hot: 0x28C6c06298d514Db089934071355E5743bf21d60
# Coinbase: 0xA9D1e08C7793af67e9d92fe308d5697FB81d3E43
curl "$BASE?module=account&action=balance&address=0x28C6c06298d514Db089934071355E5743bf21d60&apikey=$ETHERSCAN_KEY"
```

### Beacon Chain (Staking Data)

```bash
# Beaconcha.in free API
curl "https://beaconcha.in/api/v1/epoch/latest"
curl "https://beaconcha.in/api/v1/validators/queue"

# Total ETH staked
curl "https://beaconcha.in/api/v1/epoch/latest/deposits"
```

### CoinGecko (Free, 30 calls/min)

```bash
BASE="https://api.coingecko.com/api/v3"

# Current price + market data
curl "$BASE/coins/ethereum?localization=false&tickers=false&community_data=false&developer_data=false"

# Historical prices (90 days)
curl "$BASE/coins/ethereum/market_chart?vs_currency=usd&days=90"

# Global market data (dominance, total mcap)
curl "$BASE/global"
```

### DeFi Llama (Free, no key)

```bash
# TVL by chain
curl "https://api.llama.fi/v2/chains"

# ETH TVL history
curl "https://api.llama.fi/v2/historicalChainTvl/Ethereum"

# Protocol TVL breakdown
curl "https://api.llama.fi/protocols"

# DEX volumes
curl "https://api.llama.fi/overview/dexs/ethereum"

# Stablecoin flows (proxy for capital flows)
curl "https://stablecoins.llama.fi/stablecoinchains"
```

## Technical Data

### Binance Public API (Free, no key for market data)

```bash
BASE="https://api.binance.com/api/v3"

# Klines (candlesticks)
curl "$BASE/klines?symbol=ETHUSDT&interval=1d&limit=100"
curl "$BASE/klines?symbol=ETHUSDT&interval=4h&limit=200"

# 24h ticker
curl "$BASE/ticker/24hr?symbol=ETHUSDT"

# Order book depth
curl "$BASE/depth?symbol=ETHUSDT&limit=50"

# Recent trades
curl "$BASE/trades?symbol=ETHUSDT&limit=500"
```

### Funding Rate & Open Interest

```bash
# Binance Futures
FBASE="https://fapi.binance.com/fapi/v1"

# Funding rate
curl "$FBASE/fundingRate?symbol=ETHUSDT&limit=30"

# Open interest
curl "$FBASE/openInterest?symbol=ETHUSDT"

# Long/Short ratio (endpoint moved to /futures/data/ path)
curl "$FBASE/../futures/data/globalLongShortAccountRatio?symbol=ETHUSDT&period=1d&limit=30"
```

## Macro & Geopolitical (Tier 1/2 Mixed)

### Payment Infrastructure & Official Sources (Tier 1)

- **FedNow Explorer**: `https://explore.fednow.org/` (Official specs, **NOT CBDC**)
- **BIS mBridge Hub**: `https://www.bis.org/about/bisih/topics/cbdc/mcbdc_bridge.htm` (Project status tracking)
- **Circle Investor Relations**: `https://investor.circle.com/` (Verify IPO/S-1 status)

### FRED (Federal Reserve Economic Data, free API key)

```bash
BASE="https://api.stlouisfed.org/fred/series/observations"

# DXY (Dollar Index) — use DTWEXBGS as proxy
curl "$BASE?series_id=DTWEXBGS&api_key=$FRED_KEY&file_type=json&sort_order=desc&limit=30"

# 10-Year Treasury Yield
curl "$BASE?series_id=DGS10&api_key=$FRED_KEY&file_type=json&sort_order=desc&limit=30"

# M2 Money Supply
curl "$BASE?series_id=M2SL&api_key=$FRED_KEY&file_type=json&sort_order=desc&limit=12"

# CPI (inflation)
curl "$BASE?series_id=CPIAUCSL&api_key=$FRED_KEY&file_type=json&sort_order=desc&limit=12"

# Fed Funds Rate
curl "$BASE?series_id=FEDFUNDS&api_key=$FRED_KEY&file_type=json&sort_order=desc&limit=12"
```

### Geopolitical Risk Index

```bash
# Matteo Iacoviello's GPR Index (monthly updates, CSV)
curl "https://www.matteoiacoviello.com/gpr_files/data_gpr_daily_recent.xls" -o /tmp/gpr.xls

# Alternative: use web_search for current GPR readings
# Search: "geopolitical risk index latest monthly"
```

### BTC ETF Flows

```bash
# Free tracking via web scrape or:
# SoSoValue: https://sosovalue.com/assets/etf/us-btc-spot
# Farside Investors: https://farside.co.uk/btc/

# Proxy: use web_search tool
# Search: "bitcoin ETF daily flows this week"
```

## Sentiment

### Alternative.me Fear & Greed Index (free, no key)

```bash
# Current
curl "https://api.alternative.me/fng/"

# Historical (30 days)
curl "https://api.alternative.me/fng/?limit=30"
```

### Deribit Options (Put/Call)

```bash
# Use web_search: "deribit ETH options put call ratio"
# Or: https://metrics.deribit.com/options/ETH
```

### Social Sentiment

```bash
# LunarCrush (free tier)
# https://lunarcrush.com/developers/api/endpoints
# Or use web_search: "ethereum social sentiment score today"

# Google Trends (proxy for retail interest)
# https://trends.google.com/trends/explore?q=ethereum&date=now%207-d
```

## DeFi & Ecosystem

### L2Beat (L2 activity, free)

```bash
# TVL by L2
curl "https://l2beat.com/api/tvl/aggregate" 2>/dev/null | head -100

# Alternative: web scrape l2beat.com
```

### Ultrasound.money (ETH burn/issuance)

```bash
# ETH supply and burn data
# Use web_search: "ultrasound money eth supply burn rate"
# Or scrape: https://ultrasound.money/
```

### GitHub Developer Activity

```bash
# Ethereum org repos
curl "https://api.github.com/orgs/ethereum/repos?sort=pushed&per_page=10"

# Commit frequency (proxy for dev activity)
curl "https://api.github.com/repos/ethereum/go-ethereum/stats/commit_activity"
```

## Aggregated Dashboards (for manual cross-reference)

| Dashboard      | URL                  | Free    | Best For                  |
| -------------- | -------------------- | ------- | ------------------------- |
| CoinGlass      | coinglass.com        | Yes     | Funding, OI, liquidations |
| Token Terminal | tokenterminal.com    | Partial | Protocol fundamentals     |
| Dune Analytics | dune.com             | Yes     | Custom on-chain queries   |
| Artemis        | app.artemis.xyz      | Partial | Cross-chain activity      |
| IntoTheBlock   | app.intotheblock.com | Partial | On-chain signals          |
| Messari        | messari.io           | Partial | Research + metrics        |

## Environment Variables

The analysis script uses these optional env vars:

```bash
export ETHERSCAN_KEY="your_key"         # etherscan.io (free)
export FRED_KEY="your_key"              # fred.stlouisfed.org (free)
export COINGECKO_KEY=""                 # optional, for higher rate limits
export BINANCE_KEY=""                   # optional, for higher rate limits
```

Without keys, the script falls back to keyless endpoints (lower rate limits) and web_search.
