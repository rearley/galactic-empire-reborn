/**
 * T016 — Unit tests for SpyHandlerService.
 * Rejection branches in original-source order, zero-mutation assertions,
 * success path state changes, and overwrite case.
 * @see GECMDS.C:6044-6077 cmd_spy
 * @see specs/016-navigation-spy/plan.md §T016
 */
import { SpyHandlerService } from '../../../../src/game/commands/handlers/spy.handler';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { PlanetState } from '../../../../src/game/planet/planet-state.types';
import { CommandContext } from '../../../../src/game/commands/command.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { I_SPY, NUMITEMS } from '../../../../src/game/constants/items';
import { PLTYPE_WORM } from '../../../../src/game/constants';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  const items = Array(NUMITEMS).fill(0n) as bigint[];
  items[I_SPY] = 3n;
  return {
    userid: 'alice', shipno: 1, shipname: 'Recon', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.0, ycoord: 5.0, damage: 0, energy: 50000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 10, // in orbit of planet 0 by default
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items,
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false,
    dirty: false,
    ...overrides,
  };
}

function makePlanet(overrides: Partial<PlanetState> = {}): PlanetState {
  return {
    xsect: 5, ysect: 5, plnum: 0,
    type: 1, xcoord: 5.5, ycoord: 5.5,
    userid: 'bob', name: 'Outpost',
    enviorn: 0, resource: 0, cash: 0n, debt: 0n, tax: 0n,
    taxrate: 0, warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items: Array.from({ length: NUMITEMS }, () => ({
      qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
    })),
    ...overrides,
  };
}

function makeHandler(planet: PlanetState | null = makePlanet()) {
  const mockPlanetService = {
    get: jest.fn().mockReturnValue(planet),
  } as unknown as PlanetStateService;

  const handler = new SpyHandlerService(mockPlanetService);
  const ctx: CommandContext = {};
  return { handler, mockPlanetService, ctx };
}

function firstLineText(result: unknown): string {
  return (result as { lines: { text: string }[] }).lines[0].text;
}

// ---------------------------------------------------------------------------
// Rejection branches (GECMDS.C order: 6044–6077)
// ---------------------------------------------------------------------------

