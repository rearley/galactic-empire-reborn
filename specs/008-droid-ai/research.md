# Phase 0 Research: Ephemeral Droid AI

**Status**: complete — all NEEDS CLARIFICATION resolved.

## R-1 — Tick subscription and ordering

**Decision**: `DroidTickService` subscribes to `TickKind.PHYSICS` from the
existing `TickService` (006a). `DroidModule` imports `CybertronModule`
(which transitively imports `CombatModule` → `PhysicsModule`), so its
`onModuleInit` runs strictly after physics + combat + Cybertron
subscriptions are registered. The subscription order is enforced by
NestJS's dependency-graph `onModuleInit` order, identical to 007's
approach.

**Rationale**: Reuses the only fixed-interval scheduling primitive
allowed by Constitution III (raw `setInterval` in `OnModuleInit`).
No new tick kind required — the spec calls for evaluation every 30
physics ticks, which is implemented as a counter inside the handler,
not as a new tick frequency.

**Alternatives rejected**:
- New `TickKind.DROID` event @ 180s — adds a third timer for no
  testability win; counter-in-handler is simpler.
- `@Interval` decorator — disallowed by Constitution III.

## R-2 — Spawn cadence and per-Droid action cadence

**Decision**: Single private counter `spawnTickCounter` increments on
every `TickKind.PHYSICS` fire. On rollover at 30, the handler runs both
(a) the spawn evaluation pass (top up each class up to its cap of 2)
AND (b) the per-Droid action pass (call `droid_act_class_<N>` for every
ephemeral Droid in the in-memory map). Per spec clarification, the two
passes share the same 30-tick cadence — Droids do not act every
6-second tick.

**Rationale**: Faithful to `GEMAIN.C` lines 2325-2400 (`ticktock2 >= 30`
gates the entire `droid_lives` outer loop). Halves the scheduler
overhead vs. evaluating per-Droid actions every 6 seconds and is
required by FR-005.

**Alternatives rejected**:
- Per-Droid actions every PHYSICS tick (6s) — diverges from C source
  and from spec clarification; would also raise the annoy chatter rate
  by ~5×.
- Two separate counters — unnecessary complexity; the C source uses one.

## R-3 — Player-online gate

**Decision**: Both spawn pass and per-Droid action pass are gated on
`ShipStateService.findAllShips().some(s => s.status === GESTAT_USER)`.
When false, the entire 30-tick cycle is a no-op.

**Rationale**: Matches the Cybertron pattern from 007 and the spec
clarification. Avoids burning CPU on an empty server and keeps the
universe quiescent in dev/CI runs that bring the backend up without
seeded players.

**Alternatives rejected**:
- Always run — wasteful and contradicts the explicit clarification.
- Gate only spawn — leaves the per-Droid action pass running on a
  populated-but-deserted universe; no behavioral benefit.

## R-4 — Ephemerality mechanism

**Decision**: Add `isEphemeral?: boolean` to the `ShipState` interface
(undefined = persistent). `ShipStateService.flush()` adds one early
`if (state.isEphemeral) continue;` at the top of the `for` loop.
`removeFromGame()` requires no change — its existing behavior of
deleting from the in-memory map without touching the DB is exactly
what ephemeral kills need (because no DB row exists).

**Rationale**: Smallest possible mutation to existing infrastructure;
flagged-state pattern is widely understood; the new field is optional
so all existing call sites (mappers, tests, fixtures) compile
unchanged. The flush short-circuit is one line and is covered by a
direct unit test plus the broader ephemerality regression.

**Alternatives rejected**:
- Separate `EphemeralShipStateService` map — splits the source of
  truth and would force every read site (combat, scan, gateway) to
  consult two maps. Massive blast radius for a one-line invariant.
- Detect ephemerality by userid prefix (`@Droid-`) inside `flush()` —
  couples persistence logic to a naming convention; harder to test;
  fails open if naming ever changes.
- Persist Droids and rely on a Prisma soft-delete column — directly
  contradicts FR-001..FR-004.

## R-5 — Userid and slot allocation

**Decision**: Droid userid format is `@Droid-<n>`, faithful to
`GEDROIDS.C` line 111. `n` is allocated by `DroidSpawner` from a
private monotonic counter that wraps at a high ceiling (e.g., 9999) and
checks live-population uniqueness on each spawn. Each Droid is
`(userid, shipno=1)` — Droids never share a userid.

