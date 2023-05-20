FROM node:18

COPY . /app

WORKDIR /app

RUN npm install -g pnpm

RUN ls -lah

run ls -lah /app

RUN pnpm build

RUN ls -lah dist


ENTRYPOINT /app/entrypoint.sh
