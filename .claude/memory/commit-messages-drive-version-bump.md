---
name: commit-messages-drive-version-bump
description: "Commit messages on main decide the release version bump via substring match — the word \"feat\" anywhere forces a minor bump"
metadata: 
  node_type: memory
  type: project
  originSessionId: ca733b42-5e99-422a-9fda-a6e80f064fc3
  modified: 2026-07-26T23:00:54.909Z
---

Every push to main runs `.github/workflows/release.yml`, where `phips28/gh-action-bump-version` picks the bump type by **substring-matching the commit message**, not by parsing the conventional-commit type. Defaults: `minor-wording: feat,minor`, `major-wording: BREAKING CHANGE,major`, otherwise patch.

**Why:** the match is a plain substring test over the whole message, subject *and* body. Prose like "Features", "minor tweak", or a body sentence containing "major" silently bumps the version harder than intended — and the bump is pushed and tagged before anyone sees it.

**How to apply:** when writing a commit destined for main, keep `feat`/`minor`/`major`/`BREAKING CHANGE` out of the message entirely unless that bump is genuinely wanted. Watch for them hiding inside longer words ("features", "refactor**major**ly"). For an intentional minor bump, use a real `feat:` type. Related: [[albion-registration-critical-pillar]].
