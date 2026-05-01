# Original-game response strings — feature 003 ledger

The Galacticom `.MSG` file referenced by `prfmsg(IDENT, …)` calls is **not** present in
`reference/ge-source/`. This ledger reconstructs each response string used by the five
P1 commands from two sources, in priority order:

1. `reference/wiki/commands.md` — where the literal output is documented
2. The `prfmsg(IDENT, arg1, arg2)` call sites in `GECMDS.C` — whose argument list dictates the format placeholders

These strings are committed to `backend/src/game/commands/messages.ts` as exported
constants. SC-001 character-level diff tests pin them. Any deviation requires updating
both this ledger and the test fixtures.

> **NOTE:** Every entry below is **provisional** — it is the working reconstruction
> against which feature 003 will write its tests. If the implementer locates a copy of
> the original `.MSG` file, every entry here must be reconciled and the tests updated in
> the same PR.

---

## `cmd_impulse` — `GECMDS.C:482`

| Identifier | Format | Args | When |
|------------|--------|------|------|
| `IMPFMT`   | `Usage: impulse <0-99> [course]` | — | wrong arg count |
| `IMPULSE1` | `You cannot use impulse engines in hyperspace.` | — | `where == 1` |
| `ENGFIRE`  | `Engines fired, new course %u degrees.` | heading | success |
| `HLBROKE`  | `Helm controls are inoperative.` | — | `helm != 0` (deferred gate — TODO(006)) |
| `NUMOOR`   | `Number out of range (%u-%u).` | min,max | shared with validators |

## `cmd_warp` — `GECMDS.C:561`

| Identifier | Format | Args | When |
|------------|--------|------|------|
| `WARP01`   | `Your ship has no warp drive.` | — | `shipclass.maxWarp == 0` |
| `WARPSPD2` | `Your warp drive is offline.` | — | `topspeed == 0` |
| `WARPFMT`  | `Usage: warp <speed> [course]` | — | wrong arg count |
| `WARP02`   | `Speed cannot be negative.` | — | `speed < 0` |
| `WARP03`   | `Speed exceeds maximum allowed by 50%.` | — | `speed > topspeed * 1.5` |
| `WARP04`   | `Warning: speed exceeds rated maximum of warp %d.` | topspeed | `speed > topspeed` (still allowed) |
| `ENGFIRE`  | (as above) | heading | success |

## `cmd_rotate` — `GECMDS.C:643`

| Identifier | Format | Args | When |
|------------|--------|------|------|
| `ROTFMT`   | `Usage: rotate <-180..180>` | — | wrong arg count |
| `NOWTURN`  | `Now turning to %u degrees.` | new heading | success |
| `NUMOOR`   | (as above) | min,max | invalid degree |
| `NOROTPW`  | `Insufficient power to rotate.` | — | TODO(006) — `useenergy` gate |
| `CANTROT`  | `Cannot rotate while reversing.` | — | TODO(006) — `speed < 0` gate |
| `HLBROKE`  | (as above) | — | TODO(006) — helm gate |

## `cmd_report` — `GECMDS.C:1946`

| Identifier | Format | Args | When |
|------------|--------|------|------|
| `REPFMT`   | `Usage: report <nav\|sys\|cargo\|wpns>` | — | wrong arg count |
| `REP01`    | `%s — %s` | typename, shipname | header |
| `DASHES`   | `--------------------------------` | — | header underline |
| `REP35`    | `Navigation:` | — | nav section header |
| `REP02`    | `In hyperspace at sector (%d, %d).` | x, y | `where == 1` |
| `REP03`    | `Speed: %s` | warp string | hyperspace speed |
| `REP04`    | `Heading: %d degrees.` | heading | hyperspace heading |
| `REP05`    | `In sector (%d, %d).` | x, y | `where == 0` |
| `REP06`    | `Speed: %s` | impulse string | normal speed |
| `REP07`    | `Heading: %d degrees.` | heading | normal heading |
| `REP08`    | `Orbiting planet %d in sector (%d, %d).` | planet, x, y | `where >= 10` |
| `REP32`    | `Position: sector (%d, %d) intra (%d, %d).` | sx, sy, ix, iy | always (nav tail) |
| `REP09`    | `Energy: %u units.` | energy | sys |
| `REP10`/`REP11`/`REP11B` | shield variants | type, pcnt | sys |
| `REP14`    | `Damage: %s` | damstr output | sys |
| `REP24A`   | `Frequencies: %d / %d / %d.` | f0,f1,f2 | sys |
| `REP23`/`REP24` | phasor variants | type | sys |
| `REP12`/`REP13` | cloak on/off | — | sys |
| `REP15`–`REP18A` | damaged subsystem warnings | — | sys, conditional |

> The full `report cargo` and `report wpns` fields are out of scope for this feature
> (item descriptions, weapon channel readouts) — produce a single line "No items / no
> weapons configured." until features 005 / 006 wire them. This deviation is recorded as
> a `TODO(005)` / `TODO(006)` comment in the handler.

## `cmd_scan` — `GECMDS.C:2138`

| Identifier | Format | Args | When |
|------------|--------|------|------|
| `SCANFMT`  | `Usage: scan <sh\|pl\|ra\|se\|lo>` | — | unrecognised sub-keyword or missing arg |
| `TABROKE`  | `Tactical computer is offline.` | — | TODO(006) — tactical gate |
| `JAMMER4`  | `Cannot scan while jammer is active.` | — | TODO(006) — jammer gate |
| `scan_sh` per-ship line | `%c %s — class %d, range %.1f, bearing %d.` | ltr, name, class, range, bearing | per ship |
| `scan_pl` per-planet line | `@ %s — sector (%d,%d), tons %ld.` | name, sx, sy, tons | per planet |

Only the `scan_lo` body is **also** delivered as `scanGrid` cells (Session 2026-05-02 Q1)
— `scan_sh` and `scan_pl` are text-only and produce no `scanGrid` field. Clients render
the grid from the `scanGrid` payload, not by parsing the text lines.

---

## Cross-command shared

| Identifier | Format | Args | When |
|------------|--------|------|------|
| `NUMOOR`   | `Number out of range (%d-%d).` | min,max | `valdegree` / `valpcnt` rejection |
| Unknown command | `Unknown command. Type "help" for a list.` | — | `CommandRouter` dispatch miss |

---

## Implementation note

`backend/src/game/commands/messages.ts` exports each identifier as a `MessageId` enum
plus a `formatMessage(id, ...args)` function. Tests assert exact bytes for representative
inputs (SC-001).
