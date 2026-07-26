FROM node:24.14.1

ARG VERSION
ENV VERSION=${VERSION}

# Installs pnpm via corepack
RUN corepack enable

WORKDIR /app

# Own layer so it's only redone when the manifests change. Dev deps are kept, entrypoint.sh runs
# migrations through ts-node.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# Many things are ignored, check .dockerignore
COPY . /app

# Build and lock the execution down to node non privledged user
RUN pnpm build && chown node:node /app

USER node

ENTRYPOINT ["/app/entrypoint.sh"]
