/**
 * T009 / T012 — Unit spec for AttackHandlerService.
 * Covers all troop-branch preconditions (FR-014-001..007) and command routing.
 * @see GECMDS.C:3515 cmd_attack
 */
import { AttackHandlerService } from '../../../../src/game/commands/handlers/attack.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { PlanetAttackService } from '../../../../src/game/planet/planet-attack.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { PlanetState } from '../../../../src/game/planet/planet-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { PLTYPE_WORM } from '../../../../src/game/constants';
import { FIRETICKS_DEFAULT } from '../../../../src/game/commands/attack.config';
import { I_TROOPS, I_FIGHTER, NUMITEMS } from '../../../../src/game/constants/items';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeItems(): PlanetState['items'] {
  return Array.from({ length: NUMITEMS }, () => ({
    qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
  }));
}

function makePlanet(overrides: Partial<PlanetState> = {}): PlanetState {
  const items = makeItems();
  items[I_TROOPS].qty = 100n;
  return {
    xsect: 5, ysect: 5, plnum: 0,
    type: 1, xcoord: 5.5, ycoord: 5.5,
    userid: 'defender', name: 'TestPlanet',
    enviorn: 0, resource: 0, cash: 0n, debt: 0n, tax: 0n,
    taxrate: 0, warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items,
    ...overrides,
  };
}

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  const items = Array(NUMITEMS).fill(0n) as bigint[];
  items[I_TROOPS] = 500n;
  return {
    userid: 'attacker', shipno: 1, shipname: 'Attacker', shpclass: 5,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 10, // in orbit of planet 0
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items,
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    dirty: false,
    ...overrides,
  };
}

function makeHandler(opts: {
  planet?: PlanetState | null;
  canAttackPlanet?: boolean;
  attackOutcome?: Partial<{ left1: number; left2: number; kill1: number; kill2: number; won: number; itemsDestroyed: []; narration: string[] }>;
} = {}) {
  const {
    planet = makePlanet(),
    canAttackPlanet = true,
    attackOutcome = { left1: 200, left2: 50, kill1: 50, kill2: 10, won: 0, itemsDestroyed: [], narration: ['Lost 50.', 'Standoff.'] },
  } = opts;

  const mutated: Record<string, unknown> = {};
  const mockShipState = {
    mutate: jest.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        const s = makeShip();
        fn(s);
        Object.assign(mutated, s);
        return s;
      },
    ),
  } as unknown as ShipStateService;

  const mockPlanetService = {
    get: jest.fn().mockReturnValue(planet),
    withPlanetLock: jest.fn().mockImplementation(
      async (_x: number, _y: number, _p: number, fn: () => Promise<unknown>) => fn(),
    ),
    flushPlanet: jest.fn().mockResolvedValue(undefined),
  } as unknown as PlanetStateService;

  const mockAttackService = {
    attackTroop: jest.fn().mockResolvedValue(attackOutcome),
    attackFighter: jest.fn().mockResolvedValue(attackOutcome),
  } as unknown as PlanetAttackService;

  const mockShipClassCache = {
    get: jest.fn().mockReturnValue({ canAttackPlanet }),
  } as unknown as ShipClassCacheService;

  const handler = new AttackHandlerService(
    mockShipState,
    mockPlanetService,
    mockAttackService,
    mockShipClassCache,
    FIRETICKS_DEFAULT,
  );

  return { handler, mockShipState, mockPlanetService, mockAttackService, mockShipClassCache, mutated };
}

type Lines = { lines: { text: string; category: string }[] };

// ---------------------------------------------------------------------------
// Precondition: FR-014-001 — not in orbit
// ---------------------------------------------------------------------------

describe('AttackHandlerService — FR-014-001: not in orbit', () => {
  it('returns ATT_NOT_ORBIT when where < 10', async () => {
    const { handler } = makeHandler();
    const ship = makeShip({ where: 5 });
    const result = await handler.command.handler(ship, ['100', 'tro'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ATT_NOT_ORBIT));
  });

  it('returns ATT_NOT_ORBIT when where == 0', async () => {
    const { handler } = makeHandler();
    const ship = makeShip({ where: 0 });
    const result = await handler.command.handler(ship, ['100', 'tro'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ATT_NOT_ORBIT));
  });
});

