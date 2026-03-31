# Arnoldas Life Helper — Features

## Application Structure

- Runs as a Home Assistant add-on (amd64, aarch64, armv7)
- Web ingress for seamless HA panel access
- Persistent data storage at `/data`
- Supervisor API for notifications

---

## Tennis Radar

### Court Availability Monitoring

- **Automatic polling** with configurable interval (10–3600 seconds, default 30s)
- **Multi-provider support** — query multiple tennis court systems simultaneously
- **Date scanning** — scan specific dates or automatically check the next 7 days
- **Time preferences** — filter by earliest start time and latest end time
- **Duration filtering** — minimum booking duration (30–180 minutes)
- **Slot merging** — consecutive 30-minute slots merged into continuous blocks

### Providers

#### SEB Arena

- Queries the Teniso Pasaulis API for court availability
- Session token authentication
- Fetches court name, surface type, price, and slot status
- Retrieves user's existing bookings (next 6 months) with pricing

#### Baltic Tennis

- Scrapes the Baltic Tennis booking portal
- Username/password authentication with automatic session renewal
- Parses Lithuanian calendar format
- Retrieves user's upcoming bookings with price and duration

#### Provider Management

- Enable/disable providers independently
- Automatic disabling after persistent failures (10 consecutive errors)
- One-click resume for all disabled providers
- Concurrent fetching across providers

### Notifications

- **Home Assistant persistent notifications** in the HA notification panel
- **Mobile push notifications** to a configured device with action buttons (Open Booking Site / Dismiss)
- **Deduplication** — suppresses duplicate alerts for the same slot within 1 hour
- **Error alerts** when a provider is disabled due to failures

### Web UI — Navigation

Four top-level screens accessible via pill-style tabs on every page:

1. **Tennis Radar** — court availability and bookings (default)
2. **Home Building** — todo list for home building tasks
3. **Settings** — shared configuration for all features
4. **Investments** — portfolio tracker (separate page with full-width layout)

URL-based screen switching (`?screen=settings`) with browser history support.

### Tennis Radar Screen

Sub-tabs (outline style) within the Tennis Radar screen:

#### Courts Sub-tab

- Available slots grouped by date
- Cards showing court name, time range, duration, and provider
- Summary of total matching courts
- Poll statistics: last poll time, dates checked, slots found, query duration, per-provider breakdown

#### Bookings Sub-tab

- User's existing bookings from all providers, grouped by date
- Displays court name, time, duration, provider, price, and status
- Manual refresh button
- Error handling for booking fetch failures

### Settings Screen

- **Date picker** — select from next 14 days with weekend indicators
- **Poll interval**, **start/end time**, **min duration**, **notify device**
- **Provider credentials** — SEB session token, Baltic Tennis username/password
- **Anthropic API key** — for AI portfolio insights
- **Debug mode** toggle
- Save with immediate effect and validation feedback

#### Status & Errors (Tennis Radar)

- Status badge: Running / Issues / Error / Loading (shown on Tennis Radar screen)
- Configuration warnings (invalid times, missing credentials, no providers enabled)
- Provider error banner with details and resume button

### Tennis Radar — Resilience

- Exponential backoff on polling failures (max 5 minutes)
- Provider isolation — one failure doesn't affect others
- Automatic session reconnection (Baltic Tennis)
- Graceful shutdown on SIGTERM/SIGINT

---

## Home Building TODO List

Task tracking for home building projects, powered by a Home Assistant todo entity (`todo.01kn1rvcbxskmfdrqfdry7xvkq`).

### Features

- **HA-backed storage** — all tasks stored in a Home Assistant todo entity, synced via the Supervisor API
- **Add tasks** with name and optional description
- **Toggle completion** — mark tasks as done or reopen them
- **Remove tasks** — delete tasks from the list
- **Progress tracking** — visual progress bar showing completion percentage
- **Organized display** — pending and completed tasks shown in separate sections

### Web UI

Accessible via the **Home Building** tab on the main dashboard:

