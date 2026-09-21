# AI Galaxy Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seeded, fake-clock simulation that runs the real tick, movement, combat and Cybertron services for hours of game time and asserts emergent properties of the AI.

**Architecture:** `backend/test/sim/galaxy-sim.ts` assembles the real services over an in-memory ship map. The real `TickService` is driven by Vitest fake timers. Canon's class table loads through the real `ShipClassCacheService`, fed by a Prisma stand-in that returns `SHIP_CLASSES`. The invariants live in `test/sim/sim-invariants.ts`, and a failure prints the offending Cybertron's `sys trace`. Scenarios are `test/sim/*.sim.spec.ts`.

**Tech Stack:** Vitest (fake timers, `vi.hoisted`), NestJS services constructed by hand, `@nestjs/event-emitter`.

**Spec:** `docs/superpowers/specs/2026-09-21-ai-galaxy-simulation-design.md`

## Global Constraints

- **UNIVMAX 100.** The suite defaults to 20 (`test/helpers/test-galaxy-size.ts`).
  Each sim spec sets `process.env.UNIVMAX = '100'` inside `vi.hoisted`, before
  `constants.ts` is imported. Writing `process.env` classifies the file into the
  `isolated` project, which is required anyway, since constants are read at
  import.
- **Deterministic.** Randomness comes only from `Mulberry32Adapter(seed)`, and
  time only from `vi.useFakeTimers()`. Seeds are fixed literals.
- **No production change** unless a scenario finds a real bug. A bug gets its
  own commit, test and DECISIONS entry, per the usual rules.
- Backend specs need `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` (the owner
  granted it this session). Run on Node 24
  (`PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`).
- **Test-only work does not bump `VERSION`.** Nothing deploys.

## Facts the harness depends on (verified 2026-09-21)

- `TickService(invariants)` opens its `setInterval`s in
  `onApplicationBootstrap()`. `fire()` dispatches to handlers in `TickOrder`.
- `CybertronTickService.onModuleInit` subscribes SHIP_UPDATE and PHYSICS,
  registers `events.on(...)` listeners (a plain `EventEmitter2` works), calls
  `repository.hydrateAll()`, and boot-seeds via `spawnOne` →
  `repository.createSpawn(slot)`. The real `createSpawn` ends in
  `shipState.loadShip(state)`.
- `CYBERTRON_SCORED_KILL` is emitted by `PlayerScoreService`, which is not in
  the sim. So `releaseWon` never fires there, and a killer's claim lapses
  through `releaseTargetLeft`. This is a stated limit.
- `pha <degree> <focus>` takes a degree RELATIVE to the ship's heading
  (`firep.ts:54`, `normal(heading + degrees)`).

---

### Task 1: Harness core, smoke test and timing

**Files:**
- Create: `backend/test/sim/galaxy-sim.ts`
- Create: `backend/test/sim/galaxy-sim.sim.spec.ts`

**Produces:** `GalaxySim.create({ seed })`, `sim.addPilot(opts)`,
`sim.run({ seconds, every })`, `sim.ships()`, `sim.cybertrons()`,
`sim.events`, `sim.trace(key)`, `sim.dispose()`.

- [ ] **Step 1: Write the smoke spec.** Boot on seed 1. Expect at least one
  Cybertron to exist after boot seeding. Run 600 simulated seconds and expect
  at least one Cybertron to have moved, which proves SHIP_UPDATE drives
  movement. Also pin the fake `createSpawn` against the real field set:
  `status 2`, `cybmine 255`, `cybupdate 100`, `holdcourse 0`, `topspeed` = the
  class's `maxWarp`.
- [ ] **Step 2: Run it and see it fail** (the module does not exist).
- [ ] **Step 3: Build `galaxy-sim.ts`.** Construct `TickService`,
  `ShipClassCacheService` (fed `SHIP_CLASSES`), `PhysicsTickService`,
  `ShipTickService` (with a `MaintenanceService` stub), `CombatTickService`,
  `CybTraceService`, `CybertronTickService` and `PhaserHandlerService`. Call
  each `onModuleInit`, then `tick.onApplicationBootstrap()`. Advance with
  `vi.advanceTimersByTimeAsync(1000)` per simulated second, so the async spawn
  path settles between ticks. Record every event with `events.onAny`.
