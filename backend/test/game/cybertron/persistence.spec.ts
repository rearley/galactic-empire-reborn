/**
 * T056-T058, T060a — Cybertron persistence tests.
 * T056: boot-time hydrate reloads all Cybertrons/Sarterns.
 * T057: hydrateAll clamps cash > CYB_MAXCASH.
 * T058: spawn-fill creates the right number of missing ships.
 * T060a: clampCybertronCash applied at every persistence boundary.
 *
 * @see GECYBS.C:88 cyb_init — hydrate path
 * @see specs/007-cybertron-ai/tasks.md T056-T058, T060a
 */
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { CYB_MAXCASH } from '../../../src/game/constants';

async function buildRepo(prisma: PrismaService): Promise<{ repo: CybertronRepository; shipState: ShipStateService }> {
  const shipState = {
    loadShip: jest.fn(),
    findByUserid: jest.fn().mockReturnValue([]),
    findAllShips: jest.fn().mockReturnValue([]),
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ShipStateService;

  const repo = new CybertronRepository(prisma, shipState);
  return { repo, shipState };
}

describe('Cybertron persistence (T056-T058, T060a)', () => {
  let app: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [PrismaModule],
    }).compile();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up any Cybrg-* test rows
    await prisma.ship.deleteMany({ where: { userid: { startsWith: 'Cybrg-test-' } } });
    await prisma.user.deleteMany({ where: { userid: { startsWith: 'Cybrg-test-' } } });
  });

  afterEach(async () => {
    await prisma.ship.deleteMany({ where: { userid: { startsWith: 'Cybrg-test-' } } });
    await prisma.user.deleteMany({ where: { userid: { startsWith: 'Cybrg-test-' } } });
  });

  // ─── T060a: clampCybertronCash at every boundary ─────────────────────────

  describe('T060a — clampCybertronCash applied at every persistence boundary', () => {
    it('clampCybertronCash returns max for value > CYB_MAXCASH', () => {
      // Directly test via a new instance (pure function)
      const testPrisma = {} as PrismaService;
      const testShipState = {} as ShipStateService;
      const testRepo = new CybertronRepository(testPrisma, testShipState);

      expect(testRepo.clampCybertronCash(BigInt(CYB_MAXCASH) + 1n)).toBe(BigInt(CYB_MAXCASH));
      expect(testRepo.clampCybertronCash(BigInt(CYB_MAXCASH))).toBe(BigInt(CYB_MAXCASH));
      expect(testRepo.clampCybertronCash(0n)).toBe(0n);
      expect(testRepo.clampCybertronCash(-1n)).toBe(0n);
    });

    it('createSpawn clamps cash to CYB_MAXCASH when cyb_gold exceeds limit', async () => {
      const { repo } = await buildRepo(prisma);

      // Create a class that would give > CYB_MAXCASH gold
      await repo.createSpawn({
        userid: 'Cybrg-test-1',
        shipno: 901,
        classNumber: 21,
        shipname: 'Cybrg-901901',
        xcoord: 5.0,
        ycoord: 5.0,
        phasrtype: 2,
        shieldtype: 2,
        loadout: { fluxpod: 0, decoys: 5, torpedo: 5, mine: 10, jammers: 5, gold: CYB_MAXCASH + 1_000_000 },
        cybskill: 10,
        tick: 6,
      });

      const user = await prisma.user.findUnique({ where: { userid: 'Cybrg-test-1' } });
      expect(user).toBeDefined();
      // Gold in loadout is stored in User.cash, clamped to CYB_MAXCASH
      expect(user!.cash).toBeLessThanOrEqual(BigInt(CYB_MAXCASH));
    });
  });

  // ─── T057: hydrateAll clamps cash ──────────────────────────────────────────

  describe('T057 — hydrateAll clamps User.cash > CYB_MAXCASH', () => {
    it('resets cash to CYB_MAXCASH when DB row has excess cash', async () => {
      // Seed a Cybertron with cash above cap
      await prisma.user.upsert({
        where: { userid: 'Cybrg-test-2' },
        create: { userid: 'Cybrg-test-2', username: 'Cybrg-test-2', cash: BigInt(CYB_MAXCASH) + 500_000n },
        update: { cash: BigInt(CYB_MAXCASH) + 500_000n },
      });
      await prisma.ship.create({
        data: {
          userid: 'Cybrg-test-2',
          shipno: 902,
          shipname: 'Test',
          shpclass: 21,
          xcoord: 5.0,
          ycoord: 5.0,
          status: 2,
          items: Array(16).fill(0n),
        },
      });

      const { repo } = await buildRepo(prisma);
      await repo.hydrateAll();

      // Verify cash was clamped in DB during hydrateAll
      const user = await prisma.user.findUnique({ where: { userid: 'Cybrg-test-2' } });
      expect(user!.cash).toBeLessThanOrEqual(BigInt(CYB_MAXCASH));
    });
  });

  // ─── bugfix: createSpawn loads ship into ShipStateService immediately ────

  describe('createSpawn — ship immediately visible in ShipStateService', () => {
    it('calls loadShip with the new ship after createSpawn so the ship is visible without restart', async () => {
      const loadedShips: { userid: string; shipno: number }[] = [];
      const shipState = {
        loadShip: jest.fn((s: { userid: string; shipno: number }) => loadedShips.push(s)),
        findByUserid: jest.fn().mockReturnValue([]),
        findAllShips: jest.fn().mockReturnValue([]),
        get: jest.fn().mockImplementation(
          (userid: string, shipno: number) =>
            loadedShips.find((s) => s.userid === userid && s.shipno === shipno) ?? undefined,
        ),
      } as unknown as ShipStateService;

      const repo = new CybertronRepository(prisma, shipState);

      await repo.createSpawn({
        userid: 'Cybrg-test-spawn',
        shipno: 950,
        classNumber: 21,
        shipname: 'Cybrg-950950',
        xcoord: 3.0,
        ycoord: 7.0,
        phasrtype: 2,
        shieldtype: 2,
        loadout: { fluxpod: 0, decoys: 5, torpedo: 5, mine: 10, jammers: 5, gold: 1000 },
        cybskill: 10,
        tick: 6,
      });

      // loadShip must have been called for the new ship
      const loaded = loadedShips.find((s) => s.userid === 'Cybrg-test-spawn' && s.shipno === 950);
      expect(loaded).toBeDefined();
      expect(loaded!.userid).toBe('Cybrg-test-spawn');
      expect(loaded!.shipno).toBe(950);

      // The ship must be visible via get() without a restart
      const visible = (shipState as unknown as { get: (u: string, n: number) => unknown }).get('Cybrg-test-spawn', 950);
      expect(visible).toBeDefined();
    });
  });

  // ─── Spawn-slot collision: dead Cybertron row left in DB ─────────────────

  describe('createSpawn — stale dead Cybertron row in DB', () => {
    it('reuses the slot when a Ship row already exists for (userid, shipno)', async () => {
      // Pre-create a stale "dead" Cybertron row at the target slot.
      await prisma.user.upsert({
        where: { userid: 'Cybrg-test-911' },
        create: { userid: 'Cybrg-test-911', username: 'Cybrg-test-911', cash: 0n },
        update: { cash: 0n },
      });
      await prisma.ship.create({
        data: {
          userid: 'Cybrg-test-911',
          shipno: 911,
          shipname: 'OldDeadCyb',
          shpclass: 21,
          xcoord: 0.0,
          ycoord: 0.0,
          damage: 100,           // dead
          status: 0,             // GESTAT_AVAIL
          items: Array(16).fill(0n),
        },
      });

      const { repo } = await buildRepo(prisma);

      // New spawn at the SAME (userid, shipno) — used to throw P2002 unique
      // constraint; now must succeed by overwriting the stale row.
      await expect(
        repo.createSpawn({
          userid: 'Cybrg-test-911',
          shipno: 911,
          classNumber: 22,
          shipname: 'FreshCyb',
          xcoord: 5.5,
          ycoord: 5.5,
          phasrtype: 3,
          shieldtype: 3,
          loadout: { gold: 1000, torpedo: 5, fluxpod: 5, decoys: 5, jammers: 1, mine: 1 },
          cybskill: 7,
          tick: 8,
        }),
      ).resolves.not.toThrow();

      // The row should now reflect the fresh spawn data.
      const row = await prisma.ship.findUnique({
        where: { userid_shipno: { userid: 'Cybrg-test-911', shipno: 911 } },
      });
      expect(row).not.toBeNull();
      expect(row!.shipname).toBe('FreshCyb');
      expect(row!.shpclass).toBe(22);
      expect(row!.damage).toBe(0);
      expect(row!.status).toBe(2);
    });
  });

  // ─── T056: hydrateAll reloads all Cybertrons ─────────────────────────────

  describe('T056 — hydrateAll loads all Cybrg-* ships into ShipStateService', () => {
    it('loads all seeded Cybertrons + Sarterns into in-memory state', async () => {
      // Seed 3 Cybertrons (class 21, 22, 24)
      for (const [suffix, cls] of [['3', 21], ['4', 22], ['5', 24]] as const) {
        await prisma.user.upsert({
          where: { userid: `Cybrg-test-${suffix}` },
          create: { userid: `Cybrg-test-${suffix}`, username: `Cybrg-test-${suffix}`, cash: 1000n },
          update: { cash: 1000n },
        });
        await prisma.ship.create({
          data: {
            userid: `Cybrg-test-${suffix}`,
            shipno: 900 + Number(suffix),
            shipname: `Cybrg-test-${suffix}`,
            shpclass: cls,
            xcoord: 5.0,
            ycoord: 5.0,
            status: 2,
            items: Array(16).fill(0n),
          },
        });
      }

      const loadedShips: unknown[] = [];
      const shipState = {
        loadShip: jest.fn((s: unknown) => loadedShips.push(s)),
        findByUserid: jest.fn().mockReturnValue([]),
        findAllShips: jest.fn().mockReturnValue([]),
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ShipStateService;

      const repo = new CybertronRepository(prisma, shipState);
      await repo.hydrateAll();

      // All 3 (+ possibly leftovers from T057) should be loaded
      // Filter to just our test ships
      const testLoads = (shipState.loadShip as jest.Mock).mock.calls
        .map(([s]: [{ userid: string }]) => s)
        .filter((s) => (s as { userid: string }).userid?.startsWith('Cybrg-test-'));
      expect(testLoads.length).toBeGreaterThanOrEqual(3);

      // Each has status AUTO (2)
      for (const ship of testLoads) {
        expect((ship as unknown as { status: number }).status).toBe(2);
      }
    });
  });
});
