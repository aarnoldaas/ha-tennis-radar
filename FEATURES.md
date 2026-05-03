# Tennis Radar & Investments — Features

This repository hosts two independent Home Assistant add-ons:

- **`tennis/`** — tennis court availability scanner (SEB Arena, Baltic Tennis)
- **`investments/`** — personal portfolio tracker with AI insights

Each addon has its own `src/`, `public/`, `data/`, Dockerfile, config, and versioning. They share no code.

## Shared Conventions

- Each addon runs as a standalone Home Assistant add-on (amd64, aarch64)
- Each uses web ingress on port 8099 (separate containers — no conflict)
- Persistent data storage at `/data` inside each container
- Supervisor API access for notifications (tennis only)
- Build pipeline: esbuild bundles backend to `dist/bundle.cjs` and frontend to content-hashed `public/app-[HASH].{js,css}` assets; server discovers the hashed filenames at startup

---

# Tennis Radar Addon (`tennis/`)

## Court Availability Monitoring

- **Automatic polling** with configurable interval (10–3600 seconds, default 30s)
- **Night hours** — separate interval (23:00–08:00) to reduce polling during off-hours
- **Multi-provider support** — query multiple tennis court systems simultaneously
- **Date scanning** — scan specific dates or automatically check the next 7 days
- **Time preferences** — filter by earliest start time and latest end time
- **Duration filtering** — minimum booking duration (30–180 minutes)
- **Slot merging** — consecutive 30-minute slots merged into continuous blocks

## Providers

### SEB Arena

- Queries the Teniso Pasaulis API for court availability
- Session token authentication
- Fetches court name, surface type, price, and slot status
- Retrieves user's existing bookings (next 6 months) with pricing

### Baltic Tennis

- Scrapes the Baltic Tennis booking portal
- Username/password authentication with automatic session renewal
- Parses Lithuanian calendar format
- Retrieves user's upcoming bookings with price and duration

### Provider Management

- Enable/disable providers independently for radar polling — credentials remain active for bookings even when a provider is excluded from the radar
- Automatic disabling after persistent failures (10 consecutive errors)
- One-click resume for all disabled providers
- Concurrent fetching across providers

## Notifications

- **Home Assistant persistent notifications** in the HA notification panel
- **Mobile push notifications** to a configured device with action buttons (Open Booking Site / Dismiss)
- **Deduplication** — suppresses duplicate alerts for the same slot within 1 hour
- **Error alerts** when a provider is disabled due to failures
- **Booking reminders** — automatic reminders at 72 hours (3 days) and 49 hours before each existing booking. Bookings are fetched from providers every 6 hours and cached in memory; a lightweight in-memory tick re-evaluates the cache every 30 minutes so threshold crossings fire promptly without re-hitting the network. Each `(booking, threshold)` fires at most once with state persisted to `/data/booking-reminders.json` so restarts don't resend. If the addon comes online late, only the most-imminent applicable threshold fires.

## Web UI

Single-page application with persistent sidebar (desktop, 220px) and bottom tab bar (mobile). Warm dark theme, amber/gold accent, DM Sans typography, JetBrains Mono for numeric data.

Navigation: **Tennis Radar** (Courts, Bookings) + **Settings**.

### Courts Screen
- Available slots grouped by date with cards showing court name, time range, duration, provider
- Summary of total matching courts
- Poll statistics: last poll time, dates checked, slots found, query duration, per-provider breakdown

### Bookings Screen
- User's existing bookings from all providers with configured credentials, grouped by date — bookings are returned regardless of whether the provider is enabled for radar polling
- Back-to-back bookings on the same court (where one ends exactly when the next begins) are merged into a single combined session — duration is summed and price is summed when the format is parseable
- Court name, time, duration, provider, price, status
- Manual refresh button, error handling for fetch failures

### Settings Screen
- **Date picker** — select from next 14 days with weekend indicators (accent-bordered card)
- **General** — poll interval, start/end time, min duration, notify device
- **Accordion sections** — SEB Arena credentials, Baltic Tennis credentials, Advanced (Debug mode)
- Save with immediate effect and validation feedback (sticky bottom bar with backdrop blur)

### Status & Errors
- Status badge in sidebar: Running / Issues / Error / Loading
- Configuration warnings (invalid times, missing credentials, no providers enabled)
- Provider error banner with details and resume button

## Resilience

- Exponential backoff on polling failures (max 5 minutes)
- Provider isolation — one failure doesn't affect others
- Automatic session reconnection (Baltic Tennis)
- Graceful shutdown on SIGTERM/SIGINT

## Configuration

- Persistent config stored in `/data/config.json`
- Falls back to HA add-on options, then defaults
- Validates settings and returns warnings to UI
- Legacy key migration (teniso_pasaulis → seb)

## API Endpoints

- `GET /api/status` — polling status, available slots, provider stats, config warnings
- `GET /api/bookings` — user's existing court bookings from all providers
- `GET /api/config`, `POST /api/config` — read/update configuration
- `POST /api/resume` — re-enable disabled providers

---

# Investments Addon (`investments/`)

