FROM node:18

WORKDIR /app

RUN npm install -g pnpm

COPY . ./

RUN pnpm install && pnpm build

ENTRYPOINT /app/entrypoint.sh
