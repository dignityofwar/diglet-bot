---
name: local-midnight-date-keys-are-wrong
description: "MikroORM runs forceUtcTimezone, so date.setHours(0,0,0,0) day keys split a day across BST"
metadata: 
  node_type: memory
  type: project
  originSessionId: 90fbe174-1646-4977-a103-bfdf7cf2ff8d
  modified: 2026-08-02T16:57:28.208Z
---

`mikro-orm.config.ts` sets `forceUtcTimezone: true`, but `ActivityService`, `RoleMetricsService`
and `JoinerLeaverService` all normalise their daily-statistics key with `date.setHours(0, 0, 0, 0)`
— **local** midnight in Europe/London, then stored UTC-shifted.

**Why:** during BST that puts anything logged between 23:00 and midnight onto the following day's
row, so a single day can end up split across two keys. It matters much more for a per-member
counter than for the existing once-a-day report rows, where the job runs at 00:01 and only ever
writes one row anyway. Anything doing read-modify-write against a day key — or mixing an ORM read
with a raw-SQL upsert, which can generate its own date server-side — will silently disagree with
itself twice a year.

**How to apply:** use `utcMidnight()` from `src/helpers.ts` (`setUTCHours`) for any new day-keyed
table, on **every** read and write path, and bind the date as a parameter computed in Node rather
than letting SQL produce it with `CURDATE()`. `MemberDailyActivityEntity` and
`MemberDailyGameActivityEntity` do this. The three older services were deliberately left alone —
changing them would rewrite the meaning of historical statistics rows, so that is its own change.
