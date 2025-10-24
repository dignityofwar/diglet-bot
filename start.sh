#!/bin/bash

rm -rf dist

# Check if Docker daemon is responding
if ! docker info > /dev/null 2>&1; then
  echo "Docker daemon is not responding. Please ensure Docker is running."
  exit 1
fi

docker compose up -d

# Now need to build the app as the migrations depend upon the MirkoORM config file being built into JS
pnpm install
pnpm build
pnpm migration:up

pnpm dev