**Rationale**: The C source uses an integer slot index from the
fixed-size ship table; we don't have a fixed table, but a monotonic
counter scoped to the live population gives the same uniqueness
guarantee and is trivial to implement with an in-memory `Map`.

**Alternatives rejected**:
- UUID userid — diverges from the `@Droid-<n>` convention and breaks
  human-readable log lines (`logthis(spr("GE:%s Lives", droidname))`).
- Reuse Cybertron's `Cybrg-<n>` scheme — collides with 007 hydrate
  query (`startsWith: 'Cybrg-'`) and would persist Droids by accident.

## R-6 — Combat primitive reuse

**Decision**: `droid_act_class_<N>` modules call existing 006b
primitives directly (`firep`, `firehp`, `torp`, `laymine`, `jam`,
`shieldup`, `shielddn`). The Droid AI never recomputes damage or kill
state — it just feeds the same primitive surface a player command
handler would.

**Rationale**: Matches the 007 architecture. Combat math is already
covered by 006b's tests; duplicating it would create drift risk.

**Alternatives rejected**:
- Re-implement weapon math inline in Droid AI — fidelity risk and
  test duplication.
- Publish `droid.fire-phaser` events for combat to consume —
  unnecessary indirection; combat services are already injected and
  callable directly.

## R-7 — Cargo transfer on Droid death

**Decision**: No special-casing required. The 006b `combat.ship-destroyed`
event already triggers loot transfer (item-by-item from victim to
attacker) per the existing 006b kill-resolution rule. For Droids the
flow is identical to a player kill except the victim is removed from
the in-memory map (`ShipStateService.removeFromGame`) without a DB
delete because no row exists.

**Rationale**: SC-004 explicitly requires no regression in cargo
transfer behavior. Reusing the existing path guarantees this.

**Alternatives rejected**:
- Custom Droid loot table — diverges from spec; the Murdonian carries
  randomized cargo per `droid_init` and that cargo IS the loot.
- Special transfer event — duplicates 006b machinery for no gain.

## R-8 — Annoy event delivery

**Decision**: `DroidTickService` publishes `droid.annoy` events on
`EventEmitter2`. `GameGateway` subscribes and translates each event to
(a) a direct emit to the target player's socket and (b) a sector-room
broadcast so co-located players see the chatter. The Droid module
never imports `Server` or `Socket`.

**Rationale**: Constitution III prohibits AI services from touching
Socket.io directly. Event-bus indirection is the established pattern
(007 uses it for `cybertron.taunt`).

