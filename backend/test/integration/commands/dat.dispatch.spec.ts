import { CommandRouterService } from '../../../src/game/commands/command-router.service';
import { DatHandlerService } from '../../../src/game/commands/handlers/dat.handler';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../src/game/commands/command.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Alpha',
    shpclass: 1, heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

const ctx: CommandContext = {};

function buildRouter(ships: ShipState[]): CommandRouterService {
  const shipSvc = { findAllShips: () => ships } as unknown as ShipStateService;
  const prismaMock = {
    team: { findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  const handler = new DatHandlerService(shipSvc, prismaMock);
  const router = new CommandRouterService();
  router.register(handler.command);
  return router;
}

describe('dat dispatch integration', () => {
  it('missing arg returns usage message', () => {
    const router = buildRouter([]);
    const result = router.dispatch('dat', makeShip(), ctx) as import('../../../src/game/commands/command.types').CommandResult;
    expect(result.lines[0].text).toMatch(/Usage: dat/i);
  });

  it('match returns stat block with ship name in header', async () => {
    const ship = makeShip({ shipname: 'StarBird', cloak: 0 });
    const router = buildRouter([ship]);
    const result = await router.dispatch('dat star', makeShip(), ctx);
    expect(result.lines.some((l) => l.text.includes('StarBird'))).toBe(true);
  });

  it('no match returns "Ship not found."', async () => {
    const router = buildRouter([makeShip({ shipname: 'Nothing' })]);
    const result = await router.dispatch('dat zzz', makeShip(), ctx);
    expect(result.lines[0].text).toBe('Ship not found.');
  });

  it('cloaked ship returns "Ship not found."', async () => {
    const ship = makeShip({ shipname: 'Phantom', cloak: 1 });
    const router = buildRouter([ship]);
    const result = await router.dispatch('dat phan', makeShip(), ctx);
    expect(result.lines[0].text).toBe('Ship not found.');
  });
});
