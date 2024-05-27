FROM node:20.13.1

ARG VERSION
ENV VERSION=${VERSION}

RUN npm install -g pnpm@9.1.2

COPY . /app

WORKDIR /app

RUN pnpm build

ENTRYPOINT /app/entrypoint.sh
