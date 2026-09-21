/**
 * The four decisions inside `cyb_lives` that decide whether a player keeps
 * their ship: the break-off roll, the hyperspace/normal-space split, the
 * neutral-zone gate on firing, and the claim rules in `cyb_check_lockon`.
 *
 * All of these already have unit tests for their HELPERS — `pickPursuitBand`,
 * `canPursue`, `notClaimed` and `cybFireHyperPhaser` are each pinned in their
 * own spec. None of those tests goes through the code that decides whether the
 * helper is reached at all, which is exactly the gap docs/TEST_STRATEGY.md
 * describes ("test the caller's arithmetic, not the function's"). Every case
 * below therefore enters at `runEngagementScan` or `cybCheckLockon` — the two
 * bodies `cyb_lives` calls — and asserts the resulting ship state.
 *
 * What each branch costs if it is wrong:
 *
 *  - **Break-off** (GECYBS.C:255). `isquad(ptr)` is
 *    `tough_factor == CYB_TOUGH_1`, so it is the CYBERQUADS that occasionally
 *    take a breather; a light Scout never does. The port once had this test
 *    inverted, which made Base Stars relentless and Scouts flaky — the
 *    difference between a survivable galaxy and an unsurvivable one.
 *  - **The where-split** (GECYBS.C:263-284). Canon is
 *    `if (ptr->where==1 && wptr->where==1 && gebemean) firehp; else if
 *    (ptr->where==0 && wptr->where!=1) cyb_attack`. Nothing connects across
 *    the two states: a Cybertron in normal space cannot touch a ship in
 *    hyperspace and vice versa. Get this wrong in either direction and either
 *    hyperwarp stops being an escape or it becomes an invulnerability.
 *  - **Neutral zone** (GECYBS.C:250 `!neutral(&ptr->coord)`, and for the
 *    victim GECMDS.C:1047 inside `firehp`). Sector (0,0) is where a new pilot
 *    is told they are safe.
 *  - **Claim rules** (GECYBS.C:678-731). `notclaimed` reads the PREY's
 *    `noclaim`, so it is the gang-up cap that keeps four Cybertrons off one
 *    Interceptor; `lta <= wptr->shpclass` is the hunter's floor; a cloaked
 *    target is held, not dropped, for a few passes.
 *
 * Randomness is fixed rather than seeded so each case names the draw it
 * depends on: `fixedRandom(0)` makes every `gernd()%n == 0` test succeed and
 * every `== 1` test fail, `fixedRandom(0.99)` does the reverse for the `%n==0`
 * rolls. The draw ORDER is stated in each test that has more than one.
 *
 * @see GECYBS.C:198 cyb_lives, :236-319 the engagement scan, :649 cyb_check_lockon
 * @see docs/TEST_STRATEGY.md — the filter, and "test the caller's arithmetic"
 */

import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import type { ShipClassEntry } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Random } from '../../../src/game/combat/random.port';
import { provoke } from '../../../src/game/cybertron/cyb-transitions';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';
import { FIRETICKS, GESTAT_AUTO } from '../../../src/game/constants';
import { makeShip as buildShip } from '../../helpers/make-ship';
import type { Mock } from 'vitest';

/** Class numbers used by the harness. Only the fields the tick reads are set. */
const CLASS_INTERCEPTOR = 1;
const CLASS_SCOUT = 21;
const CLASS_QUAD = 24;
/** A hunter whose `lowest_to_attk` floor excludes the small hulls. */
const CLASS_PICKY_HUNTER = 25;

const TOP_SPEED = 8_000;

// Local defaults layered on the shared factory: this suite's ships are
// Cybertron-shaped — a fitted phaser and Mk-1 shield, a full torpedo rack
// (channel 255 = empty slot), full item table, `cybmine` at the AI's "no
// current target" sentinel (255), and a canon-scale topspeed (8 = warp 8).
function makeShip(over: Partial<ShipState> = {}): ShipState {
  return buildShip({
    shipname: 'S',
    shpclass: CLASS_INTERCEPTOR,
    xcoord: 5,
    ycoord: 5,
    energy: 50_000,
    phasr: 100,
    phasrtype: 2,
    shieldtype: 1,
    ltorpsChannel: [255, 255, 255],
    ltorpsDistance: [0, 0, 0],
    items: Array.from({ length: NUMITEMS }, () => 0n),
    cybmine: 255,
    cybskill: 5,
    topspeed: 8,
    userKills: 0,
    ...over,
  });
}

