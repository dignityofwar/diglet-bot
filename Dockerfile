FROM node:24.14.0

ARG VERSION
ENV VERSION=${VERSION}

# Installs pnpm via corepack
RUN corepack enable

# Many things are ignored, check .dockerignore
COPY . /app

WORKDIR /app

# Build and lock the execution down to node non privledged user
RUN pnpm build && chown node:node /app

USER node

ENTRYPOINT ["/app/entrypoint.sh"]
