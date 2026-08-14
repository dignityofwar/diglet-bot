---
name: albion-api-search-lags-guild-members
description: "The Albion /search endpoint can 404 a character that /guilds/{id}/members already lists, so registration hard-fails even when the membership check passes"
metadata: 
  node_type: memory
  type: project
  volatility: normal
  lastVerified: 2026-08-14
  originSessionId: 2fa9c4b0-11e5-4ad5-af3f-7d94dee65519
  modified: 2026-07-30T20:37:08.236Z
---

The Albion API's two sources disagree. `checkCharacterGuildMembership` is happy if *either*
`/search?q=<name>` or `/guilds/<id>/members` confirms the character, but `handleRegistration` then
calls `getCharacter()`, which only uses `/search`. For a freshly created or freshly joined
character the guild member list is populated while search still returns nothing, so the retry
passes the membership check and then dies with "Character X does not seem to exist on the Europe
server".

**Why:** this is what `/albion-register-queue` exists for — staff can see the member in-game, so the
API is wrong rather than the member. It's also why a force-queued attempt must not be marked FAILED
on a hard error: the failure is expected and self-resolving, so it stays PENDING until it succeeds
or the 72h TTL expires (`forceQueued` on the queue entity).

**How to apply:** treat "does not seem to exist" during a *retry* as a lag symptom, not a bad
character name. If a member reports it right after registering, the fix is force-queueing them and
waiting, not asking them to re-check their spelling. See
[[albion-registration-critical-pillar]].
