FROM node:24.14.1

ARG VERSION
ENV VERSION=${VERSION}

# Installs pnpm via corepack
RUN corepack enable

WORKDIR /app

# Install dependencies inside the image rather than relying on node_modules being present in the
# build context. Kept as its own layer so it is only redone when the manifests change.
# Dev dependencies are needed at runtime too, entrypoint.sh runs migrations through ts-node.
# --ignore-scripts is explicit rather than behavioural, pnpm 10 already blocks dependency build
# scripts unless they are approved via pnpm.onlyBuiltDependencies, and we approve none.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# Many things are ignored, check .dockerignore
COPY . /app

# Build and lock the execution down to node non privledged user
RUN pnpm build && chown node:node /app

USER node

ENTRYPOINT ["/app/entrypoint.sh"]
