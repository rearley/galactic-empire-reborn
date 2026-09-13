import { CommandRouterService } from '../../../src/game/commands/command-router.service';
import { WhoHandlerService } from '../../../src/game/commands/handlers/who.handler';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../src/game/commands/command.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    ...overrides,
  });
}

const ctx: CommandContext = {};

function buildRouter(ships: ShipState[]): CommandRouterService {
  const shipSvc = { findAllShips: () => ships } as unknown as ShipStateService;
  const handler = new WhoHandlerService(shipSvc);
  const router = new CommandRouterService();
  router.register(handler.command);
  return router;
}

describe('who dispatch integration', () => {
  it('unknown keyword falls through to UNKNOWN_CMD', () => {
    const router = buildRouter([]);
    const result = router.dispatch('xyz', makeShip(), ctx) as import('../../../src/game/commands/command.types').CommandResult;
    expect(result.lines[0].text).toMatch(/Sorry Sir, I don't understand the command!/i);
  });

  it('who with two registry ships returns header + 2 info rows', async () => {
    const ship1 = makeShip({ userid: 'u1', shipno: 1, shipname: 'Alpha', cloak: 0 });
    const ship2 = makeShip({ userid: 'u2', shipno: 2, shipname: 'Beta', cloak: 0 });
    const router = buildRouter([ship1, ship2]);
    const result = await router.dispatch('who', ship1, ctx);
    const info = result.lines.filter((l) => l.category === 'info');
    expect(info).toHaveLength(2);
  });

  // Full cloak only — C's listings gate on `cloak < 10` (GECMDS.C:1511), so a
  // ship still spinning its cloak up (1, 2) remains visible.
  it('who excludes fully-cloaked ship from results', async () => {
    const visible = makeShip({ userid: 'u1', shipno: 1, shipname: 'Visible', cloak: 0 });
    const ghost = makeShip({ userid: 'u2', shipno: 2, shipname: 'Ghost', cloak: 10 });
    const router = buildRouter([visible, ghost]);
    const result = await router.dispatch('who', visible, ctx);
    expect(result.lines.some((l) => l.text.includes('Ghost'))).toBe(false);
  });
});
