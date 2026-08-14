# Investments — Features

Home Assistant add-on that ingests broker exports (Swedbank bank statements and an Interactive Brokers Transaction History) and surfaces a unified portfolio view: holdings, realized P&L, income, allocation, cashflow, and research.

This addon is fully independent of the `tennis/` addon — separate `src/`, `public/`, `data/`, Dockerfile, config, and versioning. They share no code.

## 2.0.0 — Data model rewrite

The addon was rebuilt from the data layer up around one goal: **the final data every view reads should be simple, flat, and unambiguous.** The pre-2.0 model had grown five different notions of "symbol", inconsistent sign conventions per transaction kind, holdings built in two mutable passes, and a frontend that hand-duplicated every backend type. None of that survived the rewrite.

**What changed:**

- **One shared type file.** `src/shared/types.ts` is the single source of truth for every entity — imported by both the backend and the frontend. There is no more separate, hand-maintained copy of the API types in the frontend.
- **One sign convention.** Every transaction has `amountEur`: the signed EUR cash effect on the brokerage account. Positive means money in (sell, dividend, interest, deposit); negative means money out (buy, fee, withdrawal). No per-kind exceptions.
- **One symbol per instrument.** `Instrument.symbol` is the single display symbol used everywhere — Holdings, Transactions, the instrument-detail modal, CSV exports. Broker-native tickers live only in `Instrument.aliases`.
- **EUR-only computed values.** Every derived amount (cost, value, gain, income) is in EUR. Native currency and native price are kept as separate, clearly-named display-only fields (`priceNative`, `currency`).
- **No more separate `tax` transactions.** Interactive Brokers reports withholding tax as its own row; the pipeline now folds it directly into the paying dividend/interest transaction as `grossEur` / `taxEur`, matched by (broker, instrument, date). Swedbank's dividend withholding, previously only readable from a free-text note, is now a real structured field computed from the statement's stated withholding percentage. A withholding row that can't be matched to a payer becomes a `fee` transaction instead of silently disappearing.
- **Holdings are built in a single pure pass.** No more constructing a holding with null market fields and mutating it in place once a quote arrives — `buildHoldings` takes the fetched quotes as an input and returns fully-formed, immutable `Holding` objects. A `priced` flag says whether a live quote was applied; unpriced holdings are valued at cost.
- **Cleaner API surface.** `/api/investments/*` and `/api/data/*` collapsed into one generic `/api/files/*`. `/api/instruments/mappings` (a bespoke payload) is gone — the Instruments tab now composes `GET /api/instruments` (an `Instrument[]`) with `Portfolio.unmapped` instead.

**Renamed tabs:** Watchlist → **Research**, Mappings → **Instruments**. **Removed tab:** Upload — its functionality (broker CSV upload) is absorbed into **Files**, which now defaults its destination picker to the two broker folders.

**Deliberately different from pre-2.0 (all reconciled against the old implementation on the real portfolio before shipping):**
- Swedbank dividend income now reports real `grossEur` / `taxEur` instead of `gross == net, tax == 0`. Net income is unchanged.
- Dividend/interest transactions show the canonical instrument symbol (e.g. `ROE1L`) instead of the free-text company name Swedbank's statement happened to use (e.g. "ARTEA BANKAS").
- `Portfolio.totals.incomeYtdEur` includes interest as well as dividends (previously "Dividends YTD" was dividends-only). The GPM311 tax-export CSV on the Cashflow tab is unaffected — it still exports dividends only, at the same figure per broker as before (gross for Interactive Brokers, net for Swedbank — see `shared/brokers.ts`), byte-identical to the pre-2.0 export.
- The transaction list no longer has a `tax` row type; withholding shows up folded into its dividend/interest, or as a `fee` if unmatched.

Everything else — the broker CSV parsing rules, the ECB FX source, the Yahoo price/fundamentals providers, the FIFO lot-matching logic, the file-fingerprint cache invalidation strategy — is unchanged from pre-2.0, just re-typed against the new shared entities.

<details>
<summary>Pre-2.0.0 history</summary>

