/**
 * Audit 022 / P-002 — prismaShipToState must NOT hard-code maxTons.
 *
 * The previous mapper hard-coded `maxTons: 1000`, which silently overrode
 * the per-ShipClass maxTons set by ShipStateService.onModuleInit() whenever
 * a ship was re-hydrated through the gateway reconnect path. That allowed
 * a light fighter (real maxTons ~200) to suddenly carry 1000 tons after
 * any reconnect, or a heavy freighter (maxTons ~5000) to be downgraded.
 *
 * @see specs/022-fidelity-audit-v2/findings.md P-002
 * @see backend/src/game/ship/ship-state.mappers.ts prismaShipToState
 */
import { prismaShipToState } from '../../src/game/ship/ship-state.mappers';
import type { Ship } from '../../src/prisma/client';

function makeRow(): Ship {
  // Minimal row — only fields exercised by the mapper.
  return {
    userid: 'u', shipno: 1, shipname: 'X', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 0,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    autoShield: false, autoRepair: false,
  } as unknown as Ship;
}

describe('prismaShipToState — maxTons not hard-coded (P-002)', () => {
  it('leaves maxTons undefined so callers must set it from ShipClass', () => {
    const state = prismaShipToState(makeRow());
    // The mapper has no ShipClass context; it must NOT pretend to know maxTons.
    // Callers (ShipStateService.onModuleInit, gateway reconnect) are responsible
    // for setting it from ShipClass.maxTons.
    expect(state.maxTons).toBeUndefined();
  });
});
