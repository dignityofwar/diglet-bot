#!/bin/sh

cd /app

prisma generate

yarn start:prod
