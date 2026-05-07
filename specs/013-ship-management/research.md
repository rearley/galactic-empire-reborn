# Research: Ship Management Commands

**Feature**: 013-ship-management
**Date**: 2026-05-06

This document records (a) deliberate deviations from the canonical C source,
each with rationale per Constitution I, and (b) constant / formula lookups
that anchor the implementation to `GEMAIN.H` and `GEFUNCS.C`.

---

## Deviations from Canonical C Source

### D1 — `transfer` is reinterpreted as ship-to-ship

**Decision**: `transfer` moves cargo or gold between two ships in the same
sector, both online.

**Canonical**: `cmd_transfer` (GECMDS.C:3271) is `trans <up|down> <amt> <itemkw>`
and moves cargo *between a ship and the planet it is orbiting* (the orbiting
ship calls `trans_down` to deposit and `trans_up` to withdraw).

**Rationale**: The spec calls for ship-to-ship cooperation (FR-301..-306).
Ship-to-planet transfers are scoped under the planet system feature (005). The
keyword `transfer` is reused because it is the canonical short keyword players
type, and there is no overlap (planet-orbit transfers are not implemented yet).
A future change may rename one of the two if both ship and consumed.

**Alternatives rejected**: Naming the new command `give` or `xfer` — would
diverge from the canonical `tra` keyword players know from the original game
and from the GE wiki.

**Affected requirements**: FR-301..FR-306; SC-003.

---

### D2 — `abandon` is reinterpreted as abandon-ship

**Decision**: `abandon` releases the captain from their current ship, marks
the ship as abandoned, and routes the captain back through the feature-011
new-player onboarding flow before any further gameplay command is accepted.

**Canonical**: `cmd_abandon` (GECMDS.C:3420) abandons a *colony* — it requires
the ship to be in orbit at a planet the captain owns and clears the planet's
`userid`.

**Rationale**: Spec scope explicitly defines abandon-ship semantics (User
Story 7, FR-701..FR-704). Colony abandonment will be revisited under the planet
system feature (005), where it belongs alongside other colony-management verbs.

**Alternatives rejected**: Naming the new command `eject` — would diverge from
the canonical `aba` keyword and the GE wiki references.

**Affected requirements**: FR-701..FR-704.

---

### D3 — `maint` cost is canonical fixed price, not a damage-scaled formula

**Decision**: Maintenance costs `200` credits at a friendly planet and `2500`
credits at a Zygor neutral-zone planet (planet number 1 or 2 in neutral
sector). On payment, ship damage decrements via `repair = damage/3 + 1`
written to `ShipState.repair`, which is consumed by the existing repair
sub-system over subsequent ticks.

**Spec wording**: FR-202 says "calculate maintenance cost using the formula
from `GEFUNCS.C`, scaling with damage level." There is no such formula in
`GEFUNCS.C`; the canonical `cmd_maint` (GECMDS.C:4452) uses fixed prices.
The formula that *is* damage-scaled is the *repair amount* (`damage/3 + 1`,
GECMDS.C:4516), not the cost. We honor the canonical prices and the
canonical repair formula; we treat FR-202's "formula" wording as referring
to the repair calculation.

**Rationale**: Constitution I — "constants defined in `GEMAIN.H` are
canonical. Any deviation MUST be documented." The spec's intent (player pays
to repair) is satisfied either way, but only the canonical interpretation
preserves balance.

**Alternatives rejected**: Inventing a new damage-scaled cost formula —
would break balance regression and contradict the canonical source.

**Affected requirements**: FR-201, FR-202, FR-203, FR-205; SC-002 (still
achievable: a single `maint` queues the full repair, completion time depends
on the existing repair-tick cadence).

**Deferred sub-decision — planet password gate**: The canonical `cmd_maint`
also enforces a per-planet maintenance password (`GECMDS.C:4452` MAINT2 /
MAINT3 — if `plptr->password != "none"`, the player must supply it as
`margv[1]` and it must match). v1 explicitly defers this gate (FR-210):
all owned, sufficiently populated planets are accessible regardless of
password. The password field exists on the planet record and can be wired
in a later feature (likely 005-planet-system) without re-reading the spec
or changing FR-201..FR-209. Rationale: planet password administration is
itself unimplemented in v1; gating maint on an empty/default field would
either reject every player or accept every player and give the false
impression that the gate works.

**Orbit / population / combat / Zygor gates retained verbatim**: The four
non-password gates from `cmd_maint` ARE preserved in v1 as FR-206, FR-207,
FR-208, FR-209 respectively. These are required for canonical balance
(maint must not be a deep-space free-repair).

**Atomicity boundary**: the Prisma transaction is the durable write
boundary; the in-memory `ShipState` update follows immediately on
transaction commit. If the in-memory write fails after a successful
Prisma commit, the server's next flush cycle will re-sync from Postgres.

---

### D4 — `set` exposes `auto-shield` and `auto-repair`, not the canonical option list

**Decision**: `set <option> <on|off>` accepts `auto-shield` and `auto-repair`.
Both are stored as booleans on `ShipState` (new fields `autoShield`,
`autoRepair`) and persisted via Prisma.

**Canonical**: `cmd_set` (GECMDS.C:5190) uses options `scannames`, `scanhome`,
`scanfull`, `filter`, all stored on `User.options[]`.

