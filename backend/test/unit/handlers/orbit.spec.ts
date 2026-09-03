/**
 * T015 — OrbitHandlerService unit tests.
 */
import { OrbitHandlerService } from '../../../src/game/commands/handlers/orbit.handler';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandResult } from '../../../src/game/commands/command.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Falcon', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 3.5, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
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

const makePlanet = (plnum: number, name = '') => ({
  xsect: 5, ysect: 3, plnum,
  name, userid: null, type: 2, xcoord: 5.5, ycoord: 3.5,
  enviorn: 0, resource: 0,
});

function makeService(planets: ReturnType<typeof makePlanet>[]) {
  const mutated: { where?: number; speed?: number; speed2b?: number } = {};
  const shipMock = {
    mutate: jest.fn().mockImplementation((_u: string, _n: number, fn: (s: ShipState) => void) => {
      const fake = { where: 0, speed: 0, speed2b: 0 } as ShipState;
      fn(fake);
      Object.assign(mutated, { where: fake.where, speed: fake.speed, speed2b: fake.speed2b });
    }),
    get: jest.fn(),
  };
  // `orb` reads the LIVE planet map now, not GalaxyService's boot snapshot --
  // that snapshot never sees a planet named after startup, so orbiting a colony
  // claimed this session printed "(unnamed)".
  const planetMock = {
    bySector: jest.fn().mockReturnValue(planets),
  };
  const svc = new OrbitHandlerService(
    shipMock as unknown as ShipStateService,
    planetMock as unknown as PlanetStateService,
  );
  return { svc, shipMock, planetMock, mutated };
}

describe('OrbitHandlerService', () => {
  it('already in orbit returns ORBITALR', () => {
    const { svc } = makeService([]);
    const ship = makeShip({ where: 10 });
    const result = svc.command.handler(ship, [], {}) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ORBITALR));
  });

  it('no planets returns ORBITNO', () => {
    const { svc } = makeService([]);
    const result = svc.command.handler(makeShip(), [], {}) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ORBITNO));
  });

  it('single planet auto-orbits and sets where = 10 + plnum', () => {
    const { svc, mutated } = makeService([makePlanet(1, 'Zygor-3')]);
    const ship = makeShip();
    const result = svc.command.handler(ship, [], {}) as CommandResult;
    expect(result.lines[0].category).toBe('success');
    expect(mutated.where).toBe(11);
    expect(mutated.speed).toBe(0);
    expect(mutated.speed2b).toBe(0);
  });

  it('multiple planets without arg returns ORBITPK pick-list', () => {
    const { svc } = makeService([makePlanet(1, 'Alpha'), makePlanet(2, 'Beta')]);
    const result = svc.command.handler(makeShip(), [], {}) as CommandResult;
    expect(result.lines[0].text).toContain(formatMessage(MessageId.ORBITPK, '').replace('%s', ''));
  });

  it('multiple planets with valid plnum arg orbits correct planet', () => {
    const { svc, mutated } = makeService([makePlanet(1, 'Alpha'), makePlanet(2, 'Beta')]);
    svc.command.handler(makeShip(), ['2'], {});
    expect(mutated.where).toBe(12);
  });

  it('multiple planets with invalid plnum returns ORBITPK', () => {
    const { svc } = makeService([makePlanet(1, 'Alpha'), makePlanet(2, 'Beta')]);
    const result = svc.command.handler(makeShip(), ['99'], {}) as CommandResult;
    expect(result.lines[0].text).toContain(formatMessage(MessageId.ORBITPK, '').replace('%s', ''));
  });

  it('keyword is "orbit", alias includes "orb"', () => {
    const { svc } = makeService([]);
    expect(svc.command.keyword).toBe('orbit');
    expect(svc.command.aliases).toContain('orb');
  });
});
