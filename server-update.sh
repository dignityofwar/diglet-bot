#!/usr/bin/env bash
set -euo pipefail

echo "$(date '+%Y-%m-%d %H:%M:%S') Webhook called!" >> /root/deploy.log

cd /root/docker

echo "$(date '+%Y-%m-%d %H:%M:%S') Updating container..." >> /root/deploy.log
docker compose pull digletbot && docker compose down digletbot && docker compose up digletbot -d
echo "$(date '+%Y-%m-%d %H:%M:%S') Container updated!" >> /root/deploy.log