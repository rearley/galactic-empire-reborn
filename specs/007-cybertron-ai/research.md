# Phase 0 Research: Cybertron AI

All `NEEDS CLARIFICATION` items in the Technical Context are resolved here.

## R-1 — Tick subscription ordering

**Decision**: `CybertronTickService.onModuleInit()` subscribes to
`TickKind.PHYSICS` after both `PhysicsTickService` and `CombatTickService`
have subscribed.

**Rationale**: NestJS executes `onModuleInit` in import-dependency order.
`CybertronModule` imports `CombatModule` (which imports `PhysicsModule`).
Both are already in place from 006a/006b. The existing
`TickService.subscribe()` registry calls handlers in registration order on
each fire, so the AI pass observes post-physics, post-combat ship state.
This is the same pattern 006b uses to land after 006a (006b R-1).

**Alternatives rejected**:

- **A separate `TickKind.AI` enum value**: would force three separate
  `setInterval` callbacks per 6-second physics tick or a "fan-out from
  PHYSICS" wrapper. Adds a layer with no benefit; the registration-order
  pattern already gives us strict ordering on a single fire.
- **An explicit priority field on subscriptions**: not needed — module
  import order is the authoritative ordering signal in NestJS and is
  already what 006b relies on. Adding a priority field would diverge from
  the established pattern.

## R-2 — Spawn cadence

**Decision**: `CybertronTickService` maintains a private
`spawnTickCounter`. On each tick the counter increments; on rollover
(modulo 30) it executes one spawn-slot attempt per FR-003.

**Rationale**: Original `GEMAIN.C` runs the Cybertron spawn slot inside
the same outer loop that drives all ticks, but only every ~30 service
ticks. Reproducing the slow drip means the universe fills gradually on a
fresh boot rather than instantaneously, which preserves the
"populates within ~15 minutes" SC-001 budget without any sleep/timer code.

**Alternatives rejected**:

- **A separate `@Cron` job for spawn-fill**: would split the AI loop
  across two scheduling mechanisms in violation of the Constitution III
  principle that game-loop ticks live behind the central `TickService`.
- **Spawn one ship per tick until full**: would saturate the universe in
  the first 60 seconds of boot, breaking SC-001 and the gradual-fill
  feel of the original.

## R-3 — Per-ship `tick` countdown

**Decision**: Each AUTO ship's `Ship.tick` field decrements every PHYSICS
tick (already on schema). Only ships hitting zero execute `cyb_lives`. On
completion, the next `tick` is set per FR-011: long sleep
`(CYBTICKTIME + rnd%CYBTICKTIME) * 5` when `cantexit == 0`, short sleep
`CYBTICKTIME + rnd%CYBTICKTIME` otherwise.

**Rationale**: Verbatim from `GECYBS.C:cyb_lives` end-of-function. This
naturally throttles AI work — at steady state most Cybertrons sleep
between bursts of activity, keeping per-tick cost well under the SC-008
1-second budget.

**Alternatives rejected**:

- **Global rate limiting via `CYBMAXPERTICK=2`**: the C constant exists
  but is a per-tick *maximum activations*, not a per-ship gate. The
  per-ship `tick` countdown is the primary throttle. The
  `CYBMAXPERTICK` ceiling is honored as a hard cap inside the iteration
  loop (early-exit after 2 activations per service tick) so worst-case
  burst load is bounded.

## R-4 — Gold transfer on kill

**Decision**: `CybertronTickService` registers an `EventEmitter2`
listener for `combat.ship-destroyed` (already published by 006b). When
the victim's `userid` matches `/^Cybrg-/`, the listener:

1. Reads the victim's `User.cash`, clamps to `CYB_MAXCASH`.
2. Adds the clamped amount to the attacker's `User.cash` (using
   `BigInt` arithmetic per the schema).
3. Zeros the victim's `User.cash`.
4. Marks both `User` rows for immediate flush via the repository (per
   FR-019 immediate-flush hook).

