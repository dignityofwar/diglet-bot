FROM node:18

RUN npm install -g pnpm

RUN pnpm build

ENTRYPOINT ./entrypoint.sh