- Progress card with completion count and percentage bar
- Add task form with name and description fields
- Pending tasks section with checkboxes to mark complete
- Completed tasks section (strikethrough styling) with option to reopen
- Delete button on each task
- Manual refresh button

### API Endpoints

- `GET /api/todos` — fetch all todo items from HA
- `POST /api/todos` — add a new todo item (summary, description)
- `PATCH /api/todos/:uid` — update a todo item (rename, status, description)
- `DELETE /api/todos/:uid` — remove a todo item

---

## Investment Portfolio Tracker

### Domain Model (Phase 1 — Interfaces & Stubs)

- **Multi-broker support** — Swedbank, Interactive Brokers, Revolut, Wix (employer equity)
- **Unified transaction model** — all broker-specific formats normalized to a common `ITransaction` interface
- **FIFO cost basis tracking** — tax lots with acquisition date, quantity, cost basis, and source (MARKET / RSU / ESPP)
- **Holdings & unrealized P/L** — open positions with current market value and unrealized gains
- **Realized trade tracking** — FIFO lot matching on sells with realized P/L computation
- **Dividends** — per-payment tracking with ticker, amount, currency
- **Interest income** — Revolut Flexible Cash Funds and Savings Accounts (EUR & USD)

### RSU Compensation Tracking

- RSU vestings tracked as compensation events (cost basis = $0, FMV recorded)
- Same-day RSU sales excluded from portfolio P/L — treated as compensation
- RSUs held beyond vesting tracked as portfolio holdings (cost basis = FMV at vesting)
- Compensation summary by grant, by year, and cumulative

### ESPP Statistics

- Discount tracking: built-in gain (FMV − purchase price) per lot
- Market appreciation: post-purchase gain/loss tracked separately
- Per-lot breakdown with hold period analysis
- Dedicated statistics aggregation

### Multi-Currency

- Base currency: EUR
- **ECB reference rates** — fetches live daily exchange rates from the European Central Bank on startup and price refresh
- Hardcoded EUR/USD fallback rates (2017–2026) used when ECB fetch fails or data is stale
- Supports EUR, USD, CNH (via CNY proxy), DKK
- All portfolio values expressible in original currency and EUR

### Market Prices

- **Live price refresh** — fetches current prices from Yahoo Finance via "Refresh Prices" button; also refreshes ECB exchange rates
- Date-based price lookup via `getPrice(ticker, date)` — returns the closest available price snapshot for any date
- `getCurrentPrice(ticker)` convenience wrapper uses today's date, preferring live-fetched prices over hardcoded data
- Hardcoded price history (2020–2026) for all tracked tickers: Baltic (APG1L, IGN1L, TEL1L, KNF1L, SAB1L, LNA1L, ROE1L), EU (ASML), US/HK (BABA, WIX, GOOG, NOVA, BYD/002594, PBR), and Revolut (E3G1/Evolution AB)
- Stale price indicator on holdings that haven't been refreshed

### Swedbank CSV Parser

- Parses all Swedbank CSV files (2022–2026) from `/data/Investments/swedbank/`
- Extracts and classifies transactions: BUY, SELL, DIVIDEND, TRANSFER, FEE, TAX
- Parses embedded trade details (ticker, quantity, price) from the Details column
- Handles fund orders and fund redemptions (SWRTECC, SWRMEDC, SWEDEM1, SWBACASC)
- Handles foreign stock trades (DCX, NOV-GY) with trade tax rows
- Two dividend description format variants (2022 legacy and 2023+ standard)

### Holdings Calculator

- FIFO lot tracking from parsed buy/sell transactions
- Current holdings with unrealized P&L (using hardcoded current prices)
- Multi-currency P&L: cost basis and current value converted to EUR using date-based exchange rates
- EUR base currency values displayed with € prefix

### Investments Page

