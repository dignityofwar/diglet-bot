---
name: deploy-webhook-reports-false-failure
description: "Actions wrappers for the deploy webhook die at 5s on Node 19+ because https.globalAgent sets timeout:5000 — the configured timeout is unreachable, so call the hook with curl"
metadata: 
  node_type: memory
  type: project
  volatility: normal
  lastVerified: 2026-08-14
  originSessionId: f59bd104-1a86-4613-a4d3-c718fae6dff4
  modified: 2026-07-29T02:27:17.845Z
---

`ramzzisudip/secure-github-webhook@0.3.0` — and any Actions wrapper that does not set its
own HTTP agent — aborts the request after **~5 seconds** regardless of its `timeout` input,
then reports `timeout of <configured>ms exceeded`, which is why the error looks like a
timeout that has not happened. Since Node 19 `https.globalAgent` is
`{keepAlive: true, timeout: 5000, …}`; that 5000 is a socket idle timeout, the socket is
idle for the whole deploy, so it fires, the request emits `timeout`, and axios rejects with
its own configured message. Reproduced off-infrastructure against `httpbin.org/delay/10`:
`EXIT after 5373ms` with `timeout: 120000`. A request with a fresh agent waits properly.

**Why:** this only started showing on 2026-07-28, when the webhooks repo made deploy hooks
synchronous (`include-command-output-in-response`), so responses went from instant to
37–86s. Nothing changed in this repo, and raising the action's timeout 2000 → 120000 could
never have helped — the input is unreachable. The deploys themselves all landed.

**How to apply:** call the hook with `curl` and `--fail-with-body --max-time`, signing the
body with `openssl dgst -sha256 -hmac` (verified byte-identical to the action's HMAC), as
`.github/workflows/deploy.yml` now does. A red `send-webhook` is now a real deploy failure
and its output is the deploy's own. Same fix applies to any other repo pointing at that
host. Related: [[mariadb-upgrades-need-auto-upgrade-env]].
