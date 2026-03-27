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

### Tennis Radar — Web Dashboard

#### Courts Tab

- Available slots grouped by date
- Cards showing court name, time range, duration, and provider
- Summary of total matching courts
- Poll statistics: last poll time, dates checked, slots found, query duration, per-provider breakdown

#### Bookings Tab

- User's existing bookings from all providers, grouped by date
- Displays court name, time, duration, provider, price, and status
- Manual refresh button
- Error handling for booking fetch failures

#### Settings Tab

- **Date picker** — select from next 14 days with weekend indicators
- **Poll interval**, **start/end time**, **min duration**, **notify device**
- **Provider credentials** — SEB session token, Baltic Tennis username/password
- **Debug mode** toggle
- Save with immediate effect and validation feedback

#### Status & Errors

- Status badge: Running / Issues / Error / Loading
- Configuration warnings (invalid times, missing credentials, no providers enabled)
- Provider error banner with details and resume button

### Tennis Radar — Resilience

- Exponential backoff on polling failures (max 5 minutes)
- Provider isolation — one failure doesn't affect others
- Automatic session reconnection (Baltic Tennis)
- Graceful shutdown on SIGTERM/SIGINT

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
- Stub currency conversion (`getExchangeRate`, `convertAmount`) with hardcoded EUR/USD rates (2017–2026)
- Designed for easy swap to CSV-backed rate lookup
- All portfolio values expressible in original currency and EUR

### Current Prices

- Stub `getCurrentPrice` with hardcoded approximate prices for known tickers
- Covers Baltic (APG1L, IGN1L, TEL1L, KNF1L, ROE1L), EU (ASML), and US/HK (BABA, WIX, BYD) stocks

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
- EUR base currency values

### Investments Page

- Separate page at `/investments` (independent entry point, not a tab)
- **Holdings table**: symbol, quantity, average cost, current value, unrealized P&L with totals
- **Transactions table**: date, type (color-coded), symbol, description, quantity, price, amount
- Client-side column sorting
- Navigation link from main dashboard

### Parser Interface

- Generic `IDataParser<T>` interface defined for each broker
- `IRevolutParser` handles multi-section file format (flexible cash, savings, brokerage, crypto)
- Remaining parsers not yet built (IB, Revolut, Wix)

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
- `/api/resume-providers` — re-enable disabled providers
- `/api/investments` — parsed transactions and computed holdings

## Tech Stack

- **Frontend**: Preact, TypeScript, Mantine UI, esbuild
- **Backend**: Fastify, Node.js 20+, Cheerio
- **Deployment**: Docker (Alpine Linux), s6-overlay, port 8099
