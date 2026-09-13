/**
 * `sca sh @` scans whatever you are locked onto.
 *
 * Canon resolves a target argument through `findshp`, and `@` there means "use
 * my lock" (GECMDS.C:1442-1470). Exactly four commands call it:
 *
 *   GECMDS.C:1149  cmd_torp
 *   GECMDS.C:1287  cmd_missl
 *   GECMDS.C:2207  scan_sh      <-- this one
 *   GECMDS.C:5088  cmd_lock
 *
 * The port's own findShip helper implements `@` correctly, but only torpedo,
 * missile and lock call it — `sca sh` parsed its argument by hand and had no
 * `@` branch, so the one command you would most want to point at your current
 * target could not be.
 *
 * It matters because the letters shuffle. A lock holds a SHIP NUMBER, so it
 * survives the scantab being rebuilt; the letter you locked with may since
 * belong to someone else. `sca sh @` is the only way to re-read your actual
 * target without guessing which letter it wears now.
 *
 * The stale-lock behaviour comes free with the shared resolver: out of range,
 * gone from the game, or never set all clear the lock and answer NOLOCK
 * (GECMDS.C:1461-1465).
 */

import { ScanHandlerService } from '../../../../src/game/commands/handlers/scan.handler';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../../src/game/constants/items';
import { NOLOCK_SENTINEL } from '../../../../src/game/commands/helpers/find-ship';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    xcoord: 5,
    ycoord: 5,
    energy: 50_000,
    phasr: 100,
    phasrtype: 2,
    shieldtype: 1,
    items: Array.from({ length: NUMITEMS }, () => 0n),
    topspeed: 10,
    ...over,
  });
}

function build(ships: ShipState[]) {
  const shipClassCache = new ShipClassCacheService({} as never);
  shipClassCache.setForTest(1, { maxAcceleration: 0, maxWarp: 0, scanRange: 100_000 });
  return new ScanHandlerService(
    {
      findAllShips: () => ships,
      findByName: (n: string) => ships.find((s) => s.shipname === n),
      findByUserid: () => [],
      get: (uid: string, no: number) => ships.find((s) => s.userid === uid && s.shipno === no),
      mutate: () => undefined,
    } as never,
    {} as never,
    {
      getSectorPlanets: () => [], getSectorWormholes: () => [],
      findPlanetByName: () => null, getMeta: vi.fn(),
    } as never,
    { get: () => undefined } as never,
    { all: () => [] } as never,
    undefined,
    shipClassCache,
  );
}

describe('sca sh @ — scan the locked target (GECMDS.C:2207)', () => {
  it('scans the ship the lock points at', async () => {
    const target = makeShip({ userid: 'u2', shipno: 2, shipname: 'Bogey', xcoord: 5.2, ycoord: 5 });
    const self = makeShip({ lock: 2, lockUserid: 'u2' } as Partial<ShipState>);
    const svc = build([self, target]);

    const res = await svc.command.handler(self, ['sh', '@'], {} as never);

    expect(res.lines.map((l) => l.text).join('\n')).toContain('Bogey');
  });

  it('refuses when nothing is locked, rather than scanning something else', async () => {
    const self = makeShip({ lock: NOLOCK_SENTINEL });
    const svc = build([self]);

    const res = await svc.command.handler(self, ['sh', '@'], {} as never);

    expect(res.lines.map((l) => l.text).join('\n')).toMatch(/no.*lock/i);
  });

  it('refuses when the lock points at a ship that has left the game', async () => {
    // Canon clears a stale lock and answers NOLOCK rather than silently
    // resolving to whoever now occupies that slot. @see GECMDS.C:1453-1458
    const self = makeShip({ lock: 99 });
    const svc = build([self]);

    const res = await svc.command.handler(self, ['sh', '@'], {} as never);

    expect(res.lines.map((l) => l.text).join('\n')).toMatch(/lock/i);
  });
});
