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
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'alice',
    shipname: 'Scout',
    xcoord: 10.5,
    ycoord: 7.5,
    energy: 50000,
    items: Array(NUMITEMS).fill(0n) as bigint[],
    status: 0,
    ...overrides,
  });
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
