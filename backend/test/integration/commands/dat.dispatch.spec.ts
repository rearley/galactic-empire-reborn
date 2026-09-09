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

/**
 * Routed end-to-end, `dat` is about the caller and nobody else.
 * @see src/game/commands/handlers/dat.handler.ts
 */
describe('dat dispatch integration', () => {
  it('bare `dat` reports the ship the caller is flying', async () => {
    const me = makeShip({ shipname: 'StarBird' });
    const result = await buildRouter([me]).dispatch('dat', me, ctx);
    expect(result.lines.some((l) => l.text.includes('StarBird'))).toBe(true);
  });

  it('`dat <name>` does not scout — it redirects to sca sh', async () => {
    const me = makeShip({ userid: 'u1', shipname: 'Alpha' });
    const them = makeShip({ userid: 'u2', shipname: 'StarBird' });
    const result = await buildRouter([me, them]).dispatch('dat star', me, ctx);
    const text = result.lines.map((l) => l.text).join('\n');
    expect(text).not.toContain('StarBird');
    expect(text).toMatch(/sca sh/);
  });

  it('a cloaked stranger is no more visible than an uncloaked one', async () => {
    const me = makeShip({ userid: 'u1', shipname: 'Alpha' });
    const ghost = makeShip({ userid: 'u2', shipname: 'Phantom', cloak: 1 });
    const result = await buildRouter([me, ghost]).dispatch('dat phan', me, ctx);
    expect(result.lines.map((l) => l.text).join('\n')).not.toContain('Phantom');
  });
});
