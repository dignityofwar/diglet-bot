# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude memories

Persistent memories are version-controlled in this repo at `.claude/memory/`, wired up natively via `autoMemoryDirectory` in the committed `.claude/settings.json` (which assumes the repo lives at `~/code/diglet-bot`). Before writing a memory, sanity-check you're writing inside the repo's `.claude/memory/` — if your memory directory resolves elsewhere (e.g. a plain `~/.claude/projects/<slug>/memory` dir because the repo was cloned to a different path), merge any stray files into `.claude/memory/`, flag the mismatch to the user, and suggest fixing it per README "Claude Code memory". Memory changes should be committed like any other file.

## Project

diglet-bot is a TypeScript Discord bot (NestJS + discord.js v14) serving the Dignity of War gaming community, with Albion Online and PlanetSide 2 integrations. Package manager is **pnpm** (Node 24.x enforced via `engines`).

## Commands

```bash
pnpm install                 # install deps
pnpm dev                     # NestJS watch mode (needs DB; Discord TOKEN needed only for real connectivity)
pnpm build                   # nest build → dist/
pnpm lint                    # ESLint with --fix
pnpm test                    # full Jest suite with coverage (~2 min; don't cancel)
pnpm test:wsl                # same but maxWorkers=4 (use on WSL — filesystem chokes otherwise)
npx jest src/path/to/file.spec.ts   # run a single test file
```

Tests require no database or Discord token — they run entirely against mocks.

### Database / migrations

Local MariaDB runs via `docker compose up -d` (host port 3307, credentials root/password). MikroORM CLI reads `.env` — create it as a symlink: `ln -s digletbot.env .env` (copy `digletbot.env.example` → `digletbot.env` first).

```bash
pnpm migration:create | migration:up | migration:down | migration:list
```

If `migration:up` fails with "MikroORM config file not found", run `pnpm build` first — the CLI needs the compiled entities in `dist/`.

`./start.sh` runs the full local sequence (DB, build, migrations, dev mode); `./stop.sh` stops the containers.

## Architecture

NestJS dependency-injection app bootstrapped in `src/main.ts` / `src/app.module.ts`. There is no HTTP server — the app's "controllers" are Discord slash commands and gateway events.

- **Feature modules** — `src/general/` (core community features: activity tracking, purges, joiner/leaver stats, role metrics), `src/albion/`, `src/ps2/` (per-game registration/verification/scanning). Each follows the same internal layout:
  - `commands/` — slash commands via `@discord-nestjs/core` decorators (`@Command`, `@Handler`). Commands are thin; logic lives in services.
  - `services/` — business logic. `*.cron.service.ts` files hold scheduled jobs (`@nestjs/schedule` `@Cron` decorators) that drive recurring scans/reports/purges.
  - `events/` (general only) — Discord gateway event handlers (guild member, message, voice state).
- **`src/database/`** — MikroORM (MariaDB) entities and migrations. Entities extend `base.entity.ts`. Config is in root-level `mikro-orm.config.ts`. Migrations are non-transactional.
- **`src/config/`** — `@nestjs/config` namespaced configs (`app`, `discord`, `albion`, `ps2`), including large Discord role/channel ID maps and PS2 rank→role mappings. Accessed via `ConfigService.get('discord.guildId')` etc.
- **External APIs** — Albion Online API (`albion.api.service.ts`, axios) and PS2 Census API/websocket (`census.api.service.ts`, `census.websocket.service.ts`, ps2census). Sentry is initialized in `src/instrument.ts`.

### Testing conventions

Tests are colocated `*.spec.ts` files. `src/test.bootstrapper.ts` (`TestBootstrapper`) is the shared mock factory — use it for ConfigService values, entity repos, Discord interactions/members/channels instead of hand-rolling mocks (it exists specifically to kill copy-paste duplication). `src/test.template` is a starter skeleton for new spec files. `src/jest-preload.js` mocks out all console output globally. Coverage excludes `database/`, `config/`, `*.module.ts`, and `main.ts` by design.

## CI

Run `pnpm lint` before committing — CI enforces it, and the ESLint config carries strict style rules (single quotes, semicolons, 2-space indent, stroustrup braces, trailing commas on multiline) that `--fix` applies automatically. Coverage badges and SonarCloud metrics are generated from the Jest coverage output.
