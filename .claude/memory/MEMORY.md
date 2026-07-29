# Memory Index

- [Albion registration is a critical pillar](albion-registration-critical-pillar.md) — daily cron strips roles for ex-guild members; must be very robust
- [Local dev/test environment](local-dev-test-environment.md) — nvm use 24.12.0 first (strict engines pin), pnpm test ~107s / 362 tests; test:wsl only needed on WSL
- [Commit messages drive the version bump](commit-messages-drive-version-bump.md) — substring match on main: "feat" anywhere in a message forces a minor bump
- [necord's @Options() drops DTO defaults](necord-options-drops-dto-defaults.md) — field initialisers are ignored; omitted options arrive as null, so default at the read site
- [MariaDB upgrades need MARIADB_AUTO_UPGRADE](mariadb-upgrades-need-auto-upgrade-env.md) — a tag bump alone leaves system tables un-upgraded; the DB container drifts behind the repo
- [The deploy webhook reports false failures](deploy-webhook-reports-false-failure.md) — Node 19+ globalAgent kills the request at 5s, so Actions webhook wrappers are unusable; use curl

Note: this memory lives in the repo at `.claude/memory/` (wired via `autoMemoryDirectory` in `.claude/settings.json`) so it's shared via git across machines and collaborators. See README "Claude Code memory".
