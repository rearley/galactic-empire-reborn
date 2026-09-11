/**
 * T015 — OrbitHandlerService unit tests.
 */
import { OrbitHandlerService } from '../../../src/game/commands/handlers/orbit.handler';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandResult } from '../../../src/game/commands/command.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Falcon',
    xcoord: 5.5,
    ycoord: 3.5,
    status: 0,
    topspeed: 0,
    ...overrides,
  });
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
    // No wormhole in these fixtures' sectors.
    { existsInSector: async () => false } as never,
  );
  return { svc, shipMock, planetMock, mutated };
}

describe('OrbitHandlerService', () => {
  it('already in orbit returns ORBITALR', async () => {
    const { svc } = makeService([]);
    const ship = makeShip({ where: 10 });
    const result = await svc.command.handler(ship, [], {}) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ORBITALR));
  });

  it('no planets returns ORBITNO', async () => {
    const { svc } = makeService([]);
    const result = await svc.command.handler(makeShip(), [], {}) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ORBITNO));
  });

  it('single planet auto-orbits and sets where = 10 + plnum', async () => {
    const { svc, mutated } = makeService([makePlanet(1, 'Zygor-3')]);
    const ship = makeShip();
    const result = await svc.command.handler(ship, [], {}) as CommandResult;
    expect(result.lines[0].category).toBe('success');
    expect(mutated.where).toBe(11);
    expect(mutated.speed).toBe(0);
    expect(mutated.speed2b).toBe(0);
  });

  it('multiple planets without arg returns ORBITPK pick-list', async () => {
    const { svc } = makeService([makePlanet(1, 'Alpha'), makePlanet(2, 'Beta')]);
    const result = await svc.command.handler(makeShip(), [], {}) as CommandResult;
    expect(result.lines[0].text).toContain(formatMessage(MessageId.ORBITPK, '').replace('%s', ''));
  });

  it('multiple planets with valid plnum arg orbits correct planet', async () => {
    const { svc, mutated } = makeService([makePlanet(1, 'Alpha'), makePlanet(2, 'Beta')]);
    await svc.command.handler(makeShip(), ['2'], {});
    expect(mutated.where).toBe(12);
  });

  it('multiple planets with invalid plnum returns ORBITPK', async () => {
    const { svc } = makeService([makePlanet(1, 'Alpha'), makePlanet(2, 'Beta')]);
    const result = await svc.command.handler(makeShip(), ['99'], {}) as CommandResult;
    expect(result.lines[0].text).toContain(formatMessage(MessageId.ORBITPK, '').replace('%s', ''));
  });

  it('keyword is "orbit", alias includes "orb"', async () => {
    const { svc } = makeService([]);
    expect(svc.command.keyword).toBe('orbit');
    expect(svc.command.aliases).toContain('orb');
  });
});

/**
 * `orb <n>` naming a wormhole answers ORBIT0, not the disambiguation prompt.
 *
 * Wormholes share the planet slot space in canon (`sector.planets[]` holds
 * both, discriminated by `type`) and `sca pl` numbers them in the same run —
 * so in a three-planet sector with three portals, `orb 4` is a captain naming
 * something the game has just listed for them.
 *
 * Canon answers that case specifically:
 *
 *     if (plptr->type == PLTYPE_WORM) { prfmsg(ORBIT0); return; }
 *
 * (GECMDS.C:791-793.) ORBIT0 is "You can't do that to a wormhole!!!" and we
 * had no such message: the handler searched planets only, found nothing, and
 * re-prompted as though no argument had been given.
 */
