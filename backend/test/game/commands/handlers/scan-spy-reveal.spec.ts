/**
 * T017 — Integration test for spy-owner item reveal in `scan pl`.
 * Planet with spyowner="alice": alice sees per-item inventory block;
 * bob sees only aggregate description lines.
 * @see GECMDS.C:2295 scan_pl
 * @see specs/016-navigation-spy/plan.md §T017
 */
import { ScanHandlerService } from '../../../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { GalaxyService } from '../../../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { PrismaService } from '../../../../src/prisma/prisma.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { PlanetState } from '../../../../src/game/planet/planet-state.types';
import { CommandContext } from '../../../../src/game/commands/command.types';
import { NUMITEMS } from '../../../../src/game/constants/items';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'alice', shipno: 1, shipname: 'Scout', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 10.5, ycoord: 7.5, damage: 0, energy: 50000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, // in-flight
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(NUMITEMS).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makePlanetState(overrides: Partial<PlanetState> = {}): PlanetState {
  return {
    xsect: 10, ysect: 7, plnum: 0,
    type: 1, xcoord: 10.5, ycoord: 7.5,
    userid: 'bob', name: 'Recon Base',
    enviorn: 0, resource: 2, cash: 0n, debt: 0n, tax: 0n,
    taxrate: 0, warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: 'alice', technology: 0, teamcode: 0n,
    items: Array.from({ length: NUMITEMS }, (_, i) => ({
      qty: BigInt((i + 1) * 100),
      rate: i,
      sell: i % 2 === 0,
      reserve: 0,
      markup2a: 10,
      sold2a: 0n,
    })),
    ...overrides,
  };
}

