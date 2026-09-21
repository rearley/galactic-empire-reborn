# AI house rules — design and plan

**Issue:** #63, under #58. **Status:** approved in conversation 2026-09-21. The
owner asked for "a nice clean separation of code and easier to know what is
what in the future".

## What

`src/game/ai/house-rules.ts` names every AI behaviour that is ours rather than
canon's, as one switch each, and links each switch to the DECISIONS entry that
justifies it:

| Switch | Where it acts | DECISIONS |
|---|---|---|
| `zoneSanctuary` | brain: no lock on a pilot in (0,0), release on entry, no engagement of a target inside it | 2026-09-20 — The neutral zone blinds Cybertrons… |
| `respawnHold` | scheduler: a killed class waits its hold | 2026-09-20 — Cybertron rarity is re-expressed as respawn time |
| `releaseClaimsOnDeath` | combat: every claim on a dead pilot released at the kill | 2026-09-21 — A Cybertron's claim changes only through a named transition |
| `droidsSpawnOutsideZone` | droid spawner re-rolls a spawn in (0,0) | 2026-09-01 — Droids stay out of the neutral zone |
| `scalePopulation` | Cybertron `tot_to_create` scaled to UNIVMAX | 2026-09-08 — AI population scales with UNIVMAX |

- `PORT_RULES` (all on) is what production runs. `CANON_RULES` (all off) is
  canon's behaviour.
- Every consumer takes the rules as an optional last constructor argument,
  defaulting to `PORT_RULES`. No module changes, and hand-built harnesses keep
  working.
- `GalaxySim.create({ seed, rules })` runs a whole galaxy under either set.

## Guards

1. Every `PORT-ORIGINAL` marker in `src/game/{ai,cybertron,droid,combat}` names
   its switch, as `@house-rule <name>`, or says `@not-a-house-rule` with a
   reason. An undeclared deviation fails.
2. Every switch is read in code (`rules.<name>`), and its DECISIONS heading
   exists.
3. Per switch, a unit test shows the behaviour on and off.
4. A canon-mode simulation: with `CANON_RULES`, a pilot parked on the hub IS
   claimed, as canon's Cybertron would claim them.

## Out of scope, filed separately

The 2026-09-06 "Cybertrons leave hyperspace to fight" deviation no longer has
an identifiable code site. Since #43, leaving hyperspace belongs to the shared
movement code, and whether canon's AI ever reaches `accel()` needs an audit of
its own.

## Plan (inline, TDD)

1. Write `house-rules.ts` with its registry test, which fails.
2. Wire each switch with an on/off test per site, one commit.
3. Mark every `PORT-ORIGINAL` site, add the guard test, add the canon-mode sim
   scenario.
4. Docs; no version bump, because nothing deploys that a player sees.
