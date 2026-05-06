# Phase 0 Research: Social and Information Commands

**Feature**: 012-social-commands
**Date**: 2026-05-06

All Technical Context unknowns from `plan.md` are resolved here. No NEEDS CLARIFICATION
remain at the end of Phase 0.

---

## D1 — Reinterpreting `who` and `dat` versus the original BBS source

**Decision**: Implement `who` and `dat` as in-world player-facing listings/scouting
commands per the spec, not as the BBS-shell debug echoes that exist in `GECMDS.C`.

**Rationale**:

- The original `cmd_who` (GECMDS.C:5162) prints the caller's BBS user ID, name, and
  channel — it is a session-debug helper, not a galaxy listing. The original
  `cmd_data` (GECMDS.C:5829) is gated behind a hard-coded `qazwsx` password and dumps
  the caller's own ship state in a colon-prefixed wire format intended for the BBS
  client renderer.
- Feature 010 (React frontend) already surfaces an online-ship listing via
  `ConnectedShipsRegistry` and a per-ship telemetry feed. The spec's reinterpretation
  of `who` (list active non-cloaked ships) and `dat` (full stat block on one named
  ship) is the player-facing form of those existing data flows.
- The GE wiki documents the in-world meanings the spec adopts. Players have always
  used these verbs to mean "show me everyone" / "show me that ship". Treating the
  C source's BBS-debug forms as canonical here would deliver functionality nobody
  uses.

**Alternatives considered**:

- *Implement the literal C-source forms* — rejected because the player-facing surface
  is what the spec requires, and the literal forms (admin echo, `qazwsx`-gated dump)
  are unreachable through the modern command pipeline.
- *Implement both forms (literal and player-facing) under different keywords* —
  rejected as YAGNI; no consumer for the literal forms exists.

This deviation is the only material departure from `GECMDS.C` for these two commands
and is recorded under Constitution I's documented-rationale rule.

---

## D2 — Scope of `tea` versus the original `cmd_team`

**Decision**: Implement only the player-facing join / leave / show subset of `cmd_team`.
Defer team creation, password rotation, kicking, and renaming.

**Rationale**:

- The original `cmd_team` (GECMDS.C:5277) supports nine sub-verbs: `join`, `start`
  (create), `score`, `unjoin`, `members`, `kick`, `newpass`, `newname`. Most of these
  are administrative and would expand this feature significantly without proportional
  player value at this stage.
- The spec explicitly defines three behaviours: `tea` (show), `tea <name>` (join),
  `tea leave` (clear). It also mandates exact case-insensitive name matching, which
  diverges from the original five-digit teamcode + password flow — a deliberate
  modernisation choice already accepted by the player community in the GE wiki era.
- Team creation will be handled by the midnight job or an admin endpoint in a future
  feature; the existing `Team` Prisma model from feature 001 is sufficient for the
  read path now.

**Alternatives considered**:

- *Port all nine sub-verbs* — rejected as out-of-scope; spec is explicit.
- *Use teamcode-based join* — rejected; spec mandates name-based join (clarification
  Q1).

---

## D3 — `sen` broadcast plumbing

**Decision**: Emit the `message.send` event from the handler via a new
`CommandResult.broadcasts` entry; the gateway iterates and dispatches them on the
Socket.io server. Recipients are computed inside the handler:

- **Hail (freq = 0)**: enumerate `ConnectedShipsRegistry.list()`, filter cloaked
  recipients (`ship.cloak > 0`).
- **Sector (1–19999)**: emit to room `sector:{xsect}:{ysect}` derived from the sender's
  current sector. All ships in that room receive the event regardless of cloak (cloak
  filters scan visibility, not subspace radio reception — consistent with `outsect`
  in the original).
- **Galaxy-wide (≥20000)**: emit to all sockets in the game namespace (no cloak filter,
  matching `outwar ALWAYS`).

**Rationale**: `CommandResult.broadcasts` is already scaffolded in `command.types.ts`
(left in place by feature 003 specifically for this kind of use). Recipient
enumeration on the handler side keeps the cloak-filtering rule colocated with the
business logic and keeps the gateway dumb (it just calls `server.to(room).emit(...)`).

**Alternatives considered**:

- *Inject the `Server` directly into the handler* — rejected; cleaner separation to
  return broadcasts as data and let the gateway perform the side effect.
- *Pass a callback via `CommandContext`* — rejected; `CommandResult.broadcasts` is
  already the project's chosen extension point.

---

## D4 — `ros` AI-userid filtering

