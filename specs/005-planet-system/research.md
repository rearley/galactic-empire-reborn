# Phase 0 Research — Planet System

All NEEDS CLARIFICATION items in the spec were closed by the
2026-05-02 clarification session. The questions below were the
remaining technical choices that needed dispatch before writing
contracts and the data model.

---

## Decision 1 — Per-mutation Postgres flush, not the dirty-flag pattern

**Decision**: `PlanetStateService` writes to Postgres synchronously inside
the same async function that mutates the in-memory `Map`. There is no
`dirty` flag and no tick-driven flush.

**Rationale**:
- Spec clarification Q4 mandates it: planet mutations are sparse (only on
  explicit player actions and the planet-update tick), so per-mutation
  I/O cost is acceptable and crash safety is maximal.
- The original game's `gesdb(GEUPDATE,...)` calls in `cmd_buy`, `cmd_sell`,
  `cmd_admin`, and `multiply()` execute synchronously after each economic
  change. Faithful reproduction.
- The `ShipStateService` dirty-flag pattern was justified by a 1 Hz tick
  flushing many ships at once. Planets do not have that property.

**Alternatives considered**:
- *Dirty flag + flush on `PLANET_UPDATE` tick.* Rejected: the tick processes
  one planet per firing, so a dirty-flag flush across all planets would
  reintroduce the ship-style amortization that the spec explicitly
  rejects. It would also widen the crash-loss window from "current
  in-flight op" to "everything since the last full pass."
- *Write-behind queue.* Rejected: adds complexity without buying anything
  given the low write rate.

---

## Decision 2 — Per-planet async serialization (in-process mutex)

**Decision**: Every public write method on `PlanetStateService`
(`buy`, `sell`, `applyAdminChange`, `withdraw`, `runEconomicTickFor`)
acquires a per-planet async mutex implemented as a promise chain:

```ts
private locks = new Map<string, Promise<unknown>>();
private async runSerialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = this.locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  this.locks.set(key, next.catch(() => undefined));
  return next;
}
```