describe('OrbitHandlerService — orbiting a wormhole', () => {
  const twoPlanets = [
    { plnum: 1, name: 'Zygor', xcoord: 0.5, ycoord: 0.5 },
    { plnum: 2, name: 'Tahanian Station', xcoord: 0.5, ycoord: 0.5 },
  ];

  const build = (wormholePlnums: number[]) => new OrbitHandlerService(
    { get: () => undefined, mutate: jest.fn() } as unknown as ShipStateService,
    { bySector: () => twoPlanets } as unknown as PlanetStateService,
    {
      existsInSector: async (_xsect: number, _ysect: number, plnum: number) =>
        wormholePlnums.includes(plnum),
    } as never,
  );

  it('refuses with canon\'s own words', async () => {
    const svc = build([4]);
    const r = await svc.command.handler(makeShip({ where: 0 }), ['4'], {}) as CommandResult;
    expect(r.lines[0].text).toBe("You can't do that to a wormhole!!!");
  });

  it('still re-prompts for a slot that is neither planet nor wormhole', async () => {
    const svc = build([4]);
    const r = await svc.command.handler(makeShip({ where: 0 }), ['9'], {}) as CommandResult;
    expect(r.lines[0].text).not.toBe("You can't do that to a wormhole!!!");
  });

  it('still orbits a real planet by number', async () => {
    const svc = build([4]);
    const r = await svc.command.handler(makeShip({ where: 0 }), ['1'], {}) as CommandResult;
    expect(r.lines[0].text).not.toMatch(/wormhole/);
  });
});

/**
 * The slot the pilot types is the slot that is looked up.
 *
 *   plnum = (atoi(margv[1]));
 *   if (plnum <= MAXPLANETS && plnum > 0) {
 *       got_plt = getplanetdat(usrnum);
 *       if (got_plt) { if (plptr->type == PLTYPE_WORM) { prfmsg(ORBIT0); return; } ... }
 *       else { prfmsg(FOOLISH); }
 *   }
 *
 * @see GECMDS.C:785-816
 *
 * Canon never substitutes a different planet — `margv[1]` is mandatory there.
 * The port added a convenience: with exactly one planet in the sector it
 * orbits that one without an argument. That convenience swallowed the
 * argument entirely, so in a sector holding planet #1 and wormhole #2, a
 * pilot typing `orb 2` — deliberately naming the wormhole `sca pl` had just
 * listed — was silently put in orbit around planet #1 and told so by name.
 *
 * The convenience is kept for the NO-ARGUMENT case only. An argument that is
 * present is always honoured.
 */
describe('orb <n> honours the slot even when the sector holds one planet', () => {
  function serviceWithWormhole(planets: ReturnType<typeof makePlanet>[], wormPlnum: number) {
    const shipMock = { mutate: jest.fn(), get: jest.fn() };
    const planetMock = { bySector: jest.fn().mockReturnValue(planets) };
    return new OrbitHandlerService(
      shipMock as unknown as ShipStateService,
      planetMock as unknown as PlanetStateService,
      {
        existsInSector: async (_xsect: number, _ysect: number, plnum: number) =>
          plnum === wormPlnum,
      } as never,
    );
  }

  it('answers ORBIT0 for a wormhole slot, not silent success on the lone planet', async () => {
    const svc = serviceWithWormhole([makePlanet(1, 'Terra')], 2);

    const result = await svc.command.handler(makeShip(), ['2'], {}) as CommandResult;

    expect(result.lines[0].text).toBe(formatMessage(MessageId.ORBIT0));
  });

  it('does not orbit the lone planet when a different slot was named', async () => {
    const { svc, shipMock } = makeService([makePlanet(1, 'Terra')]);

    await svc.command.handler(makeShip(), ['5'], {}) as CommandResult;

    expect(shipMock.mutate).not.toHaveBeenCalled();
  });

  it('still orbits the lone planet when no slot is given', async () => {
    const { svc, mutated } = makeService([makePlanet(1, 'Terra')]);

    const result = await svc.command.handler(makeShip(), [], {}) as CommandResult;

    expect(result.lines[0].text).toBe(formatMessage(MessageId.ORBIT01, 1, 'Terra'));
    expect(mutated.where).toBe(11);
  });

  it('orbits the lone planet when its own slot is named', async () => {
    const { svc, mutated } = makeService([makePlanet(1, 'Terra')]);

    await svc.command.handler(makeShip(), ['1'], {}) as CommandResult;

    expect(mutated.where).toBe(11);
  });
});