**Rationale**: Per the Q/A in the spec's clarifications session, only the two
auto-flags are needed in v1. The canonical four are display preferences for
`scan` and `report` output that are not yet implemented as user-toggleable
behaviour in this codebase; adding them now would be speculative. When a
future feature needs them, they can be added to the same `set` command.

**Alternatives rejected**: Implementing all four canonical options today —
violates the YAGNI principle and the spec's explicit "defer until needed"
guidance.

**Affected requirements**: FR-501, FR-502, FR-503.

---

## Canonical Constants and Formulas

| Symbol | Source | Value | Use |
|---|---|---|---|
| `CLENGUSE` | `GEGLOBAL.H:150` (declaration); loaded at `GEMAIN.C:519` via `numopt(CLENGUSE,1,32000)` — **not in `GEMAIN.H`**, no compile-time default in source | sysop-tunable runtime option | Cloak activation cost AND per-tick maintenance drain (`GEFUNCS.C:1374`, `:1384`) |
| `COUNTDOWN` | `GEMAIN.H:165` | `20` | Initial value of `ShipState.destruct` on `cmd_destruct` |
| Cloak ramp | `GEFUNCS.C:1717-1724` | `1 → 2 → 10` | One physics-tick step per transition; `10` is the "fully cloaked" indicator |
| Cloak indicator | `GEMAIN.H:344`, used at `GEFUNCS.C:156`, `:165`, `:1717`, `:1722` | `10` (cloaked), `0` (decloaked), `< 0` (damaged) | Source of truth for torpedo lock, report visibility, Cybertron threat assessment |
| Maint price (normal) | `GECMDS.C:4499` | `200` | Captain cash debit at a friendly planet |
| Maint price (Zygor neutral) | `GECMDS.C:4505` | `2500` | Captain cash debit at neutral-zone Zygor planet (planet 1 or 2) |
| Maint repair amount | `GECMDS.C:4516` | `(damage/3) + 1` | Written to `ShipState.repair`; consumed by repair sub-system |
| Destruct decrement | `GEFUNCS.C:1820-1851` | `--destruct` per physics tick | Sector warning fires every tick while > 0 |
| Destruct score penalty | TBD | Confirmed at handler write time against `GEFUNCS.C:destruct` ship-destruction path | Captain's `score` decremented on destruction |

**Note on `CLENGUSE`**: `CLENGUSE` is **not** a `GEMAIN.H` constant. It is
declared in `GEGLOBAL.H:150` and loaded at `GEMAIN.C:519` via
`numopt(CLENGUSE,1,32000)` as a sysop-tunable runtime option with no
compile-time default in the source.

For v1, we treat it as a NestJS config value following the
`CHGLOSER_PERCENT` pattern from feature 009
(`backend/src/game/player/player-score.module.ts`):

- An injection token `CLOAK_ENERGY_USE` is exported from the commands module.
- A factory provider reads the env var `CLOAK_ENERGY_USE` (default `50`)
  through a small config helper analogous to `midnight.config.ts`, clamps it
  to the canonical `1..32000` range, and returns the resolved integer.
- The cloak handler and the `cloakTick` callback inject the token rather
  than referencing a static constant.
- The balance regression test pins the **default** (`50`) so changes to the
  default fail CI; env-overridden values are exercised by a separate config
  test.

This keeps the canonical "sysop tunable" semantics while satisfying
Constitution II (balance regression) for the default case.

**Note on destruct penalty**: the canonical `GEFUNCS.C:destruct` calls into the
generic ship-destruction routine on countdown expiration. The score penalty is
the same one applied to any destroyed ship. The exact numeric value is
confirmed at handler write time and locked into a balance regression.

---

## Cloak State Machine (canonical, from `GEFUNCS.C:cloakstat`)

```
                 cmd_cloak("on")            physics tick      physics tick
   cloak = 0  ─────────────────────► 1 ───────────────────► 2 ───────────────────► 10  (fully cloaked)
       ▲                                                                              │
       │                                                                              │
       │       cmd_cloak("off")                                                       │
       └──────────────────────────────────────────────────────────────────────────────┘

   cloak < 0  (damaged — produced by combat hit, NOT by player command)
       │
       │   physics tick increments toward 0
       ▼
   cloak = 0  (eligible to cloak again)
```

Each physics tick while `cloak > 0`, `clenguse` energy is drained
(`GEFUNCS.C:1384`). If energy < `clenguse`, the cloak collapses to 0 and a
"cloak collapsed" event is emitted.

---

## Destruct State Machine (canonical, from `GEFUNCS.C:destruct`)

```
   destruct = 0  ──── cmd_destruct ────►  destruct = 20
                                                │
                                                │ each physics tick: --destruct, broadcast SELFD2
                                                ▼
                                          destruct = 0 ──► ship destroyed, score penalty applied
                                                │
                                                │ at any point while > 0:
                                                │   cmd_abort  → destruct = 0 (no destruction)
                                                ▼
                                          destruct = 0
```

Spec FR-604 mandates a sector warning on initiation, every physics tick (6 s)
while active, and on destruction. The canonical source emits special
"shipname has X seconds remaining" messages at `destruct == 10`, `5`, and `2`
(GEFUNCS.C:1833-1849). Our implementation broadcasts on *every* tick (per
the spec) and uses the canonical text formats at the canonical thresholds for
fidelity.