**Rationale**:
- Single-process backend → in-process serialization is sufficient
  (Constitution III's reason #3).
- Promise-chain mutex is < 20 lines, has no dependency, and is the same
  shape used by many in-process Node services. Verifiable in a unit test.
- Satisfies FR-013 / SC-005: any interleaving of concurrent ops on the
  same planet matches *some* serial order. Multiple pilots may be landed
  on the same planet (Spec Q1) — only the *mutation* path is serialized,
  not landing presence itself.

**Alternatives considered**:
- *Postgres advisory locks.* Rejected: requires a round-trip per acquire,
  bloats trace timing, and is overkill for one process.
- *`async-mutex` npm package.* Rejected: introduces a runtime dep for a
  20-line concept; project preference is to keep dependencies thin.
- *Per-planet worker queue.* Rejected: complexity not justified at this
  write rate (< 1 op/s/planet under realistic load).

---

## Decision 3 — Cadence: `interval = floor(plantock / numrecs)` with `< 4` floor

**Decision**: At `PlanetTickService.onModuleInit`, after `GalaxyService`
has hydrated, count planets and compute:

```ts
const numrecs = planetCount; // direct count, not the (count+25)*(4/plodds) wrap
const interval = Math.max(4, Math.floor(PLANTOCK_SECONDS / numrecs));
```

The `< 4` floor mirrors `GEMAIN.C:658-659`.

**Rationale**:
- Spec Q3 mandates that the cadence formula is the unit-test target, not
  a hardcoded planet count. The formula reproduces the original's
  `plantime = plantock/numrecs` exactly for the case where every planet
  is processed on a single timer pass.
- The original applies a `(/plodds)*4` factor on top of `numrecs`
  (`GEMAIN.C:654`) because the original loop processes up to `MAXTIC=20`
  planets per firing on a coarser timer. We process exactly one planet
  per firing. The straight `plantock/count` form yields a full round of
  every planet inside the lock-time window — same end-state property,
  more even cadence, easier to reason about under tests.
- Documented as a deliberate, faithful-in-spirit deviation in the
  `PlanetTickService` JSDoc.

**Alternatives considered**:
- *Hardcoded 1 Hz tick processing N planets per firing.* Rejected:
  reintroduces the bursty `MAXTIC` shape from the original which the
  spec explicitly does not require, and makes the per-firing cost grow
  with planet count.
- *Recompute cadence after every claim.* Rejected: planet count is
  bounded and stable post-feature-004 (no claim creates a new planet —
  ownership flips, not creation). Recomputing per-claim adds complexity
  with no payoff.

**PLANTOCK source value**: matches the canonical original — 30 minutes
(`PLANTOCK = 1800` seconds, mirroring `lngopt(PLANTOCK,1,32760)*60L` with
the canonical default of 30). Pinned by a balance-regression test.

---

## Decision 4 — Sell only at neutral-zone plnum=1

**Decision**: `cmd_sell` refuses unless the pilot is landed on
plnum=1 inside the neutral zone (sector 0,0). This matches `GECMDS.C:4127`
and the existing `s00` fixture from feature 004 which places exactly one
planet (Zygor-3) at plnum=1.

**Rationale**: Strict fidelity. The galactic-market sell semantics from
spec Q5 are exactly this — the universe-removal sink lives at one
specific planet, not at every owned planet. Any non-neutral-zone sell
path would diverge from the original's economic equilibrium.

**Test coverage**: an explicit unit test asserts that sell from a
non-neutral planet returns `SELL1` and produces zero state mutation.

---

## Decision 5 — Production-report mail emission deferred to feature 009

**Decision**: When `multiply()` would emit `MAIL_CLASS_PRODRPT`
(`GEPLANET.C:313-326`) because an item crossed its `maxpl[i]` threshold,
this feature still applies the `temp = max` clamp — it just does not
generate a mail row. Feature 009's midnight job and mail system will land
the emission path.

**Rationale**: Mail tables exist in the schema (feature 001), but no
service yet writes mail rows. Spec FR-016 / SC-006 only require that the
production formula match — they do not require mail emission. Decoupling
keeps this feature's scope tight without changing the on-disk state of
the planet itself.

---

## Decision 6 — Revolt and `check_spy` deferred to feature 006

**Decision**: `multiply()` is ported only through line `GEPLANET.C:340`
(end of tax accrual). The revolt branch (`GEPLANET.C:341-...`) and the
`check_spy()` invocation are out of scope here.

**Rationale**: Spec Assumption "The `check_spy()` behavior referenced in
the original `plartia()` code path is part of feature 006 and is
intentionally not implemented here." Revolt requires combat resolution
(troops vs. men, ownership flip) which only makes sense once feature 006
delivers planetary defense.

---

## Decision 7 — Trade password literal "team" preserved as-is

**Decision**: When `plptr->password == "team"` and the planet has a
non-zero `teamcode`, buy/sell access is gated by team-code match. This is
the original's special-cased password behavior (`GECMDS.C:4232-4248`).

**Rationale**: Spec Assumption "Trade password matches original
semantics." The "team" literal is the original's escape hatch for
team-only planets and must be preserved or team economies break.

**Test coverage**: explicit case for `password = "team"` + matching
`teamcode` (allowed) and mismatching `teamcode` (refused) in `buy.spec.ts`.

---

## Decision 8 — `report cargo` rendering: 14 fixed lines, zero-suppress optional

**Decision**: `report cargo` produces a multi-line readout with one line
per non-zero cargo slot, plus a final total tonnage line. Zero-quantity
slots are omitted to match the terse style of the original — the original
in-game display printed the full table only on the price screen, not on
report.

**Rationale**: Less noise for a player who's only carrying a few items.
Spec FR-025 / SC-007 require *real* cargo, not a fixed presentation
layout. The audit test in `balance-planet.spec.ts` covers all 14 slots
being represented in the canonical item table; the per-line output is a
display concern.

**Format** (one line per non-zero item):
```
  120 Men
   30 Food Cases
   ...
Total: 425 tons in cargo (capacity: 1000 tons).
```

---

## Decision 9 — Item canonical arrays sourced from wiki + `GEMAIN.H`, hardcoded (NOT env-configurable)

**Decision**: A single new file `backend/src/game/constants/items.ts`
exports four parallel arrays of length 14: `ITEM_NAMES`, `BASEPRICE`,
`MANHOURS`, `MAXPL` (plus `ITEM_TONS`). Values are HARDCODED, sourced
from `reference/wiki/items.md` (the canonical defaults from
`MBMGEMSG.MSG`). They are NOT env-configurable in this feature — unlike
`GALAXY_SEED` / `PLODDS` / `WORMODDS` / `MAXPLANETS` which feature 004
exposed via env, item economics stay pinned in code.

**Rationale**:
- The original loaded these via `numopt`/`lngopt` from a sysop-editable
  config file (`MBMGEMSG.MSG` + `.MDF`). Operators could retune them
  per-deployment.
- For Galactic Empire Reborn, balance is a project-level decision, not a
  per-deployment one. Hardcoding lets the balance regression test
  (FR-028) catch drift at PR review time. An env override could only
  produce two outcomes: (a) silent drift (values change without test
  awareness, defeating FR-028) or (b) a parallel "balance config"
  surface that still has to be pinned somewhere — adding complexity
  without value.
- Re-tuning still has a clean path: edit the constants file and the
  regression test in the same commit. The balance commit is a clear,
  reviewable, version-controlled artifact — exactly what feature 004
  Decision 5 chose for `s00`.
- Constitution Principle I (Fidelity): preserving the originally-shipped
  defaults is the higher-fidelity choice. Operator retuning is not part
  of the player-facing fidelity goal.

**Alternative considered and rejected**: env-configurable arrays via a
new `ITEM_BASEPRICE_<N>` / `ITEM_MANHOURS_<N>` / `ITEM_MAXPL_<N>` env
surface (28 vars). Rejected on complexity vs. zero clear demand. If
post-launch operations need rebalancing, a follow-up feature can
introduce the config surface deliberately rather than baking in a
half-used hook now.

**Test coverage**: `balance-planet.spec.ts` includes one frozen snapshot
test per array; any edit to a value fails the test.

---

## Decision 10 — Beacon visibility through existing `scan` projection

**Decision**: When a planet has a non-empty `beacon` field, the existing
`scan lo` and short-range scan projections include a `beacon: string`
field on the planet cell. No new event type, no new socket channel.

**Rationale**: Spec FR-021 — beacons are visible to ships in the same
sector. The `scan` handler already projects sector contents on demand;
extending the cell shape is the cheapest faithful path.

**Test coverage**: extend `scan.spec.ts` with one case asserting that a
beacon string surfaces in the projected cell.

---

## Open items

None. All NEEDS CLARIFICATION resolved through the spec clarification
session and the ten decisions above.
