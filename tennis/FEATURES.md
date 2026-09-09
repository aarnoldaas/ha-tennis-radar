# Tennis Radar — Features

Home Assistant add-on that scans tennis court availability across multiple booking systems (SEB Arena, Baltic Tennis) and surfaces matching slots via the web UI and Home Assistant notifications.

This repository contains only the Tennis Radar add-on.

## Conventions

- Runs as a standalone Home Assistant add-on (amd64, aarch64)
- Web ingress on port 8099
- Persistent data storage at `/data` inside the container
- Supervisor API access for Home Assistant notifications
- Build pipeline: esbuild bundles backend to `dist/bundle.cjs` and frontend to content-hashed `public/app-[HASH].{js,css}` assets; server discovers the hashed filenames at startup
- Container dependency installation uses `--legacy-peer-deps` to bypass npm's automatic peer-resolution `edgesOut` crash. Required runtime peers are direct dependencies; test-runner peers are not needed for bundling. Local development installation keeps normal peer resolution.

## Court Availability Monitoring

- **Automatic polling** with configurable interval (10–3600 seconds, default 30s)
- **Night hours** — separate interval (23:00–08:00) to reduce polling during off-hours
- **Multi-provider support** — query multiple tennis court systems simultaneously
- **Date scanning** — check only explicitly selected dates from tomorrow through 14 days ahead. No selection means no near-term scans; expired and out-of-window dates are ignored. There is no automatic seven-day fallback
- **Future SEB scans** — selected weekdays 15 days to six months ahead use a separate schedule, default **2 hours** (configurable **1–24 hours**). Optional weekday checkboxes add recurring dates in that future window. No weekdays are enabled by default. Near-term dates keep the regular day/night interval. Baltic Tennis only receives near-term dates.
- **SEB request batches** — sequential batches of at most **7 dates**, for both near and future scans. Each request retains its 20-second timeout. Future results stay visible between scans, with the last/next scan and date count in Scan details. Changing settings clears old results and restarts the future schedule.
- **Calendar boundary** — future planning uses Europe/Vilnius dates and a six-calendar-month horizon. Recurring weekdays apply only to the future window.
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
- Username/password authentication with CSRF form tokens, all response cookies, and automatic session renewal
- Shared in-flight login prevents polling and booking requests from racing; HTTP login failures are reported explicitly
- Parses Lithuanian calendar format
- Retrieves user's upcoming bookings with price and duration

### Provider Management

- Enable/disable providers independently for radar polling — credentials remain active for bookings even when a provider is excluded from the radar
- Provider failures never disable radar polling: per-provider exponential retry delays from 30 seconds to 5 minutes, retried on the next scheduled poll after the delay
- One-click reset of retry delays; successful requests clear the error and failure count
- Concurrent fetching across providers

## Notifications

- **Home Assistant persistent notifications** in the HA notification panel
- **Delivery retries** — failed pushes are retried on the next scan instead of being suppressed for an hour; changing the destination allows fresh alerts. Both device names and full `notify.mobile_app_*` service names are accepted. HA requests time out after 20 seconds.
- **Mobile push notifications** to a configured device with action buttons (Book & pay up to €100 / Open Booking Site / Dismiss)
- **Deduplication** — suppresses duplicate alerts for the same slot within 1 hour
- **Error alerts** after 3 consecutive provider failures, once per outage; automatic retries continue
- **Booking reminders** — automatic reminders at 168 hours (1 week), 72 hours (3 days) and 49 hours before each existing booking, using Europe/Vilnius time including daylight-saving changes. Bookings are fetched from providers every 6 hours and cached in memory; a lightweight in-memory tick re-evaluates the cache every 30 minutes so threshold crossings fire promptly without re-hitting the network. Each `(booking, threshold)` fires at most once with state persisted to `/data/booking-reminders.json` so restarts don't resend. If the addon comes online late, only the most-imminent applicable threshold fires.

## Web UI

Single-page application with persistent sidebar (desktop, 220px) and bottom tab bar (mobile). Forest-green dark theme, lime accents, DM Sans typography, and tabular numeric data. Responsive court illustration and accessible navigation with visible connection status.

Navigation: **Tennis Radar** (Courts, Bookings) + **Settings**.

### Courts Screen
- Available slots grouped by date with cards showing court name, time range, duration, provider
- Summary of matching time slots, with venue and date filters and a clear-filters recovery action
- Search preferences shortcut; separate loading, first-scan, empty, filtered-empty, and stale connection states
- Collapsible scan statistics and booking setup details

