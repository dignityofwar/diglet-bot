FROM node:22.20.0

ARG VERSION
ENV VERSION=${VERSION}

RUN npm install --ignore-scripts -g pnpm@9.14.4

# Many things are ignored, check .dockerignore
COPY . /app

WORKDIR /app

# Build and lock the execution down to node non privledged user
RUN pnpm build && chown node:node /app

USER node

ENTRYPOINT ["/app/entrypoint.sh"]
