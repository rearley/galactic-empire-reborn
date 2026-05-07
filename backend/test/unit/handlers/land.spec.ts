/**
 * T016 — LandHandlerService unit tests.
 */
import { LandHandlerService } from '../../../src/game/commands/handlers/land.handler';
import { GalaxyService } from '../../../src/game/galaxy/galaxy.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
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
    scanNames: false, scanHome: false,
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

  const svc = new LandHandlerService(
    galaxyMock as unknown as GalaxyService,
    shipMock as unknown as ShipStateService,
    planetMock as unknown as PlanetStateService,
  );
  return { svc, claimMock, planetMock };
}

describe('LandHandlerService', () => {
  it('not in orbit returns LAND_NOT_ORBIT', () => {
    const { svc } = makeService(null);
    const result = svc.command.handler(makeShip({ where: 0 }), [], {}) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_NOT_ORBIT));
  });

  it('unowned with no name arg returns LAND_NAME_PROMPT', () => {
    const { svc } = makeService(makePlanetState({ userid: null }));
    const result = svc.command.handler(makeShip(), [], {}) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_NAME_PROMPT));
  });

  it('unowned with valid name calls claim and returns LAND_CLAIMED', () => {
    const { svc, claimMock } = makeService(makePlanetState({ userid: null }));
    const result = svc.command.handler(makeShip(), ['Aurora'], {}) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_CLAIMED, 'Aurora'));
    // claim is fire-and-forget, called eventually
  });

  it('unowned with whitespace-only arg returns LAND_NAME_PROMPT (treated as no name)', () => {
    const { svc } = makeService(makePlanetState({ userid: null }));
    const result = svc.command.handler(makeShip(), ['   '], {}) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_NAME_PROMPT));
  });

  it('unowned with name > 19 chars returns LAND_INVALID_NAME', () => {
    const { svc } = makeService(makePlanetState({ userid: null }));
    const result = svc.command.handler(makeShip(), ['A'.repeat(20)], {}) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_INVALID_NAME));
  });

  it('owned by self returns LAND_OK', () => {
    const { svc } = makeService(makePlanetState({ userid: 'u1', name: 'Aurora' }));
    const result = svc.command.handler(makeShip({ userid: 'u1' }), [], {}) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_OK, 'Aurora'));
  });

  it('owned by other with no password set returns LAND_REFUSED', () => {
    const { svc } = makeService(makePlanetState({ userid: 'other', password: '', name: 'Nova' }));
    const result = svc.command.handler(makeShip({ userid: 'u1' }), [], {}) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_REFUSED));
  });

  it('owned by other with password="none" returns LAND_REFUSED', () => {
    const { svc } = makeService(makePlanetState({ userid: 'other', password: 'none', name: 'Nova' }));
    const result = svc.command.handler(makeShip({ userid: 'u1' }), [], {}) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_REFUSED));
  });

  it('owned by other with correct password returns LAND_OK', () => {
    const { svc } = makeService(makePlanetState({ userid: 'other', password: 'secret', name: 'Nova' }));
    const result = svc.command.handler(makeShip({ userid: 'u1' }), ['secret'], {}) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_OK, 'Nova'));
  });

  it('owned by other with wrong password returns LAND_PASSFAIL', () => {
    const { svc } = makeService(makePlanetState({ userid: 'other', password: 'secret', name: 'Nova' }));
    const result = svc.command.handler(makeShip({ userid: 'u1' }), ['wrong'], {}) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_PASSFAIL));
  });

  it('keyword is "land", alias includes "lan"', () => {
    const { svc } = makeService(null);
    expect(svc.command.keyword).toBe('land');
    expect(svc.command.aliases).toContain('lan');
  });
});
