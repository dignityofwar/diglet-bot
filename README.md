# diglet-bot
Typescript Discord Bot that serves the Dignity of War community. 

[![](https://dcbadge.vercel.app/api/server/joindig)](https://discord.gg/joindig)

[![CI](https://github.com/dignityofwar/diglet-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/dignityofwar/diglet-bot/actions/workflows/ci.yml)
![Jest coverage](./badges/coverage-jest%20coverage.svg)
![Lines](./badges/coverage-lines.svg)

## Setup
1. `pnpm install`.
2. Create a copy of `.env.example` file, name it `.env` and add your bot token into it (grab it from the Discord Developers site).
3. Go to [Planetscale](https://planetscale.com/) and create an account.
   1. Create a database on the main branch and dev branch.
   2. Create passwords for each branch.
   3. Inject said passwords into your `.env`.
4. `pnpm dev`.
5. Invite the bot to your server.

## MikroORM & Planetscale

This project uses [MikroORM](https://mikro-orm.io/) which is a TS native ORM.

We use a cloud database hosted by [Planetscale](https://planetscale.com/). This is a MySQL database, and is used for simple database storage.
