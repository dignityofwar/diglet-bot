FROM node:18

ARG VERSION
ENV VERSION=${VERSION}

RUN npm install -g pnpm

COPY . /app

WORKDIR /app

RUN pnpm build

ENTRYPOINT /app/entrypoint.sh
