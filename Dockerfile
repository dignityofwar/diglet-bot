FROM node:18

ARG VERSION

COPY . /app

WORKDIR /app

# Edit .env file with new version
RUN sed -i "s/VERSION=.*/VERSION=${VERSION}/g" .env

RUN npm install -g pnpm

RUN pnpm build

ENTRYPOINT /app/entrypoint.sh