**Alternatives rejected**:
- Sector-room broadcast only — strips the per-target context that
  `droid_annoy` provides (the message is keyed to a specific
  scanned player's `usrn`).
- Socket emit only — strips the in-sector ambient chatter, loss of
  authentic feel.

## R-9 — Annoy roll and rate

**Decision**: `rollAnnoy(rnd: number = 4): boolean` returns
`random.int(0, rnd - 1) === 1` — i.e., 25% per evaluation when
`rnd === 4`. Matches `gernd() % 4 == 1` from `droid_annoy` line 240.

**Rationale**: Direct port. SC-002's 15-35-out-of-100 acceptance band
covers the standard binomial(100, 0.25) two-sigma envelope (mean 25,
σ ≈ 4.33), generous enough that a seeded PRNG run is non-flaky.

**Alternatives rejected**:
- `random.int(1, rnd) === 1` — off-by-one vs. C source.
- Configurable rate — over-engineering; spec pins ~25% explicitly.

## R-10 — Random ranges (verbatim from `GEDROIDS.C`)

| Branch | Speed | Heading | Holdcourse |
|--------|-------|---------|------------|
| Garbage Scow jammed | `999.9` | (unchanged) | `gernd()%50 + 10` |
| Murdonian jammed flee | `topspeed * 1000` | (unchanged) | `gernd()%50 + 10` |
| Murdonian fight-back confuse (1/10) | `rndm(10000.0)` | `rndm(359.9)` | `gernd()%10 + 3` |
| Murdonian hyperspace+missile evade | `rndm(999.0)` | (unchanged) | `gernd()%15 + 5` |
| Vakory jammed flee | `topspeed * 1000` | (unchanged) | `gernd()%50 + 10` |
| Vakory fight-back alter (1/20) | `rndm(5000.0)` | `rndm(359.9)` | `gernd()%10 + 3` |
| Vakory >75% dmg flee | `topspeed * 1000` | `rndm(359.9)` | `gernd()%30 + 20` |
| Vakory missile evade | `rndm(5900.0) + 5000.0` | (unchanged) | `gernd()%5 + 5` |

All rolls flow through the 006b `Random` port. The seeded Mulberry32
adapter is the test fixture.

## R-11 — Fight-back trigger predicates

**Decision**: Murdonian fight-back triggers when `cantexit > 0 &&
lastfired >= 0`. Vakory fight-back triggers when `cantexit > 0 &&
lastfired > 0`. The strict-greater-than vs. greater-than-or-equal
distinction is preserved verbatim from the C source — it means
`lastfired === 0` (single-attacker case at slot 0) will trigger
Murdonian fight-back but NOT Vakory fight-back.

**Rationale**: Direct port. Edge-cased explicitly in the spec.

**Alternatives rejected**:
- Normalize both to `>= 0` — silently changes Vakory behavior;
  fidelity violation.

## R-12 — Vakory torpedo volley size

**Decision**: `rollVakoryTorpedoVolley(): number` returns
`random.int(0, 1)` — i.e., 0 or 1 torpedo per fight-back tick. Matches
`j = gernd()%2; for (i=0;i<j;++i) torp(...)` from line 477. Note that
`ptr->items[I_TORPEDO] = (gernd()%5)+1` is set IMMEDIATELY before each
launch — Vakory does not deplete its torpedo inventory through fire,
the C source replenishes it. We preserve this for fidelity (it means
Vakory torpedo fire is not gated by ammo).

**Rationale**: Direct port. Spec clarification explicitly notes a
volley size of 0 is intended.

## R-13 — Cybertron spawn-visibility (US4 / FR-032)

**Decision**: The fix is already in code at
`backend/src/game/cybertron/cybertron.repository.ts:141-151` (commit
b01c009). After `prisma.ship.create`, the row is re-fetched and
`ShipStateService.loadShip(state)` is called in the same logical
operation. This feature adds only a regression test at
`test/game/cybertron/createSpawn-visibility.spec.ts` to pin the
behavior so future refactors cannot silently reintroduce the defect.

**Rationale**: No production code change is needed; the defect is
already closed. A regression test is the cheapest way to keep it
closed and is trivially added under this feature's scope.

**Alternatives rejected**:
- Skip the test — the spec explicitly lists US4 / FR-032 as in scope;
  the test is the smallest deliverable that satisfies the requirement.
- Re-implement the fix — already in place; double-implementation risk.

## R-14 — Spawn coordinate range

**Decision**: Spawn coordinates are uniformly random in
`[-19.8, 19.8]` on each axis (the `univmax >= 20` branch from
`droid_init` lines 137-140). The smaller-universe branch is out of
scope per spec assumption.

**Rationale**: The project's universe is at standard configured size
(`MAXX=30`, `MAXY=15` per CLAUDE.md). The C-source small-universe
branch (`univmax < 20`) is dead code in our deployment.

## R-15 — Per-class tunables and ship class seed values

**Decision**: Three new `ShipClass` rows seeded at classes 10
(Lydorian Garbage Scow), 11 (Murdonian Transport), 12 (Vakory Survey
Drone). Values verbatim from `GEDROIDS.C` and the original C-source
class table:

- All three: `category = CLASSTYPE_DROID = 3`.
- `scanRange`, `topspeed`, `maxShields`, `maxPhaser`, `hasTorpedo`,
  `hasMine`, `hasJammer` — sourced from the original class table
  (concrete numeric values are codified in `droid.config.ts` and the
  `ship-classes.ts` seed; this research file fixes the policy, not
  the literals — see [data-model.md](./data-model.md) for the full
  table).
- `tot_to_create = 2` for each (FR-006 cap).

**Rationale**: Fidelity (Constitution I). Per-class tunables are
sourced from the C original verbatim.

**Alternatives rejected**:
- Pick one canonical class with shared values — collapses the
  per-class behavior the feature is built to deliver.
