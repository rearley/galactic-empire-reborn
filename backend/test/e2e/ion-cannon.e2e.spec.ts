/**
 * A planet's ion cannons fire at ships that ATTACKED it — and at nothing else.
 *
 * This started as a test for "does an AI ever invade my colony". It does not,
 * and cannot: `max_attk` (our canAttackPlanet) is read in exactly three places
 * in the original — loaded at GEMAIN.C:854, tested by the PLAYER's `att`
 * command at GECMDS.C:3522, and printed in a listing at :422. GECYBS.C and
 * GEDROIDS.C contain zero references to planets. Canon's AI hunts ships only.
 *
 * That reshaped this test. The defence that IS live is fireion, and its gate
 * is narrower than it looks:
 *
 *   if (ptr->hostile > 1) { plnum = ptr->hostile - 10; ... }
 *
 * `hostile` is set in one place — `att` (GECMDS.C:3568) — so the cannons only
 * ever shoot the ship that attacked them. A hostile AI parked in orbit is
 * never fired on, and in a world with no other players the cannons do nothing.
 * That is worth pinning precisely, because "stock ion cannons to defend the
 * colony" is the natural reading and it is wrong.
 *
 * @see GEFUNCS.C:1785-1812 fireion, GEFUNCS.C:907-930 checkdist
 */
import 'reflect-metadata';
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { ShipTickService } from '../../src/game/ship/ship-tick.service';
import { TickService } from '../../src/game/tick/tick.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../src/game/constants';
import { I_ION } from '../../src/game/constants/items';

function makeShip(over: Partial<ShipState>): ShipState {
  return {
    userid: 'ion-e2e', shipno: 1, shipname: 'Probe', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 4.5, ycoord: 3.5, damage: 0, energy: 500_000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 8, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  } as ShipState;
}

