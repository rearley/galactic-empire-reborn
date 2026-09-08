/**
 * A dead AI hull must not be loaded back into the game.
 *
 * There are two hydration paths and only one had this guard.
 * `CybertronRepository.hydrateAll` skips `damage >= 100` and says exactly why:
 * "otherwise runKillResolution re-processes the persisted kill on the first
 * physics tick after boot and emits a phantom COMBAT_SHIP_DESTROYED to all
 * clients." But `ShipStateService.onModuleInit` runs FIRST and loaded every
 * GESTAT_AUTO row regardless, so the corpse was already in the map by the time
 * the Cybertron repository declined to add it.
 *
 * The gateway never deletes an AI hull ("death/persistence owned by the AI
 * layer"), so the row survives at damage >= 100 and the whole thing repeats on
 * the NEXT restart, for ever.
 *
 * Observed in production 2026-09-08 — the boot log is the fingerprint:
 *
 *   [ShipStateService]    Hydrated 24 ships from Postgres
 *   [CybertronRepository] Hydrated 23 Cybertron/Sartern ships
 *
 * and four seconds later `Cybrg-222:222` (a Sarten Obliterator holding 1,146
 * gold, damage 110.62) was announced destroyed with attacker=none, for at least
 * the second time.
 */
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { shipKey } from '../../../src/game/ship/ship-state.types';

function row(over: Record<string, unknown>) {
  return {
    userid: 'Cybrg-1', shipno: 1, shipname: 'Scout', shpclass: 21,
    heading: 0, head2b: 0, speed: 0, speed2b: 0, xcoord: 1, ycoord: 1,
    damage: 0, energy: 50000, phasr: 100, phasrtype: 2, kills: 0, lastfired: 0,
    shieldtype: 2, shieldstat: 0, shield: 0, cloak: 0, degrees: 0, percent: 0,
    tactical: 0, helm: 0, train: 0, where: 0,
    ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    decout: [], jammer: 0, freq: [], items: Array(16).fill(0n), titem: 0,
    hostile: 0, cantexit: 0, repair: 0, hypha: 0, firecntl: 0, destruct: 0,
    status: 2, cybmine: 255, cybskill: 10, cybupdate: 100, tick: 6, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 8, warncntr: 0,
    user: { teamcode: null, options: [0, 0, 0, 0], kills: 0, username: null, fkeys: [] },
    ...over,
  };
}

describe('ShipStateService hydration — corpses stay dead', () => {
  const build = (rows: Array<Record<string, unknown>>) => {
    // Applies the damage filter the way Postgres would, so this asserts the
    // ships that end up in the map rather than asserting the mock.
    const findMany = jest.fn().mockImplementation((args: { where?: { damage?: { lt?: number } } }) => {
      const lt = args?.where?.damage?.lt;
      return Promise.resolve(lt === undefined ? rows : rows.filter((r) => (r.damage as number) < lt));
    });
    const prisma = {
      ship: { findMany },
      shipClass: { findMany: jest.fn().mockResolvedValue([{ classNumber: 21, maxWarp: 8, maxTons: 1000 }, { classNumber: 25, maxWarp: 15, maxTons: 30000 }]) },
    } as unknown as PrismaService;
    const service = new ShipStateService(prisma, { subscribe: () => () => {}, registerSnapshotProvider: () => {} } as never);
    return { service, findMany };
  };

  it('does not load an AI hull that is already past the kill threshold', async () => {
    const { service } = build([
      row({ userid: 'Cybrg-222', shipno: 222, shipname: 'SOBx949345', shpclass: 25, damage: 110.62 }),
      row({ userid: 'Cybrg-1', shipno: 1, damage: 12 }),
    ]);

    await service.onModuleInit();

    // The live one is in; the corpse is not, so runKillResolution has nothing
    // to re-kill and no phantom announcement to make.
    expect(service.get('Cybrg-1', 1)).toBeDefined();
    expect(service.get('Cybrg-222', 222)).toBeUndefined();
    expect(service.findAllShips().map((s) => shipKey(s.userid, s.shipno))).toEqual(['Cybrg-1:1']);
  });

  it('excludes them in the query rather than filtering after the fact', async () => {
    // Loading every corpse just to drop it grows with the graveyard; the
    // Cybertron repository already expresses the same rule as a guard, and the
    // two paths should not disagree about what "in the game" means.
    const { service, findMany } = build([]);
    await service.onModuleInit();
    const where = findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where).toMatchObject({ damage: { lt: 100 } });
  });
});
