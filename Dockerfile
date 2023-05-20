FROM node:18

COPY . /app

WORKDIR /app

RUN npm install -g pnpm

RUN pnpm build

RUN ls -lah dist/src

ENTRYPOINT /app/entrypoint.sh
