# Tennis Court Radar — Features

## Court Availability Monitoring

- **Automatic polling** with configurable interval (10–3600 seconds, default 30s)
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
- Retrieves user's existing bookings (next 6 months)

### Baltic Tennis

- Scrapes the Baltic Tennis booking portal
- Username/password authentication with automatic session renewal
- Parses Lithuanian calendar format
- Retrieves user's upcoming bookings with price and duration

### Provider Management

- Enable/disable providers independently
- Automatic disabling after persistent failures (10 consecutive errors)
- One-click resume for all disabled providers
- Concurrent fetching across providers

## Notifications

- **Home Assistant persistent notifications** in the HA notification panel
- **Mobile push notifications** to a configured device with action buttons (Open Booking Site / Dismiss)
- **Deduplication** — suppresses duplicate alerts for the same slot within 1 hour
- **Error alerts** when a provider is disabled due to failures

## Web Dashboard

### Courts Tab

- Available slots grouped by date
- Cards showing court name, time range, duration, and provider
- Summary of total matching courts
- Poll statistics: last poll time, dates checked, slots found, query duration, per-provider breakdown

### Bookings Tab

- User's existing bookings from all providers, grouped by date
- Displays court name, time, duration, provider, price, and status
- Manual refresh button

### Settings Tab

- **Date picker** — select from next 14 days with weekend indicators
- **Poll interval**, **start/end time**, **min duration**, **notify device**
- **Provider credentials** — SEB session token, Baltic Tennis username/password
- **Debug mode** toggle
- Save with immediate effect and validation feedback

### Status & Errors

- Status badge: Running / Issues / Error / Loading
- Configuration warnings (invalid times, missing credentials, no providers enabled)
- Provider error banner with details and resume button

## Home Assistant Integration

- Runs as a Home Assistant add-on (amd64, aarch64, armv7)
- Web ingress for seamless HA panel access
- Persistent data storage at `/data`
- Supervisor API for notifications

## Configuration

- Persistent config stored in `/data/config.json`
- Falls back to HA add-on options, then defaults
- Validates settings and returns warnings to UI
- Legacy key migration (teniso_pasaulis → seb)

## Resilience

- Exponential backoff on polling failures (max 5 minutes)
- Provider isolation — one failure doesn't affect others
- Automatic session reconnection (Baltic Tennis)
- Graceful shutdown on SIGTERM/SIGINT

## Tech Stack

- **Frontend**: Preact, TypeScript, esbuild
- **Backend**: Fastify, Node.js 20+, Cheerio
- **Deployment**: Docker (Alpine Linux), s6-overlay, port 8099
