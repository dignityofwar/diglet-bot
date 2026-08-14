---
name: local-dev-test-environment
description: "Running tests locally: any 24.x Node, pnpm install, then pnpm test (~91s, 54 suites / 786 tests); the engine-strict guard is currently inert under pnpm 11"
metadata:
  type: project
---

`engines` pins Node to `>=24.12.0 <25.0.0`, but **nothing currently enforces it**. `.npmrc` carries `engine-strict=true`, which pnpm 11 ignores — the setting moved to `engineStrict` in `pnpm-workspace.yaml`, and the pnpm 10 → 11 bump (`3a8715b`, 2026-07-27) orphaned the old line without anything failing. A v26 Node now prints `[WARN] Unsupported engine` and runs Jest anyway.

**Why:** the guard is worth having — "tests are broken" on a fresh machine is usually the wrong Node or missing `node_modules`, not a real failure, and a warning scrolls past where a hard stop does not. Restoring it means adding `engineStrict: true` to `pnpm-workspace.yaml`; verified that key produces `ERR_PNPM_UNSUPPORTED_ENGINE` where `.npmrc` no longer does.

**How to apply:**
- Any 24.x from 24.12.0 up (`nvm use 24.12.0` fails — that exact version was never installed; 24.18.0 satisfies the range), then `pnpm install`, then `pnpm test`.
- Full suite: 54 suites / 786 tests, ~91s with coverage. Plain `pnpm test` works fine on native Linux — `pnpm test:wsl` (maxWorkers=4) is only needed on WSL.
- pnpm 11 runs a deps-status check that spawns a real `pnpm install` before scripts. Set `npm_config_verify_deps_before_run=false` where an unintended install would be harmful — a failed one appends a junk line to `pnpm-workspace.yaml`.
- Baseline (2026-08-14, measured on a feature branch): green, 54/54. Known-low coverage is `ps2.game.verification.service.ts` (30.5%) and `census.websocket.service.ts` (20.5%) — still the worst two in the tree.