As of 1.51.0 the addon was rebuilt around a single canonical transaction ledger, with cross-broker identity resolved via a curated `instruments.yaml` master. Notable milestones: 1.50.0 rewrote the Interactive Brokers parser around IB's unified `Transaction History` export; 1.51.x collapsed the UI around the ledger and fixed IB credit-interest / instrument-identity edge cases (the `alibaba-group-hk` vs `byd-company` split, `samsung-electronics` vs `samsung-electronics-common-gdr` — both still true today); 1.52.0–1.53.1 added deposit/withdrawal tracking, the Cashflow tab, and the GPM311 tax-declaration CSV export; 1.54.0 added the generic Files tab; 1.55.x added the Watchlist tab with Finnhub fundamentals; 1.56.0 removed Finnhub entirely in favor of Yahoo Finance `quoteSummary` (free tier US-only lock-out made it dead weight).
</details>

## Conventions

- Runs as a standalone Home Assistant add-on (amd64, aarch64)
- Web ingress on port 8099
- Persistent data storage at `/data` inside the container
- Build pipeline: esbuild bundles the backend to `dist/bundle.cjs` and the frontend to content-hashed `public/app-[HASH].{js,css}` assets; the server discovers the hashed filenames at startup

## Architecture

```
raw CSVs  →  broker parsers  →  RawTx[]  →  normalize()  →  Transaction[]  (EUR-final, tax folded)
                                                                    │
                                                                    ├─▶  buildLots  →  Lot[] / Sale[]
                                                                    │                     │
                                                                    │                     └─▶  buildHoldings (priced in one pass) → Holding[]
                                                                    ├─▶  buildIncome  →  IncomeRow[]
                                                                    ├─▶  buildAllocation  →  Allocation
                                                                    └─▶  raw Transaction[] feed (Transactions tab)
                                                                                     ▲
                       prices + FX (Yahoo, ECB) ─────────────────────────────────────┘
```

Module layout under `src/`:

- `shared/` — `types.ts` (every entity, imported by frontend + backend) and `brokers.ts` (broker labels + GPM311 account metadata)
- `core/` — `parse/{raw,swedbank,ib}.ts` (broker CSV → `RawTx[]`), `pipeline.ts` (`RawTx[]` → `Portfolio`, pure functions), `instruments.ts` (`InstrumentStore`: the runtime `instruments.yaml`, resolution, migration), `portfolio.ts` (`PortfolioService`: orchestration + fingerprint cache), `watchlist.ts`, `research.ts`, `csv.ts`, `hash.ts`
- `market/` — `fx.ts` (ECB rates), `prices.ts` (Yahoo spot quotes, `verifyYahooSymbol`), `fundamentals.ts` (Yahoo `quoteSummary`)
- `server/` — `index.ts` (entry), `server.ts` (all routes), `files.ts` (safe-path helpers for the generic file API)
- `config/instruments.yaml` — bundled baseline instrument master, inlined into the backend bundle at build time
- `frontend/` — `app.tsx` (nav shell), `lib/{api,format,utils,csv}.ts`, `tabs/*.tsx`, `InstrumentDetailModal.tsx`

Key properties:

- **The ledger is derived, never stored.** Raw broker files under `/data/Investments/<broker>/` remain the only source of truth. `PortfolioService` rebuilds in memory and caches the result until a source file's mtime (or `instruments.yaml`'s mtime) changes.
- **Cross-broker identity** is resolved via the curated instrument master (`InstrumentStore`, backed by `/data/instruments.yaml`; seeded from `src/config/instruments.yaml` on first boot). ISIN match wins when a source row provides one; `(broker, alias)` match is the fallback. The Instruments tab edits the runtime file directly.
- **Dedupe** is keyed on a stable `Transaction.id` (`swedbank:<refNo>`, `ib:<hash>`) so overlapping or re-uploaded exports are idempotent.
- **Base currency: EUR**, always. Trade cost basis uses the ECB rate on the trade date; current market value uses the latest ECB rate. IB's offshore currency codes (e.g. `CNH`) alias to the nearest published ECB ticker (`CNY`).

## Broker Parsers

