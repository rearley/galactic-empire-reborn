# Phase 0 Research — Physics Tick Activation

All Technical Context unknowns are resolved against the original C source
in `reference/ge-source/`. There are no remaining `NEEDS CLARIFICATION`
items. Each entry below records the decision, the rationale, and what was
considered and rejected.

---

## R-1 — Per-tick rotation step

**Decision**: Step = `shipclass.max_accel / 10.0` degrees per physics tick.
When the absolute angular gap to `head2b` is `<= step` *or* `>= 360 - step`,
heading snaps to `head2b`. Otherwise heading rotates the short way and is
normalized to `[0, 360)`.

**Rationale**: `GEFUNCS.C:441 rotship` literally:
```
rotamt = (double)(shipclass[ptr->shpclass].max_accel/10.0);
```
The decision-by-`absol(normal(...))` block at `GEFUNCS.C:444-460` is the
short-way rotation rule. `normal()` in the original normalizes into
`[0, 360)`.

**Alternatives considered**:
- Use the `ROTAMT=20` constant from `GEMAIN.H`. Rejected — `ROTAMT` is not
  referenced in any `.C` file (verified by grep); it is dead code in the
  original and would yield wrong-by-class behavior.
- Always rotate by the full `max_accel`. Rejected — would make heavy ships
  pivot in 1 tick, breaking class differentiation.

---

## R-2 — Acceleration / deceleration step + ACCENGAMT debit gate

**Decision**:
- Going up (speed `<` speed2b): `accelStep = max_accel`. Snap if gap `<= step`.
- Coming down (speed `>` speed2b): `decelStep = max_accel * 2.0`. Snap if gap `<= step`.
- Energy debit: if `speed < 1000`, debit is `0`; else debit is `ACCENGAMT = 120`.
- If `useenergy()` refuses (would leave energy below the per-debit floor),
  force `speed2b = 0` (do not stop the ship instantly — it begins decelerating
  on the next tick via the deceleration branch).
- Hyperspace boundary (1000 ↔ 999) crossed by the *step* triggers a
  `physics.hyperspace` event (see contracts).

**Rationale**: `GEFUNCS.C:469-573 accel` shows exactly this branching, the
`if (ptr->speed < 1000) usage = 0; else usage = ACCENGAMT;` gate, and the
`hyperspace(ptr, usrn, 1|0)` calls on the step that crosses the warp boundary
in either direction.

**Alternatives considered**:
- Charge `ACCENGAMT` on every step. Rejected — original explicitly free
  acceleration below warp 1, which matches the "impulse is cheap, warp is
  expensive" intuition the game ships with.
- Snap-then-debit (charge after snap). Rejected — `accel()` runs the
  `useenergy()` only on the non-snap branch, never on the snap.

---

## R-3 — Position integration formula

**Decision**:
```
xcoord += (speed * sin(deg2rad(heading))) / 65000.0
ycoord -= (speed * cos(deg2rad(heading))) / 65000.0
```
After the update, the *new* sector is derived as
`{ x: floor(xcoord), y: floor(ycoord) }` and compared with the pre-update
derived sector to detect a transition.

**Rationale**: Verbatim from `GEFUNCS.C:648-649 moveship`. `coord1(d)` is
defined in `GECMDS.C:3102` as `(int)floor(dcoord)`.

**Alternatives considered**:
- Compute movement after writing wrap/telezip handling. Rejected — wrap and
  telezip are out of scope for 006a; coordinate updates here are unbounded
  and a galaxy-wrap feature can be layered later without touching the math
  module.
- Use the `+1` display offset that `report.handler.ts` applies. Rejected —
  the `+1` is a UI offset for the human-readable "sector 1..30" labels;
  the canonical sector index for routing is `floor(coord)` (already the
  convention in `scan.handler.ts`).

---

## R-4 — Movement-maintenance debit (MOVENGUSE / MOVENGMIN)

**Decision**: After the position update, if `speed > 0` *and* `status === 1`
(GESTAT_USER, i.e., player-controlled), debit `MOVENGUSE = 10`. After the
debit, if `energy < MOVENGMIN = 3000`, force `speed2b = 0` so the ship coasts
down on subsequent ticks. AI ships (Cybertron/Droid/Murdonian, all of which
have `status !== 1`) skip both the debit and the post-debit cutoff.

**Rationale**: `GEFUNCS.C:733-792 moveship` gates the entire energy block on
`if (ptr->speed > 1000.0 && ptr->status == GESTAT_USER)` for the overspeed
penalty path AND `useenergy(ptr,usrn,MOVENGUSE)` is inside that gate at
line 784. The original therefore does not debit AI ships for movement
maintenance — confirmed by spec clarification with the user.

> Note: the original additionally gates MOVENGUSE on `speed > 1000.0`. The
> spec for 006a (FR-006) widens this to `speed > 0` so impulse ships also pay
> a maintenance debit. This is a deliberate, documented departure: the
> original game's impulse drive was effectively free, but every spec
> reviewer asked the same "why doesn't impulse cost energy" question. We
> are answering "yes it does, at the same `MOVENGUSE` rate" rather than
> inventing a new constant. **Open follow-up: if playtest shows impulse-only
> ships starve, fall back to the strict `speed > 1000` gate.** Tracked in
> `docs/DECISIONS.md` after implement.

