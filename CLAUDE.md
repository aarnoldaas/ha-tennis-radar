# Project Rules

This repo contains the Tennis Radar Home Assistant add-on in `tennis/`, with its own source, public assets, data, and build toolchain.

## Version Sync

When you change code or assets, update BOTH version strings before bundling:

- `tennis/config.yaml` + `tennis/build.yaml` — keep `version` and `BUILD_VERSION` identical

Bump patch (Z) for fixes, minor (Y) for features.

## Features Documentation

The living features doc is:

- `tennis/FEATURES.md` — Tennis Radar

When implementing new features, making architectural decisions, or changing existing behavior, update `tennis/FEATURES.md` to reflect the changes. Specifically:

- **New features** — add a section or bullet points describing the capability
- **Changed behavior** — update existing descriptions to match the new behavior
- **Removed features** — remove the corresponding documentation
- **Architectural decisions** — document in the relevant section (e.g. new API endpoints, new providers, new UI tabs)