- [ ] **Step 4: Run it and see it pass.** Record the wall time for 600
  simulated seconds and extrapolate to 4 hours.
- [ ] **Step 5: Commit.**

### Task 2: Invariants that explain themselves

**Files:**
- Create: `backend/test/sim/sim-invariants.ts`
- Create: `backend/test/sim/sim-invariants.sim.spec.ts`

**Produces:** `createInvariantChecker(sim)` returning
`{ check(): void; violations: SimViolation[] }`, and `describeViolation(v)`,
which ends with the Cybertron's rendered trace lines.

The three invariants, checked every simulated second:

1. **No stale claim.** If a Cybertron's `cybmine` names a channel with no active
   pilot, record that activation count. Violate if the claim is still held after
   that ship's NEXT activation.
2. **No fire into the zone.** On `COMBAT_PHASER_FIRED` or a torpedo launch from
   a `Cybrg-` shooter, violate if the victim is in sector (0,0). The payload's
   positions are used, or failing that the victim ship's own.
3. **No hub trap.** Track continuous seconds per Cybertron in sector (0,0).
   Violate above 600.

- [ ] **Step 1: Write failing tests** against a sim with a doctored ship (a
  Cybertron planted in (0,0) with speed 0 and `tick` held high, so it cannot
  leave). Expect exactly the hub-trap violation, and `describeViolation` to
  contain `sys trace`-style lines.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Pass, then commit.**

### Task 3: Passive scenarios

**Files:**
- Create: `backend/test/sim/passive.sim.spec.ts`
- Modify: `backend/test/sim/galaxy-sim.ts` to add the scripts `park(at)` and
  `commute(a, b, periodSeconds)`

For each seed in `[1, 2, 3]`:

- **Hub idler.** Interceptor (class 1) at (0.5, 0.5), 4 h. Expect no
  violations, pilot `damage === 0`, and no Cybertron ever holds a claim on its
  channel.
- **Parked out.** Interceptor at (2.5, 2.5). Expect a Cybertron claim on it
  within 600 s. The run ends at the first claim, or at 3,600 s as a failure.
- **Commuter.** Pilot looping (0.5, 0.5) ↔ (3.5, 3.5), 4 h. Expect no
  violations. The stale-claim and zone-release invariants carry the property.

- [ ] Write the spec, run it, and fix the harness if needed (not the
  production code, unless there is a real bug; see Global Constraints).
- [ ] Commit.

### Task 4: Fight-back scenario

**Files:**
- Create: `backend/test/sim/fight-back.sim.spec.ts`
- Modify: `backend/test/sim/galaxy-sim.ts` to add the script `fightBack`

`fightBack`: once a second, find the Cybertron claiming this pilot. If it is
within the pilot's `scanRange` and the phaser is charged, fire
`pha <relative bearing> 1` through the real `PhaserHandlerService`. The hull is
the heaviest buyable class in `SHIP_CLASSES`. A killed pilot is re-added at its
start point after 60 s.

Properties per seed:

- at least one Cybertron destroyed
- for every killed class, no hull of that class spawns before `diedAt + respawnDelayMs(canonCount)`
- every killed class respawns by `diedAt + respawnDelayMs + 30 PHYSICS ticks + 6 s`
- invariants hold throughout

- [ ] Write, run, fix harness, commit.

### Task 5: Placement, docs, close

- [ ] Time the full `test/sim` run. Under ~30 s: leave it in the default run.
  Otherwise add `npm run test:sim` with its own config, exclude `test/sim` from
  the default projects, and add a CI step.
- [ ] Add a PROGRESS entry with the timing, the placement decision, and anything
  a scenario found. Add a line to the `docs/TEST_STRATEGY.md` section on test
  kinds.
- [ ] Commit with `Closes #61`.