// ---------------------------------------------------------------------------
// Precondition: FR-014-002 — ship class cannot attack planets
// ---------------------------------------------------------------------------

describe('AttackHandlerService — FR-014-002: no planet attack capability', () => {
  it('returns ATT_NO_CAPABILITY when canAttackPlanet == false', async () => {
    const { handler } = makeHandler({ canAttackPlanet: false });
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, ['100', 'tro'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ATT_NO_CAPABILITY));
  });

  it('returns ATT_NO_CAPABILITY when ship class not found in cache', async () => {
    const { mockShipClassCache, handler } = makeHandler();
    (mockShipClassCache.get as jest.Mock).mockReturnValue(null);
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, ['100', 'tro'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ATT_NO_CAPABILITY));
  });
});

// ---------------------------------------------------------------------------
// Precondition: FR-014-003 — wormhole rejection
// ---------------------------------------------------------------------------

describe('AttackHandlerService — FR-014-003: wormhole planet', () => {
  it('returns ATT_WORMHOLE when planet type == PLTYPE_WORM', async () => {
    const { handler } = makeHandler({ planet: makePlanet({ type: PLTYPE_WORM }) });
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, ['100', 'tro'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ATT_WORMHOLE));
  });
});

// ---------------------------------------------------------------------------
// Precondition: FR-014-004 — self-attack
// ---------------------------------------------------------------------------

describe('AttackHandlerService — FR-014-004: self-attack', () => {
  it('returns ATT_SELF when planet.userid == ship.userid', async () => {
    const { handler } = makeHandler({ planet: makePlanet({ userid: 'attacker' }) });
    const ship = makeShip({ where: 10, userid: 'attacker' });
    const result = await handler.command.handler(ship, ['100', 'tro'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ATT_SELF));
  });
});

// ---------------------------------------------------------------------------
// Precondition: FR-014-006 — bad arg shape
// ---------------------------------------------------------------------------

describe('AttackHandlerService — FR-014-006: argument parsing', () => {
  it('returns ATT_FORMAT when no args provided', async () => {
    const { handler } = makeHandler();
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, [], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ATT_FORMAT));
  });

  it('returns ATT_FORMAT when amount is not a number', async () => {
    const { handler } = makeHandler();
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, ['abc', 'tro'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ATT_FORMAT));
  });

  it('returns ATT_FORMAT when amount is 0', async () => {
    const { handler } = makeHandler();
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, ['0', 'tro'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ATT_FORMAT));
  });

  it('returns ATT_FORMAT when item keyword is unrecognised', async () => {
    const { handler } = makeHandler();
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, ['100', 'food'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ATT_FORMAT));
  });

  it('returns ATT_FORMAT when item keyword is "missiles" (not troops/fighters)', async () => {
    const { handler } = makeHandler();
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, ['100', 'mis'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ATT_FORMAT));
  });
});

// ---------------------------------------------------------------------------
// Precondition: FR-014-007 — insufficient cargo
// ---------------------------------------------------------------------------

describe('AttackHandlerService — FR-014-007: insufficient cargo', () => {
  it('returns ATT_NO_TROOPS when troop cargo is zero', async () => {
    const { handler } = makeHandler();
    const items = Array(NUMITEMS).fill(0n) as bigint[];
    items[I_TROOPS] = 0n;
    const ship = makeShip({ where: 10, items });
    const result = await handler.command.handler(ship, ['100', 'tro'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ATT_NO_TROOPS));
  });

  it('returns ATT_NO_TROOPS when requesting more troops than cargo', async () => {
    const { handler } = makeHandler();
    const items = Array(NUMITEMS).fill(0n) as bigint[];
    items[I_TROOPS] = 50n;
    const ship = makeShip({ where: 10, items });
    const result = await handler.command.handler(ship, ['100', 'tro'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ATT_NO_TROOPS));
  });

  it('returns ATT_NO_FIGHTERS when fighter cargo is zero', async () => {
    const { handler } = makeHandler();
    const items = Array(NUMITEMS).fill(0n) as bigint[];
    items[I_TROOPS] = 500n;
    items[I_FIGHTER] = 0n;
    const ship = makeShip({ where: 10, items });
    const result = await handler.command.handler(ship, ['100', 'fig'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ATT_NO_FIGHTERS));
  });

  it('returns ATT_NO_FIGHTERS when requesting more fighters than cargo', async () => {
    const { handler } = makeHandler();
    const items = Array(NUMITEMS).fill(0n) as bigint[];
    items[I_FIGHTER] = 20n;
    const ship = makeShip({ where: 10, items });
    const result = await handler.command.handler(ship, ['100', 'fig'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ATT_NO_FIGHTERS));
  });
});

