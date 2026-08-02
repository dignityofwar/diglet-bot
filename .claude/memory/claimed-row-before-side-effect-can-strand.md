---
name: claimed-row-before-side-effect-can-strand
description: Claiming a row before an unrepeatable side effect strands the claim if anything between them fails
metadata: 
  node_type: memory
  type: project
  originSessionId: 90fbe174-1646-4977-a103-bfdf7cf2ff8d
  modified: 2026-08-02T20:16:33.889Z
---

`/albion-rank-up` inserts the ballot row (claiming `pendingKey`) before posting to Judgement Hall,
because a Discord post cannot be rolled back. The trap is everything that sits *between* the claim
and the post: the activity report was built there, so a failing rollup query left a pending row with
no `messageId` — a ballot the member is locked behind that nobody ever saw. Nothing cleaned it up,
and after five days the expiry cron closed it as a timeout, adding a week-long failed-vote lockout.

**Why:** claim-then-act is the right ordering — the reverse leaves an untracked public ballot. But
it only holds if the gap is empty. Two things make it safe: build everything fallible *before* the
claim, and give the claim a reclaim path, since a crash between the two can always happen.
`reclaimUnposted()` abandons pending rows with a null `messageId` older than a grace window, run
first in the vote sweep so a stranded claim is cleared before expiry can time it out. The grace
window matters — without it a concurrent request could reclaim a publish still in flight.

**How to apply:** when a row claims a slot ahead of an irreversible side effect, check what can
throw in between and move it earlier, then ask what clears the claim if the process dies there. Also
classify the duplicate-key error rather than catching broadly: the original code reported *any*
insert failure as "you already have a vote open", which is how a stranded row looked identical to a
missing table. See [[nullable-unique-key-enforces-one-open-row]] for the constraint itself.
