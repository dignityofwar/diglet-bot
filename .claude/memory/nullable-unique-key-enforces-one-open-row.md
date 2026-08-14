---
name: nullable-unique-key-enforces-one-open-row
description: "A nullable unique column beats a read-before-write check for \"only one open X per member\""
metadata: 
  node_type: memory
  type: project
  volatility: normal
  lastVerified: 2026-08-14
  originSessionId: 90fbe174-1646-4977-a103-bfdf7cf2ff8d
  modified: 2026-08-02T16:57:39.545Z
---

To enforce "a member may only have one open rank-up ballot", `AlbionRankUpVoteEntity` carries a
`pendingKey` column holding the `discordId` while pending and `null` once resolved, under a unique
index. MariaDB unique indexes ignore nulls, so any number of resolved rows coexist while a second
*pending* insert fails with a duplicate-key error the service catches and reports.

**Why:** the obvious version — query for an existing pending row, then insert if there isn't one —
is a read-before-write race. Two invocations can both read "none open" and both insert, and the
result is two public ballots for the same person. The same shape applies to the resolve path, which
uses `UPDATE ... WHERE id = ? AND status = 'pending'` and treats an affected-row count of 1 as
winning the election; every other caller gets 0 and returns without announcing. Neither needs a
transaction — the guarantee comes from the constraint and the conditional `WHERE`.

**How to apply:** reach for this whenever "only one live X at a time" matters and more than one
code path can create it. Verified against the real container, not just mocks: two null rows plus
one pending insert fine, second pending insert rejected. Mocked repositories will happily let a
racy read-then-insert pass, so prove constraints like this against the database.
