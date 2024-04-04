# diglet-bot
Typescript Discord Bot that serves the Dignity of War community. 

[![](https://dcbadge.vercel.app/api/server/joindig)](https://discord.gg/joindig)

[![CI](https://github.com/dignityofwar/diglet-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/dignityofwar/diglet-bot/actions/workflows/ci.yml)
![Jest coverage](./badges/coverage-jest%20coverage.svg)
![Lines](./badges/coverage-lines.svg)

## Setup
1. `pnpm install`.
2. Create a copy of `.env.example` file, name it `.env` and add your bot token into it (grab it from the Discord Developers site).
3. Run `start.sh`
4. Invite the bot to your server.

## MikroORM & Database

This project uses [MikroORM](https://mikro-orm.io/) which is a TS native ORM. We use MariaDB (the same as in the `docker-compose.yaml`) both in local dev and production.