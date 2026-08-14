---
name: necord-options-drops-dto-defaults
description: "necord's @Options() never constructs the DTO class, so field initialisers are silently ignored and omitted options arrive as null"
metadata: 
  node_type: memory
  type: project
  originSessionId: 98e6e913-c748-4676-92ad-94d3e2352e1b
  modified: 2026-07-29T01:37:26.407Z
---

necord's `@Options()` param decorator reduces the resolved interaction options into a **plain object literal** — it calls `interaction.options.getBoolean(name, required)` etc. per field and never instantiates the DTO class. So a class field initialiser (`dryRun = true`) is silently ignored, and an omitted optional argument arrives as **`null`**, not the default.

**Why:** `@discord-nestjs`' old `SlashCommandPipe` *did* fall back to the class default (`interactionOption?.value ?? dtoInstance[property]`), so the migration in #727 lost that behaviour invisibly. `DryRunDto` defaulted `dryRun` to `true`; ported as-is, `/thanos-snap` with no argument would have skipped the dry-run banner and kicked members for real. Nothing in the type system or the test suite caught it — the DTO still *looked* like it had a default. (`/thanos-snap` and `DryRunDto` were themselves removed in #736 shortly afterwards; the live example of the same pattern is now `onboarding.nudge.command.ts`.)

**How to apply:** never put a field initialiser on a command DTO; it is a lie. Apply the default where the value is read (`const dryRun = dto.dryRun ?? false`) and write a test that asserts the omitted-argument case. Same trap applies to any new optional option. Related: [[albion-registration-critical-pillar]].