/** Prisma Planet shape (minimal fields used by scanPl / findPlanetByName) */
function makePrismaPlanet(xsect = 10, ysect = 7) {
  return {
    id: 1,
    xsect, ysect, plnum: 0,
    type: 1, xcoord: 10.5, ycoord: 7.5,
    userid: 'bob', name: 'Recon Base',
    enviorn: 0, resource: 2,
    visible: 1,
  } as unknown as import('@prisma/client').Planet;
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

function makeService(opts: {
  viewerUserId?: string;
  spyowner?: string;
} = {}) {
  const { viewerUserId = 'alice', spyowner = 'alice' } = opts;

  const prismaPlane = makePrismaPlanet();

  const mockShipService = {
    findAllShips: jest.fn().mockReturnValue([]),
    findByName: jest.fn().mockReturnValue(undefined),
  } as unknown as ShipStateService;

  const mockGalaxyService = {
    findPlanetByName: jest.fn().mockReturnValue(prismaPlane),
    getSectorPlanets: jest.fn().mockReturnValue([]),
    getSectorWormholes: jest.fn().mockReturnValue([]),
  } as unknown as GalaxyService;

  const planetState = makePlanetState({ spyowner });

  const mockPlanetService = {
    get: jest.fn().mockReturnValue(planetState),
    // scanPl resolves the planet from the LIVE state now — GalaxyService's
    // read-model hydrates once at boot and goes stale on the first claim.
    bySector: jest.fn().mockReturnValue([]),
    byName: jest.fn().mockReturnValue(prismaPlane),
  } as unknown as PlanetStateService;

  // PrismaService — shipClass.findMany for onModuleInit, user.findUnique for scanPl owner resolution.
  const mockPrisma = {
    shipClass: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;

  const service = new ScanHandlerService(
    mockShipService,
    mockPrisma,
    mockGalaxyService,
    mockPlanetService,
  );

  const ship = makeShip({ userid: viewerUserId, xcoord: 10.5, ycoord: 7.5 });
  const ctx: CommandContext = {};

  return { service, ship, planetState, ctx };
}

async function lineTexts(result: unknown): Promise<string[]> {
  const r = await (result as Promise<{ lines: { text: string }[] }>);
  return r.lines.map(l => l.text);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScanHandlerService — scan pl spy reveal (T017)', () => {
  it('spy owner (alice) sees per-item inventory block in scan pl output', async () => {
    const { service, ship, ctx } = makeService({ viewerUserId: 'alice', spyowner: 'alice' });

    const result = service.command.handler(ship, ['pl', 'Recon Base'], ctx);
    const texts = await lineTexts(result);

    // The spy-owner reveal block must include at least one item inventory line.
    // Implementation will add lines containing item qty/sell info for the spy owner.
    const hasItemLine = texts.some(t => /item|qty|sell|inventory/i.test(t));
    expect(hasItemLine).toBe(true);
  });

  it('non-spy-owner (bob) does NOT see item inventory lines in scan pl output', async () => {
    const { service, ship, ctx } = makeService({ viewerUserId: 'bob', spyowner: 'alice' });

    const result = service.command.handler(ship, ['pl', 'Recon Base'], ctx);
    const texts = await lineTexts(result);

    // Bob should see normal aggregate planet info but no item inventory block
    const hasItemLine = texts.some(t => /item|qty|sell|inventory/i.test(t));
    expect(hasItemLine).toBe(false);
    // But does see at least the planet name line
    expect(texts.length).toBeGreaterThan(0);
  });

  it('case-insensitive spyowner match — ALICE matches alice', async () => {
    const { service, ship, ctx } = makeService({ viewerUserId: 'alice', spyowner: 'ALICE' });

    const result = service.command.handler(ship, ['pl', 'Recon Base'], ctx);
    const texts = await lineTexts(result);

    const hasItemLine = texts.some(t => /item|qty|sell|inventory/i.test(t));
    expect(hasItemLine).toBe(true);
  });

  it('case-insensitive spyowner match — Alice (mixed case) matches alice', async () => {
    const { service, ship, ctx } = makeService({ viewerUserId: 'alice', spyowner: 'Alice' });

    const result = service.command.handler(ship, ['pl', 'Recon Base'], ctx);
    const texts = await lineTexts(result);

    const hasItemLine = texts.some(t => /item|qty|sell|inventory/i.test(t));
    expect(hasItemLine).toBe(true);
  });

  it('viewer with matching userid but different case (ALICE) is treated as spy owner', async () => {
    const { service, ship, ctx } = makeService({ viewerUserId: 'ALICE', spyowner: 'alice' });

    const result = service.command.handler(ship, ['pl', 'Recon Base'], ctx);
    const texts = await lineTexts(result);

    const hasItemLine = texts.some(t => /item|qty|sell|inventory/i.test(t));
    expect(hasItemLine).toBe(true);
  });
});

/**
 * `scan pl <n>` reported "Bearing: 0" for every planet — the value was a
 * literal 0 next to a `TODO(006)` that was never done, while the distance
 * beside it was real. C computes it exactly like the ship scan does:
 * `cbearing(&warsptr->coord, &plptr->coord, warsptr->heading)`
 * (GECMDS.C:2324, the same call as :2222).
 *
 * Found while playing a new pilot: three planets in one sector, all reporting
 * bearing 0, so there was no way to steer toward the one worth claiming.
 */
describe('scan pl — bearing to the planet', () => {
  const bearingOf = (text: string): number =>
    Number(/Bearing:\s*(-?\d+)/.exec(text)?.[1] ?? NaN);

  async function scanFrom(shipOverrides: Partial<ShipState>): Promise<string> {
    const { service, ctx } = makeService({ viewerUserId: 'alice' });
    const ship = makeShip({ ...shipOverrides });
    const texts = await lineTexts(service.command.handler(ship, ['pl', 'Recon Base'], ctx));
    return texts.join('\n');
  }

  it('reports a real bearing, not a placeholder zero', async () => {
    // Planet sits at (10.5, 7.5); ship approaches off-axis from the south-east,
    // so the true bearing is not zero and a placeholder would show up.
    const text = await scanFrom({ xcoord: 10.9, ycoord: 7.9, heading: 0 });
    expect(text).toMatch(/Bearing:/);
    expect(bearingOf(text)).not.toBe(0);
  });

  it('is relative to the ship heading — dead ahead reads 0', async () => {
    // Ship south of the planet pointing north.
    const ahead = await scanFrom({ xcoord: 10.5, ycoord: 7.9, heading: 0 });
    // Same geometry, ship turned around: the planet is now behind it.
    const behind = await scanFrom({ xcoord: 10.5, ycoord: 7.9, heading: 180 });
    expect(bearingOf(ahead)).not.toBe(bearingOf(behind));
    // Signed: turning 180 degrees flips the sign as well as the magnitude, so
    // compare on the absolute compass angle rather than modulo arithmetic.
    const toAbsolute = (relative: number, heading: number) => ((relative + heading) % 360 + 360) % 360;
    expect(toAbsolute(bearingOf(ahead), 0)).toBe(toAbsolute(bearingOf(behind), 180));
  });

  it('stays within the -180..180 a player can act on', async () => {
    // Scans report a SIGNED bearing, as GELIB.C:142-166 does -- negative to
    // port, positive to starboard. This asserted 0..359, which is the range
    // valdegree REJECTS (GEFUNCS.C:1941): a target off the port bow printed
    // something like 300 and `pha 300` came back "number out of range".
    for (const heading of [0, 45, 90, 200, 359]) {
      const b = bearingOf(await scanFrom({ xcoord: 10.9, ycoord: 7.9, heading }));
      expect(b).toBeGreaterThanOrEqual(-180);
      expect(b).toBeLessThanOrEqual(180);
    }
  });
});