- Separate page at `/investments` (independent entry point, not a tab)
- **Portfolio summary card**: total value, cost basis, unrealized/realized P&L, income, total return percentage — all pre-computed server-side
- **Risk warnings**: concentration and currency exposure alerts displayed as banners
- **Income card**: expandable per-stock dividend breakdown showing payment count and total EUR per symbol
- **Refresh Prices** button: fetches live prices from Yahoo Finance and ECB exchange rates, then recomputes all portfolio data
- **Copy Holdings** button: copies holdings as a markdown table to clipboard for pasting into AI chats
- **Price staleness indicator**: shows when prices were last refreshed; stale badge on individual holdings using hardcoded fallback data

Eight sub-tabs:

1. **Holdings**: symbol with broker badges, quantity, average cost, current value, unrealized P&L with totals. Expandable rows showing tax lot details (acquisition date, remaining qty, cost/share, source badge MARKET/RSU/ESPP). Search by symbol.
2. **Realized P&L**: year filter dropdown with short-term vs long-term P&L subtotals per year for tax reporting.
3. **Allocation**: geography, currency exposure, and sector breakdowns with progress bars — computed from ticker metadata.
4. **Equity Comp**: RSU view toggles between "By Year" (with cumulative EUR column) and "By Grant" (expandable per-grant vesting details with FMV, same-day sale badges). ESPP summary with discount stats.
5. **Stocks**: per-stock breakdown showing total invested, realized P&L, unrealized P&L, dividends, and total P&L for every instrument ever traded. Open/closed status badges, first trade date, geography/sector badges from ticker metadata, and sortable columns with totals row. Expandable rows showing per-stock transaction history.
6. **Transactions**: date, type (color-coded), symbol, description, quantity, price, amount, flow direction. Search by symbol/description/broker plus type filter dropdown. Count indicator when filtered.
7. **Upload**: upload/delete investment files (CSV/TXT) per broker via the web UI — no need for SSH or File Explorer to manage investment data. Files are stored in `/data/Investments/<broker>/` and portfolio data is automatically reloaded after changes.
8. **AI Insights**: AI-powered portfolio analysis (see AI Portfolio Insights section).

- All calculations pre-computed server-side; frontend is presentation-only (client-side sorting, search, and filtering for interactive views)
- Navigation link from main dashboard

### Revolut Parser

- Parses multi-section Revolut CSV export from `/data/Investments/revolut/`
- **Brokerage sells** (EUR & USD): creates synthetic BUY + SELL transaction pairs from each sell row (dateAcquired/costBasis → BUY, dateSold/grossProceeds → SELL) for FIFO tracking
- **Crypto sells**: BTC and XRP trades parsed as BUY + CRYPTO_SELL pairs with USD→EUR conversion
- **Interest summary**: extracts total earned interest from Flexible Cash Funds (EUR/USD) and Savings Accounts (EUR/USD) — displayed as a summary card, no individual transactions
- Supports multi-currency: EUR brokerage (E3G1/Evolution), USD brokerage (BABA/Alibaba), USD crypto
- Base currency conversion uses existing EUR/USD rate table

### Interactive Brokers Parser

- Parses IB trade confirmation CSV exports from `/data/Investments/interactive-brokers/`
- Handles 90+ column CSV format with full field mapping to `IInteractiveBrokersTransaction`
- Classifies STK (stock/ADR) trades as BUY or SELL transactions
- Skips CASH (forex) rows — internal currency conversions, not investment transactions
- Multi-currency support: EUR, USD, CNH, DKK — converts to EUR base currency using IB's `FXRateToBase` when available, falls back to internal rate table
- Fees: combines IB commission + taxes per trade

### Wix Equity Parser

- Parses Wix employer equity data from `/data/Investments/wix/`
- **shares-issued.txt**: RSU vestings and ESPP purchases — space-delimited, no header
- **shares-sold.txt**: share sales (same-day compensation sales and later market sales) — space-delimited, no header
- Handles variable-length sale type field ("Sell of Stock" vs "Sell of Restricted Stock")
- Deduplicates records (issued by vestingDate+grantId+shares, sold by transactionId)
- RSU vestings → `RSU_VEST` transactions with FMV as cost basis for portfolio tracking
- ESPP purchases → `ESPP_PURCHASE` transactions with discounted purchase price as cost basis
- Sales → `SELL` transactions with fees
- All amounts in USD, converted to EUR base currency
- Holdings computation supports RSU/ESPP lot sources for FIFO tracking

