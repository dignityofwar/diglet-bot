FROM node:18

COPY . /app

WORKDIR /app

RUN npm install -g pnpm

RUN pnpm build

ENTRYPOINT /app/entrypoint.sh
