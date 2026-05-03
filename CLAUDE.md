# Project Rules

This repo contains two Home Assistant add-ons: `tennis/` (tennis court scanner) and `investments/` (portfolio tracker). They share no code — each is an independent addon with its own `src/`, `public/`, `data/`, and build toolchain.

## Version Sync

When you change code or assets in an addon, update BOTH version strings in that addon before bundling:

- `tennis/config.yaml` + `tennis/build.yaml` — keep `version` and `BUILD_VERSION` identical
- `investments/config.yaml` + `investments/build.yaml` — keep `version` and `BUILD_VERSION` identical

Addons are versioned independently. Bump patch (Z) for fixes, minor (Y) for features.

## Features Documentation

When implementing new features, making architectural decisions, or changing existing behavior, update `FEATURES.md` to reflect the changes. This keeps the file as a living record of what each addon does. Specifically:

- **New features** — add a section or bullet points describing the capability
- **Changed behavior** — update existing descriptions to match the new behavior
- **Removed features** — remove the corresponding documentation
- **Architectural decisions** — document in the relevant section (e.g. new API endpoints, new providers, new UI tabs)
