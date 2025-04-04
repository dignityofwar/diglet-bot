FROM node:22.14.0

ARG VERSION
ENV VERSION=${VERSION}

RUN npm install --ignore-scripts -g pnpm@9.14.4

# Many things are ignored, check .dockerignore
COPY . /app

WORKDIR /app

RUN pnpm build

# Lock the execution down to node non privledged user
RUN chown node:node /app
USER node

ENTRYPOINT ["/app/entrypoint.sh"]
