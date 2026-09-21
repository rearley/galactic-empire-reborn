# AI galaxy simulation — design

**Issue:** #61, under the AI-layer review #58.
**Status:** approved in conversation, 2026-09-21. The owner chose passive and
combat scenarios, and the default suite if fast. Everything else follows the
recommendations below.

## Why

The hub-trap bugs of 2026-09-20 (v0.27.4 through v0.27.8) were **emergent**.
Every unit test passed while a Sarten Obliterator sat in sector (0,0) for hours.
Unit tests pin canon's odds and branches; nothing pinned what they add up to
over time. This harness runs the AI for hours of simulated time and asserts
properties of the run.

## Approach

The real services run in an in-memory world:

- **Real:**
  - `TickService`, driven by Vitest fake timers, so the 1s and 6s heartbeats
    fire from their real `setInterval`s in `TickOrder`
  - `PhysicsTickService` (movement), `ShipTickService` (shields, energy),
    `CombatTickService`, `CybertronTickService`, `CybTraceService`
  - `PhaserHandlerService`, for pilots who fire
  - `EventEmitter2`
  - a seeded `Mulberry32Adapter`
- **Canon data:** the ship class table from the generated
  `prisma/seed/ship-classes.ts`, loaded into a real `ShipClassCacheService`.
  UNIVMAX 100 with the real `scaleAiPopulation`.
- **Faked, at the persistence edge only:**
  - ship state: an in-memory map exposing the `ShipStateService` surface the
    services use
  - `CybertronRepository`: `hydrateAll` is empty, `createSpawn` loads the new
    hull into the map, and flushes are no-ops
  - `MineRepository`
  - no Galaxy service, so there is no gravity; this is a stated limit

Rejected alternatives:

- **A real Nest app on Postgres.** Every spawn and flush would do database I/O
  interleaved with fake timers. That is slow and flaky.
- **Calling handlers directly without `TickService`.** It skips tick ordering,
  which is part of the behaviour under test.

**Known fidelity gap.** The fake `createSpawn` builds the hull from the same
`SpawnSlotInit` fields the real one writes, on the shared `makeShip` defaults,
not from Prisma's column defaults. A test pins the fake's spawned state against
the fields `createSpawn` writes, so the two cannot drift silently.

## Harness — `backend/test/sim/galaxy-sim.ts`

```ts
const sim = await GalaxySim.create({ seed, univmax: 100 });
sim.addPilot({ name, classNumber, at: { x, y }, script });
await sim.run({ minutes: 240, every: (s) => checks(s) });
sim.events;          // every EventEmitter2 emission, in order
sim.trace(shipKey);  // rendered `sys trace` lines (#60)
```

- **Pilot scripts** are functions of the world, called once per simulated
  second:
  - `park`: speed 0
  - `commute(a, b, period)`: fly between two points on a loop
  - `fightBack`: turn to the claimant and fire phasers when in range
- **Failures explain themselves.** A property that fails names the Cybertron
  and includes its rendered trace, so the report reads like a `sys trace`.
- **Deterministic.** The only randomness is the seeded port, and time is fake.

## Invariants — checked every simulated second, in every scenario

1. **No stale claim.** A Cybertron holding a claim on a channel that no longer
   resolves to an active pilot must release it by the end of its own next
   activation.
2. **No fire into the zone.** No Cybertron phaser or torpedo event targets a
   pilot inside sector (0,0).
3. **No hub trap.** No Cybertron stays in sector (0,0) for more than 10
   continuous simulated minutes.

## Scenarios — each on three fixed seeds

| Scenario | Pilots | Properties |
|---|---|---|
| Hub idler | 1 Interceptor parked at (0.5, 0.5), 4 h | takes no damage from a Cybertron; is never the target of a claim |
| Parked out | 1 Interceptor stopped at (2.5, 2.5), up to 1 h | claimed by a Cybertron within 10 min |
| Commuter | 1 pilot looping between (0.5, 0.5) and (3.5, 3.5), 4 h | after entering the zone, any claim on it is gone by the end of its holder's next activation |
| Fight back | pilots in the port's heaviest buyable hull, `fightBack`, 4 h | at least one Cybertron kill; no killed class reappears before `respawnDelayMs`; every killed class reappears within that delay plus the spawn cadence |

Numbers such as 10 minutes and 4 hours are properties of play, not canon
values. Each is named in the spec file with its reason.

## Where it runs

Measure first. If all scenarios together take under about 30 seconds of wall
time, they join the default `vitest run` and CI. Otherwise they move to an
opt-in `npm run test:sim` with a CI step of their own. The result is recorded in
PROGRESS.

## Out of scope

- Droids. They have no transitions module; revisit with #62.
- Gravity and planets.
- Multiple pilots competing for one Cybertron's attention, beyond what the
  fight-back scenario produces naturally.
- Asserting canon odds. Unit tests already do that; this asserts outcomes.
