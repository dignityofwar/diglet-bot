---
name: lockfile-maintenance-bypasses-renovate-age-gate
description: Renovate's 14-day minimumReleaseAge does not apply to lock file maintenance; pnpm's own setting is the only guard on that path
metadata:
  type: project
---

`renovate.json` sets `minimumReleaseAge: 14 days`, but Renovate's `isMinimumReleaseAgeApplicable()`
excludes the `lockFileMaintenance` update type — resolution is delegated to the package manager, so
Renovate never sees candidate releases to age-filter. The weekly job deletes `pnpm-lock.yaml` and
re-runs `pnpm install --lockfile-only`, re-resolving every caret in `package.json` against pnpm's
policy alone. This repo is the only one of mine with `lockFileMaintenance` enabled; Renovate's
default is `enabled: false`.

**Why:** the 14-day wait reads like a repo-wide guarantee and isn't one. On 2026-07-29 `main`'s
lockfile held `@sentry/node@10.68.0` five days after publication, plus `minimatch@10.2.6` at two
days — all arriving under `^` ranges while the PR proposing a *reviewed* Sentry bump sat frozen.

**How to apply:** the guard on that path is `minimumReleaseAge` in `pnpm-workspace.yaml` (minutes;
pnpm 11 defaults to 1440 = 1 day), raised to 10080 = 7 days in PR #744. Not 14, because
`vulnerabilityAlerts` deliberately bypasses the Renovate wait and a 14-day pnpm gate would block a
CVE fix from installing at all. Raising it needs the lockfile regenerated in the same commit —
`trustLockfile` defaults false, so every install re-checks existing entries and a stricter value
fails `--frozen-lockfile` until they age out. Exact pins can make a value unreachable entirely:
14 days was impossible while `@typescript-eslint` was pinned at 8.65.0. See
[[pnpm-allowbuilds-breaks-on-renames]] for the other pnpm-policy trap.
