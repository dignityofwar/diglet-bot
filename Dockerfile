FROM node:24.12.0

ARG VERSION
ENV VERSION=${VERSION}

RUN npm install --ignore-scripts -g pnpm@10.25.0

# Many things are ignored, check .dockerignore
COPY . /app

WORKDIR /app

# Build and lock the execution down to node non privledged user
RUN pnpm build && chown node:node /app

USER node

ENTRYPOINT ["/app/entrypoint.sh"]
