# Memory Index

- [Albion registration is a critical pillar](albion-registration-critical-pillar.md) — daily cron strips roles for ex-guild members; must be very robust
- [Albion search lags the guild member list](albion-api-search-lags-guild-members.md) — /search 404s characters /guilds/{id}/members already lists, so retries hard-fail on a lag
- [Local dev/test environment](local-dev-test-environment.md) — nvm use 24.12.0 first (strict engines pin), pnpm test ~107s / 362 tests; test:wsl only needed on WSL
- [Commit messages drive the version bump](commit-messages-drive-version-bump.md) — substring match on main: "feat" anywhere in a message forces a minor bump
- [necord's @Options() drops DTO defaults](necord-options-drops-dto-defaults.md) — field initialisers are ignored; omitted options arrive as null, so default at the read site
- [MariaDB upgrades need MARIADB_AUTO_UPGRADE](mariadb-upgrades-need-auto-upgrade-env.md) — a tag bump alone leaves system tables un-upgraded; the DB container drifts behind the repo
- [The deploy webhook reports false failures](deploy-webhook-reports-false-failure.md) — Node 19+ globalAgent kills the request at 5s, so Actions webhook wrappers are unusable; use curl
- [allowBuilds breaks on dependency renames](pnpm-allowbuilds-breaks-on-renames.md) — an unlisted ignored build script fails pnpm install outright, killing CI before lint/test
- [Lock file maintenance bypasses Renovate's age gate](lockfile-maintenance-bypasses-renovate-age-gate.md) — the 14-day wait doesn't cover it; pnpm's own minimumReleaseAge is the only guard
- [Renovate freezes PRs under minimumReleaseAge](renovate-freezes-prs-under-minimum-release-age.md) — forced PRs never rebase, and the rebase checkbox can't unstick them
- [Local-midnight date keys are wrong here](local-midnight-date-keys-are-wrong.md) — forceUtcTimezone means setHours(0,0,0,0) splits a day across BST; use utcMidnight()
- [A nullable unique key enforces one open row](nullable-unique-key-enforces-one-open-row.md) — beats a read-before-write check, which races
- [Queue status flips collide with history](queue-status-unique-key-collides-with-history.md) — the unique key is on (guild, member, status), so an old succeeded row blocks the new one

Note: this memory lives in the repo at `.claude/memory/` (wired via `autoMemoryDirectory` in `.claude/settings.json`) so it's shared via git across machines and collaborators. See README "Claude Code memory".