/** An active player hull, channel-addressed the way `cybmine` addresses it. */
function player(channel: number, over: Partial<ShipState> = {}): ShipState {
  return makeShip({
    userid: `p${channel}`, shipno: channel, channel, shipname: `Player${channel}`,
    shpclass: CLASS_INTERCEPTOR, status: 1, ...over,
  } as Partial<ShipState>);
}

/** A Cybertron hull. `heading: 0` keeps absolute and relative bearings equal. */
function cybertron(shpclass: number, over: Partial<ShipState> = {}): ShipState {
  return makeShip({
    userid: 'Cybrg-201', shipno: 201, channel: 201, shipname: 'Cybertron 1',
    shpclass, status: GESTAT_AUTO, heading: 0, topspeed: 8, ...over,
  } as Partial<ShipState>);
}

function classEntry(over: Partial<ShipClassEntry>): ShipClassEntry {
  return {
    maxAcceleration: 1200, maxWarp: 8, maxPhaser: 2, maxShields: 2,
    scanRange: 100_000, maxTons: 900, hasTorpedo: false, hasMissile: false,
    hasJammer: false, hasMine: false, hasZipper: false, hasCloak: false,
    hasDecoy: false, noClaim: 1, tough: 0, cybLowestClassAttacks: 0,
    cybCanAttack: false, points: 50, canAttackPlanet: false, damageFactor: 100,
    typeName: 'harness', category: 'CPU_COMBATIVE', shipNameTemplate: 'Cybertron ',
    ...over,
  } as unknown as ShipClassEntry;
}

/**
 * `cybCanAttack` is deliberately FALSE for the player class here. Canon's
 * `shipclass[wptr->shpclass].cybs_can_att` short-circuits the range test
 * (GECYBS.C:271, :291), so a class carrying it is engaged at any distance and
 * the range branch these tests are about would never be reached.
 */
const CLASSES: Record<number, ShipClassEntry> = {
  [CLASS_INTERCEPTOR]: classEntry({ maxTons: 100, noClaim: 1, typeName: 'Interceptor' }),
  [CLASS_SCOUT]: classEntry({ tough: 0, cybLowestClassAttacks: 0, typeName: 'Cybertron Scout' }),
  [CLASS_QUAD]: classEntry({ tough: 1, cybLowestClassAttacks: 0, typeName: 'Cyberquad' }),
  [CLASS_PICKY_HUNTER]: classEntry({ tough: 0, cybLowestClassAttacks: 6, typeName: 'Cyber Base' }),
};

function fixedRandom(value: number): Random {
  return { next: () => value } as unknown as Random;
}

const CTX: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };

interface Harness {
  svc: CybertronTickService;
  flush: Mock;
}

function harness(ships: ShipState[], rand: Random): Harness {
  const shipState = {
    findAllShips: () => ships,
    findByUserid: () => [],
    get: (userid: string, shipno: number) =>
      ships.find((s) => s.userid === userid && s.shipno === shipno),
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = ships.find((x) => x.userid === userid && x.shipno === shipno);
      if (s) { fn(s); s.dirty = true; }
      return s;
    },
    loadShip: () => {}, removeFromGame: () => {}, size: () => ships.length,
  } as unknown as ShipStateService;

  const classCache = {
    get: (c: number) => CLASSES[c],
    getCategory: (c: number) => CLASSES[c]?.category,
    getMaxTons: (c: number) => CLASSES[c]?.maxTons ?? 100,
    getMaxShields: (c: number) => CLASSES[c]?.maxShields ?? 1,
    getScanRange: (c: number) => CLASSES[c]?.scanRange ?? 100_000,
    getTypeName: (c: number) => CLASSES[c]?.typeName ?? '',
  } as unknown as ShipClassCacheService;

  const flush = vi.fn();
  const svc = new CybertronTickService(
    { subscribe: () => () => {} } as unknown as TickService,
    shipState,
    classCache,
    {
      hydrateAll: vi.fn().mockResolvedValue(undefined),
      clampCybertronCash: (n: bigint) => n,
      flushShipsImmediate: flush,
      incrementKills: vi.fn(),
    } as unknown as CybertronRepository,
    new EventEmitter2(),
    rand,
  );
  return { svc, flush };
}

function scan(svc: CybertronTickService, ship: ShipState): void {
  ((svc as unknown as { brain: unknown }).brain as {
    runEngagementScan: (s: ShipState, top: number, c: TickContext) => void;
  }).runEngagementScan(ship, TOP_SPEED, CTX);
}

function lockon(svc: CybertronTickService, ship: ShipState): void {
  ((svc as unknown as { brain: unknown }).brain as {
    cybCheckLockon: (s: ShipState, top: number, c: TickContext) => void;
  }).cybCheckLockon(ship, TOP_SPEED, CTX);
}

