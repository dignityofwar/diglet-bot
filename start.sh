#!/bin/bash

docker compose up -d
pnpm migration:up
pnpm dev
