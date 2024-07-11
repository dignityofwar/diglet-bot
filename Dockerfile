FROM node:20.15.1

ARG VERSION
ENV VERSION=${VERSION}

RUN npm install --ignore-scripts -g pnpm@9.1.2

COPY . /app

WORKDIR /app

RUN pnpm build

ENTRYPOINT /app/entrypoint.sh
