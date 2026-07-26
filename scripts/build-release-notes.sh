#!/usr/bin/env bash
#
# Builds a categorised changelog rollup for a release, printed to stdout as markdown.
#
# GitHub's own generateReleaseNotes only ever lists *merged pull requests*. Plenty of work here
# lands as a direct push to main (and Renovate squashes carry their own PR refs), so releases
# were coming out with an empty body - just the "Full Changelog" compare link and nothing saying
# what actually changed. This walks the commits instead, so every conventional commit between the
# previous release tag and this one shows up under its type.
#
# Usage: scripts/build-release-notes.sh <new-tag> [previous-tag]
#
# The previous tag is worked out automatically when not given: the nearest version tag reachable
# from the new tag's parent. Needs full history + tags, so the workflow checks out at depth 0.
set -euo pipefail

NEW_TAG="${1:?usage: build-release-notes.sh <new-tag> [previous-tag]}"
PREV_TAG="${2:-}"

if [[ -z "$PREV_TAG" ]]; then
  PREV_TAG="$(git describe --tags --abbrev=0 --match '[0-9]*.[0-9]*.[0-9]*' "${NEW_TAG}^" 2>/dev/null || true)"
fi

if [[ -n "$PREV_TAG" ]]; then
  RANGE="${PREV_TAG}..${NEW_TAG}"
else
  # First ever release - take the lot.
  RANGE="$NEW_TAG"
fi

# Section buckets, in the order they get printed.
declare -a breaking=() features=() fixes=() perf=() refactors=() docs=() tests=() deps=() build=() chores=() other=()

# %x1f separates fields, %x1e separates commits, so multi-line commit bodies survive the read loop.
commits="$(git log --no-merges --reverse --format='%h%x1f%s%x1f%b%x1e' "$RANGE")"

while IFS=$'\x1f' read -r -d $'\x1e' sha subject body; do
  # Leading newline left over from the previous record's separator.
  sha="${sha#$'\n'}"
  [[ -z "$sha" ]] && continue

  # Release plumbing - noise in a changelog aimed at humans.
  [[ "$subject" == "ci: version bump to "* ]] && continue
  [[ "$subject" == "ci(bot): Update coverage badges" ]] && continue

  if [[ "$subject" =~ ^([a-zA-Z]+)(\(([^\)]*)\))?(!)?:[[:space:]]*(.*)$ ]]; then
    type="${BASH_REMATCH[1],,}"
    scope="${BASH_REMATCH[3]}"
    bang="${BASH_REMATCH[4]}"
    description="${BASH_REMATCH[5]}"
  else
    # Not a conventional commit - keep it verbatim rather than dropping it on the floor.
    type=''
    scope=''
    bang=''
    description="$subject"
  fi

  # Bare short SHAs (7+ chars) get auto-linked to the commit by GitHub, so leave them unquoted.
  if [[ -n "$scope" ]]; then
    entry="- **${scope}**: ${description} (${sha})"
  else
    entry="- ${description} (${sha})"
  fi

  # A `!` in the type or a BREAKING CHANGE footer promotes the entry, whatever its type.
  if [[ -n "$bang" || "$body" == *"BREAKING CHANGE"* ]]; then
    breaking+=("$entry")
    continue
  fi

  # Dependency updates are almost all of chore()/fix() by volume - give them their own section so
  # they don't bury the hand-written changes.
  if [[ "$scope" == deps* ]]; then
    deps+=("$entry")
    continue
  fi

  case "$type" in
    feat)              features+=("$entry") ;;
    fix)               fixes+=("$entry") ;;
    perf)              perf+=("$entry") ;;
    refactor)          refactors+=("$entry") ;;
    docs)              docs+=("$entry") ;;
    test)              tests+=("$entry") ;;
    build|ci)          build+=("$entry") ;;
    chore|style)       chores+=("$entry") ;;
    *)                 other+=("$entry") ;;
  esac
done <<< "$commits"

print_section() {
  local title="$1"
  shift
  (( $# == 0 )) && return 0
  printf '### %s\n\n' "$title"
  printf '%s\n' "$@"
  printf '\n'
}

printf '## Changelog\n\n'

total=$(( ${#breaking[@]} + ${#features[@]} + ${#fixes[@]} + ${#perf[@]} + ${#refactors[@]} \
       + ${#docs[@]} + ${#tests[@]} + ${#deps[@]} + ${#build[@]} + ${#chores[@]} + ${#other[@]} ))

if (( total == 0 )); then
  printf '_No notable changes - maintenance release._\n\n'
else
  print_section '⚠️ Breaking Changes' ${breaking[@]+"${breaking[@]}"}
  print_section '✨ Features'         ${features[@]+"${features[@]}"}
  print_section '🐛 Bug Fixes'        ${fixes[@]+"${fixes[@]}"}
  print_section '⚡ Performance'      ${perf[@]+"${perf[@]}"}
  print_section '♻️ Refactoring'      ${refactors[@]+"${refactors[@]}"}
  print_section '📝 Documentation'    ${docs[@]+"${docs[@]}"}
  print_section '✅ Tests'            ${tests[@]+"${tests[@]}"}
  print_section '📦 Dependencies'     ${deps[@]+"${deps[@]}"}
  print_section '🏗️ Build & CI'       ${build[@]+"${build[@]}"}
  print_section '🧹 Chores'           ${chores[@]+"${chores[@]}"}
  print_section '🔀 Other'            ${other[@]+"${other[@]}"}
fi
