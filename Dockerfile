FROM node:18.20.3

ARG VERSION
ENV VERSION=${VERSION}

RUN npm install -g pnpm@9.1.2

COPY . /app

WORKDIR /app

RUN pnpm build

ENTRYPOINT /app/entrypoint.sh
