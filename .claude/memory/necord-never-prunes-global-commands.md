---
name: necord-never-prunes-global-commands
description: "necord skips the global command scope entirely when every command is guild-scoped, so stale global registrations survive every redeploy"
metadata: 
  node_type: memory
  type: project
  volatility: normal
  lastVerified: 2026-08-14
  originSessionId: 32bc8f0f-2d66-4a8c-b99c-c9b4012b8549
  modified: 2026-08-03T20:23:47.759Z
---

necord's `registerGlobalCommands()` returns early when there are no global commands to write,
*before* it calls `application.commands.set()`. Because `development: [guildId]` in
`app.module.ts` stamps every command with a guild, this app never has a global command — so
necord never writes that scope and never prunes it. Anything registered globally by an earlier
deploy stays on Discord forever and shows up as a **duplicate slash command** in the picker,
since Discord merges the global and guild sets.

**Why:** this fails silently and looks like a code bug. The command is declared once in source,
the guild bulk-overwrite works correctly, and no amount of redeploying changes anything, because
the stale copy lives in a scope the bot no longer writes to. Only some commands duplicate — the
global set is a frozen snapshot of whichever commands existed when it was last written.

**How to apply:** `GlobalCommandCleanupService` (`src/discord/`) now clears that scope on
`clientReady`, guarded on necord's own `development` option being a non-empty array. If that
option is ever removed, necord starts owning the global scope and the cleanup must not run.
Note it only prunes the global scope — guild commands registered in *other* guilds are
deliberately left alone. Also beware `development: [undefined]`: necord throws part way through
registration and silently leaves the previous command set in place, which is the likely origin
of the stale globals, so the module factory now refuses to start without the guild id.
