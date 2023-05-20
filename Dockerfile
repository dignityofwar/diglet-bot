FROM node:18

WORKDIR /app

RUN npm install -g pnpm

COPY . ./

RUN ls -lah node_modules

RUN pnpm build

ENTRYPOINT /app/entrypoint.sh
