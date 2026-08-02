---
name: commit-messages-drive-version-bump
description: "Commit messages on main decide the release version bump via substring match — the word \"feat\" anywhere forces a minor bump"
metadata: 
  node_type: memory
  type: project
  originSessionId: ca733b42-5e99-422a-9fda-a6e80f064fc3
  modified: 2026-08-02T22:04:33.897Z
---

Every push to main runs `.github/workflows/release.yml`, where `phips28/gh-action-bump-version` picks the bump type by **substring-matching the commit message**, not by parsing the conventional-commit type. Defaults: `minor-wording: feat,minor`, `major-wording: BREAKING CHANGE,major`, otherwise patch.

**Why:** the match is a plain substring test over the whole message, subject *and* body. Prose like "Features", "minor tweak", or a body sentence containing "major" silently bumps the version harder than intended — and the bump is pushed and tagged before anyone sees it.

**A major bump does not just over-bump, it breaks the deploy.** Tags `3.0.0` and `3.0.1` already exist from April 2025, and the version later went back down to 2.x. So the action computes `3.0.0`, `git tag` fails with "tag already exists", the release job dies, and **Build & Publish container and Trigger deployment are both skipped** — the merge lands on main and never ships. On 2026-08-02 the word *majority* in a commit body did exactly this, and the change sat undeployed until the next push.

**How to apply:** when writing a commit destined for main, keep `feat`/`minor`/`major`/`BREAKING CHANGE` out of the message entirely unless that bump is genuinely wanted. Watch for them hiding inside longer words — "features", "majority", "de**feat**ed", "refactor**major**ly". For an intentional minor bump, use a real `feat:` type. If a deploy has already failed this way, the fix is the next push: nothing was tagged, so a following commit with a clean message bumps normally and carries the stranded change out with it. Related: [[albion-registration-critical-pillar]].