describe('ion cannons (real services, no mocks)', () => {
  let app: INestApplication;
  let ships: ShipStateService;
  let planets: PlanetStateService;
  let shipTick: ShipTickService;
  const PX = 3, PY = 3, PLNUM = 1;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    ships = app.get(ShipStateService);
    planets = app.get(PlanetStateService);
    shipTick = app.get(ShipTickService);

    // Stop the live heartbeats. Booting the real AppModule starts raw
    // setInterval timers (tick.service.ts:53-84) that keep running while this
    // suite executes, rehydrating the planet map and ticking ships underneath
    // it. That made the suite pass alone and fail in a full run — the longer
    // wall clock simply gave a timer time to fire. We drive the tick by hand
    // here, so the scheduler is not merely unnecessary, it is the race.
    app.get(TickService).onModuleDestroy();

  }, 30000);

  afterAll(async () => { await app?.close(); }, 15000);

  /**
   * Drive the real tick that owns fireIon.
   *
   * NOT processMovementTick — that one ends before the ion step. The seven
   * numbered steps, fireIon among them, live in processRestorativeTick, which
   * is subscribed to PHYSICS rather than SHIP_UPDATE (ship-tick.service.ts:96).
   * Calling the movement tick ran thirty times and invoked fireIon zero times,
   * which read exactly like the feature being stubbed.
   */
  function runTick(ship: ShipState): void {
    (shipTick as unknown as { processRestorativeTick: (s: ShipState) => void })
      .processRestorativeTick(ship);
  }

  /**
   * Our OWN planet, inserted into the live map.
   *
   * This borrowed a planet from the generated galaxy and was flaky in a full
   * run: the map was empty by the time the later cases ran, so `planets.get`
   * returned undefined. Whatever empties it, depending on galaxy state that
   * another suite can change is the wrong coupling for a test about fireIon —
   * the planet is a fixture here, and everything else (the service, the tick,
   * the damage maths) stays real.
   */
  function armedPlanet(): { xcoord: number; ycoord: number; items: Array<{ qty: bigint }> } {
    const key = `${PX}:${PY}:${PLNUM}`;
    const map = (planets as unknown as { map: Map<string, unknown> }).map;
    let p = planets.get(PX, PY, PLNUM) as unknown as { items: Array<{ qty: bigint }> } | undefined;
    if (!p) {
      p = {
        xsect: PX, ysect: PY, plnum: PLNUM, type: 2,
        xcoord: PX + 0.5, ycoord: PY + 0.5,
        userid: 'ion-owner', name: 'Testbed', enviorn: 2, resource: 2,
        cash: 0n, debt: 0n, tax: 0n, taxrate: 0, warnings: 0, password: '',
        lastattack: '', beacon: '', spyowner: '', technology: 0, teamcode: 0n,
        items: Array.from({ length: NUMITEMS }, () => ({
          qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
        })),
      } as unknown as { items: Array<{ qty: bigint }> };
      map.set(key, p);
    }
    p.items[I_ION].qty = 50n;
    return p as { xcoord: number; ycoord: number; items: Array<{ qty: bigint }> };
  }

  function orbiting(over: Partial<ShipState> = {}): ShipState {
    const p = armedPlanet();
    const s = makeShip({
      xcoord: p.xcoord, ycoord: p.ycoord,
      where: 10 + PLNUM,
      ...over,
    });
    ships.loadShip(s);
    return s;
  }

  it('has an armed planet to shoot with', () => {
    expect(Number(armedPlanet().items[I_ION].qty)).toBe(50);
  });

  it('does NOT fire on a ship merely sitting in orbit', () => {
    // The natural reading of "stock ion cannons to defend the colony" — and it
    // is wrong. Without `hostile` the cannons never look at you.
    const s = orbiting({ userid: 'peaceful', hostile: 0 });
    for (let i = 0; i < 20; i++) runTick(s);
    expect(s.damage).toBe(0);
  });

  it('does NOT fire on an AI hull in orbit, however hostile it looks', () => {
    // Canon's AI never attacks a planet (GECYBS.C and GEDROIDS.C have no
    // planet references at all), so it can never set `hostile` and can never
    // draw fire. A colony cannot defend itself against AI because AI is not a
    // threat to it in the first place.
    const s = orbiting({ userid: 'Cybrg-999', status: 2, hostile: 0 });
    for (let i = 0; i < 20; i++) runTick(s);
    expect(s.damage).toBe(0);
  });

  it('DOES fire on the ship that attacked it', () => {
    // `att` sets hostile = where (GECMDS.C:3568), which is 10 + plnum.
    const s = orbiting({ userid: 'raider', hostile: 10 + PLNUM });
    for (let i = 0; i < 20; i++) runTick(s);
    expect(s.damage).toBeGreaterThan(0);
  });

  it('credits the kill to nobody — a planet is not an attacker', () => {
    const s = orbiting({ userid: 'raider2', hostile: 10 + PLNUM, lastfired: 7 });
    for (let i = 0; i < 5; i++) runTick(s);
    // `ptr->lastfired = -1` (GEFUNCS.C:1797): the ship-loss mail must not name
    // whoever shot you last before the colony finished the job.
    expect(s.lastfired).toBe(-1);
    expect(s.lastfiredBy).toBeUndefined();
  });

  it('stops once the raider pulls away — checkdist drops the mark', () => {
    const p = armedPlanet();
    const s = orbiting({ userid: 'fleeing', hostile: 10 + PLNUM });
    // More than HOSTILE_RANGE (1000 raw = 0.1 sectors) away, but still in the
    // SAME sector: fireIon looks the planet up by floor(coord), so a ship that
    // leaves the sector fails the lookup and returns BEFORE the checkdist
    // clear — hostile then stays set until it comes back. Canon does the same,
    // getplanetdat being keyed on the current sector, so this tests the
    // in-sector withdrawal that checkdist is actually written for.
    const base = Math.floor(p.xcoord);
    const frac = p.xcoord - base;
    s.xcoord = base + (frac > 0.5 ? frac - 0.3 : frac + 0.3);
    runTick(s);
    expect(s.hostile).toBe(0);
    const dmg = s.damage;
    for (let i = 0; i < 10; i++) runTick(s);
    expect(s.damage).toBe(dmg);
  });

  it('a raider with shields up takes a scratch instead of a killing blow', () => {
    const bare = orbiting({ userid: 'bare', hostile: 10 + PLNUM, shieldstat: 0 });
    const guarded = orbiting({
      userid: 'guarded', shipno: 2, hostile: 10 + PLNUM,
      shieldstat: 1, shield: 50, shieldtype: 1,
    });
    // ONE hit each. Over many ticks the guarded ship's shield BLOWS, after
    // which it takes full damage too and the two converge — which made this
    // an RNG coin-flip that passed alone and failed in a full run. A single
    // exchange keeps the ranges disjoint: bare takes IDAMMAX x (0.5..1.0),
    // shielded takes IDAMMAX x (0..0.15). @see ion-cannon.ts
    runTick(bare);
    runTick(guarded);
    expect(bare.damage).toBeGreaterThan(guarded.damage);
  });
});
