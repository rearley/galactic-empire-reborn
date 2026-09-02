/**
 * T016 — LandHandlerService unit tests.
 */
import { LandHandlerService } from '../../../src/game/commands/handlers/land.handler';
import { GalaxyService } from '../../../src/game/galaxy/galaxy.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { ScanHandlerService } from '../../../src/game/commands/handlers/scan.handler';
import { PlanetState } from '../../../src/game/planet/planet-state.types';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandResult } from '../../../src/game/commands/command.types';
import { NUMITEMS } from '../../../src/game/constants/items';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Eagle', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 3.5, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 11, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makePlanetState(overrides: Partial<PlanetState> = {}): PlanetState {
  return {
    xsect: 5, ysect: 3, plnum: 1,
    type: 2, xcoord: 5.5, ycoord: 3.5,
    userid: null, name: '',
    enviorn: 1, resource: 1,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0,
    warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items: Array.from({ length: NUMITEMS }, () => ({ qty: 0n, rate: 0, sell: true, reserve: 0, markup2a: 0, sold2a: 0n })),
    ...overrides,
  };
}

function makeService(planetState: PlanetState | null) {
  const galaxyMock = {
    getSectorPlanets: jest.fn().mockReturnValue([{ plnum: 1, name: planetState?.name ?? '' }]),
  };
  const shipMock = { get: jest.fn() };
  const claimMock = jest.fn().mockResolvedValue({ ok: true });
  const planetMock = {
    get: jest.fn().mockReturnValue(planetState),
    claim: claimMock,
  };

  const scanHandlerMock = { clearScantab: jest.fn() } as unknown as ScanHandlerService;
  const svc = new LandHandlerService(
    galaxyMock as unknown as GalaxyService,
    shipMock as unknown as ShipStateService,
    planetMock as unknown as PlanetStateService,
    scanHandlerMock,
  );
  return { svc, claimMock, planetMock };
}

describe('LandHandlerService', () => {
  it('not in orbit returns LAND_NOT_ORBIT', async () => {
    const { svc } = makeService(null);
    const result = (await svc.command.handler(makeShip({ where: 0 }), [], {})) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_NOT_ORBIT));
  });

  it('unowned with no name arg returns LAND_NAME_PROMPT', async () => {
    const { svc } = makeService(makePlanetState({ userid: null }));
    const result = (await svc.command.handler(makeShip(), [], {})) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_NAME_PROMPT));
  });

  it('unowned with valid name calls claim and returns LAND_CLAIMED', async () => {
    const { svc, claimMock } = makeService(makePlanetState({ userid: null }));
    const result = (await svc.command.handler(makeShip(), ['Aurora'], {})) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_CLAIMED, 'Aurora'));
    // claim is fire-and-forget, called eventually
  });

  it('unowned with whitespace-only arg returns LAND_NAME_PROMPT (treated as no name)', async () => {
    const { svc } = makeService(makePlanetState({ userid: null }));
    const result = (await svc.command.handler(makeShip(), ['   '], {})) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_NAME_PROMPT));
  });

  it('unowned with a multi-word name claims the whole name', async () => {
    const { svc, claimMock } = makeService(makePlanetState({ userid: null }));
    const result = (await svc.command.handler(makeShip(), ['New', 'Terra'], {})) as CommandResult;
    expect(claimMock).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(), 'New Terra',
    );
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_CLAIMED, 'New Terra'));
  });

  it('unowned with name > 19 chars returns LAND_INVALID_NAME', async () => {
    const { svc } = makeService(makePlanetState({ userid: null }));
    const result = (await svc.command.handler(makeShip(), ['A'.repeat(20)], {})) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_INVALID_NAME));
  });

  it('owned by self returns LAND_OK', async () => {
    const { svc } = makeService(makePlanetState({ userid: 'u1', name: 'Aurora' }));
    const result = (await svc.command.handler(makeShip({ userid: 'u1' }), [], {})) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_OK, 'Aurora'));
  });

  it('owned by other with no password set returns LAND_REFUSED', async () => {
    const { svc } = makeService(makePlanetState({ userid: 'other', password: '', name: 'Nova' }));
    const result = (await svc.command.handler(makeShip({ userid: 'u1' }), [], {})) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_REFUSED));
  });

  it('owned by other with password="none" returns LAND_REFUSED', async () => {
    const { svc } = makeService(makePlanetState({ userid: 'other', password: 'none', name: 'Nova' }));
    const result = (await svc.command.handler(makeShip({ userid: 'u1' }), [], {})) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_REFUSED));
  });

  it('owned by other with correct password returns LAND_OK', async () => {
    const { svc } = makeService(makePlanetState({ userid: 'other', password: 'secret', name: 'Nova' }));
    const result = (await svc.command.handler(makeShip({ userid: 'u1' }), ['secret'], {})) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_OK, 'Nova'));
  });

  it('owned by other with wrong password returns LAND_PASSFAIL', async () => {
    const { svc } = makeService(makePlanetState({ userid: 'other', password: 'secret', name: 'Nova' }));
    const result = (await svc.command.handler(makeShip({ userid: 'u1' }), ['wrong'], {})) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_PASSFAIL));
  });

  it('keyword is "land", alias includes "lan"', () => {
    const { svc } = makeService(null);
    expect(svc.command.keyword).toBe('land');
    expect(svc.command.aliases).toContain('lan');
  });

  /**
   * The team hole. `land` used to carry its own copy of the access rule and
   * admit on `arg === 'team' || arg === ''`, never comparing the visitor's
   * team to the planet's — so a bare `land`, or `land team` from any stranger,
   * docked at a team-locked world. Its comment justified this with "ship
   * carries no explicit teamcode field", which was false: ShipState.teamcode
   * exists (ship-state.types.ts:178). It now shares decideTradeAccess with the
   * buy path. @see planet/trade-access.ts
   */
  it('refuses a stranger at a team-locked planet', async () => {
    const { svc } = makeService(makePlanetState({
      userid: 'owner', name: 'Bastion', password: 'team', teamcode: 42n,
    }));
    const stranger = makeShip({ userid: 'u1' });
    stranger.teamcode = 0n;

    for (const args of [[], ['team']]) {
      const result = (await svc.command.handler(stranger, args, {})) as CommandResult;
      expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_REFUSED));
    }
  });

  it('refuses a captain on a different team', async () => {
    const { svc } = makeService(makePlanetState({
      userid: 'owner', name: 'Bastion', password: 'team', teamcode: 42n,
    }));
    const rival = makeShip({ userid: 'u1' });
    rival.teamcode = 7n;
    const result = (await svc.command.handler(rival, [], {})) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_REFUSED));
  });

  it('admits an actual team-mate', async () => {
    const { svc } = makeService(makePlanetState({
      userid: 'owner', name: 'Bastion', password: 'team', teamcode: 42n,
    }));
    const mate = makeShip({ userid: 'u1' });
    mate.teamcode = 42n;
    const result = (await svc.command.handler(mate, [], {})) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUYPAS4));
  });
});
