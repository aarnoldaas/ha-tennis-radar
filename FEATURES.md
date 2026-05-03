# Tennis Radar & Investments — Features

This repository hosts two independent Home Assistant add-ons:

- **`tennis/`** — tennis court availability scanner (SEB Arena, Baltic Tennis)
- **`investments/`** — multi-broker portfolio tracker (Swedbank, Interactive Brokers, Revolut, Wix equity plans)

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

As of 1.47.0, the Investments addon is a full portfolio tracker built around a single canonical transaction ledger. Broker-native CSV/TXT exports are parsed into a shared `Transaction` shape, cross-broker identity is resolved via a curated `instruments.yaml` master, and every view (merged holdings, realized P&L, income, cash, allocation) is a pure derivation of that ledger. Base reporting currency is EUR; historical FX uses ECB daily reference rates.

## Architecture

```
raw CSVs  →  broker parsers  →  canonical ledger (Transaction[])
                                        │
                                        ├─▶  FIFO lot builder  →  merged holdings (per-broker breakdown)
                                        ├─▶  realized P&L (lot-matched, EUR)
                                        ├─▶  income (dividends + interest + withholding tax, yearly)
                                        ├─▶  cash balances (per broker per currency)
                                        └─▶  allocation (asset class / currency / broker)
                                                         ▲
                 prices + FX (Yahoo, ECB) ───────────────┘
```

- **Canonical ledger is derived, never stored.** Raw broker files under `/data/Investments/<broker>/` remain the only source of truth. The portfolio is rebuilt in-memory on demand and cached until any source file's mtime changes.
- **Cross-broker identity** is resolved via a hand-curated `src/config/instruments.yaml` (instrument id + per-broker aliases + optional ISIN + price-source hint). ISIN match wins when the source provides one (e.g. Swedbank dividend lines, IB dividend descriptions); alias match is the fallback.
- **Dedupe** is keyed on stable `Transaction.id` (`swedbank:<refNo>`, `ib:<hash>`, `wix:<tradeId>`) so overlapping yearly exports are idempotent.
- **Base currency: EUR.** Historical FX at trade date for cost basis; latest spot FX for current valuation. IB offshore currencies like `CNH` alias to published ECB pairs (`CNY`).

## Broker Parsers

- **Swedbank** — parses the Lithuanian bank-statement CSV. Classifier reads the free-text `Details` column:
  - Trade regex (`SYMBOL ±qty@price`) → buy/sell with D/K direction flipping the sign.
  - `DIVIDENDAI ...` rows → dividend; extracts ISIN and the per-share rate/withholding % into notes.
  - `VP saugojimo mokestis` → custody fee.
  - `Transfer between own accounts` / `Pervedimas tarp savo sąskaitų` → `internal` (excluded from cash).
  - Opening/Closing balance / Turnover rows dropped.
- **Interactive Brokers** — section-aware CSV parser consuming only source-of-truth sections: `Trades` (stocks), `Dividends`, `Withholding Tax`, `Fees`, `Deposits & Withdrawals`. Derived IB sections (`Mark-to-Market`, `Realized & Unrealized`, `Open Positions`, `Change in Dividend Accruals`) are intentionally skipped — we rebuild them from the ledger ourselves so nothing can drift.
- **Wix (employer equity)** — whitespace-delimited RSU + ESPP files with mixed date formats. Issued rows emit a `buy` at fair market value with cash amount 0 (shares received, not bought); sold rows emit a `sell` with net proceeds (qty × sale price − fee).
- **Revolut** — intentionally **summary-only**. The Revolut export does not contain a granular-enough ledger to merge with the other brokers, so this parser emits only lifetime earned interest, lifetime fees, closing balances, and lifetime dividends tagged against the relevant section/currency. Revolut appears in Cash and Income but never in Holdings or Realized P&L.

## Web UI

