---
name: queue-status-unique-key-collides-with-history
description: "Flipping an albion_registration_queue row's status can collide with an older row holding the target status"
metadata: 
  node_type: memory
  type: project
  volatility: hot
  lastVerified: 2026-08-14
  originSessionId: 2229b546-6ab4-4ca6-b8b8-72c155b3b6af
  modified: 2026-08-02T19:34:44.047Z
---

`AlbionRegistrationQueueEntity` is unique on `(guildId, discordId, status)`, so a member may hold
one row per status at once — one `pending`, one `succeeded`, one `failed`, one `expired`. That means
writing `attempt.status = SUCCEEDED` on a pending row throws a duplicate-key error whenever that
member already has a succeeded row from an earlier registration, which is exactly what a
register → deregister → re-register cycle leaves behind. Delete the row already holding the target
status first.

**Why:** the collision only appears once a member has history, so it never shows up in development
or in mocked tests — the repository mock accepts any status assignment. It surfaced in review, not
in the suite. The consequence is worse than the error itself: the status flip happens *after* the
registration row and the Discord roles are committed, so the throw is caught and converted into a
member-facing failure ping for someone who is in fact fully registered, and leaves the pending row
for the retry cron to keep picking up.

**How to apply:** treat any `status` assignment on this entity as a write that can collide, not a
field update. Clear the target status first, and wrap the whole step so a failure downgrades to a
warning rather than failing an operation that already succeeded. `AlbionForceRegistrationService`
does both. **Every** status write in `albion.registration.retry.cron.service.ts` still carries the
exposure — the `SUCCEEDED` flip, both `FAILED` writes and `EXPIRED` — and a collision there can
abort the rest of the batch, because the failing flush escapes `processAttempt` into an unguarded
`for` loop over the remaining attempts. Only the `retainForceQueued` path is safe, and only
because the row is already `PENDING`. See
[[nullable-unique-key-enforces-one-open-row]] for the case where this constraint shape is the
feature rather than the trap.
