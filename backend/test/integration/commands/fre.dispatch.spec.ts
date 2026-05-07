import { CommandRouterService } from '../../../src/game/commands/command-router.service';
import { FreHandlerService } from '../../../src/game/commands/handlers/fre.handler';
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
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false,
    dirty: false,
    ...overrides,
  };
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
    expect(result.lines[0].text).toMatch(/Usage: fre/i);
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
    expect(result.lines[0].text).toMatch(/sector-scoped/i);
  });

  it('fre c 25000 sets galaxy-wide frequency', () => {
    const router = buildRouter();
    const ship = makeShip({ freq: [0, 0, 0] });
    const result = router.dispatch('fre c 25000', ship, ctx) as import('../../../src/game/commands/command.types').CommandResult;
    expect(ship.freq[2]).toBe(25000);
    expect(result.lines[0].text).toMatch(/galaxy-wide/i);
  });

  it('fre a 0 returns usage error', () => {
    const router = buildRouter();
    const ship = makeShip({ freq: [5, 0, 0] });
    const result = router.dispatch('fre a 0', ship, ctx) as import('../../../src/game/commands/command.types').CommandResult;
    expect(result.lines[0].text).toMatch(/Usage: fre/i);
    expect(ship.freq[0]).toBe(5);
  });

  it('fre d 1000 returns usage error (invalid channel)', () => {
    const router = buildRouter();
    const ship = makeShip();
    const result = router.dispatch('fre d 1000', ship, ctx) as import('../../../src/game/commands/command.types').CommandResult;
    expect(result.lines[0].text).toMatch(/Usage: fre/i);
  });
});
