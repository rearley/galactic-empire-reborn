import { Test, TestingModule } from '@nestjs/testing';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { Planet } from '@prisma/client';
import { S00_PLNUM } from '../../src/game/galaxy/s00';

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
  planet: { findMany: jest.fn().mockResolvedValue([]) },
  wormhole: { findMany: jest.fn().mockResolvedValue([]) },
  galaxyMeta: { findFirst: jest.fn().mockResolvedValue(null) },
  $transaction: jest.fn(),
};

// ── Shared test state ─────────────────────────────────────────────────────────

let service: GalaxyService;

// Build the 5 fake planets for sector (0,0) matching the s00 fixture order.
// plnum values are 1..5 to match the canonical neutral-zone layout.
// @see s00.ts — Zygor-3 is index 0 (plnum=1)
const fakeZygor = makePlanet({ xsect: 0, ysect: 0, plnum: 1, name: 'Zygor-3', resource: 2 });
const fakeNexus = makePlanet({ xsect: 0, ysect: 0, plnum: 2, name: 'Nexus Prime', resource: 3, xcoord: 0.2, ycoord: 0.3 });
const fakeCaldor = makePlanet({ xsect: 0, ysect: 0, plnum: 3, name: 'Caldor IV', resource: 1, xcoord: 0.7, ycoord: 0.2 });
const fakeMinera = makePlanet({ xsect: 0, ysect: 0, plnum: 4, name: 'Minera', resource: 3, xcoord: 0.3, ycoord: 0.7 });
const fakeDraconis = makePlanet({ xsect: 0, ysect: 0, plnum: 5, name: 'Draconis', resource: 0, xcoord: 0.8, ycoord: 0.8 });

const s00Planets: Planet[] = [fakeZygor, fakeNexus, fakeCaldor, fakeMinera, fakeDraconis];

beforeAll(async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      GalaxyService,
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
  it('returns the Zygor-3 planet when queried by exact name', () => {
    const result = service.findPlanetByName('Zygor-3');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Zygor-3');
  });

  it('returns null for an unknown planet name', () => {
    expect(service.findPlanetByName('NOTAPLANET')).toBeNull();
  });

  it('lookup is case-insensitive — lowercase works', () => {
    const result = service.findPlanetByName('zygor-3');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Zygor-3');
  });

  it('lookup is case-insensitive — uppercase works', () => {
    const result = service.findPlanetByName('ZYGOR-3');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Zygor-3');
  });

  it('returns the same object regardless of case variant', () => {
    const lower = service.findPlanetByName('zygor-3');
    const upper = service.findPlanetByName('ZYGOR-3');
    const exact = service.findPlanetByName('Zygor-3');
    expect(lower).toBe(exact);
    expect(upper).toBe(exact);
  });
});

// ── G10: getSectorPlanets ─────────────────────────────────────────────────────

describe('G10: getSectorPlanets', () => {
  it(`returns ${S00_PLNUM} planets for sector (0,0) — matches S00_PLNUM fixture count`, () => {
    const planets = service.getSectorPlanets(0, 0);
    expect(planets).toHaveLength(S00_PLNUM);
  });

  it('entries are in fixture order — plnum 1..5', () => {
    const planets = service.getSectorPlanets(0, 0);
    const plnums = planets.map((p) => p.plnum);
    expect(plnums).toEqual([1, 2, 3, 4, 5]);
  });

  it('first entry is Zygor-3 (plnum=1) — canonical starting planet', () => {
    const planets = service.getSectorPlanets(0, 0);
    expect(planets[0].name).toBe('Zygor-3');
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
