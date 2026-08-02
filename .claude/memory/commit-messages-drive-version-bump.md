---
name: commit-messages-drive-version-bump
description: "The release bump is chosen by substring-matching the commit message; the trigger words are now explicit markers, not prose"
metadata:
  node_type: memory
  type: project
  originSessionId: ca733b42-5e99-422a-9fda-a6e80f064fc3
  modified: 2026-08-02T22:08:39.823Z
---

Every push to main runs `.github/workflows/release.yml`, where `phips28/gh-action-bump-version` picks
the bump type by **substring-matching the commit message**, subject *and* body, rather than parsing
the conventional-commit type. Its defaults are `minor-wording: feat,minor` and
`major-wording: BREAKING CHANGE,major`, which means ordinary prose decides the release.

**Why that mattered:** the words hide inside longer ones. "majority" contains *major*; "features"
and "defeat" contain *feat*. Worse than over-bumping, a spurious version bump of the largest size
**breaks the deploy outright**: tags `3.0.0` and `3.0.1` have existed since April 2025 (the project
briefly ran a 3.x line, then went back to 2.x), so the action computes `3.0.0`, `git tag` fails with
"tag already exists", the release job dies, and **Build & Publish container and Trigger deployment
are both skipped**. The PR shows merged and green while the change never leaves the repository, and
nothing in the failure points at the commit message. This is not hypothetical: it stranded a merge on
2026-08-02, and a check across the preceding history showed a pure bugfix PR had already been
released as a minor version for the same reason.

**Now configured explicitly**, in `release.yml` and identically in `build-and-test-main.yml` (which
runs the same action in dry-run to label the SonarCloud scan — they must agree or Sonar reports a
version the tag never becomes):

- `major-wording: BUMP-MAJOR` — a marker that cannot appear by accident
- `minor-wording: feat:,feat(` — the conventional-commit prefix, not the bare word
- `rc-wording: BUMP-RC`
- `default: patch`

**How to apply:** a `feat:` or `feat(scope):` subject still gives a minor bump, which is the existing
convention and worth keeping. Everything else is a patch. For a deliberate large bump, put
`BUMP-MAJOR` in the message — and first deal with the stale `3.0.0`/`3.0.1` tags, which will collide
with it. If a deploy ever fails this way again, nothing was tagged, so the next push with a clean
message bumps normally and carries the stranded change out with it.
Related: [[albion-registration-critical-pillar]].
