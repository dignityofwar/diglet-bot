FROM node:18

ARG PNPM_STORE_DIR

WORKDIR /app

RUN npm install -g pnpm

# Copy pnpm store from builder
COPY --from=build  $PNPM_STORE_DIR /pnpm-store

COPY . ./

RUN pnpm config set store-dir /pnpm-store && pnpm install && pnpm build

ENTRYPOINT /app/entrypoint.sh
