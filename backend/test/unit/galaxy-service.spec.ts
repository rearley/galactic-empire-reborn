import { Test, TestingModule } from '@nestjs/testing';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { WormholeRepository } from '../../src/game/galaxy/wormhole.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { Planet } from '../../src/prisma/client';
import { S00, S00_PLNUM } from '../../src/game/galaxy/s00';

// ── Minimal Planet factory ────────────────────────────────────────────────────

function makePlanet(overrides: Partial<Planet> & Pick<Planet, 'xsect' | 'ysect' | 'plnum' | 'name'>): Planet {
  return {
    type: 2,
    xcoord: 0.5,
    ycoord: 0.5,
    userid: null,
    enviorn: 0,
    resource: 2,
    cash: BigInt(0),
    debt: BigInt(0),
    tax: BigInt(0),
    taxrate: 0,
    warnings: 0,
    password: 'none',
    lastattack: '',
    beacon: '',
    spyowner: '',
    // Never ticked — the persisted production schedule. @see planet-tick.service isDue
    lastTickAt: null,
    technology: 0,
    teamcode: BigInt(0),
    itemsQty: [],
    itemsRate: [],
    itemsSell: [],
    itemsReserve: [],
    itemsMarkup2a: [],
    itemsSold2a: [],
    ...overrides,
  };
}

// ── Mock PrismaService ────────────────────────────────────────────────────────

const prismaMock = {
  planet: { findMany: vi.fn().mockResolvedValue([]) },
  wormhole: { findMany: vi.fn().mockResolvedValue([]) },
  galaxyMeta: { findFirst: vi.fn().mockResolvedValue(null) },
  $transaction: vi.fn(),
};

// ── Shared test state ─────────────────────────────────────────────────────────

let service: GalaxyService;

// Build the fake sector (0,0) rows straight FROM the fixture, so this spec can
// never drift from it the way its hand-written Zygor-3/Nexus Prime/Caldor IV/
// Minera/Draconis set did. Only the non-portal entries are planets: a type-3
// entry is written to the Wormhole table instead. @see GEPLANET.C:517-520
const s00Planets: Planet[] = S00.map((e, i) =>
  makePlanet({
    xsect: 0,
    ysect: 0,
    plnum: i + 1,
    name: e.name,
    xcoord: e.xcoord,
    ycoord: e.ycoord,
    enviorn: e.env,
    resource: e.res,
  }),
).filter((_, i) => S00[i].type !== 3);

/** plnums of the entries that become planets — 1, 2, 3 in the shipped table. */
const s00PlanetPlnums = S00.map((e, i) => (e.type === 3 ? null : i + 1)).filter(
  (n): n is number => n !== null,
);

beforeAll(async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      GalaxyService,
      WormholeRepository,
      { provide: PrismaService, useValue: prismaMock },
    ],
  }).compile();

  // Do NOT call module.init() — onModuleInit is a stub in T019.
  // Manually populate the private maps to test read-method behaviour in isolation.
  service = module.get(GalaxyService);

  (service as any).planetsBySector.set('0,0', [...s00Planets]);

  // planetsByName is keyed by lower-cased name (see galaxy.service.ts:46)
  for (const p of s00Planets) {
    (service as any).planetsByName.set(p.name.toLowerCase(), p);
  }
});

// ── G9: findPlanetByName ──────────────────────────────────────────────────────

describe('G9: findPlanetByName', () => {
  it('returns the Zygor planet when queried by exact name', () => {
    const result = service.findPlanetByName('Zygor');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Zygor');
  });

  it('returns null for an unknown planet name', () => {
    expect(service.findPlanetByName('NOTAPLANET')).toBeNull();
  });

  it('lookup is case-insensitive — lowercase works', () => {
    const result = service.findPlanetByName('zygor');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Zygor');
  });

  it('lookup is case-insensitive — uppercase works', () => {
    const result = service.findPlanetByName('ZYGOR');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Zygor');
  });

  it('returns the same object regardless of case variant', () => {
    const lower = service.findPlanetByName('zygor');
    const upper = service.findPlanetByName('ZYGOR');
    const exact = service.findPlanetByName('Zygor');
    expect(lower).toBe(exact);
    expect(upper).toBe(exact);
  });
});

// ── G10: getSectorPlanets ─────────────────────────────────────────────────────

describe('G10: getSectorPlanets', () => {
  it(`returns the ${s00PlanetPlnums.length} non-portal entries of the ${S00_PLNUM}-slot fixture`, () => {
    const planets = service.getSectorPlanets(0, 0);
    expect(planets).toHaveLength(s00PlanetPlnums.length);
    expect(s00PlanetPlnums.length).toBeLessThan(S00_PLNUM);
  });

  it('entries keep their fixture plnum', () => {
    const planets = service.getSectorPlanets(0, 0);
    expect(planets.map((p) => p.plnum)).toEqual(s00PlanetPlnums);
  });

  it('first entry is Zygor (plnum=1) — canonical starting planet', () => {
    const planets = service.getSectorPlanets(0, 0);
    expect(planets[0].name).toBe('Zygor');
    expect(planets[0].plnum).toBe(1);
  });

  it('returns an empty array for an unpopulated sector', () => {
    expect(service.getSectorPlanets(5, 5)).toEqual([]);
  });

  it('returns a readonly-compatible result (no mutation of internal state)', () => {
    const a = service.getSectorPlanets(0, 0);
    const b = service.getSectorPlanets(0, 0);
    // Both calls should refer to the same underlying array (O(1) map lookup)
    expect(a).toBe(b);
  });
});

// ── getMeta: throws when not initialized ──────────────────────────────────────

describe('getMeta', () => {
  it('throws when meta has not been populated', () => {
    // meta starts as null (onModuleInit is a stub); this guards against silent
    // undefined returns if someone removes the null-check in the future.
    expect(() => service.getMeta()).toThrow('GalaxyService not yet initialized');
  });
});
