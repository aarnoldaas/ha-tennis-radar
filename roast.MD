You're running three unrelated products inside a single Home Assistant add-on (tennis radar, home-building TODO, and a full
  personal-finance platform covering 4 brokers, RSU/ESPP, multi-currency, FIFO tax lots, and AI insights). Implicit decisions: HA add-on is
   the right runtime for long-term financial records; JSON files on /data are durable enough; hardcoded price/FX fallbacks in source are an
   acceptable safety net; one server process serves all three domains; and the product is "mine only" so scope keeps growing with no budget
   for it.

  Sharpest challenges

  1. Three products, one repo, still named "ha-tennis-radar" — The add-on is now 80% investment tracker and 15% tennis, but its identity,
  repo slug, and release discipline are still the tennis tool. Every change means a global version bump (1.42.0 already) and a full
  redeploy of tennis polling just to ship an investment chart. Concrete failure: a bad CSV parser change crashes the process and your court
   scanner stops notifying you during the very hour a slot opens. Why is this one addon instead of two? What's the actual reason not to
  split out life-helper-investments? "Fewer things to run" is not load-bearing on a single HA instance.
  2. Hardcoded price tables and 2017–2026 EUR/USD fallback rates feeding realized P&L for tax reporting — prices.ts carries hardcoded
  snapshots; currency.ts falls back to a hardcoded rate table when ECB fetch fails. Your own FEATURES.md lists "short-term vs long-term P&L
   subtotals per year for tax reporting." That's a tax-relevant output depending on silently-stale constants. Failure mode: ECB fetch fails
   for a week, Yahoo rate-limits you, fallback kicks in, the number shown on Realized P&L tab drifts, you cite it somewhere, and you don't
  notice because the UI shows "stale" on the holding, not on the historical FX used to compute a 2024 realized trade. What's the specific
  rule for when you're allowed to trust a number from this UI in a real filing? If the answer is "never, I cross-check elsewhere," then the
   whole analytics feature is decorative — which is fine, but say so and simplify.
  3. HA add-on as the runtime for permanent financial records — Add-ons live in /data, get reinstalled when you reset HA, migrate awkwardly
   across architectures, and have no backup story in FEATURES.md. You're storing CSV uploads, AI suggestions, investment plan, config — all
   on one volume, no DB, no backup. Failure mode: you rebuild HA, forget to back up /data/Investments/, you've just lost the primary-key
  evidence for your tax lots. Who owns the backup — you, manually? What's the recovery procedure? "I reupload the CSVs" presumes you keep
  the CSVs somewhere canonical outside this addon, which raises the question of why the addon is the source of truth at all.
  4. Investment tracker has 114 tests; tennis polling (the stated purpose and notification-critical path) appears to have none — The thing
  that pages you when a court opens has no test suite, while the decorative analytics has exhaustive FIFO coverage. The risk-weighted ROI
  on test effort is inverted. When was the last time a Baltic Tennis HTML change silently broke parsing and you missed a slot? If the
  answer is "I'd know because no notifications," that's detection-by-absence and it's unreliable.
  5. 12 investment sub-pages built for a single user — Overview, Holdings, Allocation, Stocks, Realized P&L, Trade Analysis, Equity Comp,
  Market Data, Transactions, Plan, AI Insights, Upload. This is Personal Capital's navigation grafted onto a home automation extension. How
   many of these do you open in a normal week? If it's 2–3, the other 9 are ongoing maintenance tax (schema drift, calculation regressions,
   test breakage on every refactor) with negligible usage. The "AI Insights" page especially: what decision have you ever actually made
  because of its output?

  Also worth a thought

  - armv7 in build.yaml — are you actually running this on a Pi 3B? Mantine v7 + Recharts + React 18 + a 4852-line server bundle on an
  armv7 box is going to feel rough, and you're paying CI time to build it every release.
  - Manual version-sync rule in CLAUDE.md — two files must match, by hand, every change. That's a footgun; a single sed in the build script
   removes the ritual.
  - Yahoo Finance as primary price feed — unofficial, no SLA, has blocked libraries before. Alpha Vantage fallback has a 25 calls/day cap.
  For dozens of tickers this is one network incident from the whole analytics section going stale with no loud alarm.
  - /api/investments/upload multipart file write into HA addon storage — any input validation on filename/extension/path? Ingress is
  HA-auth'd, but defense in depth matters when you're writing user-uploaded files to disk under a deterministic broker dir.
  - "AI Insights" stored as JSON on disk, re-displayed as authoritative — cached model output becomes stale in a way users don't see.
  What's its TTL? Is there any sanity check that the suggestions still match current holdings before showing them?

  What would make me trust this

  Two things. First, pick a stance on the investment tracker: either it's a toy (say so in the UI, strip the tax-reporting framing, drop
  the armv7 target and half the sub-pages) or it's load-bearing (then move it out of a HA add-on into a proper service with a DB, backups,
  and authoritative price/FX sources — and absolutely not hardcoded rate tables). The middle position — "serious tax-relevant analytics
  inside a home-automation side project with hardcoded fallbacks" — is where mistakes get made. Second, give the tennis polling its own
  small test suite and a heartbeat/self-check: if you're going to keep everything in one addon, the notification path deserves at least as
  much rigor as the RSU FIFO calculator.
