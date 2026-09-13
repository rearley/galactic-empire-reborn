import { CommandRouterService } from '../../../src/game/commands/command-router.service';
import { DatHandlerService } from '../../../src/game/commands/handlers/dat.handler';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { TeamRepository } from '../../../src/game/team/team.repository';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../src/game/commands/command.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    items: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
    ...overrides,
  });
}

const ctx: CommandContext = {};

function buildRouter(ships: ShipState[]): CommandRouterService {
  const shipSvc = { findAllShips: () => ships } as unknown as ShipStateService;
  const teamsMock = {
    findNameByCode: vi.fn().mockResolvedValue(null),
  } as unknown as TeamRepository;
  const handler = new DatHandlerService(shipSvc, teamsMock);
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