**Decision**: Filter AI userids by name prefix in the SQL query. Pattern (case-sensitive
to match how AI ships are inserted): `userid NOT LIKE 'Cybrg-%' AND userid NOT LIKE '@Droid-%'`.
Encapsulate the patterns in `helpers/ai-userid.ts` so future AI types can extend the
exclusion list in one place.

**Rationale**: The AI naming conventions are stable contracts established in features
007 and 008. Doing the filter at the SQL layer avoids loading AI rows just to throw
them away and keeps the page-size cap meaningful.

**Alternatives considered**:

- *Add a boolean `isAi` column to `User`* — rejected; would require a migration and
  a backfill, and the prefix pattern already disambiguates reliably.
- *Filter in JavaScript after the query* — rejected; would break the page-size
  semantics (we'd over- or under-fetch).

---

## D5 — `ros all` cap and `ROSTER_MAX` configuration

**Decision**: `ros` (no args) returns `min(ROSTER_MAX, eligible_count)`. `ros all`
returns `min(200, eligible_count)`. `ROSTER_MAX` is read from `process.env.ROSTER_MAX`
on service init; if missing or invalid (non-integer, ≤ 0, or > 200), it falls back to
20 and a warning is logged. The 200 ceiling is hard-coded.

**Rationale**: Spec FR-010 mandates a configurable default and a hard ceiling. Reading
on service init (not per-request) avoids a hot-path env-parse cost. Fallback to 20
on misconfiguration matches existing patterns elsewhere in the codebase.

**Alternatives considered**:

- *Persist `ROSTER_MAX` in DB* — rejected; static configuration is simpler and matches
  how other tunables are handled.

---

## D6 — `tea` consistency between User and ShipState

**Decision**: Within the `tea` handler:

1. Validate the team name (or `leave`) and resolve to a `Team.teamcode` (or `null`).
2. Inside a Prisma transaction: write `User.teamcode = <new value>`. If the named team
   does not exist, abort with the FR-027 error before any write.
3. On successful commit: mutate `ShipState.teamcode` to the same value and set the
   ship's `dirty` flag.
4. Return a `player.snapshot` rebroadcast directive in `CommandResult.broadcasts`,
   targeting the caller's socket.

The in-memory `ShipState.teamcode` is a denormalised read-cache used only by `dat`
to render the team field. Restart-time hydration (`ShipStateService` boot path) will
copy `User.teamcode` into `ShipState.teamcode` for each loaded ship.

**Rationale**: The spec mandates that both User and ShipState reflect the change in
the same command turn (FR-024, FR-025, SC-006). A small synchronous Prisma write is
acceptable here because `tea` is a low-frequency command and consistency is the
priority.

**Alternatives considered**:

- *Write to ShipState only, lazy-flush to User* — rejected; FR-024 is explicit that
  User MUST be updated synchronously on the command turn so the next midnight job
  reflects the change.
- *Add `teamcode` to the Prisma `Ship` model* — rejected for now; would require a
  migration to denormalise data we can re-derive from `User.teamcode` on hydrate.
  If a future feature needs `Ship.teamcode` queryable in SQL (e.g. team-scoped
  combat reports), a migration can add it then.

---

## D7 — Cloak treatment

**Decision**:

- `who`: cloaked ships are excluded (FR-002).
- `dat`: cloaked ships are treated as not found (FR-005).
- `sen` hail: cloaked recipients are excluded (matches `outwar FILTER` in the
  original `cmd_send` line 1841).
- `sen` sector / galaxy-wide: cloaked recipients are *not* filtered — cloak hides
  visibility on scan, not subspace radio. Matches `outsect` (line 1850) and
  `outwar ALWAYS` (line 1858) in the original.

**Rationale**: This preserves the original behaviour of the four `outX` calls verbatim
and aligns with how cloak is treated elsewhere in the codebase.

---

## D8 — Channel frequency persistence

**Decision**: `fre` mutates `ShipState.freq[channelIndex]` and sets `dirty = true`.
The existing 1-second ship-update flush cycle persists it to `Ship.freq[]` in
Postgres (Prisma `Int[]`). No new flush logic.

**Rationale**: `Ship.freq` already exists as `Int[]` in the schema (verified in
`backend/prisma/schema.prisma`). The dirty-flag flush handles all ShipState
mutations uniformly.

---

## Closing notes

All NEEDS CLARIFICATION items from the Technical Context are resolved. No external
research was required — the original C source plus the existing codebase (features
001, 003, 010) supplied every answer.