describe('the break-off roll belongs to the Cyberquads (GECYBS.C:255 isquad)', () => {
  // Both cases sit 2.0 sectors out (ddist 20,000), well beyond
  // `tooclose + rndm(tooclose)`, so the engagement branch declines to attack
  // and the ONLY thing that can move `cybmine` is the break-off.
  it('a Cyberquad that rolls zero drops its claim and settles to top speed', () => {
    const quad = cybertron(CLASS_QUAD, { xcoord: 5, ycoord: 5, cybmine: 9, speed2b: 1_234 });
    const prey = player(9, { xcoord: 7, ycoord: 5 });
    const { svc } = harness([quad, prey], fixedRandom(0));

    // Draw 1 is `gernd()%CYB_BREAKOFF`; 0 breaks off.
    scan(svc, quad);

    expect(quad.cybmine).toBe(255);
    expect(quad.speed2b).toBe(TOP_SPEED);
  });

  it('an ordinary Scout keeps its claim however the dice fall', () => {
    // `isquad(ptr) && gernd()%CYB_BREAKOFF == 0` — the class test comes first,
    // so a tough_factor of 0 never even rolls. Same all-zero generator as
    // above: if the port ever re-inverts this test, this case fails.
    const scout = cybertron(CLASS_SCOUT, { xcoord: 5, ycoord: 5, cybmine: 9, speed2b: 1_234 });
    const prey = player(9, { xcoord: 7, ycoord: 5 });
    const { svc } = harness([scout, prey], fixedRandom(0));

    scan(svc, scout);

    expect(scout.cybmine).toBe(9);
    expect(scout.speed2b).toBe(1_234);
  });
});

describe('hyperspace and normal space are separate fights (GECYBS.C:263-284)', () => {
  it('both in hyperspace: the hyper-phaser goes through raised shields to the hull', () => {
    // Draw 1 gebemean (`gernd()%CYBSLO == 0` → mean), draw 2 the
    // `rndm(tooclose)` widening. 0.05 sectors apart on the +x axis with the
    // attacker heading 0, so the target sits dead centre of the 5-degree beam.
    const cyb = cybertron(CLASS_SCOUT, { xcoord: 5.95, ycoord: 5.5, where: 1 });
    const victim = player(2, {
      xcoord: 6.0, ycoord: 5.5, where: 1, shieldstat: 1, shield: 100,
    });
    // Zero for the two draws above; 0.99 after, so firehp's own randamage roll
    // (GECMDS.C:1082) comes up empty and cannot touch the shield this test is
    // about.
    let draw = 0;
    const { svc } = harness([cyb, victim], { next: () => (draw++ < 2 ? 0 : 0.99) } as Random);

    scan(svc, cyb);

    // `wptr->damage += damage` with no shieldhit anywhere in firehp
    // (GECMDS.C:1071-1081) — the shield bank is untouched and does not absorb.
    expect(victim.damage).toBeGreaterThan(0);
    expect(victim.shield).toBe(100);
    expect(victim.shieldstat).toBe(1);
    expect(victim.cantexit).toBe(FIRETICKS);
    expect(cyb.cantexit).toBe(FIRETICKS);
  });

  it('a Cybertron in normal space cannot touch a target that has gone to hyperspace', () => {
    // `else if (ptr->where == 0 && wptr->where != 1)` — the second condition
    // fails, so neither branch runs. Nothing is aimed and nothing is fired:
    // this is what makes hyperwarp an escape.
    const cyb = cybertron(CLASS_SCOUT, { xcoord: 5.95, ycoord: 5.5, where: 0, head2b: 123 });
    const runner = player(2, { xcoord: 6.0, ycoord: 5.5, where: 1 });
    const { svc } = harness([cyb, runner], fixedRandom(0));

    scan(svc, cyb);

    expect(runner.damage).toBe(0);
    expect(runner.cantexit).toBe(0);
    expect(cyb.head2b).toBe(123); // never even turned toward it
  });

  it('a Cybertron in hyperspace ignores a ship sitting in normal space', () => {
    // The mirror case: the first branch needs BOTH ships at where 1 and the
    // second needs the Cybertron at where 0, so a pursuer still in hyperwarp
    // cannot shoot something that has already dropped out.
    const cyb = cybertron(CLASS_SCOUT, { xcoord: 5.95, ycoord: 5.5, where: 1, head2b: 123 });
    const sitting = player(2, { xcoord: 6.0, ycoord: 5.5, where: 0 });
    const { svc } = harness([cyb, sitting], fixedRandom(0));

    scan(svc, cyb);

    expect(sitting.damage).toBe(0);
    expect(sitting.cantexit).toBe(0);
    expect(cyb.head2b).toBe(123);
  });
});

