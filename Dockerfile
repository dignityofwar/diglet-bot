FROM node:18

ARG VERSION
ENV VERSION=${VERSION}

COPY . /app

WORKDIR /app

RUN npm install -g pnpm

RUN pnpm build

ENTRYPOINT /app/entrypoint.sh