## Domain Model

- **Multi-broker support** — Swedbank, Interactive Brokers, Revolut, Wix (employer equity)
- **Unified transaction model** — all broker-specific formats normalized to a common `ITransaction` interface
- **FIFO cost basis tracking** — tax lots with acquisition date, quantity, cost basis, and source (MARKET / RSU / ESPP)
- **Holdings & unrealized P/L** — open positions with current market value and unrealized gains
- **Realized trade tracking** — FIFO lot matching on sells with realized P/L computation
- **Dividends** — per-payment tracking with ticker, amount, currency
- **Interest income** — Revolut Flexible Cash Funds and Savings Accounts (EUR & USD)

## RSU Compensation Tracking

- RSU vestings tracked as compensation events (cost basis = $0, FMV recorded)
- Same-day RSU sales excluded from portfolio P/L — treated as compensation
- RSUs held beyond vesting tracked as portfolio holdings (cost basis = FMV at vesting)
- Compensation summary by grant, by year, and cumulative

## ESPP Statistics

- Discount tracking: built-in gain (FMV − purchase price) per lot
- Market appreciation: post-purchase gain/loss tracked separately
- Per-lot breakdown with hold period analysis
- Dedicated statistics aggregation

## Multi-Currency

- Base currency: EUR
- **ECB reference rates** — fetches live daily exchange rates from the European Central Bank on startup and price refresh
- Hardcoded EUR/USD fallback rates (2017–2026) used when ECB fetch fails or data is stale
- Supports EUR, USD, CNH (via CNY proxy), DKK

## Market Prices

- **Live price refresh** — fetches current prices from Stooq (free keyless CSV) via "Refresh Prices" button; also refreshes ECB exchange rates
- Stooq covers US tickers (BABA, WIX, GOOG, PBR, NOVA/NVO) and ASML (Amsterdam). Tickers without Stooq coverage — Baltic (APG1L, IGN1L, TEL1L, KNF1L, SAB1L, LNA1L, ROE1L), BYD (002594), E3G1 (Frankfurt) — are updated via manual entry through the Price History tab
- **One-time history backfill** — on the first refresh the server fetches ~5 years of daily history from Stooq for covered tickers and merges it into `price-history.json`. A `stooq-backfilled.json` flag file prevents repeat backfills
- Date-based price lookup via `getPrice(ticker, date)` — returns the closest available snapshot for any date
- Hardcoded price history (2020–2026) remains as a fallback for all tracked tickers
- Stale price indicator on holdings that haven't been refreshed

## Broker Parsers

### Swedbank CSV
- Parses all CSV files (2022–2026) from `/data/Investments/swedbank/`
- Classifies BUY, SELL, DIVIDEND, TRANSFER, FEE, TAX
- Parses embedded trade details from the Details column
- Handles fund orders/redemptions (SWRTECC, SWRMEDC, SWEDEM1, SWBACASC)
- Handles foreign stock trades (DCX, NOV-GY) with trade tax rows
- Two dividend description format variants (2022 legacy and 2023+ standard)

### Revolut
- Multi-section Revolut CSV export from `/data/Investments/revolut/`
- **Brokerage sells** (EUR & USD): creates synthetic BUY + SELL pairs from each sell row (dateAcquired/costBasis → BUY, dateSold/grossProceeds → SELL) for FIFO tracking
- **Crypto sells**: BTC and XRP parsed as BUY + CRYPTO_SELL pairs with USD→EUR conversion
- **Interest summary**: aggregate earned interest from Flexible Cash Funds (EUR/USD) and Savings Accounts (EUR/USD) — summary card, no individual transactions
- Multi-currency: EUR brokerage (E3G1/Evolution), USD brokerage (BABA/Alibaba), USD crypto

### Interactive Brokers
- IB trade confirmation CSV exports from `/data/Investments/interactive-brokers/`
- 90+ column CSV format mapped to `IInteractiveBrokersTransaction`
- STK (stock/ADR) trades classified as BUY or SELL
- CASH (forex) rows skipped — internal currency conversions
- Multi-currency: EUR, USD, CNH, DKK — uses IB's `FXRateToBase` when available
- Fees: combines IB commission + taxes per trade

### Wix Equity
- Employer equity from `/data/Investments/wix/`
- **shares-issued.txt**: RSU vestings and ESPP purchases — space-delimited, no header
- **shares-sold.txt**: share sales (same-day compensation sales and later market sales)
- Handles variable-length sale type field ("Sell of Stock" vs "Sell of Restricted Stock")
- Deduplicates records (issued by vestingDate+grantId+shares, sold by transactionId)
- RSU vestings → `RSU_VEST` with FMV as cost basis
- ESPP purchases → `ESPP_PURCHASE` with discounted purchase price as cost basis
- All amounts in USD, converted to EUR

## Portfolio Analytics Service

