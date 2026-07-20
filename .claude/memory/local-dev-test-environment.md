---
name: local-dev-test-environment
description: "Running tests locally: nvm use 24.12.0 first (newer system node fails the engines check), pnpm install, then pnpm test (~107s, plain `pnpm test` is fine on native Linux)"
metadata:
  type: project
---

`pnpm` refuses to run anything if the active Node doesn't satisfy `engines` (`>=24.12.0 <25.0.0`) — a newer system Node (e.g. v26) fails with `ERR_PNPM_UNSUPPORTED_ENGINE` before Jest even starts.

**Why:** the engines pin is strict, so "tests are broken" on a fresh machine is usually just the wrong Node or missing `node_modules`, not a real failure.

**How to apply:**
- `source ~/.nvm/nvm.sh && nvm use 24.12.0` (installed via nvm on Matt's machines), then `pnpm install`, then `pnpm test`.
- Full suite: 31 suites / 362 tests, ~107s with coverage. Plain `pnpm test` works fine on native Linux — `pnpm test:wsl` (maxWorkers=4) is only needed on WSL.
- Baseline (2026-07-20): everything green on `main`; known-low coverage areas are `ps2.game.verification.service.ts` (~30%) and `census.websocket.service.ts` (~20%).