Single-page app with persistent sidebar (desktop, 220px) and bottom tab bar (mobile). Warm dark theme shared with Tennis Radar (DM Sans + JetBrains Mono, amber accent).

- **Overview** — KPI strip (total value, invested, unrealized P&L, realized YTD, dividends YTD, cash) plus per-broker value cards.
- **Holdings** — single merged table keyed by canonical instrument id. Columns: symbol, name, qty, avg cost in EUR, market price, market value, unrealized P&L + %. Each row expands to show a per-broker breakdown with native and EUR cost basis. An "Unresolved instruments" banner surfaces the broker symbols missing from `instruments.yaml` so curation is a one-file edit.
- **Instrument detail** (modal) — opens on row click: KPI panel plus four tabs (Open lots, Transactions, Realized, Income).
- **Realized P&L** — lot-matched table filterable by year with holding-period days and totals summary (proceeds / cost basis / net).
- **Income** — per-year summary cards plus a full dividend + interest table with gross / withholding tax / net in EUR.
- **Cash** — per-broker per-currency balances in native and EUR, with a base-currency total.
- **Allocation** — three donut charts: by asset class, by currency, by broker.
- **Upload** — broker selector, multi-file upload, lists current files per broker with delete confirmation.

## Market Data

- **Prices** — Yahoo Finance v8 chart API (`regularMarketPrice` + `currency`) covers US, European, and Baltic (`.VS` suffix) tickers. Cached to `/data/price-cache.json` with a 6-hour TTL; stale misses fall back to the last cached value.
- **FX** — ECB euro reference rates. First boot fetches the full `eurofxref-hist.xml` (history back to 1999); subsequent refreshes pull the 90-day slice. Cached to `/data/fx-cache.json`. Historical `rateOn(date)` uses binary search for the nearest on-or-before business day.

## Storage Layout

- `/data/Investments/swedbank/` — raw Swedbank exports
- `/data/Investments/interactive-brokers/` — raw IB Activity Statements
- `/data/Investments/revolut/` — raw Revolut summaries
- `/data/Investments/wix/` — Wix employer-equity text files
- `/data/fx-cache.json` — ECB daily rates (derived)
- `/data/price-cache.json` — Yahoo price quotes (derived)

## API Endpoints

- `GET /api/investments/files` — list uploaded investment files per broker
- `POST /api/investments/upload` — upload investment files (multipart, max 10 MB per file)
- `DELETE /api/investments/files/:broker/:filename` — delete a file
- `GET /api/portfolio` — full portfolio snapshot (KPIs + holdings + realized + income + cash + allocation + unresolved)
- `POST /api/portfolio/refresh` — force reparse + reprice
- `GET /api/portfolio/instrument/:id` — drill-down (instrument + holding + open lots + transactions + realized + income)
- `GET /api/instruments` — list curated instrument master
- `GET /api/instruments/unresolved` — broker symbols not yet mapped in `instruments.yaml`

---

## Tech Stack (Both Addons)

- **Frontend**: React 18, TypeScript, Mantine UI v7, esbuild
- **Backend**: Fastify, Node.js 20+
- **Deployment**: Docker (Alpine Linux), s6-overlay, port 8099
- **Design tokens**: DM Sans + JetBrains Mono, warm dark theme, amber/gold accent, CSS custom properties
- **Cache control**: all responses include no-cache headers; content-hashed bundle filenames (`app-[HASH].js`) ensure fresh assets after deploys

## Investments-Only Additional Dependencies

- `@fastify/multipart` — file uploads
- `js-yaml` — loads the embedded `instruments.yaml` master (inlined at build time via esbuild's `text` loader)
- `papaparse` — RFC 4180-correct CSV parsing for quoted Swedbank/IB rows
- `decimal.js` — available for deterministic cost-basis arithmetic when/if precision drift becomes visible (current implementation uses plain numbers as portfolio magnitudes stay within IEEE-754 safe range)
