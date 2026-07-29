---
name: deploy-webhook-reports-false-failure
description: "ci.yml's send-webhook step goes red on deploys that actually succeeded — check /root/deploy.log on the host, not the Actions result"
metadata: 
  node_type: memory
  type: project
  originSessionId: 98e6e913-c748-4676-92ad-94d3e2352e1b
  modified: 2026-07-29T01:37:43.327Z
---

The `Trigger deployment / send-webhook` job in `ci.yml` reports failure while the deploy itself succeeds. It errors with `timeout of 120000ms exceeded` after only **~5 seconds**, so it is a connection/response-handling problem mislabelled as a timeout. Confirmed on both `e33a1c8` (2.27.12) and `46abe1e` (2.27.13): `/root/deploy.log` on the host shows the deploy fired and recreated the container each time.

**Why:** a pipeline that shows red on every successful deploy trains everyone to stop reading it, so the day it fails for real nothing stands out. There is also no watchtower container on that host despite `watchtower.enable` labels on both compose services — the webhook is the only deploy path, with nothing quietly covering for it.

**How to apply:** treat a red `send-webhook` as unproven, not failed. Verify against `/root/deploy.log` and the container's `StartedAt` before assuming a deploy did not land. Note the repo's `server-update.sh` is **not** the script that actually runs — the host's real one pulls and recreates by changed image and logs different text. Related: [[mariadb-upgrades-need-auto-upgrade-env]].