### Bookings Screen
- User's existing bookings from all providers with configured credentials, grouped by date — bookings are returned regardless of whether the provider is enabled for radar polling
- Back-to-back bookings on the same court (where one ends exactly when the next begins) are merged into a single combined session — duration is summed and price is summed when the format is parseable
- Court name, time, duration, provider, price, status
- Manual refresh button, error handling for fetch failures

### Settings Screen
- **Scan dates** — 14 selectable dates starting tomorrow, with optional future weekday selection
- **Playing preferences** — earliest start, latest finish with inline time validation, minimum session duration
- **Notifications & scanning** — daytime and nighttime polling intervals, mobile notification device guidance
- **Provider cards** — SEB Arena and Baltic Tennis with always-visible Enabled toggle in the card header; credential fields shown when enabled
- **Advanced options** — collapsible debug logging toggle
- Persistent draft when changing app tabs, discard action, disabled unchanged saves, loading/retry feedback, and reload/close warning for unsaved edits
- Save bar stays above mobile navigation; inputs are locked while saving
- Session token is masked; future weekday selection uses accessible checkboxes

### Status & Errors
- Status badge in sidebar: Running / Issues / Error / Loading
- Configuration warnings (invalid times, missing credentials, no providers enabled)
- Provider error banner from the first failure, automatic retry time, and a retry-delay reset button; incomplete availability is distinguished from no matching courts

## Resilience

- Exponential backoff on polling failures (max 5 minutes), without permanently stopping after repeated errors
- Provider requests time out after 20 seconds so a stalled API cannot hang polling
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

## Tech Stack

- **Frontend**: React 18, TypeScript, Mantine UI v7, esbuild
- **Backend**: Fastify, Node.js 20+
- **Deployment**: Docker (Alpine Linux), s6-overlay, port 8099
- **Design tokens**: DM Sans + JetBrains Mono, warm dark theme, amber/gold accent, CSS custom properties
- **Cache control**: all responses include no-cache headers; content-hashed bundle filenames (`app-[HASH].js`) ensure fresh assets after deploys

## Book and pay for SEB courts from notifications

- Version 1.51.0 adds **Book & pay ≤€100** to new phone court alerts. Touch and
  hold the push notification on iPhone to see actions. HA persistent notifications
  and booking reminders do not have this button.
- An explicit tap reserves one available court, then pays using **SEB account
  credit**, with a hard **€100 per-booking maximum**. It does not run from polling
  alone. No Safari extension, Shortcut, or browser localStorage handoff is needed
  for successful paid bookings. Open **View SEB bookings** in Chrome or Safari
  signed into the same account.
- Before payment, the add-on checks existing bookings for overlapping times,
  then reads the fresh cart and validates exactly one court, account, date,
  start/end time, quantity, no extra items, unexpired unpaid status and total.
  Missing/invalid prices or a total above €100 stop payment.
- Credit checkout sends multipart `session_token` to
  `POST /v2/carts/{code}/user_account_order`, requiring the observed
  `{status: "success", data: true}` response before reporting payment success.
  There is no bank/card fallback. A rejected or uncertain payment is not retried.
- Payment intent and price are saved before the POST. Paid/uncertain attempts
  survive restart and prevent another overlapping payment from a later alert.
  A corrupted state file disables new cart actions rather than discarding the
  payment history. Operators must reconcile uncertain results against SEB
  bookings/credit before manually attempting another payment.
- Version 1.51.1 keeps only `TENNIS_BOOK_` paid actions. Old cart-only buttons
  are ignored and never upgraded to payment authorization. The unpaid cart
  route, links, Safari script and setup UI have been removed.
  Results appear on Courts and in mobile/persistent
  notifications. Successful payment refreshes the booking reminder cache.
- Live checkout verified on 2026-09-09 in Chrome: SEB 21, 2026-09-16,
  13:00–14:00, €36, booking 4305281. **Sumokėti** only opens payment methods
  (no request); **Kreditus → Taip** sends the account-credit order request.
  The live browser payment was verified separately from the mocked automated
  flow tests; deployment to Home Assistant is not part of that validation.
- The API exposes no client price-cap parameter in the observed payment request;
  the €100 check is performed immediately before payment against the cart total.

The action rechecks availability, prioritizes court numbers 21 → 1, and books
the configured minimum duration within the preferred time window. Tokens expire
after 15 minutes; changed credentials or disabled SEB invalidate pending actions.
No separate Home Assistant automation is required.