describe('the neutral zone stops the shot, both ends (GECYBS.C:250, GECMDS.C:1047)', () => {
  it('a Cybertron standing inside sector (0,0) engages nobody', () => {
    // Identical geometry to the hyper-phaser case above — 0.05 sectors, dead
    // ahead, both in hyperspace — shifted so the ATTACKER is at x 0.95, which
    // floors to sector 0. `!neutral(&ptr->coord)` gates the whole scan.
    const cyb = cybertron(CLASS_SCOUT, { xcoord: 0.95, ycoord: 0.5, where: 1 });
    const victim = player(2, { xcoord: 1.0, ycoord: 0.5, where: 1 });
    const { svc } = harness([cyb, victim], fixedRandom(0));

    scan(svc, cyb);

    expect(victim.damage).toBe(0);
    expect(victim.cantexit).toBe(0);
  });

  it('a ship inside sector (0,0) takes nothing from a Cybertron outside it', () => {
    // Attacker at x -0.05 floors to sector -1, so it is NOT protected itself;
    // the victim at x 0.0 is. Canon reaches the same answer twice over — the
    // port skips the candidate in the scan loop, and canon's `firehp` skips it
    // at GECMDS.C:1047 with `!neutral(&wptr->coord)`.
    const cyb = cybertron(CLASS_SCOUT, { xcoord: -0.05, ycoord: 0.5, where: 1 });
    const victim = player(2, { xcoord: 0.0, ycoord: 0.5, where: 1 });
    const { svc } = harness([cyb, victim], fixedRandom(0));

    scan(svc, cyb);

    expect(victim.damage).toBe(0);
    expect(victim.cantexit).toBe(0);
  });
});

describe('who a Cybertron is allowed to claim (GECYBS.C:678-731)', () => {
  it('claims the nearest eligible player', () => {
    // Baseline. 0.99 fails every `%n == 0` roll and every `%n == 1` roll, so
    // no taunt fires and nothing random moves the claim.
    const cyb = cybertron(CLASS_SCOUT, { xcoord: 10, ycoord: 10, cybmine: 255 });
    const near = player(2, { xcoord: 11, ycoord: 10 });
    const far = player(3, { xcoord: 15, ycoord: 10 });
    const { svc } = harness([cyb, near, far], fixedRandom(0.99));

    lockon(svc, cyb);

    expect(cyb.cybmine).toBe(2);
  });

  it('will not claim a class beneath its own lowest_to_attk floor', () => {
    // `if (lta <= wptr->shpclass && notclaimed(...))` — GECYBS.C:719. A hunter
    // whose floor is 6 passes over an Interceptor entirely, which is the rule
    // that keeps the heavy CPU classes off beginner hulls. With no eligible
    // target canon cools off: `ptr->tick = 255; ptr->cybmine = 255;` (:733).
    const cyb = cybertron(CLASS_PICKY_HUNTER, { xcoord: 10, ycoord: 10, cybmine: 255, tick: 3 });
    const rookie = player(2, { xcoord: 11, ycoord: 10 });
    const { svc } = harness([cyb, rookie], fixedRandom(0.99));

    lockon(svc, cyb);

    expect(cyb.cybmine).toBe(255);
    expect(cyb.tick).toBe(255);
  });

  it('passes over a player already claimed by as many Cybertrons as their Cyb# allows', () => {
    // `return (nc < shipclass[victim].noclaim)` — the cap is the PREY's, and
    // the Interceptor's is 1. One Cybertron already holds channel 2, so the
    // second finds nobody to hunt rather than piling on. This is the gang-up
    // cap; without it a new pilot is swarmed.
    const hunter = cybertron(CLASS_SCOUT, { xcoord: 10, ycoord: 10, cybmine: 255, tick: 3 });
    const holder = cybertron(CLASS_SCOUT, {
      userid: 'Cybrg-202', shipno: 202, channel: 202, xcoord: 40, ycoord: 40, cybmine: 2,
    });
    const prey = player(2, { xcoord: 11, ycoord: 10 });
    const { svc } = harness([hunter, holder, prey], fixedRandom(0.99));

    lockon(svc, hunter);

    expect(hunter.cybmine).toBe(255);
    expect(hunter.tick).toBe(255);
  });
});