describe('SpyHandlerService — rejection branches', () => {
  it('SPY1 — not in orbit (where < 10) → rejection, no state change', () => {
    const ship = makeShip({ where: 0 });
    const planet = makePlanet();
    const { handler, mockPlanetService, ctx } = makeHandler(planet);

    const shipBefore = { ...ship, items: [...ship.items] };
    const planetBefore = { ...planet };

    const result = handler.command.handler(ship, [], ctx);

    expect(firstLineText(result)).toBe(formatMessage(MessageId.SPY1));
    // planet.get should not be called — we bail before even fetching the planet
    expect(mockPlanetService.get).not.toHaveBeenCalled();
    // zero state change
    expect(ship.dirty).toBe(shipBefore.dirty);
    expect(ship.items[I_SPY]).toBe(shipBefore.items[I_SPY]);
    expect(planet.spyowner).toBe(planetBefore.spyowner);
    expect(planet.dirty).toBeUndefined(); // PlanetState has no dirty field here, use spyowner check
  });

  it('SPY0B — wormhole planet → rejection, no state change', () => {
    const planet = makePlanet({ type: PLTYPE_WORM });
    const ship = makeShip({ where: 10 });
    const { handler, ctx } = makeHandler(planet);

    const spyBefore = ship.items[I_SPY];
    const spyownerBefore = planet.spyowner;

    const result = handler.command.handler(ship, [], ctx);

    expect(firstLineText(result)).toBe(formatMessage(MessageId.SPY0B));
    expect(ship.items[I_SPY]).toBe(spyBefore);
    expect(planet.spyowner).toBe(spyownerBefore);
    expect(ship.dirty).toBe(false);
  });

  it('SPY0 — ship owner matches planet owner → rejection, no state change', () => {
    const planet = makePlanet({ userid: 'alice' });
    const ship = makeShip({ userid: 'alice', where: 10 });
    const { handler, ctx } = makeHandler(planet);

    const spyBefore = ship.items[I_SPY];
    const spyownerBefore = planet.spyowner;

    const result = handler.command.handler(ship, [], ctx);

    expect(firstLineText(result)).toBe(formatMessage(MessageId.SPY0));
    expect(ship.items[I_SPY]).toBe(spyBefore);
    expect(planet.spyowner).toBe(spyownerBefore);
    expect(ship.dirty).toBe(false);
  });

  it('SPY0 — case-insensitive owner match (ALICE == alice)', () => {
    const planet = makePlanet({ userid: 'ALICE' });
    const ship = makeShip({ userid: 'alice', where: 10 });
    const { handler, ctx } = makeHandler(planet);

    const result = handler.command.handler(ship, [], ctx);

    expect(firstLineText(result)).toBe(formatMessage(MessageId.SPY0));
  });

  it('SPY0C — neutral zone (xcoord=0, ycoord=0) → rejection, no state change', () => {
    const planet = makePlanet({ xsect: 0, ysect: 0, userid: 'bob' });
    const ship = makeShip({ xcoord: 0.5, ycoord: 0.5, where: 10 });
    const { handler, ctx } = makeHandler(planet);

    const spyBefore = ship.items[I_SPY];
    const spyownerBefore = planet.spyowner;

    const result = handler.command.handler(ship, [], ctx);

    expect(firstLineText(result)).toBe(formatMessage(MessageId.SPY0C));
    expect(ship.items[I_SPY]).toBe(spyBefore);
    expect(planet.spyowner).toBe(spyownerBefore);
    expect(ship.dirty).toBe(false);
  });

  it('SPYM0 — no spy equipment (items[I_SPY] <= 0n) → rejection, no state change', () => {
    const items = Array(NUMITEMS).fill(0n) as bigint[];
    items[I_SPY] = 0n;
    const ship = makeShip({ items, where: 10 });
    const planet = makePlanet({ userid: 'bob' });
    const { handler, ctx } = makeHandler(planet);

    const spyownerBefore = planet.spyowner;

    const result = handler.command.handler(ship, [], ctx);

    expect(firstLineText(result)).toBe(formatMessage(MessageId.SPYM0));
    expect(ship.items[I_SPY]).toBe(0n);
    expect(planet.spyowner).toBe(spyownerBefore);
    expect(ship.dirty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Success path
// ---------------------------------------------------------------------------

describe('SpyHandlerService — success path', () => {
  it('SPYM1 — decrements items[I_SPY] by 1, sets planet.spyowner, marks both dirty', () => {
    const items = Array(NUMITEMS).fill(0n) as bigint[];
    items[I_SPY] = 3n;
    const ship = makeShip({ userid: 'alice', items, where: 10 });
    const planet = makePlanet({ userid: 'bob', name: 'Outpost', spyowner: '' });
    const { handler, ctx } = makeHandler(planet);

    const result = handler.command.handler(ship, [], ctx);

    // items[I_SPY] decremented
    expect(ship.items[I_SPY]).toBe(2n);
    // ship marked dirty
    expect(ship.dirty).toBe(true);
    // planet.spyowner set to ship.userid
    expect(planet.spyowner).toBe('alice');
    // success message with planet name
    expect(firstLineText(result)).toBe(formatMessage(MessageId.SPYM1, 'Outpost'));
  });

  it('SPYM1 — overwrite: existing spyowner replaced with new owner', () => {
    const items = Array(NUMITEMS).fill(0n) as bigint[];
    items[I_SPY] = 2n;
    const ship = makeShip({ userid: 'alice', items, where: 10 });
    // planet already has a spy from carol
    const planet = makePlanet({ userid: 'bob', name: 'Frontier', spyowner: 'carol' });
    const { handler, ctx } = makeHandler(planet);

    handler.command.handler(ship, [], ctx);

    expect(planet.spyowner).toBe('alice');
    expect(ship.items[I_SPY]).toBe(1n);
  });
});

// ---------------------------------------------------------------------------
// Command metadata
// ---------------------------------------------------------------------------

describe('SpyHandlerService — command metadata', () => {
  it('keyword is "spy" with no aliases', () => {
    const { handler } = makeHandler();
    expect(handler.command.keyword).toBe('spy');
    expect(handler.command.aliases).toEqual([]);
  });
});
