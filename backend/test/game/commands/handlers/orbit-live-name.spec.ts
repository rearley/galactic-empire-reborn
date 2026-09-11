/**
 * `orb` resolved the planet through GalaxyService, whose planet read-model
 * hydrates once at boot and is never updated. A planet claimed and named during
 * the session therefore still orbited as "(unnamed)", and the multi-planet
 * picker listed stale names too. `sca pl` was already fixed to read the live
 * PlanetStateService; `orb` was not.
 *
 * @see GECMDS.C:758 cmd_orbit
 */
import { OrbitHandlerService } from '../../../../src/game/commands/handlers/orbit.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { PlanetState } from '../../../../src/game/planet/planet-state.types';
import { CommandContext, CommandResult } from '../../../../src/game/commands/command.types';
import { NUMITEMS } from '../../../../src/game/constants/items';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'alice', shipno: 1, shipname: 'Scout', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 10.5, ycoord: 7.5, damage: 0, energy: 50000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(NUMITEMS).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  } as ShipState;
}

function planetState(overrides: Partial<PlanetState> = {}): PlanetState {
  return {
    xsect: 10, ysect: 7, plnum: 1,
    type: 1, xcoord: 10.5, ycoord: 7.5,
    userid: 'alice', name: 'New Hope',
    enviorn: 3, resource: 2, cash: 0n, debt: 0n, tax: 0n,
    taxrate: 0, warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items: Array.from({ length: NUMITEMS }, () => ({
      qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
    })),
    ...overrides,
  };
}

function makeService(planets: PlanetState[]) {
  const mockShips = { mutate: jest.fn() } as unknown as ShipStateService;
  const mockPlanets = {
    bySector: jest.fn().mockReturnValue(planets),
  } as unknown as PlanetStateService;
  return new OrbitHandlerService(mockShips, mockPlanets, { existsInSector: async () => false } as never);
}

const ctx: CommandContext = {};
const texts = (r: CommandResult): string => r.lines.map((l) => l.text).join('\n');

describe('orb — reads live planet state, not the boot snapshot', () => {
  it('names a planet renamed during this session', async () => {
    const service = makeService([planetState({ name: 'New Hope' })]);
    const r = await service.command.handler(makeShip(), [], ctx) as CommandResult;
    expect(texts(r)).toContain('New Hope');
    expect(texts(r)).not.toContain('(unnamed)');
  });

  it('uses live names in the multi-planet picker', async () => {
    const service = makeService([
      planetState({ plnum: 1, name: 'New Hope' }),
      planetState({ plnum: 2, name: 'Anchorage', xcoord: 10.9, ycoord: 7.9 }),
    ]);
    const r = await service.command.handler(makeShip(), [], ctx) as CommandResult;
    expect(texts(r)).toContain('New Hope');
    expect(texts(r)).toContain('Anchorage');
  });
});