describe('releasing or holding an existing claim (GECYBS.C:682-706)', () => {
  it('a claim on a ship that has left the game is released, and the pass ends there', () => {
    // `if (!ingegame(zothusn)) { cybmine = 255; speed2b = rndm(d_topspeed);
    //  return; }` — canon RETURNS, so no new target is acquired on this pass
    // even though one is sitting a sector away, and the Cybertron cruises at a
    // random fraction of top speed rather than sprinting.
    const cyb = cybertron(CLASS_SCOUT, { xcoord: 10, ycoord: 10, cybmine: 77 });
    const bystander = player(2, { xcoord: 11, ycoord: 10 });
    const { svc } = harness([cyb, bystander], fixedRandom(0.99));

    lockon(svc, cyb);

    expect(cyb.cybmine).toBe(255);
    expect(cyb.speed2b).toBeCloseTo(0.99 * TOP_SPEED, 6);
  });

  /**
   * #64. The port hands out the LOWEST free channel, so a pilot who boards
   * straight after another leaves inherits their number — and, until now, any
   * Cybertron claim on it. The claim then hunted the newcomer, who had done
   * nothing, and counted against their gang-up limit. Canon keys claims by
   * terminal line too, but its own release says what a claim is for:
   *   GECYBS.C:684 `if (!ingegame(zothusn))`
   * — the pilot who was claimed has left. A claim now remembers WHO it is on,
   * and a channel held by somebody else reads as exactly that departure: the
   * full target-left release, with its cruise re-roll, on the holder's own turn.
   * @see docs/DECISIONS.md 2026-09-21
   */
  it('a claim does not pass to a newcomer who inherits the claimed pilot\'s channel', () => {
    const cyb = cybertron(CLASS_SCOUT, { xcoord: 10, ycoord: 10, cybmine: 255 });
    const claimed = player(2, { xcoord: 11, ycoord: 10 });
    const ships = [cyb, claimed];
    const { svc } = harness(ships, fixedRandom(0.99));

    lockon(svc, cyb);
    expect(cyb.cybmine).toBe(2);

    // The claimed pilot logs out; a newcomer boards and is handed channel 2.
    ships.splice(ships.indexOf(claimed), 1);
    const newcomer = player(9, { userid: 'p9', shipno: 9, channel: 2, xcoord: 11, ycoord: 10 });
    ships.push(newcomer);

    lockon(svc, cyb);

    expect(cyb.cybmine).toBe(255);
    expect(cyb.speed2b).toBeCloseTo(0.99 * TOP_SPEED, 6);
  });

  it('a claim a pilot earned by shooting is likewise theirs, not their channel\'s', () => {
    const cyb = cybertron(CLASS_SCOUT, { xcoord: 10, ycoord: 10, cybmine: 255 });
    const shooter = player(2, { xcoord: 11, ycoord: 10 });
    const ships = [cyb, shooter];
    const { svc } = harness(ships, fixedRandom(0.99));
    provoke(cyb, shooter);
    expect(cyb.cybmine).toBe(2);

    ships.splice(ships.indexOf(shooter), 1);
    ships.push(player(9, { userid: 'p9', shipno: 9, channel: 2, xcoord: 11, ycoord: 10 }));
    lockon(svc, cyb);

    expect(cyb.cybmine).toBe(255);
  });

  it('a cloaked target is held, not dropped — the Cybertron sits on the spot', () => {
    // `holdcourse = gernd()%5+5` then `if (gernd()%10 == 0) cybmine = 255`.
    // At 0.99 the give-up roll is 9, so the claim survives: cloaking buys
    // distance, not release. holdcourse 9 = floor(0.99*5)+5.
    const cyb = cybertron(CLASS_SCOUT, { xcoord: 10, ycoord: 10, cybmine: 2 });
    const ghost = player(2, { xcoord: 11, ycoord: 10, cloak: 10 });
    const { svc } = harness([cyb, ghost], fixedRandom(0.99));

    lockon(svc, cyb);

    expect(cyb.cybmine).toBe(2);
    expect(cyb.holdcourse).toBe(9);
  });

  it('and is given up on the 1-in-10 pass', () => {
    // Same branch, the other side of `gernd()%10 == 0`.
    const cyb = cybertron(CLASS_SCOUT, { xcoord: 10, ycoord: 10, cybmine: 2 });
    const ghost = player(2, { xcoord: 11, ycoord: 10, cloak: 10 });
    const { svc } = harness([cyb, ghost], fixedRandom(0));

    lockon(svc, cyb);

    expect(cyb.cybmine).toBe(255);
    expect(cyb.holdcourse).toBe(5);
  });
});
