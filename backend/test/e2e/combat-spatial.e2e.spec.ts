/**
 * Combat spatial integration — real services, no mocks, real distances.
 *
 * WHY THIS FILE EXISTS
 *
 * Every significant combat defect found during playtesting was invisible to the
 * unit suite, and in each case the reason was the same: the test mocked or
 * pinned the very thing that was wrong.
 *
 *   - Mine blast radius was galaxy-wide (missing `* 10_000` sector->raw
 *     conversion). Every mine-sweep unit test placed the ship and the mine at
 *     IDENTICAL coordinates (100,100), so the range guard was never exercised
 *     with a non-zero distance at all.
 *   - `scan se` threw for any ship outside the generated sector grid. All 26
 *     specs touching GalaxyService stub it with a mock that never throws.
 *   - Shields granted total immunity on three weapon paths. The spec covering
 *     it was named "shields fully absorbing" but only asserted that no
 *     subsystem event fired, so it passed while documenting the wrong
 *     behaviour.
 *   - TDAMMAX/MDAMMAX exceeded their numopt ceilings. balance-regression PINNED
 *     the out-of-bounds values.
 *
 * The gap is not coverage count — it is that mocked collaborators and
 * zero-distance fixtures cannot expose spatial or integration truth. This spec
 * boots the real AppModule and asserts behaviour that depends on actual
 * distances between real entities.
 *
 * It runs in the DEFAULT suite: a full boot here costs about 9 seconds, cheap
 * enough not to need an opt-in lane.
 */

import 'reflect-metadata';
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { MineRegistry } from '../../src/game/combat/mine.registry';
import { CombatTickService } from '../../src/game/combat/combat-tick.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { MINERANGE, NUMITEMS } from '../../src/game/constants';

function makeShip(over: Partial<ShipState>): ShipState {
  return {
    userid: 'e2e', shipno: 1, shipname: 'E2E', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50_000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: -1,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 1, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...over,
  } as ShipState;
}

describe('combat spatial integration (real services, no mocks)', () => {
  let app: INestApplication;
  let ships: ShipStateService;
  let mines: MineRegistry;
  let combat: CombatTickService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    ships = app.get(ShipStateService);
    mines = app.get(MineRegistry);
    combat = app.get(CombatTickService);
  }, 30000);

  afterAll(async () => {
    await app?.close();
  }, 15000);

  /** Drive one real physics tick through the real CombatTickService. */
  function tick(): void {
    (combat as unknown as { onPhysicsTick: (c: unknown) => void }).onPhysicsTick({
      kind: 'PHYSICS', firedAt: new Date('2026-08-30T12:00:00Z'), seq: 1,
    });
  }

  it('a mine damages only ships inside MINERANGE, not the whole galaxy', () => {
    // Far away from the neutral zone (which is mine-immune) and from origin.
    const mineX = 18.5, mineY = 9.5;

    const near = makeShip({ userid: 'e2e-near', shipno: 1, shipname: 'Near', xcoord: mineX + 0.02, ycoord: mineY });
    const far = makeShip({ userid: 'e2e-far', shipno: 1, shipname: 'Far', xcoord: mineX + 3, ycoord: mineY });
    ships.loadShip(near);
    ships.loadShip(far);

    mines.add({ id: 9001, channel: 200, timer: 1, xcoord: mineX, ycoord: mineY, deployedBy: 'e2e-x' });

    tick();

    // loadShip stores the object itself, so assert on the references directly
    // (the same pattern the existing combat unit specs use).
    const nearAfter = near;
    const farAfter = far;

    // 0.02 sectors = 200 raw units, well inside MINERANGE (10 000 raw = 1 sector)
    expect(nearAfter.damage).toBeGreaterThan(0);
    // 3 sectors = 30 000 raw units — three times the blast radius
    expect(farAfter.damage).toBe(0);

    expect(MINERANGE).toBe(10_000); // guards the unit assumption above
  });

  it('shields reduce mine damage but do not prevent it', () => {
    const mineX = 12.5, mineY = 4.5;

    const bare = makeShip({
      userid: 'e2e-bare', shipno: 1, shipname: 'Bare',
      xcoord: mineX + 0.02, ycoord: mineY, shieldstat: 0, shield: 0,
    });
    const shielded = makeShip({
      userid: 'e2e-shielded', shipno: 1, shipname: 'Shielded',
      xcoord: mineX + 0.02, ycoord: mineY, shieldstat: 1, shield: 5_000, shieldtype: 10,
    });
    ships.loadShip(bare);
    ships.loadShip(shielded);

    mines.add({ id: 9002, channel: 201, timer: 1, xcoord: mineX, ycoord: mineY, deployedBy: 'e2e-x' });

    tick();

    const bareAfter = bare;
    const shieldedAfter = shielded;

    expect(shieldedAfter.damage).toBeGreaterThan(0);              // not immunity
    expect(shieldedAfter.damage).toBeLessThan(bareAfter.damage);  // but reduced by the Mark
    expect(shieldedAfter.shield).toBeLessThan(5_000);             // and charge was spent
  });
});