// ---------------------------------------------------------------------------
// Happy path — troop attack
// ---------------------------------------------------------------------------

describe('AttackHandlerService — happy path (troops)', () => {
  it('calls attackTroop with correct args and returns narration lines', async () => {
    const { handler, mockAttackService } = makeHandler();
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, ['100', 'tro'], {}) as Lines;
    expect(mockAttackService.attackTroop).toHaveBeenCalled();
    expect(result.lines.length).toBeGreaterThan(0);
  });

  it('sets ship.hostile and ship.cantexit via mutate before combat', async () => {
    const { handler, mockShipState } = makeHandler();
    const ship = makeShip({ where: 10 });
    await handler.command.handler(ship, ['100', 'tro'], {});
    expect(mockShipState.mutate).toHaveBeenCalled();
    const mutateCall = (mockShipState.mutate as jest.Mock).mock.calls[0];
    const stateCopy = makeShip({ where: 10 });
    mutateCall[2](stateCopy);
    expect(stateCopy.hostile).toBe(10);
    expect(stateCopy.cantexit).toBe(FIRETICKS_DEFAULT);
  });

  it('deducts troops from cargo inside lock', async () => {
    const { handler, mockShipState } = makeHandler();
    const items = Array(NUMITEMS).fill(0n) as bigint[];
    items[I_TROOPS] = 500n;
    const ship = makeShip({ where: 10, items });
    await handler.command.handler(ship, ['100', 'tro'], {});
    const mutateCalls = (mockShipState.mutate as jest.Mock).mock.calls;
    const stateCopy = makeShip({ items: [...items] });
    mutateCalls[0][2](stateCopy);
    expect(stateCopy.items[I_TROOPS]).toBe(400n);
  });

  it('flushes planet exactly once after combat', async () => {
    const { handler, mockPlanetService } = makeHandler();
    const ship = makeShip({ where: 10 });
    await handler.command.handler(ship, ['100', 'tro'], {});
    expect(mockPlanetService.flushPlanet).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Happy path — fighter attack
// ---------------------------------------------------------------------------

describe('AttackHandlerService — happy path (fighters)', () => {
  it('calls attackFighter when "fig" keyword used', async () => {
    const { handler, mockAttackService } = makeHandler();
    const items = Array(NUMITEMS).fill(0n) as bigint[];
    items[I_FIGHTER] = 500n;
    const ship = makeShip({ where: 10, items });
    await handler.command.handler(ship, ['100', 'fig'], {});
    expect(mockAttackService.attackFighter).toHaveBeenCalled();
    expect(mockAttackService.attackTroop).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T012 — Command metadata
// ---------------------------------------------------------------------------

describe('AttackHandlerService — command metadata', () => {
  it('keyword is "att" with no aliases', () => {
    const { handler } = makeHandler();
    expect(handler.command.keyword).toBe('att');
    expect(handler.command.aliases).toHaveLength(0);
  });

  it('minArgs is 0 (format error raised in handler, not router)', () => {
    const { handler } = makeHandler();
    expect(handler.command.minArgs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// No flush on precondition rejection
// ---------------------------------------------------------------------------

describe('AttackHandlerService — no flush on precondition rejection', () => {
  it('does not flush planet when precondition fails (not in orbit)', async () => {
    const { handler, mockPlanetService } = makeHandler();
    const ship = makeShip({ where: 0 });
    await handler.command.handler(ship, ['100', 'tro'], {});
    expect(mockPlanetService.flushPlanet).not.toHaveBeenCalled();
  });

  it('does not flush planet when no capability', async () => {
    const { handler, mockPlanetService } = makeHandler({ canAttackPlanet: false });
    const ship = makeShip({ where: 10 });
    await handler.command.handler(ship, ['100', 'tro'], {});
    expect(mockPlanetService.flushPlanet).not.toHaveBeenCalled();
  });
});
