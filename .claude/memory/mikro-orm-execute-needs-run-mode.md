---
name: mikro-orm-execute-needs-run-mode
description: "connection.execute() returns rows by default, so affectedRows is undefined on every UPDATE unless you pass 'run'"
metadata: 
  node_type: memory
  type: project
  originSessionId: 90fbe174-1646-4977-a103-bfdf7cf2ff8d
  modified: 2026-08-02T20:16:22.304Z
---

`em.getConnection().execute(sql, params)` defaults to `method: 'all'` and returns **rows**. For an
`UPDATE` that means `[]`, so `result.affectedRows` is `undefined` and any `?? 0` fallback reads as
zero. Pass `'run'` as the third argument to get `{ affectedRows, rows }` back.

**Why:** it fails silently and in the safe-looking direction. Every conditional-update election in
the Albion rank-up feature — resolving a vote, claiming the announcement, claiming the denial-notice
throttle, reclaiming a stranded ballot — treats "affected 1 row" as winning. Reading 0 means every
caller concludes somebody else won and returns without doing anything, so votes resolved in the
database and never announced, and denial notices never reached Judgement Hall. Nothing throws and
nothing logs. It shipped because the specs mock `execute` and assert on the SQL string, which is
exactly the part that was right. See [[nullable-unique-key-enforces-one-open-row]] for why these
elections exist at all.

**How to apply:** any `execute()` whose return value you inspect needs `'run'`. Assert on the third
argument in the spec (`expect(execute.mock.calls[0][2]).toBe('run')`) — a mocked connection returns
whatever you told it to, so the mode is the one thing mocks can never catch. Where an election
decides whether a side effect happens, prove it once against the real container.
