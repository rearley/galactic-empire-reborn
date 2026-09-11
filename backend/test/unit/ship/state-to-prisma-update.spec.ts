import { Prisma } from '../../../src/prisma/client';
import { stateToPrismaUpdate } from '../../../src/game/ship/ship-state.mappers';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { schemaModel } from '../../helpers/schema-model';

/**
 * `stateToPrismaUpdate` destructures the in-memory-only fields off ShipState and
 * hands `...rest` straight to `prisma.ship.update`. Any field left in scope that
 * has no DB column makes the update throw — and ShipStateService.flush catches
 * and logs, so the only symptom is that ship state silently stops being
 * persisted. That is exactly what happened when `channel` was added: the
 * in-memory world kept working, every unit test passed (Prisma is mocked), and
 * only a browser test that teleported a ship and reconnected noticed the
 * position had never reached the database.
 */
describe('stateToPrismaUpdate — every key must be a real Ship column', () => {
  const shipModel = schemaModel('Ship');

  it('finds the Ship model in the Prisma schema', () => {
    expect(shipModel).toBeDefined();
  });

  it('emits no key that Postgres does not have a column for', () => {
    const columns = new Set(
      shipModel!.fields.filter((f) => f.kind === 'scalar').map((f) => f.name),
    );

    // Every field the type declares, so a newly added one is covered the moment
    // it appears — the point is to catch fields nobody remembered to exclude.
    const state = {
      userid: 'u', shipno: 1, shipname: 'S', shpclass: 1,
      heading: 0, head2b: 0, speed: 0, speed2b: 0,
      xcoord: 0, ycoord: 0, damage: 0, energy: 0,
      phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
      shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
      degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
      where: 0, ltorpsChannel: [], ltorpsDistance: [],
      lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
      decout: [], jammer: 0, freq: [0, 0, 0], items: [],
      titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
      firecntl: 0, destruct: 0, status: 0, cybmine: 0,
      cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
      minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
      scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
      dirty: true,
      channel: 7,
    } as unknown as ShipState;

    const stray = Object.keys(stateToPrismaUpdate(state)).filter((k) => !columns.has(k));
    expect(stray).toEqual([]);
  });

  it('drops the channel — it lives only while the ship is in the world', () => {
    const state = { userid: 'u', shipno: 1, channel: 7, dirty: true } as unknown as ShipState;
    expect(stateToPrismaUpdate(state)).not.toHaveProperty('channel');
  });
});
