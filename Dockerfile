FROM node:20.15.1

ARG VERSION
ENV VERSION=${VERSION}

USER node

RUN npm install --ignore-scripts -g pnpm@9.1.2

# Many things are ignored, check .dockerignore
COPY . /app

WORKDIR /app

RUN pnpm build

# Lock the execution down to node non privledged user
RUN chown node:node /app


ENTRYPOINT /app/entrypoint.sh
