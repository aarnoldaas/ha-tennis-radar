# Tennis Radar & Investments — Features

This repository hosts two independent Home Assistant add-ons:

- **`tennis/`** — tennis court availability scanner (SEB Arena, Baltic Tennis)
- **`investments/`** — broker file storage (CSV/TXT upload + delete)

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

The Investments addon is now a minimal broker-file uploader. As of 1.46.0, all parsers, portfolio analytics, market price fetching, currency conversion, AI insights, and reporting UI have been removed. The addon stores raw broker exports under `/data/Investments/<broker>/` for downstream consumers (e.g. external analysis tools); it does not interpret or compute anything.

## Web UI

Single-page app: just an Upload panel. Warm dark theme shared with Tennis Radar addon (DM Sans + JetBrains Mono, amber accent).

- **Upload**: select a broker (Swedbank, Interactive Brokers, Revolut, Wix), choose one or more `.csv`/`.txt` files, upload to `/data/Investments/<broker>/`
- **List**: grouped by broker, shows all currently stored files
- **Delete**: per-file delete button with confirmation prompt

No tabs, no settings, no charts.

## Storage Layout

- `/data/Investments/swedbank/` — Swedbank exports
- `/data/Investments/interactive-brokers/` — IB trade confirmations
- `/data/Investments/revolut/` — Revolut statements
- `/data/Investments/wix/` — Wix employer equity files

Files are written verbatim — no parsing, validation, or transformation.

## API Endpoints

- `GET /api/investments/files` — list uploaded files per broker
- `POST /api/investments/upload` — upload investment files (multipart, max 10 MB per file)
- `DELETE /api/investments/files/:broker/:filename` — delete a file

---

## Tech Stack (Both Addons)

- **Frontend**: React 18, TypeScript, Mantine UI v7, esbuild
- **Backend**: Fastify, Node.js 20+
- **Deployment**: Docker (Alpine Linux), s6-overlay, port 8099
- **Design tokens**: DM Sans + JetBrains Mono, warm dark theme, amber/gold accent, CSS custom properties
- **Cache control**: all responses include no-cache headers; content-hashed bundle filenames (`app-[HASH].js`) ensure fresh assets after deploys

## Investments-Only Additional Dependencies

- `@fastify/multipart` — file uploads
