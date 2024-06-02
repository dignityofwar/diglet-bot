#!/bin/bash

# Check if Docker daemon is responding
if ! docker info > /dev/null 2>&1; then
  echo "Docker daemon is not responding. Please ensure Docker is running."
  exit 1
fi

docker compose up -d
pnpm migration:up
pnpm dev