### Portfolio Analytics Service

- **Single source of truth** — all portfolio calculations computed server-side in `portfolio-analytics.ts`, frontend is presentation-only
- **Stock statistics**: per-stock aggregation of realized P&L, unrealized P&L, dividends, fees, total invested, and total P&L across all brokers and transaction types
- **Portfolio summary**: pre-computed totals (cost basis, value, unrealized/realized P&L, income, total return %)
- **Dividend aggregation**: dividends grouped by stock symbol with count and total EUR
- **Realized trade summary**: short-term vs long-term P&L breakdown with counts
- **RSU cumulative timeline**: by-year compensation with running cumulative USD/EUR totals

### Test Suite

- **Vitest** test framework with 114 tests across 9 test files
- **Holdings tests**: FIFO lot tracking, realized trade P&L, hold period classification, multi-symbol handling
- **Currency tests**: exchange rate lookups, cross-currency conversion, identity and edge cases
- **Portfolio analytics tests**: stock stats aggregation, portfolio summary, dividend grouping, realized trade summary, RSU cumulative timeline
- **Allocation & risk tests**: geographic/sector/currency allocation, concentration warnings, ticker metadata
- **Equity compensation tests**: RSU compensation by grant/year, same-day sale detection, ESPP discount calculation
- **Parser tests**: Swedbank (trade classification, dividend formats, ticker aliases), Interactive Brokers (forex filtering, FX rate conversion, date parsing), Wix (RSU/ESPP classification, sell handling), Revolut (synthetic BUY+SELL pairs, crypto transactions)

### AI Portfolio Insights

- **AI-powered analysis** — generates portfolio suggestions and insights using Claude (Anthropic API)
- **Anthropic API key** — configured in the Tennis Radar Settings tab (Advanced section)
- **Persistent storage** — AI suggestions saved to `/data/ai-suggestions.json` and persist across restarts
- **On-demand generation** — click "Generate Insights" button in the AI Insights tab to request fresh analysis
- **Portfolio context** — sends holdings, allocation, risk warnings, realized P&L, and per-stock performance to the AI
- **Structured output** — portfolio health assessment, key strengths, concerns, actionable suggestions, and tax considerations

### Parser Interface

- Generic `IDataParser<T>` interface defined for each broker
- `IRevolutParser` handles multi-section file format (flexible cash, savings, brokerage, crypto)
- All broker parsers implemented

---

## Configuration

- Persistent config stored in `/data/config.json`
- Falls back to HA add-on options, then defaults
- Validates settings and returns warnings to UI
- Legacy key migration (teniso_pasaulis → seb)

## API Endpoints

- `/api/status` — polling status, available slots, provider stats
- `/api/bookings` — user's existing court bookings from all providers
- `/api/config` — read/update configuration
- `/api/resume` — re-enable disabled providers
- `/api/todos` — GET all todo items, POST to add new item
- `/api/todos/:uid` — PATCH to update, DELETE to remove a todo item
- `/api/investments` — parsed transactions, computed holdings, and all pre-computed analytics
- `/api/investments/refresh` — refresh live prices (Yahoo Finance) and exchange rates (ECB), recompute portfolio
- `/api/investments/files` — list uploaded investment files per broker
- `/api/investments/upload` — upload investment files (multipart)
- `/api/investments/files/:broker/:filename` — delete an investment file
- `/api/investments/ai-suggestions` — GET saved AI suggestions, POST to generate new ones

## Tech Stack

- **Frontend**: Preact, TypeScript, Mantine UI, esbuild
- **Backend**: Fastify, Node.js 20+, Cheerio
- **Deployment**: Docker (Alpine Linux), s6-overlay, port 8099
- **Build system**: esbuild with content-hashed filenames (`app-[HASH].js`) for automatic cache busting; server discovers hashed asset filenames at startup
- **Cache control**: all responses include no-cache headers; hashed filenames ensure fresh assets after deployments
