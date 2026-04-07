# Features

## Tennis Court Radar
- Scans court availability from multiple providers (SEB, Baltic Tennis)
- Configurable time preferences and polling intervals
- Push notifications via Home Assistant when matching slots found
- Provider health monitoring with auto-disable and manual resume

## Investment Portfolio Tracker

### Multi-Broker Support
- **Swedbank** — Baltic/Lithuanian stock trades, dividends, custody fees, trade tax
- **Interactive Brokers** — IB Activity Statement parser supporting trades, dividends, withholding tax, deposits/withdrawals, interest, and fees across multiple currencies (EUR, USD, CNH, DKK)
- **Revolut** — Flexible Cash Funds, Savings Accounts, brokerage sells (EUR/USD), crypto sells
- **Wix** — Employee equity compensation (RSU vesting, ESPP purchases, share sales)

### Market Data
- **Live prices** via Yahoo Finance (`yahoo-finance2`) — manual refresh button
- **Alpha Vantage fallback** — when Yahoo Finance fails, automatically tries Alpha Vantage API (free tier: 25 calls/day). Fetches GLOBAL_QUOTE for price and OVERVIEW for fundamentals (P/E, EPS, dividend yield, 52-week range, market cap). Prioritizes tickers with oldest/no cached prices.
- Ticker mapping for Baltic (XVSE), EU (Amsterdam, Stockholm), China (Shenzhen), and US exchanges
- **Persistent price history** — prices saved to `data/Investments/price-history.json` on each refresh, loaded on startup
- Hardcoded historical prices as fallback when fetch fails, merged with file-based history
- Staleness indicators showing when prices were last refreshed
- **Stock fundamentals** — P/E ratio, forward P/E, EPS, dividend yield/rate, ex-dividend date, market cap, 52-week high/low, beta
- **Market Data tab** — stock fundamentals table with clickable tickers that navigate to the per-stock detail view
- **Per-stock detail view** — comprehensive stock page accessible by clicking any ticker in Holdings, Stocks, Trade Analysis, or Market Data tabs. Shows: P&L summary cards, fundamentals, trade analysis stats, current holding lots, price history chart, and sub-tabs for all transactions, realized trades, and dividends for that stock

### Exchange Rates
- **ECB reference rates** fetched at startup — daily rates for all major currencies since 1999
- Hardcoded EUR/USD fallback when ECB fetch fails
- CNH approximated via ECB's CNY rate; DKK from ECB (near-fixed peg to EUR)
- Cross-currency conversion via EUR (X → EUR → Y)

### Holdings & P&L
- **FIFO lot tracking** — accurate cost basis per share across all brokers
- **Unrealized P&L** — computed in EUR with proper currency normalization
- **Realized P&L** — captured on every sell with FIFO lot matching, hold period classification (short-term/long-term)
- **Stock split handling** — corporate actions adjust lot quantities and cost basis (e.g., GOOG 20:1 split)
- Portfolio summary card: Value, Cost Basis, Unrealized P&L, Realized P&L, Income, Total Return

### Income Tracking
- **Dividends** — parsed from Swedbank and Interactive Brokers, aggregated with EUR conversion
- **Interest** — Revolut Flexible Cash and Savings account interest (EUR + USD)
- Unified income summary card

### Analytics
- **Asset allocation** breakdown by geography, currency exposure, and sector
- **Concentration risk warnings** — flags single positions >20% of portfolio, single currency >50%
- Progress bars showing allocation percentages

### Equity Compensation
- **RSU compensation summary** — total value by year and by grant, cumulative timeline
- **ESPP summary** — shares purchased, cost basis, discount captured, average discount %

### Trade Analysis
- **Per-stock buy/sell analysis tab** — avg buy price, avg sell price, current price, last buy/sell date and price
- Total bought/sold quantities and transaction counts per stock
- **Win rate** — percentage of profitable realized sells per stock
- **Best/worst trade** — best and worst single realized trade P&L (EUR)
- **Average hold period** — mean days held for realized trades
- Filterable by open/closed positions, sortable by all columns

### Investment Plan
- **Editable plan editor** — write and save your investment strategy, goals, rules, and next steps in markdown
- Auto-saves and shows live markdown preview
- **AI refinement** — sends your plan + current portfolio data to Claude for review, risk analysis, and concrete suggestions
- Accept/dismiss the AI-refined version; original plan preserved until explicitly replaced

### Dashboard
- React + Mantine UI with dark theme + **Recharts** for data visualizations
- **Dashboard overview** — 3 donut charts (holdings by value, geographic allocation, sector allocation) displayed above tabs
- **Charted tabs**: Holdings donut, allocation donuts, monthly realized P&L bar chart, RSU compensation bar+line combo, stock P&L horizontal bars, price history line chart, dividend breakdown donut
- Sortable tables for holdings, realized trades, and transactions
- Modular component architecture (split from monolithic file into 15+ components)
- Tabs: Holdings, Realized P&L, Allocation, Equity Comp, Stocks, Trade Analysis, Market Data, Transactions, Upload, Plan, AI Insights
- Color-coded P&L (green/red), transaction type badges
- Home Assistant ingress support

### Testing
- Vitest test suite for FIFO lot tracking, currency conversion, and realized P&L calculations
