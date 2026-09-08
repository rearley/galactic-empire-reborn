import { StatsService } from '../../src/public/stats.service';
import { PresenceService } from '../../src/public/presence.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { buildVersion } from '../../src/public/build-version';

/**
 * The UI header shows the FRONTEND's build. The two images are built by the
 * same workflow but pushed and rolled independently — fail-fast is off, so one
 * can succeed while the other fails, and watchtower updates them seconds apart.
 * A header claiming a version the game engine is not running is worse than no
 * version at all, so the backend reports its own and /stats can show both.
 */
describe('buildVersion', () => {
  it('shortens a full SHA the same way the frontend does', () => {
    expect(buildVersion({ GIT_SHA: '6ea46d9b3c2f1a0e5d4c3b2a19' })).toBe('6ea46d9');
  });

  it('reports "dev" when nothing was injected', () => {
    expect(buildVersion({})).toBe('dev');
    expect(buildVersion({ GIT_SHA: '' })).toBe('dev');
    expect(buildVersion({ GIT_SHA: '   ' })).toBe('dev');
  });
});

describe('/public/stats carries the backend build', () => {
  function makeService() {
    const prisma = {
      user: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;
    return new StatsService(prisma, new PresenceService());
  }

  it('includes a version field', async () => {
    const stats = await makeService().getStats();
    expect(typeof stats.version).toBe('string');
    expect(stats.version.length).toBeGreaterThan(0);
  });

  it('survives JSON serialisation alongside the BigInt-derived fields', () => {
    // score is already a string for this reason; version must not undo it.
    return makeService().getStats().then((s) => {
      expect(() => JSON.stringify(s)).not.toThrow();
    });
  });
});
