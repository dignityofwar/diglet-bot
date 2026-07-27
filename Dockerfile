FROM node:24.14.1

ARG VERSION
ENV VERSION=${VERSION}

# pnpm ships with the image rather than being fetched at boot. Corepack is bundled with Node, so
# the version stays declared once in package.json's packageManager field. COREPACK_HOME is moved
# out of root's home and made world-readable: corepack downloads pnpm lazily on first use, and
# without this the tarball would land in /root/.cache, unreadable to the `node` user the container
# runs as, so every start would re-download pnpm from the registry.
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable

WORKDIR /app

# Own layer so it's only redone when the manifests change. Dev deps are kept, entrypoint.sh runs
# migrations through ts-node.
COPY package.json pnpm-lock.yaml ./
RUN corepack install && chmod -R a+rX "$COREPACK_HOME"
RUN pnpm install --frozen-lockfile --ignore-scripts

# Many things are ignored, check .dockerignore
COPY . /app

# Build and lock the execution down to node non privledged user
RUN pnpm build && chown node:node /app

USER node

ENTRYPOINT ["/app/entrypoint.sh"]
