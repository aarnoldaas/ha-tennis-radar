# Project Rules

## Version Sync

When any code or asset changes are made, update the version string in ALL of these files before bundling:

1. `tennis_court_radar/config.yaml` — `version: "X.Y.Z"`
2. `tennis_court_radar/build.yaml` — `BUILD_VERSION: "X.Y.Z"`

All four occurrences must always match. Bump the patch version (Z) for fixes, minor (Y) for features.
