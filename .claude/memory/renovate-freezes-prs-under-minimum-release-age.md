---
name: renovate-freezes-prs-under-minimum-release-age
description: A Renovate PR forced from the dashboard before minimumReleaseAge is frozen — no rebases, no bumps — and the rebase checkbox cannot unstick it
metadata:
  type: project
  volatility: normal
  lastVerified: 2026-08-14
---

Forcing a PR from the Dependency Dashboard while the release is younger than `minimumReleaseAge`
gets the branch created, and nothing more. `internalChecksFilter` defaults to `strict`, which sets
`pendingChecks`, and the branch worker then returns early on every later run: *"Branch updating is
skipped because internalChecksFilter was not met"*. No rebase, no version bump, no PR body refresh
until the age is met. Measured 2026-07-29: PR #729 sat 17 commits behind `main` for a day while
#719, identical config but a green check, rebased and automerged the moment `main` moved.

**Why:** it looks like Renovate has silently broken or lost the webhook, and the obvious remedy —
ticking the rebase/retry checkbox — appears to do nothing. It does work (#729 force-pushed 135
seconds after ticking), but `renovate/stability-days` is rewritten from release age alone on the
new head, so the PR comes straight back to pending and looks untouched. Rebasing can never make a
pending PR mergeable.

**How to apply:** to actually land one early, merge it by hand — `main` is not branch-protected, so
the pending check blocks only Renovate's own automerge. To stop forced PRs going stale in the first
place, set `internalChecksFilter: flexible`: branches are then created and kept rebased, with the
pending check still holding automerge back. Don't reach for
`statusCheckWhen.minimumReleaseAge: never` — it removes the signal and keeps the freeze.
