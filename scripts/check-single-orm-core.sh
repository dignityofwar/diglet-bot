#!/usr/bin/env bash
#
# Fails if pnpm-lock.yaml resolves more than one version of @mikro-orm/core.
#
# MikroORM's packages pin their siblings to an exact version, so bumping one of them on its
# own (a lone renovate/dependabot security PR, say) makes pnpm resolve a second core. The
# entities then register their @Entity() metadata in one core's MetadataStorage while the CLI
# reads the other's, every entity comes out looking abstract, and migration:up dies with
# "Only abstract entities were discovered" - on boot, in production. That has happened twice.
#
# Keep every @mikro-orm/* dependency on the same version and this stays quiet.
#
# Reads the lockfile rather than node_modules: no install needed, and it can't be fooled by
# stale copies left behind in the pnpm virtual store.
set -euo pipefail

cd "$(dirname "$0")/.."

versions=$(grep -oE '@mikro-orm/core@[0-9]+\.[0-9]+\.[0-9]+' pnpm-lock.yaml | sort -u)
count=$(printf '%s\n' "$versions" | grep -c . || true)

if [ "$count" -eq 1 ]; then
  echo "OK: pnpm-lock.yaml resolves a single ${versions}"
  exit 0
fi

echo "Expected exactly one @mikro-orm/core version in pnpm-lock.yaml, found ${count}:" >&2
printf '%s\n' "$versions" | sed 's/^/  /' >&2
echo >&2
echo "Align every @mikro-orm/* version in package.json - see the comment in this script." >&2
exit 1