**Rationale**: Spec clarification (Session 2026-05-03) — the killer
receives the Cybertron's cash, clamped to `CYB_MAXCASH`. Wiring this
through an event keeps `CombatTickService` ignorant of AI-specific
rules; combat just publishes the kill event, the AI module reacts.

**Alternatives rejected**:

- **A direct method call from combat into a `CybertronService`**: would
  reverse the dependency direction (combat depending on AI) and couple
  the modules.
- **Polling kills inside the AI tick**: the AI tick runs every 6 s; gold
  transfer needs to be observable in the same tick the kill resolves
  (per FR-005a). Event-driven is the simplest path.

## R-5 — Randomness

**Decision**: Reuse the `Random` port from 006b (DI token, default
`Math.random` adapter, seeded Mulberry32 adapter for tests). Every AI
roll flows through this port: `cybwhoops` (1-in-`cybskill`), `gebemean`
(1-in-`CYBSLO`), breakoff (1-in-`CYB_BREAKOFF`), mine-lay (1-in-5),
jammer-deploy (1-in-100), damage-respond (1-in-10), init loadout, init
`cybskill` (3..17), spawn class pick (1% random-class chance),
random-heading on jam/damage/respawn, hold-course timer.

**Rationale**: Determinism is the only path to running the simulation-
heavy tests in SC-002, SC-003, SC-004, SC-006. Using the *same* port as
006b means a single seeded run produces a reproducible interleaving of
combat + AI decisions across the whole stack.

**Alternatives rejected**:

- **A separate `AIRandom` port**: would split seeding across two ports,
  making cross-system replays harder and adding boilerplate.

## R-6 — Class config split

**Decision**:

- **`constants.ts` (game-balance invariants)**: `CYBTICKTIME=6`,
  `CYB_MINCLASS=3`, `CYBSLO=3`, `CYB_ALLOW=35`, `CYB_MAXCASH=2,000,000`,
  `CYB_BE_NICE=30`, `CYB_BE_EASY=60`, `CYB_BREAKOFF=500`,
  `CYB_MINDAM=75`, `CYBMAXPERTICK=2`, `CYB_TOUGH_0=0`, `CYB_TOUGH_1=1`,
  `CLASSTYPE_CYBORG=2`. Pinned in `balance-regression.spec.ts`.
- **`cybertron.config.ts` (per-class ops-tunables)**: keyed by
  `classNumber`, holds `tot_to_create`, `tooclose`, `hyperdist1`,
  `hyperdist2`, `cyb_gold`. Defaults verbatim from `GECYBS.C` class
  table; overridable via NestJS `ConfigModule` env.

**Rationale**: Spec assumption + clarification — `tot_to_create` and the
hyperwarp/scan distances are explicitly designated as ops-tunable
without code changes. The behavioral constants remain Constitution-I
fidelity invariants and are intentionally *not* exposed via env.

**Alternatives rejected**:

- **All values in `constants.ts`**: would force a code deploy to retune
  population/balance, contradicting the spec.
- **All values in env**: would dilute the balance-regression test and
  let an env typo silently change `CYB_BE_NICE`. Splitting them keeps
  the regression test meaningful.

## R-7 — Cybertron user identity

**Decision**: Each Cybertron's `User.userid` is `Cybrg-<shipno>` where
`shipno` is the ship-table slot index. The matching `Ship.userid` is
the same string. On boot, hydrate is one
`prisma.user.findMany({ where: { userid: { startsWith: 'Cybrg-' } } })`
plus the related `Ship` rows.

**Rationale**: Verified verbatim against `GECYBS.C:104-105` (`cyb_init`):
`strncpy(cybname,"@Cybrg-",UIDSIZ); sprintf(&cybname[7],"%d",usrn);`.
This is the **only** userid construction path for `CLASSTYPE_CYBORG`
ships in the original source — Sarterns (classes 24/25) share the same
prefix. A repo-wide grep of `reference/ge-source/` for `Sartn|Sartern`
returns zero hits; the C source treats Sarterns as a content variation
of Cybertrons, not as a distinct identity. Hydrate, gold-transfer, and
all immediate-flush filters use the single regex `/^Cybrg-/`. Stable
natural key; spawn-slot reuse is explicit (delete-then-insert when a
slot turns over).

