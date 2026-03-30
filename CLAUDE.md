# Project Rules

## Version Sync

When any code or asset changes are made, update the version string in ALL of these files before bundling:

1. `arnoldas_life_helper/config.yaml` — `version: "X.Y.Z"`
2. `arnoldas_life_helper/build.yaml` — `BUILD_VERSION: "X.Y.Z"`

Both occurrences must always match. Bump the patch version (Z) for fixes, minor (Y) for features.

## Features Documentation

When implementing new features, making architectural decisions, or changing existing behavior, update `FEATURES.md` to reflect the changes. This keeps the file as a living record of what the application does. Specifically:

- **New features** — add a section or bullet points describing the capability
- **Changed behavior** — update existing descriptions to match the new behavior
- **Removed features** — remove the corresponding documentation
- **Architectural decisions** — document in the relevant section (e.g. new API endpoints, new providers, new UI tabs)
