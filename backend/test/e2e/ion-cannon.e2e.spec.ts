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
  let armedPlnum: number | null = null;
  let px = 0, py = 0;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    ships = app.get(ShipStateService);
    planets = app.get(PlanetStateService);
    shipTick = app.get(ShipTickService);

    // Arm a real planet from the generated galaxy — no fixture stand-in, so the
    // lookup fireIon does (by sector + plnum) is the one under test.
    for (let x = 1; x <= 6 && armedPlnum === null; x++) {
      for (let y = 1; y <= 6 && armedPlnum === null; y++) {
        for (let n = 1; n <= 4; n++) {
          const p = planets.get(x, y, n);
          if (p) {
            p.items[I_ION].qty = 50n;
            armedPlnum = n; px = x; py = y;
            break;
          }
        }
      }
    }
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

  function orbiting(over: Partial<ShipState> = {}): ShipState {
    const p = planets.get(px, py, armedPlnum!)!;
    const s = makeShip({
      xcoord: p.xcoord, ycoord: p.ycoord,
      where: 10 + armedPlnum!,
      ...over,
    });
    ships.loadShip(s);
    return s;
  }

  it('found a planet to arm', () => {
    expect(armedPlnum).not.toBeNull();
    expect(Number(planets.get(px, py, armedPlnum!)!.items[I_ION].qty)).toBe(50);
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
    const s = orbiting({ userid: 'raider', hostile: 10 + armedPlnum! });
    for (let i = 0; i < 20; i++) runTick(s);
    expect(s.damage).toBeGreaterThan(0);
  });

  it('credits the kill to nobody — a planet is not an attacker', () => {
    const s = orbiting({ userid: 'raider2', hostile: 10 + armedPlnum!, lastfired: 7 });
    for (let i = 0; i < 5; i++) runTick(s);
    // `ptr->lastfired = -1` (GEFUNCS.C:1797): the ship-loss mail must not name
    // whoever shot you last before the colony finished the job.
    expect(s.lastfired).toBe(-1);
    expect(s.lastfiredBy).toBeUndefined();
  });

  it('stops once the raider pulls away — checkdist drops the mark', () => {
    const p = planets.get(px, py, armedPlnum!)!;
    const s = orbiting({ userid: 'fleeing', hostile: 10 + armedPlnum! });
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
    const bare = orbiting({ userid: 'bare', hostile: 10 + armedPlnum!, shieldstat: 0 });
    const guarded = orbiting({
      userid: 'guarded', shipno: 2, hostile: 10 + armedPlnum!,
      shieldstat: 1, shield: 50, shieldtype: 1,
    });
    for (let i = 0; i < 30; i++) { runTick(bare); runTick(guarded); }
    expect(bare.damage).toBeGreaterThan(guarded.damage);
  });
});
