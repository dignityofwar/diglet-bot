FROM node:18

COPY . ./app

WORKDIR /app

RUN pwd && ls -lah && ls -lah node_mdoules

RUN npm install -g pnpm

RUN pnpm build

ENTRYPOINT /app/entrypoint.sh
