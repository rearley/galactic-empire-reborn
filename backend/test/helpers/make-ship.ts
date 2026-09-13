/**
 * Builds a fully-populated `ShipState` for unit tests, overridable by NAME
 * rather than position.
 *
 * This exists because 334 test files hand-build a `ShipState` inline (the
 * original seed lived at `test/team/tea-subcommands.spec.ts:15` and ended in
 * `as ShipState`, which meant the compiler never actually checked it). Every
 * later repository task in this phase touches a service those fixtures feed;
 * without one place to build a ship, each task's diff fills with spec files
 * it has no business changing — the same problem `make-gateway.ts` solved for
 * `GameGateway`'s constructor in the previous phase.
 *
 * This factory returns a genuinely complete `ShipState` object literal, so no
 * `as ShipState` cast is needed and a field renamed or added on the interface
 * fails this file at compile time instead of failing silently at a call site.
 *
 * Two things matter more than the rest of this file:
 *
 * - **Fresh arrays per call.** `freq`, `items`, `ltorpsChannel` and the other
 *   array fields are built inside the function body, never hoisted to a
 *   module-level constant. A shared array mutated by one test would corrupt
 *   every other test that called `makeShip()` afterwards, and that failure
 *   depends on test execution order — one of the worst things to debug.
 * - **Defaults stay inside the canon domains** that
 *   `test/invariants/fixture-domains.spec.ts` enforces: `topspeed` is a warp
 *   FACTOR (0-255), not raw units — `topspeed: 8000` in old fixtures hid the
 *   Cybertron movement bug for 339 commits precisely because nobody thought a
 *   "boilerplate" field was worth reading. `shpclass` 0-41, `phasrtype` and
 *   `shieldtype` 0-20, `cloak` -200..10, `percent` 0-99.
 *
 * @see src/game/ship/ship-state.types.ts ShipState
 * @see test/invariants/fixture-domains.spec.ts
 */
import { ShipState } from '../../src/game/ship/ship-state.types';

export function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  const base: ShipState = {
    userid: 'u1',
    shipno: 1,
    shipname: 'Alpha',
    shpclass: 1,
    heading: 0,
    head2b: 0,
    speed: 0,
    speed2b: 0,
    xcoord: 0,
    ycoord: 0,
    damage: 0,
    energy: 1000,
    phasr: 0,
    phasrtype: 0,
    kills: 0,
    lastfired: 0,
    shieldtype: 0,
    shieldstat: 0,
    shield: 0,
    cloak: 0,
    degrees: 0,
    percent: 0,
    tactical: 0,
    helm: 0,
    train: 0,
    where: 0,
    ltorpsChannel: [],
    ltorpsDistance: [],
    lmisslChannel: [],
    lmisslDistance: [],
    lmisslEnergy: [],
    decout: [],
    jammer: 0,
    freq: [0, 0, 0],
    items: [],
    titem: 0,
    hostile: 0,
    cantexit: 0,
    repair: 0,
    hypha: 0,
    firecntl: 0,
    destruct: 0,
    status: 1,
    cybmine: 0,
    cybskill: 0,
    cybupdate: 0,
    tick: 0,
    emulate: 0,
    minesnear: 0,
    lock: 0,
    holdcourse: 0,
    topspeed: 5,
    warncntr: 0,
    scanNames: false,
    scanHome: false,
    scanFull: false,
    msgFilter: false,
    dirty: false,
  };

  return { ...base, ...overrides };
}
