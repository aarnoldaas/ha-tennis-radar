# Tennis Radar — Features

Home Assistant add-on that scans tennis court availability across multiple booking systems (SEB Arena, Baltic Tennis) and surfaces matching slots via the web UI and Home Assistant notifications.

This addon is fully independent of the `investments/` addon — separate `src/`, `public/`, `data/`, Dockerfile, config, and versioning. They share no code.

## Conventions

- Runs as a standalone Home Assistant add-on (amd64, aarch64)
- Web ingress on port 8099
- Persistent data storage at `/data` inside the container
- Supervisor API access for Home Assistant notifications
- Build pipeline: esbuild bundles backend to `dist/bundle.cjs` and frontend to content-hashed `public/app-[HASH].{js,css}` assets; server discovers the hashed filenames at startup

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
- **Mobile push notifications** to a configured device with action buttons (Open Booking Site / Dismiss)
- **Deduplication** — suppresses duplicate alerts for the same slot within 1 hour
- **Error alerts** after 3 consecutive provider failures, once per outage; automatic retries continue
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
- **Provider cards** — SEB Arena and Baltic Tennis with always-visible Enabled toggle in the card header; credential fields shown when enabled
- **Advanced card** — always-visible Debug mode toggle
- Save with immediate effect and validation feedback (sticky bottom bar with backdrop blur)

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

## Add SEB courts from notifications

- Mobile notifications offer **Add to cart** for SEB matches. Tapping sends a
  `mobile_app_notification_action` event, handled via the Supervisor WebSocket;
  no separate Home Assistant automation is required. Reconnects automatically.
- The action rechecks availability, selects one court in descending **SEB 21,
  20, 19 … 1** order (other configured courts follow), then earliest date/time.
  It uses the configured minimum duration within the preferred start/end window.
- Tokens expire after 15 minutes. Action state survives restarts. Duplicate taps
  and uncertain POST results do not repeat cart mutations. Changed credentials or
  disabled SEB invalidate pending actions. Cart codes are retained for inspection.
- Uses SEB's `/v1/checkToken`, `/v2/basic-carts`,
  `/v2/carts/{code}/court-reservations-add`, and `/v2/carts/{code}/resume` flow.
  It creates a temporary cart; it never pays or confirms an order.
- Results appear on Courts and in a follow-up notification with **Open SEB cart**.
  This is a separate cart from any previously open browser cart.

### iPhone Safari setup

1. Install [Userscripts](https://apps.apple.com/app/userscripts/id1463298887)
   and enable its Safari extension for `book.sebarena.lt`.
2. Open **Safari cart handoff script** from Tennis Radar's Courts page in Safari
   and install it through Userscripts, or save `public/seb-cart-handoff.user.js`
   into the script directory selected in Userscripts.
3. Open the result notification's **Open SEB cart** link in Safari. If Home
   Assistant opens its internal browser, use **Open in Safari**. Safari needs
   to be the browser that runs the script; Chrome on iPhone cannot run it.

The script reads a cart code from the URL fragment, writes the exact
`localStorage.cartReservationCode` key, removes the fragment parameter, and
reloads SEB so it reads that cart. It backs up a different previous code under
`tennisRadarPreviousCartReservationCode`. It never reads login tokens. Without
this one-time Safari setup, the link cannot switch carts: cross-origin browser
security prevents Home Assistant from writing SEB localStorage directly.

References: [SEB client](https://book.sebarena.lt/),
[HA actionable notifications](https://companion.home-assistant.io/docs/notifications/actionable-notifications/),
[HA WebSocket API](https://developers.home-assistant.io/docs/api/websocket/),
[Userscripts installation](https://github.com/quoid/userscripts#installation).
