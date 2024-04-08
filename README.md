# diglet-bot
Typescript Discord Bot that serves the Dignity of War community. 

[![](https://dcbadge.vercel.app/api/server/joindig)](https://discord.gg/joindig)

[![CI](https://github.com/dignityofwar/diglet-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/dignityofwar/diglet-bot/actions/workflows/ci.yml)
![Jest coverage](./badges/coverage-jest%20coverage.svg)
![Lines](./badges/coverage-lines.svg)

## Prereqs
Recommend you install `nvm`. Run `nvm install 18.18.1` which will set up your node version correctly.

## Setup
1. `pnpm install`.
2. Create a copy of `.env.example` file, name it `.env` and add your bot token into it (grab it from the Discord Developers site).
3. Run `start.sh`
4. Invite the bot to your server.

## MikroORM & Database
This project uses [MikroORM](https://mikro-orm.io/) which is a TS native ORM. We use MariaDB (the same as in the `docker-compose.yaml`) both in local dev and production.

# WSL compatability
While this project is designed for a Mac ecosystem, it can be run on WSL, but you need to make the following bodges:
1. Rather than running `pnpm install`, you need to run `npm install`, as `pnpm` creates symlinks that winblows doesn't understand, thus your IDE will likely break. Grab a brew, it will take fecking forever to install everything with npm.
2. You cannot use docker's internal DNS for some reason. `DB_HOST` in your `.env` needs to be `127.0.0.1`.
3. Tests are a problem when running from within WSL. The filesystem absolutely shits the bed (it went up to 500MB/s on an SSD...). I figured this is due to the multi-concurrency, so run `pnpm test:wsl` to set maxWorkers to 4. If you're finding it's still locking up, adjust the worker count to 1/2 in `package.json`.

# Troubleshooting
## Running migration:up fails
```
Error: MikroORM config file not found in ['./src/mikro-orm.config.js', './mikro-orm.config.js']
```
This is due to ts-node not properly transpiling typescript into javascript which the package understands. To get round this, you can run `pnpm build` to in effect create the files for the migration to be able to run. Don't ask me why it works, it just does.
