# Investments — Features

Home Assistant add-on that ingests broker exports (Swedbank bank statements and an Interactive Brokers Transaction History) and surfaces a unified portfolio view: merged holdings, realized P&L, income, and allocation.

This addon is fully independent of the `tennis/` addon — separate `src/`, `public/`, `data/`, Dockerfile, config, and versioning. They share no code.

As of 1.51.0 the addon is built around a single canonical transaction ledger. Broker-native CSV exports are parsed into a shared `Transaction` shape, cross-broker identity is resolved via a curated `instruments.yaml` master, and every view (Overview KPIs, Holdings, Transactions, Cashflow, Allocation) is a pure derivation of that ledger. **Running cash balances are intentionally not computed** — the system reports invested capital, market value, realized/unrealized P&L, and income, and (as of 1.52.0) lists external cash transfers in/out of each brokerage account, but deliberately stays out of running-balance bookkeeping. Base reporting currency is EUR; historical FX uses ECB daily reference rates.

Recent simplifications:

- **1.50.0** — removed Revolut and Wix-equity ingestion; rewrote the Interactive Brokers parser around the new flat `Transaction History` export (one CSV with all activity, base-currency Net Amount column).
- **1.51.0** — collapsed top-level views around the unified ledger: Realized P&L and Income are no longer standalone tabs (they live inside the instrument-detail modal), a new Transactions tab browses the full ledger with broker / kind / year / search filters, the Allocation page drops the degenerate "By broker" donut, the Holdings table is a single flat row per instrument (no more per-broker expansion), and the Mappings tab drops its filter chips for one sorted list. Cash-side `TxKind` values (`fee`, `deposit`, `withdrawal`, `fx`, `internal`) are dropped — Swedbank and IB parsers now only emit `buy` / `sell` / `dividend` / `interest` / `tax`.
- **1.51.1** — IBKR credit-interest withholding tax rows no longer get tagged with a synthetic `INTEREST` raw symbol; their `rawSymbol` stays null so they don't surface as a fake ticker in the Transactions / Mappings UI. Income aggregation rebinds them to their matching `Credit Interest` row by sniffing `Credit Interest` in the description.
- **1.51.2** — split the `byd-company` and `samsung-electronics` instrument-master entries that were joining genuinely different securities under one canonical id. IB symbol `89988` (and post-rename `89988.OLD`) is the HK-listed RMB counter of Alibaba — moved into a new `alibaba-group-hk` instrument (ISIN `KYG017191225`) instead of being mis-attributed to BYD. Samsung's IB symbols `SMSN` (common 1/2 NV GDR, USD on London) and `SSUN` (preferred GDR, EUR on Frankfurt) are now separate instruments (`samsung-electronics-common-gdr` and `samsung-electronics`). The Novo Nordisk Frankfurt rename across the 2023 2:1 split (`NOVC-GY` → `NOV-GY`) stays joined because it's the same security through a corp-action rename, not two listings.
- **1.52.0** — re-introduce a narrow slice of cash bookkeeping: Swedbank and IB parsers now emit `deposit` / `withdrawal` `TxKind` rows for external cash transfers (IB's `Deposit` / `Withdrawal` activity types; Swedbank's `Pervedimas tarp savo sąskaitų` / `Tarp savo sąskaitų` rows where the brokerage account credits/debits cash to/from the user's other personal accounts). A new **Cashflow** tab summarises total deposited, total withdrawn, and net contribution per broker / per year, and lists every transfer. The kinds are also selectable in the Transactions tab's `Kind` filter. Custody fees, mutual-fund `Fundorder` rows, IB `Forex Trade Component` / `Adjustment` / `Other Fee` / `Sales Tax`, and opening / closing / turnover bank-statement rows remain dropped — they don't represent an external transfer.
- **1.53.0** — Cashflow tab now includes `dividend` rows alongside `deposit` / `withdrawal`, with a fourth KPI ("Dividends") next to Deposited / Withdrawn / Net contribution. A **Download CSV** button exports the currently filtered rows in the Lithuanian GPM311 investicinė-sąskaita import format (deposits → `rusis = II`, withdrawals → `rusis = PP`, dividends → `rusis = IV`). The file is built client-side from the same broker / year filters that drive the table. Net contribution remains contribution-only (deposits − withdrawals); dividend income is reported as a separate KPI so it's not mixed into "money I put in".
- **1.53.1** — CSV export was being rejected by the GPM311 importer's structural validator. Fixed by emitting only the five required columns the spec defines (`saskaita,rusis,data,suma,valstybe`), all-lowercase headers per the spec, UTF-8 encoded. Optional columns (`Nr`, `IstaigosKodas`, `GpmIssk`, `GpmKito`, `GpmUzs`) and the institution-name field that needed CSV quoting are dropped — they were not in the required schema and the embedded-quote escaping on `IstaigosKodas` was the root cause of the malformed rows. `saskaita` and `valstybe` continue to be pinned per broker (`LT977300010172883835` / `LT` for Swedbank; `U17250741` / `IE` for Interactive Brokers).
- **1.54.0** — new **Files** tab (under the Data sidebar group) is a generic file manager for the addon's `/data` directory. Lists every file recursively grouped by directory, with size + mtime, a per-row download link, and a per-row delete button. Upload section uploads to a chosen subdirectory (root, the two broker folders, or a custom path) and creates missing folders on the fly. The runtime instrument master and the FX / price caches are surfaced with a `managed` badge and a one-line note explaining what regenerates vs. what is lost on delete; deletion still goes through but the user is warned. Path traversal is rejected server-side (paths are resolved relative to `dataDir` and any `..` segments are blocked). Existing broker-scoped Upload tab and Mappings tab remain unchanged — Files is the catch-all for stray exports, residual files, and reset-the-cache plumbing.

## Conventions

- Runs as a standalone Home Assistant add-on (amd64, aarch64)
- Web ingress on port 8099
- Persistent data storage at `/data` inside the container
- Build pipeline: esbuild bundles backend to `dist/bundle.cjs` and frontend to content-hashed `public/app-[HASH].{js,css}` assets; server discovers the hashed filenames at startup

## Architecture

```
raw CSVs  →  broker parsers  →  canonical ledger (Transaction[])
                                        │
                                        ├─▶  FIFO lot builder  →  merged holdings (one row per instrument)
                                        │                           │
                                        │                           └─▶  realized P&L (lot-matched, EUR)
                                        ├─▶  income (dividends + interest + withholding tax, yearly)
                                        ├─▶  allocation (asset class / currency)
                                        └─▶  raw transactions feed (Transactions tab)
                                                         ▲
                 prices + FX (Yahoo, ECB) ───────────────┘
```

- **Canonical ledger is derived, never stored.** Raw broker files under `/data/Investments/<broker>/` remain the only source of truth. The portfolio is rebuilt in-memory on demand and cached until any source file's mtime changes.
- **Cross-broker identity** is resolved via a curated instrument master (`src/config/instruments.yaml` is the bundled baseline; on first boot it is copied to `/data/instruments.yaml` and from then on the runtime file is the source of truth). The master defines instrument id + per-broker aliases + optional ISIN + price-source hint. ISIN match wins when the source provides one (e.g. Swedbank dividend lines, IB dividend descriptions); alias match is the fallback. The Mappings tab lets users edit the runtime master from the UI without redeploying.
- **Dedupe** is keyed on stable `Transaction.id` (`swedbank:<refNo>`, `ib:<hash>`) so overlapping or re-uploaded exports are idempotent. The IB hash is salted with `netAmount` so a single order split into multiple fills (same date, same qty, same price, different commission) is preserved as distinct transactions.
- **Base currency: EUR.** Historical FX at trade date for cost basis; latest spot FX for current valuation. IB offshore currencies like `CNH` alias to published ECB pairs (`CNY`).

## Broker Parsers

Both parsers emit `buy` / `sell` / `dividend` / `interest` / `tax` / `deposit` / `withdrawal` transactions. Other cash-side activity (custody fees, mutual-fund order rows, FX components) is dropped at parse time so the canonical ledger stays focused on investment activity plus external cash flows.

- **Swedbank** — parses the Lithuanian bank-statement CSV. Classifier reads the free-text `Details` column:
  - Trade regex (`SYMBOL ±qty@price`) → buy/sell with D/K direction flipping the sign.
  - `DIVIDENDAI ...` rows → dividend; extracts ISIN and the per-share rate/withholding % into notes.
  - `Pervedimas tarp savo sąskaitų` / `Tarp savo sąskaitų` rows → deposit (K = inflow into the brokerage account) or withdrawal (D = outflow back to the user's other personal accounts).
  - Custody fees, mutual-fund `Fundorder` rows, opening/closing balance, turnover rows are all dropped.
- **Interactive Brokers** — parses the unified `Transaction History` CSV (one section, one row per transaction):
  - `Buy` / `Sell` rows → buy/sell using the `Symbol`, signed `Quantity`, native `Price`, and `Price Currency` columns. We deliberately re-derive the cash effect from `quantity × price` in the native currency rather than trusting IB's pre-converted base-EUR `Net Amount`, so cost basis runs through the same ECB FX layer as Swedbank.
  - `Dividend` and `Foreign Tax Withholding` rows → dividend / tax in EUR base. Symbol comes from the `Symbol` column (or the `SYMBOL(ISIN)` prefix in the description as fallback). Withholding-tax rows whose Symbol is `-` are credit-interest withholding; their `rawSymbol` is left null (so they don't pollute the Transactions / Mappings UI as a fake ticker) and income aggregation rebinds them to their `Credit Interest` counterpart by sniffing `Credit Interest` in the description.
  - `Credit Interest` → interest in EUR base.
  - `Deposit` / `Withdrawal` rows → deposit / withdrawal in EUR base, trusting IB's signed `Net Amount` (positive in, negative out).
  - Cash-side noise (`Forex Trade Component`, `Adjustment`, `Other Fee`, `Sales Tax`) is intentionally skipped.

## Web UI

Single-page app with persistent sidebar (desktop, 220px) and bottom tab bar (mobile). Warm dark theme shared with Tennis Radar (DM Sans + JetBrains Mono, amber accent).

Top-level pages (sidebar): Overview · Holdings · Transactions · Cashflow · Allocation · Mappings · Upload · Files. Mobile bottom tabs: Overview · Holdings · Transactions · Upload.

- **Overview** — single KPI strip: total value, invested, unrealized P&L, realized YTD, dividends YTD.
- **Holdings** — flat table keyed by canonical instrument id, one row per instrument. Columns: symbol, name, qty, avg cost in EUR, market price, market value, unrealized P&L + %. Clicking a row opens the instrument-detail modal. An "Unresolved instruments" banner surfaces broker symbols not yet in the master so curation is a single click into Mappings.
- **Transactions** — full canonical ledger across all brokers, filterable by broker, kind (`buy` / `sell` / `dividend` / `interest` / `tax` / `deposit` / `withdrawal`), year, and a free-text search over symbol + notes. Unmapped rows are flagged with an `unmapped` badge so they're easy to spot. Sorted newest-first.
- **Cashflow** — view over `deposit` / `withdrawal` / `dividend` rows: KPI strip showing total deposited, total withdrawn, total dividends, and net contribution (deposits − withdrawals; dividends excluded); per-broker and per-year filters; one row per item with broker, direction, signed EUR amount, and source notes. No running balance is computed. A **Download CSV** button exports the currently filtered rows in the Lithuanian GPM311 investicinė-sąskaita import format — five required columns only (`saskaita,rusis,data,suma,valstybe`, lowercase, UTF-8) with `II` = deposit, `PP` = withdrawal, `IV` = dividend.
- **Instrument detail** (modal) — opens on Holdings row click: KPI panel plus four tabs (Open lots, Transactions, Realized, Income). All per-broker / per-lot detail lives here so the top-level Holdings table can stay flat.
- **Allocation** — two donut charts over holdings market value: by asset class and by currency. The "By broker" donut was retired because two brokers reduce it to a degenerate two-slice chart; broker provenance is still visible per-lot in the instrument-detail modal.
- **Mappings** — single sorted audit table over every portfolio entry (curated instruments first, then unresolved broker symbols), with header counters showing missing tickers + unresolved aliases. Inline Yahoo ticker editor with a "Verify" button that probes Yahoo Finance and shows live price / currency / display name. Saving a Yahoo ticker on an unresolved row promotes that `(broker, symbol)` pair into a new instrument; editing a resolved row updates its `priceSource`.
- **Upload** — broker selector (Swedbank / Interactive Brokers), multi-file upload, lists current files per broker with delete confirmation.
- **Files** — generic `/data` file manager. Recursive listing grouped by directory (root, `Investments/<broker>/`, etc.) with per-file size + modified-time, download link, and delete button. Upload destination is selectable (root, either broker folder, or a custom path); folders are created on demand. The runtime `instruments.yaml` master and the FX / price JSON caches carry a `managed` badge with a one-line note (what regenerates, what's lost on delete) so destructive clicks are deliberate.

## Market Data

- **Prices** — Yahoo Finance v8 chart API (`regularMarketPrice` + `currency`) covers US, European, and Baltic (`.VS` suffix) tickers. Cached to `/data/price-cache.json` with a 6-hour TTL; stale misses fall back to the last cached value.
- **FX** — ECB euro reference rates. First boot fetches the full `eurofxref-hist.xml` (history back to 1999); subsequent refreshes pull the 90-day slice. Cached to `/data/fx-cache.json`. Historical `rateOn(date)` uses binary search for the nearest on-or-before business day.

## Storage Layout

- `/data/Investments/swedbank/` — raw Swedbank exports
- `/data/Investments/interactive-brokers/` — raw IB Transaction History CSV(s)
- `/data/instruments.yaml` — runtime instrument master (seeded from the bundled baseline on first boot, then user-editable via the Mappings tab)
- `/data/fx-cache.json` — ECB daily rates (derived)
- `/data/price-cache.json` — Yahoo price quotes (derived)

## API Endpoints

- `GET /api/investments/files` — list uploaded investment files per broker
- `POST /api/investments/upload` — upload investment files (multipart, max 10 MB per file)
- `DELETE /api/investments/files/:broker/:filename` — delete a file
- `GET /api/data/files` — recursive listing of every file under the addon's data directory (path / size / mtime), used by the Files tab
- `GET /api/data/file?path=<rel>` — stream a file as an attachment download
- `DELETE /api/data/file?path=<rel>` — delete a file (path is resolved relative to dataDir; `..` escapes are rejected)
- `POST /api/data/upload?dir=<rel>` — multipart upload into an arbitrary subdirectory (created on demand, traversal-safe)
- `GET /api/portfolio` — full portfolio snapshot (KPIs + holdings + realized + income + allocation + unresolved)
- `POST /api/portfolio/refresh` — force reparse + reprice
- `GET /api/portfolio/instrument/:id` — drill-down (instrument + holding + open lots + transactions + realized + income)
- `GET /api/portfolio/transactions` — canonical ledger (every parsed `Transaction`, sorted newest-first) used by the Transactions tab
- `GET /api/instruments` — list curated instrument master
- `GET /api/instruments/unresolved` — broker symbols not yet mapped in `instruments.yaml`
- `GET /api/instruments/mappings` — full audit list (resolved instruments + unresolved aliases) used by the Mappings tab
- `POST /api/instruments/verify` — probe a Yahoo Finance symbol and return live price / currency / display name
- `POST /api/instruments/mappings/resolved` — set or clear the Yahoo ticker on an existing instrument
- `POST /api/instruments/mappings/unresolved` — promote an unresolved (broker, symbol) pair into a new instrument with the supplied Yahoo ticker

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
- `decimal.js` — available for deterministic cost-basis arithmetic when/if precision drift becomes visible (current implementation uses plain numbers as portfolio magnitudes stay within IEEE-754 safe range)