- **Single source of truth** — all portfolio calculations computed server-side in `portfolio-analytics.ts`; frontend is presentation-only
- **Stock statistics**: per-stock aggregation of realized P&L, unrealized P&L, dividends, fees, total invested, total P&L
- **Portfolio summary**: pre-computed totals (cost basis, value, unrealized/realized P&L, income, total return %)
- **Dividend aggregation**: dividends grouped by stock symbol with count and total EUR
- **Realized trade summary**: short-term vs long-term P&L breakdown with counts
- **RSU cumulative timeline**: by-year compensation with running cumulative USD/EUR totals

## Web UI

Tabbed layout: **Investments** tab (default) + **Settings** tab. Warm dark theme shared with Tennis Radar addon (DM Sans + JetBrains Mono, amber accent).

### Investments Tab
- **Portfolio summary card**: hero metric layout — large amber portfolio value with secondary metrics (cost basis, unrealized/realized P&L, income, return %)
- **Dashboard overview**: bento grid with holdings treemap, geographic donut, sector horizontal bar chart
- **Risk warnings**: concentration and currency exposure alerts as banners
- **Income card**: expandable per-stock dividend breakdown
- **Refresh Prices** button: fetches live prices from Stooq and ECB exchange rates
- **Copy Holdings** button: markdown table to clipboard for pasting into AI chats

Sub-tabs inside Investments:
1. **Holdings** — symbol with broker badges, qty, avg cost, current value, unrealized P&L. Expandable rows show tax lots. Search by symbol
2. **Realized P&L** — year filter with short-term vs long-term subtotals per year
3. **Allocation** — geography, currency, sector donut charts from ticker metadata
4. **Equity Comp** — RSU view (by year / by grant) and ESPP summary with discount stats
5. **Stocks** — per-stock breakdown (invested, realized, unrealized, dividends, total P&L) with expandable transaction history
6. **Trade Analysis** — per-stock buy/sell analysis with avg prices, win rate, hold period stats
7. **Market Data** — live price table (ticker / name / price / IR link)
8. **Transactions** — date, type (color-coded), symbol, description, qty, price, amount. Search and type filter
9. **Upload** — upload/delete investment files per broker
10. **Plan** — editable investment plan with AI refinement
11. **AI Insights** — AI-powered portfolio analysis (see below)
12. **Price History** — edit file-based price entries for tickers without Stooq coverage

### Settings Tab
- **AI** — Anthropic API key (password field)
- **Advanced** — Debug mode toggle

## AI Portfolio Insights

- Powered by Claude (Anthropic API) — requires Anthropic API key in Settings
- Persistent storage — AI suggestions saved to `/data/ai-suggestions.json`, persist across restarts
- On-demand generation — "Generate Insights" button in AI Insights tab
- Portfolio context: holdings, allocation, risk warnings, realized P&L, per-stock performance
- Structured output: health assessment, strengths, concerns, actionable suggestions, tax considerations
- Plan refinement uses the same key to rewrite the user's free-text plan with portfolio context

## Test Suite

- **Vitest** framework with tests across 9 files covering:
  - Holdings — FIFO lot tracking, realized P&L, hold period classification, multi-symbol
  - Currency — exchange rate lookups, cross-currency conversion
  - Portfolio analytics — stock stats, portfolio summary, dividend grouping, realized trade summary, RSU cumulative timeline
  - Allocation & risk — geographic/sector/currency allocation, concentration warnings
  - Equity compensation — RSU by grant/year, same-day sale detection, ESPP discount
  - Parsers — Swedbank, IB, Wix, Revolut

## Configuration

- Persistent config stored in `/data/config.json`
- Fields: `anthropic_api_key`, `debug`
- Unknown legacy keys (from before the addon split) are silently ignored when loading

## API Endpoints

- `GET /api/investments` — parsed transactions, computed holdings, all pre-computed analytics
- `POST /api/investments/refresh` — refresh live prices (Stooq) and exchange rates (ECB); response `{ fetched, failed, skipped }`
- `GET /api/investments/files` — list uploaded files per broker
- `POST /api/investments/upload` — upload investment files (multipart)
- `DELETE /api/investments/files/:broker/:filename` — delete a file
- `GET /api/investments/ai-suggestions`, `POST /api/investments/ai-suggestions` — load / generate
- `GET /api/investments/plan`, `POST /api/investments/plan`, `POST /api/investments/plan/refine`
- `GET /api/investments/price-history` — editable entries only
- `PUT /api/investments/price-history/:ticker`, `DELETE /api/investments/price-history/:ticker/:date`
- `GET /api/config`, `POST /api/config` — read/update settings

---

## Tech Stack (Both Addons)

- **Frontend**: React 18, TypeScript, Mantine UI v7, esbuild
- **Backend**: Fastify, Node.js 20+
- **Deployment**: Docker (Alpine Linux), s6-overlay, port 8099
- **Design tokens**: DM Sans + JetBrains Mono, warm dark theme, amber/gold accent, CSS custom properties
- **Cache control**: all responses include no-cache headers; content-hashed bundle filenames (`app-[HASH].js`) ensure fresh assets after deploys

## Investments-Only Additional Dependencies

- `@anthropic-ai/sdk` — AI insights
- `@fastify/multipart` — file uploads
- `papaparse` — CSV parsing
- `recharts` — charts
