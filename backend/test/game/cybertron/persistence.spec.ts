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
import type { Mock } from 'vitest';

async function buildRepo(prisma: PrismaService): Promise<{ repo: CybertronRepository; shipState: ShipStateService }> {
  const shipState = {
    loadShip: vi.fn(),
    findByUserid: vi.fn().mockReturnValue([]),
    findAllShips: vi.fn().mockReturnValue([]),
    get: vi.fn().mockReturnValue(undefined),
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
        topspeed: 8,
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
        loadShip: vi.fn((s: { userid: string; shipno: number }) => loadedShips.push(s)),
        findByUserid: vi.fn().mockReturnValue([]),
        findAllShips: vi.fn().mockReturnValue([]),
        get: vi.fn().mockImplementation(
          (userid: string, shipno: number) =>
            loadedShips.find((s) => s.userid === userid && s.shipno === shipno) ?? undefined,
        ),
      } as unknown as ShipStateService;

      const repo = new CybertronRepository(prisma, shipState);

      await repo.createSpawn({
        userid: 'Cybrg-test-spawn',
        shipno: 950,
        classNumber: 21,
        topspeed: 8,
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

  // ─── hydrateAll skips dead Cybertrons ─────────────────────────────────────

  describe('hydrateAll — already-dead Cybertron rows', () => {
    it('does NOT load Cybertrons with damage >= 100 into memory', async () => {
      // Seed one alive and one dead Cybertron under unique test userids.
      await prisma.user.upsert({
        where: { userid: 'Cybrg-test-alive' },
        create: { userid: 'Cybrg-test-alive', username: 'Cybrg-test-alive', cash: 0n },
        update: { cash: 0n },
      });
      await prisma.user.upsert({
        where: { userid: 'Cybrg-test-dead' },
        create: { userid: 'Cybrg-test-dead', username: 'Cybrg-test-dead', cash: 0n },
        update: { cash: 0n },
      });
      await prisma.ship.create({
        data: {
          userid: 'Cybrg-test-alive', shipno: 920, shipname: 'Alive',
          shpclass: 21, xcoord: 1, ycoord: 1, damage: 0, status: 2,
          items: Array(16).fill(0n),
        },
      });
      await prisma.ship.create({
        data: {
          userid: 'Cybrg-test-dead', shipno: 921, shipname: 'Dead',
          shpclass: 21, xcoord: 1, ycoord: 1, damage: 100, status: 0,
          items: Array(16).fill(0n),
        },
      });

      const loaded: { userid: string }[] = [];
      const shipState = {
        loadShip: vi.fn((s: { userid: string }) => loaded.push(s)),
        findByUserid: vi.fn().mockReturnValue([]),
        findAllShips: vi.fn().mockReturnValue([]),
        get: vi.fn().mockReturnValue(undefined),
      } as unknown as ShipStateService;

      const repo = new CybertronRepository(prisma, shipState);
      await repo.hydrateAll();

      const testLoads = loaded.filter((s) => s.userid.startsWith('Cybrg-test-'));
      expect(testLoads.map((s) => s.userid)).toContain('Cybrg-test-alive');
      expect(testLoads.map((s) => s.userid)).not.toContain('Cybrg-test-dead');
    });
  });

  // ─── The canon load block: a saved claim never survives the restart ──────

  describe('hydrateAll — canon resets the engagement fields on load', () => {
    it('clears a persisted cybmine rather than trusting a recycled channel', async () => {
      // `cybmine` holds a CHANNEL, and channels are session-scoped and recycled
      // by ShipChannelRegistry — they are not stored in the database. A claim
      // that outlives a restart therefore names whoever happens to hold that
      // number next, which is a different pilot. Canon clears it on load, in
      // the same block as the speed2b kick-start this repository already cites.
      // @see GECYBS.C:133 `		ptr->cybmine = (byte)255;`
      await prisma.user.upsert({
        where: { userid: 'Cybrg-test-claim' },
        create: { userid: 'Cybrg-test-claim', username: 'Cybrg-test-claim', cash: 0n },
        update: { cash: 0n },
      });
      await prisma.ship.create({
        data: {
          userid: 'Cybrg-test-claim', shipno: 922, shipname: 'Claimer',
          shpclass: 21, xcoord: 1, ycoord: 1, damage: 0, status: 2,
          // The production state that prompted this: a live claim on channel 18,
          // and the close-combat crawl that went with shadowing a player.
          cybmine: 18, holdcourse: 7, speed2b: 284, topspeed: 8,
          items: Array(16).fill(0n),
        },
      });

      const loaded: { userid: string; cybmine: number; holdcourse: number; speed2b: number }[] = [];
      const shipState = {
        loadShip: vi.fn((s: { userid: string; cybmine: number; holdcourse: number; speed2b: number }) => loaded.push(s)),
        findByUserid: vi.fn().mockReturnValue([]),
        findAllShips: vi.fn().mockReturnValue([]),
        get: vi.fn().mockReturnValue(undefined),
      } as unknown as ShipStateService;

      const repo = new CybertronRepository(prisma, shipState);
      await repo.hydrateAll();

      const claimer = loaded.find((s) => s.userid === 'Cybrg-test-claim');
      expect(claimer).toBeDefined();
      // 255 is "I have claimed nobody" — the loop re-acquires on its next
      // activation exactly as it would for a freshly spawned hull.
      expect(claimer?.cybmine).toBe(255);
      // And a cruise speed to carry it, UNCONDITIONALLY. The stored speed
      // belongs to whatever the ship was doing when the process died, and the
      // claim that justified it has just been cleared: a close-combat crawl
      // survived the restart and left an Obliterator inching around the hub at
      // 284 on v0.27.7. Canon overwrites it on every load.
      // @see GECYBS.C:134 `		ptr->speed2b = (double)(ptr->topspeed)*500.0;`
      expect(claimer?.speed2b).toBe(8 * 1000);
      // Cleared in the same canon block, and it gates the re-acquisition:
      // a stored countdown would make the ship skip lockon for several
      // activations after boot. @see GECYBS.C:136 `		ptr->holdcourse = 0;`
      expect(claimer?.holdcourse).toBe(0);
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
          topspeed: 6,
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
        loadShip: vi.fn((s: unknown) => loadedShips.push(s)),
        findByUserid: vi.fn().mockReturnValue([]),
        findAllShips: vi.fn().mockReturnValue([]),
        get: vi.fn().mockReturnValue(undefined),
      } as unknown as ShipStateService;

      const repo = new CybertronRepository(prisma, shipState);
      await repo.hydrateAll();

      // All 3 (+ possibly leftovers from T057) should be loaded
      // Filter to just our test ships
      const testLoads = (shipState.loadShip as Mock).mock.calls
        .map(([s]) => s as { userid: string })
        .filter((s) => (s as { userid: string }).userid?.startsWith('Cybrg-test-'));
      expect(testLoads.length).toBeGreaterThanOrEqual(3);

      // Each has status AUTO (2)
      for (const ship of testLoads) {
        expect((ship as unknown as { status: number }).status).toBe(2);
      }
    });
  });
});
