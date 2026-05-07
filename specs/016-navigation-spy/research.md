# Research — 016 Navigation, Spy, Help, Clear Screen

## D1: `holdcourse` semantics — boolean flag vs. countdown ticker

**Decision**: Use `holdcourse` as a non-zero boolean flag (`1` = autopilot
active, `0` = inactive) for player ships. Pair it with two new ship-state
fields (`navTargetX`, `navTargetY`) holding the destination sector
coordinates.

**Rationale**: In the original `GEMAIN.H:380` `holdcourse` is a `byte`
declared as a "Hold course ticker", and AI code (`GECYBS.C`,
`GEDROIDS.C`) decrements it each tick (`--ptr->holdcourse;`). The
original `cmd_navigate` did **not** touch `holdcourse` at all — it was a
one-shot bearing/distance report. The autopilot semantics in this feature
are an explicit, documented enhancement (spec Q3 clarification); using
the field as a boolean for player ships keeps the AI code's countdown
semantics intact (their loops still treat `> 0` as truthy and decrement
toward zero — never reaching this player branch). Storing the destination
on the ship is required because the original game never had a target
to remember; the new fields capture that.

**Alternatives considered**:
- Reuse `holdcourse` as the countdown to arrival: rejected — distance to
  target depends on speed and rotation rate; can't be reduced to a
  monotonic tick counter without false arrivals.
- A separate `Autopilot` table: rejected — one row per ship at most;
  inlining on the ship row matches the existing pattern (`autoShield`,
  `autoRepair`).

## D2: Per-tick bearing recompute placement

**Decision**: The autopilot branch lives inside the existing
`PhysicsTickService` (the 6 s `TickKind.PHYSICS` handler), executed
**before** the existing rotation step that consumes `head2b`. For each
ship with `holdcourse !== 0`, recompute `head2b = bearing(ship → target)`.
The pre-existing rotation logic (`rotationStep`) then steers the ship.

**Rationale**: One responsibility per tick service; the autopilot is
purely a `head2b` rewrite, not a movement engine. Reusing the existing
rotation/movement codepath is the point — the ship is still piloted by
the same rules; autopilot just keeps repointing the rudder. Arrival
detection (floor-based sector match) and disengage also fire here, in
the same iteration, so we never broadcast a stale "still steering"
event after arrival.

**Alternatives considered**:
- A new `AutopilotTickService`: rejected — would race the physics tick
  and require ordering coordination, violating the single-tick-source
  pattern from feature 002.
- Compute bearing inside `nav` handler and freeze `head2b`: rejected —
  the ship moves between ticks; bearing must be live.

## D3: Spy intel reveal — at scan render or in scan_pl handler

**Decision**: Gate the existing planet-scan rendering: when
`scan pl <name>` resolves a planet AND `planet.spyowner === viewer.userid`
(case-insensitive userid match — see existing `sameas` semantics), emit
the same per-item inventory block the original game emits for the
planet's owner (population, items, defenses). When `spyowner` matches and
the viewer is **not** the owner, the block reveals the same fields the
owner sees (per spec FR-012).

