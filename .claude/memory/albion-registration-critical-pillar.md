---
name: albion-registration-critical-pillar
description: Albion registration/scanning system is a core pillar of diglet-bot and must be very robust
metadata: 
  node_type: memory
  type: project
  originSessionId: 909afba1-29e5-4f78-afed-8378271d3953
---

The Albion Online registration system is one of the fundamental pillars of diglet-bot: it registers guild members, monitors their guild membership via a daily cron (~7 PM) that checks against the Albion Online API, and strips ranks/roles from anyone no longer detected in the guild.

**Why:** Matt (the maintainer) explicitly flagged this as needing to be "very robust" — it's the primary live function serving the Dignity of War community.

**How to apply:** Changes touching `src/albion/` registration/scanning/cron services deserve extra care: preserve retry behaviour (failed registrants can retry — a failed attempt is marked `FAILED` and **keeps** its row; the row is only cleared when the member enqueues again), don't weaken error handling, and keep test coverage strong. That persistence is load-bearing, not incidental — see [[queue-status-unique-key-collides-with-history]].
