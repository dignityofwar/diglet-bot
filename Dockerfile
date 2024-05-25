FROM node:18.20.3

ARG VERSION
ENV VERSION=${VERSION}

RUN npm install -g pnpm@8.15.7

COPY . /app

WORKDIR /app

RUN pnpm build

ENTRYPOINT /app/entrypoint.sh