**Rationale**: The spec promises richer intel "for the spy's owner"
(US-2 acceptance #7). The original `GECMDS.C:2295` `scan_pl` only
gates on `sameas(plptr->userid, warsptr->userid)` (planet owner) and
emits aggregated descriptions for non-owners. Treating the spy owner
identically to the planet owner for output is a clean, minimal
deviation (D-NOTE: documented in `docs/DECISIONS.md` after merge).

**Alternatives considered**:
- A separate `spy:intel` Socket.io event: rejected — duplicates the
  scan render path and forces frontend to handle two formats.
- Reveal partial intel (population only): rejected — spec lists three
  fields, and the original owner-view template already covers them.

## D4: `cls` round-trip vs. pure frontend handler

**Decision**: Route `cls` through the same `CommandRouterService`
dispatch path as every other command, but the handler returns a
`CommandResult` carrying a `clearLog: true` directive (in addition to
the standard `lines: []`). The gateway forwards the result; the
frontend `command:result` handler honours the directive by calling the
existing `EventLog.clear()`. No backend state is mutated; no broadcast
to other clients.

**Rationale**: Keeps tokenisation, command-not-found handling, and
authentication uniform. Avoids special-casing the input box for one
command. The directive shape is additive — existing result consumers
ignore unknown fields.

**Alternatives considered**:
- Pure frontend intercept (string-match `cls` before sending to socket):
  rejected — fragments the command surface; future help-text generation
  would need to know which commands are "real" vs. UI-only.
- Server emits a fresh `event-log:clear` Socket event: rejected —
  introduces an event type for one command; the result-directive pattern
  scales better if other UI commands appear later.

## D5: Help topic catalog — code vs. markdown vs. DB

**Decision**: A typed TypeScript module
`backend/src/game/commands/help/help-topics.ts` exporting a frozen
`Record<TopicId, { title: string; body: string[] }>`. Topic IDs:
`navigation`, `combat`, `trade`, `planet`, `ship`. Per-topic body is an
array of plain lines that the handler concatenates with `\n`.

**Rationale**: Static, version-controlled, type-checked, easily diffable
in PRs, and the test fixtures don't have to mock a filesystem read or
DB query. Wiki-faithful tone is preserved by hand-editing strings.

**Alternatives considered**:
- Markdown files loaded at boot: rejected — adds a filesystem dependency
  and a new build-time concern; benefits (rich formatting) wasted given
  the terminal-style event log renders plain text.
- DB-backed help: rejected — per spec (Key Entities), help is reference
  data, not user-editable; nightly DB churn for static content is a
  liability.

## D6: Re-issuing `nav` while active — replace silently vs. confirm

**Decision**: Per spec Q1 — silently replace the existing target with
the new one and emit the standard NAV01-style acknowledgment. No
"retargeting" event.

**Rationale**: Spec mandate. Implementation: handler unconditionally
overwrites `navTargetX`/`navTargetY` and re-asserts `holdcourse = 1`.

## D7: In-orbit `nav` — auto-break orbit

**Decision**: Per spec Q3 — when `ship.where >= 10` and the player issues
`nav <x> <y>`, the handler clears `ship.where = 1` (open space)
synchronously before computing bearing/storing target. No separate
`break` command required.

**Rationale**: Spec mandate. The original `cmd_navigate` did not gate on
`where`; treating in-orbit invocation as "implied break-and-go" matches
the autopilot enhancement intent — convenience over ceremony.

## D8: Arrival detection — floor-based sector match

**Decision**: Per spec Q4 — arrival fires when
`Math.floor(ship.xcoord) === navTargetX && Math.floor(ship.ycoord) === navTargetY`.
On arrival: emit a single `nav:arrived` line through `command:result`
to the owning user, clear `holdcourse`, clear `navTargetX`/`navTargetY`
to `null`.

**Rationale**: Spec mandate. Floor matches the existing `xsect/ysect`
convention used by orbit/scan code, so the arrival cell is the same
1×1 grid square the player sees on `sca lo`.

**Edge**: If the player issues `nav x y` while already in that sector,
the handler short-circuits with `NAV_ALREADY_THERE` and does **not**
engage `holdcourse` (spec edge case).

## D9: `univmax` constant origin

**Decision**: Define `UNIVMAX = 15` in `backend/src/game/constants.ts`
with a `@see GEGLOBAL.H:134 univmax` reference. Use it in the `nav`
range-validation and in the balance regression test.

**Rationale**: The constant already appears as a magic number in
`cybertron-tick.service.ts:674` (`const univmax = 15.0`); centralising
removes the duplicate. The original C source stores it in a global; we
treat it as a compile-time constant since galaxy dimensions don't shift
at runtime.

## D10: `I_SPY` item slot

**Decision**: Use the existing `I_SPY = 13` constant in
`backend/src/game/constants/items.ts`. Spy handler decrements
`ship.items[I_SPY]` by `1n` (BigInt) on success.

**Rationale**: Already canonical; the spec's "I_SPYEQ" reference is the
same slot per author confirmation in the Assumptions block.

## Summary of Open Questions

None — all NEEDS CLARIFICATION items resolved by spec clarifications and
the decisions above.
