import { CommandRouterService } from '../../../src/game/commands/command-router.service';
import { FreHandlerService } from '../../../src/game/commands/handlers/fre.handler';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../src/game/commands/command.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    ...overrides,
  });
}

const ctx: CommandContext = {};

function buildRouter(): CommandRouterService {
  const handler = new FreHandlerService();
  const router = new CommandRouterService();
  router.register(handler.command);
  return router;
}

describe('fre dispatch integration', () => {
  it('missing arg returns usage message', () => {
    const router = buildRouter();
    const result = router.dispatch('fre', makeShip(), ctx) as import('../../../src/game/commands/command.types').CommandResult;
    expect(result.lines[0].text).toMatch(/Type HELP SET for the correct usage\./i);
  });

  it('fre a hail sets freq[0] and returns hail confirmation', () => {
    const router = buildRouter();
    const ship = makeShip({ freq: [5, 0, 0] });
    const result = router.dispatch('fre a hail', ship, ctx) as import('../../../src/game/commands/command.types').CommandResult;
    expect(ship.freq[0]).toBe(0);
    expect(result.lines[0].text).toMatch(/hail/i);
  });

  it('fre b 5000 sets sector-scoped frequency', () => {
    const router = buildRouter();
    const ship = makeShip({ freq: [0, 0, 0] });
    const result = router.dispatch('fre b 5000', ship, ctx) as import('../../../src/game/commands/command.types').CommandResult;
    expect(ship.freq[1]).toBe(5000);
    expect(result.lines[0].text).toMatch(/is set to\nfrequency \d+/i);
  });

  it('fre c 25000 sets galaxy-wide frequency', () => {
    const router = buildRouter();
    const ship = makeShip({ freq: [0, 0, 0] });
    const result = router.dispatch('fre c 25000', ship, ctx) as import('../../../src/game/commands/command.types').CommandResult;
    expect(ship.freq[2]).toBe(25000);
    expect(result.lines[0].text).toMatch(/set to hyperspace\npacket code \d+/i);
  });

  it('fre a 0 answers with FREQFMT, its own canon message', () => {
    const router = buildRouter();
    const ship = makeShip({ freq: [5, 0, 0] });
    const result = router.dispatch('fre a 0', ship, ctx) as import('../../../src/game/commands/command.types').CommandResult;
    expect(result.lines[0].text).toMatch(/Type HELP FREQ for the correct usage\./i);
    expect(ship.freq[0]).toBe(5);
  });

  it('fre d 1000 returns usage error (invalid channel)', () => {
    const router = buildRouter();
    const ship = makeShip();
    const result = router.dispatch('fre d 1000', ship, ctx) as import('../../../src/game/commands/command.types').CommandResult;
    expect(result.lines[0].text).toMatch(/Type HELP SET for the correct usage\./i);
  });
});