Both parsers emit `RawTx` rows of type `buy` / `sell` / `dividend` / `interest` / `tax` / `deposit` / `withdrawal`; `normalize()` in the pipeline resolves instruments, converts everything to EUR, and folds `tax` rows into their paying dividend/interest (see the 2.0.0 section above). Other cash-side activity (custody fees, mutual-fund order rows, FX components) is dropped at parse time.

- **Swedbank** — parses the Lithuanian bank-statement CSV. Classifier reads the free-text `Details` column:
  - Trade regex (`SYMBOL ±qty@price`) → buy/sell, D/K flips the sign.
  - `DIVIDENDAI ...` rows → dividend; extracts ISIN, and when the per-share rate + withholding % are both present, computes structured `gross`/`tax` fields from them.
  - `Pervedimas tarp savo sąskaitų` / `Tarp savo sąskaitų` rows → deposit (K = inflow) or withdrawal (D = outflow to the user's other personal accounts).
  - Custody fees, mutual-fund `Fundorder` rows, opening/closing balance, turnover rows are dropped.
- **Interactive Brokers** — parses the unified `Transaction History` CSV:
  - `Buy` / `Sell` → the cash effect is re-derived from `quantity × price` in the native trade currency (not IB's pre-converted EUR `Net Amount`), so cost basis runs through the same ECB FX layer as Swedbank.
  - `Dividend` → dividend, gross Net Amount trusted as-is (EUR).
  - `Foreign Tax Withholding` → raw `tax` row; folded into its dividend/interest counterpart during normalization, or emitted as a `fee` if no match is found within the same year.
  - `Credit Interest` → interest (EUR). Symbolless withholding on the same date folds into it the same way as dividend withholding.
  - `Deposit` / `Withdrawal` → deposit/withdrawal (EUR), trusting IB's signed Net Amount.
  - Cash-side noise (`Forex Trade Component`, `Adjustment`, `Other Fee`, `Sales Tax`) is skipped.

## Web UI

Single-page app with a persistent sidebar (desktop, 220px) and a bottom tab bar (mobile). Warm dark theme (DM Sans + JetBrains Mono, amber accent).

Sidebar pages: Overview · Holdings · Transactions · Cashflow · Allocation · Research · Instruments · Files. Mobile bottom tabs: Overview · Holdings · Transactions · Files.

- **Overview** — KPI strip (total value, invested, unrealized gain, realized YTD, income YTD), a top-holdings list, and an "unmapped broker symbols" banner when applicable.
- **Holdings** — one row per instrument: symbol, name, qty, avg cost (€), price (native), value (€), gain, last buy/sell (date + qty @ native price + broker). An "unpriced" badge marks instruments with no live quote (valued at cost). Clicking a row opens the instrument-detail modal.
- **Transactions** — the full ledger across all brokers, filterable by broker / type / year / free-text search over symbol and note. Unmapped rows (no resolved instrument) are flagged, except `interest` rows which are legitimately instrument-less. An "Export trades CSV" button exports buy/sell rows in a broker-agnostic ticker/name/ISIN/date/shares/price/exchange format.
- **Cashflow** — deposit/withdrawal/dividend rows only. KPI strip: Deposited, Withdrawn, Dividends (net), Net contribution. Per-broker/per-year filters. **Download CSV** exports the Lithuanian GPM311 investicinė-sąskaita format (`saskaita,rusis,data,suma,valstybe`; `II`/`PP`/`IV` codes) — the `suma` for dividends mirrors each broker's own statement figure (gross for IB, net for Swedbank) so the export matches broker paperwork exactly, unchanged from pre-2.0.
- **Allocation** — two donuts over holdings market value: by asset class and by currency.
- **Research** — one table over every open holding plus every user-added watchlist ticker, enriched with Yahoo fundamentals (P/E, EPS, dividend yield, growth, 52-week range) and a 30-day upcoming earnings/ex-dividend panel. "+ Add ticker" takes a Yahoo symbol with a Verify step.
- **Instruments** — one table over the instrument master plus any unmapped broker symbols. Inline Yahoo-ticker editor with Verify; saving on an unmapped row promotes it into a new instrument.
- **Files** — generic `/data` file manager: recursive listing grouped by directory, size + mtime, download/delete per file. Upload destination defaults to the two broker folders (labeled by broker name) or any custom path. `instruments.yaml` and the FX/price caches carry a "managed" badge explaining what regenerates vs. what's lost on delete.
- **Instrument detail** (modal, opens from Holdings/Research) — stat row (qty, avg cost, price, value, gain) plus four tabs: Open lots, Transactions, Sales, Income.

## Market Data

- **Prices** — Yahoo Finance v8 chart API (`regularMarketPrice` + `currency`). Cached to `/data/price-cache.json`, keyed by uppercased Yahoo symbol, 6-hour TTL; stale misses fall back to the last cached value.
- **FX** — ECB euro reference rates. First boot fetches the full history (`eurofxref-hist.xml`); subsequent refreshes pull the 90-day slice. Cached to `/data/fx-cache.json`. `rateOn(date)` binary-searches the nearest on-or-before business day.
- **Fundamentals** — Yahoo's unofficial v10 `quoteSummary` (modules: `summaryDetail`, `defaultKeyStatistics`, `financialData`, `calendarEvents`, `price`, `assetProfile`). Handles Yahoo's crumb-cookie handshake lazily, retries once on 401. Cached to `/data/yahoo-fundamentals-cache.json`, 12-hour TTL (1-hour negative cache). Fan-out capped at 5 concurrent requests.

## Storage Layout

- `/data/Investments/swedbank/` — raw Swedbank exports
- `/data/Investments/interactive-brokers/` — raw IB Transaction History CSV(s)
- `/data/instruments.yaml` — runtime instrument master (seeded from the bundled baseline on first boot; auto-migrates pre-2.0 files in place)
- `/data/watchlist.json` — user-curated watchlist, independent of `instruments.yaml`
- `/data/fx-cache.json`, `/data/price-cache.json`, `/data/yahoo-fundamentals-cache.json` — derived market-data caches

## API Endpoints

- `GET /api/portfolio` — the full `Portfolio` payload (totals, holdings, income, sales, allocation, unmapped)
- `POST /api/portfolio/refresh` — force reparse + reprice
- `GET /api/transactions` — every transaction, newest-first
- `GET /api/instruments` — the instrument master
- `GET /api/instruments/:id` — instrument drill-down (`InstrumentDetail`: instrument + holding + lots + transactions + sales + income)
- `PATCH /api/instruments/:id` — update `symbol` / `name` / `assetClass` / `yahooSymbol`
- `POST /api/instruments` — promote an unmapped `(broker, rawSymbol)` pair into a new instrument
- `POST /api/yahoo/verify` — probe a Yahoo symbol, return live price/currency/name
- `GET /api/watchlist`, `POST /api/watchlist`, `PATCH /api/watchlist/:id`, `DELETE /api/watchlist/:id`
- `GET /api/research`, `POST /api/research/refresh`
- `GET /api/files`, `GET /api/files/download?path=`, `DELETE /api/files?path=`, `POST /api/files/upload?dir=` — generic data-directory file manager (traversal-safe; broker uploads are just `dir=Investments/<broker>`)

## Tech Stack

- **Frontend**: React 18, TypeScript, Mantine UI v7, esbuild
- **Backend**: Fastify, Node.js 20+
- **Deployment**: Docker (Alpine Linux), s6-overlay, port 8099
- **Design tokens**: DM Sans + JetBrains Mono, warm dark theme, amber/gold accent, CSS custom properties
- **Cache control**: all responses include no-cache headers; content-hashed bundle filenames (`app-[HASH].js`) ensure fresh assets after deploys

### Additional Dependencies

- `@fastify/multipart` — file uploads
- `js-yaml` — loads the embedded `instruments.yaml` master (inlined at build time via esbuild's `text` loader)
- `papaparse` — RFC 4180-correct CSV parsing for quoted Swedbank/IB rows
- `decimal.js` — available for deterministic cost-basis arithmetic if precision drift ever becomes visible (current implementation uses plain numbers; portfolio magnitudes stay within IEEE-754 safe range)