**Alternatives considered**:
- Match the strict `speed > 1000.0` original gate. Rejected per the note
  above — chosen as the playtest fallback only.
- Debit AI ships too. Rejected — original does not, and the spec
  clarification with the user explicitly forbids it.

---

## R-5 — Per-tick countdowns (`hypha`, `cantexit`)

**Decision**: For every non-destroyed ship, regardless of orbit/dock state:
- `hypha = max(0, hypha - 1)`
- `cantexit = max(0, cantexit - 1)`

Performed *after* the rotate/accel/move/maintenance block (or unconditionally
when that block is skipped because the ship is in orbit / docked).

**Rationale**: Spec FR-001, FR-008, FR-009. The original `RTKICK` decrements
these per heartbeat regardless of where the ship is. Floor-at-zero matches
the unsigned types in `GEMAIN.H`.

**Alternatives considered**:
- Decrement only when the full block runs. Rejected — would soft-lock
  players sitting in orbit waiting for a `cantexit` battle-lock to expire.

---

## R-6 — Warp command gate sequence (FR-012, FR-013, SC-006)

**Decision**: Make the existing `warp.handler.ts` correctly distinguish the
five outcomes by introducing a `ShipClassCacheService` that hydrates
`ShipClass.maxWarp` once on boot and returns it synchronously to commands.
Order:

1. Class has no warp drive (`shipClass.maxWarp === 0`) → `WARP01`.
2. Engines blown (`ship.topspeed === 0` *and* class can warp) → `WARPSPD2`.
3. Negative argument → `WARP02`.
4. Argument > `topspeed + floor(topspeed/2)` → `WARP03` (refuse).
5. Argument > `topspeed` (but ≤ hard cap) → `WARP04` warning, *and* set
   `speed2b = 1000 * arg`.
6. Otherwise → set `speed2b = 1000 * arg`, no warning.

**Rationale**: Mirrors `GECMDS.C:561-650 cmd_warp` line-for-line. The
existing handler conflates 1 and 2 because it has no `ShipClass` access.
The new cache service is a 60-line singleton.

**Topspeed lifecycle**: set from `ShipClass.maxWarp` at ship creation
(handled by ship-creation code, not this feature) and at full-repair
completion (handled by repair, not this feature). 006a does not introduce
a pilot-skill or warp-engine-damage scalar (FR-013).

**Alternatives considered**:
- Inject `PrismaService` directly into the warp handler. Rejected — handlers
  are sync; an async DB lookup per command call is wrong, and a per-call
  cache would still leak Prisma into the command layer.
- Re-derive class info from a static seed file. Rejected — the seed is the
  source of truth for the migration, but the runtime should read live DB
  state in case a future feature edits `ShipClass`.

---

## R-7 — Determinism: ship processing order

**Decision**: Sort `findAllShips()` by composite shipId (`userid:shipno`
ascending lexicographically) before iterating. Documented as `FR-015a`.

**Rationale**: Spec clarification — Map insertion order is implementation-
dependent under hydration race conditions; tests need stable input. Sorting
by composite key is O(n log n) at n = ~200 ships per tick, well under the
50 ms SC-004 budget.

**Alternatives considered**:
- Numeric `shipno` only. Rejected — collisions across `userid` are possible.
- Insertion order. Rejected per the rationale above.

---

## R-8 — Per-ship error isolation

**Decision**: Wrap every per-ship advancement in `try { ... } catch (err)`,
log `{ shipId, tickAt, stack }` at `error` level, increment a per-tick
fault counter (in-memory; exposed via the existing debug controller), and
continue with the next ship. Do not quarantine; faulted ship is re-tried
on the next tick.

**Rationale**: Spec FR-015 / clarification. Mirrors the existing
`TickService.dispatch` pattern (`one bad subscriber must not stop siblings`).

**Alternatives considered**:
- Quarantine the ship after N consecutive faults. Rejected — adds state and
  hides bugs; metrics + log is the correct first step.

---

## R-9 — Event emission mechanism

**Decision**: Use `@nestjs/event-emitter`'s `EventEmitter2` (already a
project dep). Emit `physics.sector-transition` and `physics.hyperspace` with
the contract payloads. Gateway subscribes in a follow-up feature; for 006a,
events are observable in tests and via a temporary debug listener if needed.

**Rationale**: Decouples the tick from the gateway, matches the constitution's
"in-process, no Redis" principle, and is testable with synchronous emit/listen.

**Alternatives considered**:
- Direct `GameGateway` injection. Rejected — creates a circular dep risk and
  couples physics to Socket.io.
- A bespoke pub/sub. Rejected — `EventEmitter2` is already in the dep tree.

---

## R-10 — Performance budget validation

**Decision**: Add a `bench.spec.ts` that constructs an in-memory map of 100
fake `ShipState` objects, calls `PhysicsTickService['advanceAll']()` once,
and asserts the wall-clock duration is `< 50 ms` using `process.hrtime.bigint()`.
Skipped on CI runners that report `process.env.CI_LOW_PERF === '1'`; the
default CI runner runs it.

**Rationale**: SC-004 is a budget gate, not a soak. A direct synchronous
benchmark catches regressions immediately without flakiness.

**Alternatives considered**:
- Use a microbench library (`tinybench`). Rejected — adds a dep for a single
  assertion.
- Skip the benchmark and rely on production telemetry. Rejected — would let
  a regression land before anyone notices.