**Alternatives rejected**:

- **Anonymous synthetic UUIDs**: would lose the C-source provenance and
  make manual ops-side queries harder.

## R-8 — Sartern shared code path

**Decision**: Sarterns (classes 24, 25) execute the *exact same* code
path as Cybertrons. They differ only in their `ShipClass` row (loadout
caps, ranges, `tot_to_create`, `tough_factor`, etc.). The
`CybertronTickService` iteration filter is `status == AUTO` — it does
not branch on class. The spawn slot picks among all class numbers whose
`category == 'CPU_COMBATIVE'`.

**Rationale**: Verbatim from `GECYBS.C` — Sarterns are a content
variation, not a behavioral one. Spec US6 makes this explicit. Shipped
seed values for classes 24/25 come verbatim from the original C source
class table per spec clarification.

**Alternatives rejected**:

- **A separate `SarternTickService`**: would duplicate the entire
  state machine for zero behavioral gain.

## R-9 — Hyperwarp shield drop / restore

**Decision**: Inside `cyb_check_lockon`, when the pursuit-band
selection raises `where = 1` (entering hyperspace), set `shield = 0`.
When the pursuit-band selection lowers `where = 0` (dropping back to
normal space), restore `shield = ShipClass.maxShields`. The transition
is detected by comparing pre/post `where` within the same call.

**Rationale**: Spec clarification (Session 2026-05-03). Original C
source toggles shields off in hyperspace; restoring to class max on
drop-out matches the cleanest interpretation of the original behavior
and keeps the AI a credible threat the moment it drops out.

**Alternatives rejected**:

- **Restore to pre-drop value**: would require remembering the prior
  shield level across ticks; spec clarification chose class-max.
- **Leave shields at 0 until the AI explicitly raises them**: would
  make a freshly-dropped Cybertron trivially killable for one tick
  cycle, breaking SC-004 (encounter difficulty curve).

## R-10 — Taunt event delivery

**Decision**: `cyb_annoy` emits a `cybertron.taunt` event on
`EventEmitter2` with `{ attackerShipKey, targetShipKey, message,
sector, tickAt }`. `GameGateway` subscribes; on receipt it (a) emits
to the target player's socket as a personal event-log line and (b)
broadcasts to the target's current sector room so other players see
the taunt. The taunt message is randomly picked from `taunt-pool.ts`
(small predefined hostile message set, ~10–15 strings sourced from the
spirit of the original game).

**Rationale**: Spec clarification (Session 2026-05-03). Keeps the AI
service ignorant of Socket.io and matches the 006b event-bus pattern.

**Alternatives rejected**:

- **Direct gateway injection into the AI service**: would couple AI to
  the WebSocket layer and break unit-testability of `cyb_annoy`.

## R-11 — Persistence flush cadence

**Decision**: Reuse the existing `ShipStateService` 30-second async
flush for routine Cybertron state updates. The `cybertron.repository.ts`
exposes a `flushUsersImmediate(userids: string[])` method invoked on
significant events: target acquired, target lost/cleared, damage taken,
kill scored, weapon/decoy/mine inventory depletion (per FR-019, spec
clarification).

**Rationale**: Spec clarification (Session 2026-05-03). The 30s window
bounds worst-case crash loss to ~30 s of position drift, which is
acceptable since Cybertrons resume hunting on the next tick after
rehydration. Significant events that change inventories or accumulated
gold flush immediately so a crash mid-fight does not silently rewind
the state.

**Alternatives rejected**:

- **Flush every tick**: would add ~30 Postgres writes per 6-second
  tick at full population, blowing the SC-008 budget.
- **Flush only on significant events**: would lose 30 s of
  position/heading drift on every restart and break the persistent-world
  feel for the worst-case "crashed mid-cruise" Cybertron.
