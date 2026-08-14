---
name: pnpm-allowbuilds-breaks-on-renames
description: "An unlisted ignored build script fails pnpm install outright; allowBuilds keys are exact names, so a dependency rename breaks CI"
metadata: 
  node_type: memory
  type: project
  volatility: durable
  lastVerified: 2026-08-14
  originSessionId: 7e253822-08af-4203-b398-60ba9dcec1da
  modified: 2026-07-29T02:24:55.870Z
---

`allowBuilds` in `pnpm-workspace.yaml` matches on exact package names, and pnpm 11 treats an
ignored build script that isn't listed there as a hard `ERR_PNPM_IGNORED_BUILDS` failure — not
a warning. So when a dependency *renames* its native subpackage, every CI job dies at
`pnpm install` before lint/build/test run. Hit on 2026-07-29: Sentry 10.65.0 renamed
`@sentry-internal/node-cpu-profiler` to `@sentry/node-cpu-profiler`, failing PR #719 (fixed in
#739). The failing install also appends a `': set this to true or false'` placeholder line to
`pnpm-workspace.yaml`, so the file comes back dirty locally.

**Why:** the error text points at `pnpm approve-builds` and names the package, but not the fact
that a *previously handled* package changed name — it reads like a brand-new untrusted
dependency, which sends you looking in the wrong place.

**How to apply:** on any `ERR_PNPM_IGNORED_BUILDS`, diff the lockfile for a package dropping out
as another appears before assuming it's new. Fix by adding the new name to `allowBuilds`
(`false` for anything that only checks for a prebuilt binary — the Docker image installs with
`--ignore-scripts` anyway). List both names while the bump is in flight, and land the change on
`main` rather than the Renovate branch, since Renovate wipes non-Renovate commits when it
rebases.
