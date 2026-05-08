import { CommandRouterService } from '../../../src/game/commands/command-router.service';
import { WhoHandlerService } from '../../../src/game/commands/handlers/who.handler';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
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
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
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
    expect(result.lines[0].text).toMatch(/unknown command/i);
  });

  it('who with two registry ships returns header + 2 info rows', async () => {
    const ship1 = makeShip({ userid: 'u1', shipno: 1, shipname: 'Alpha', cloak: 0 });
    const ship2 = makeShip({ userid: 'u2', shipno: 2, shipname: 'Beta', cloak: 0 });
    const router = buildRouter([ship1, ship2]);
    const result = await router.dispatch('who', ship1, ctx);
    const info = result.lines.filter((l) => l.category === 'info');
    expect(info).toHaveLength(2);
  });

  it('who excludes cloaked ship from results', async () => {
    const visible = makeShip({ userid: 'u1', shipno: 1, shipname: 'Visible', cloak: 0 });
    const ghost = makeShip({ userid: 'u2', shipno: 2, shipname: 'Ghost', cloak: 1 });
    const router = buildRouter([visible, ghost]);
    const result = await router.dispatch('who', visible, ctx);
    expect(result.lines.some((l) => l.text.includes('Ghost'))).toBe(false);
  });
});
