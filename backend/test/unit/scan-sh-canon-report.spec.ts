/**
 * `sca sh` is a ten-line intelligence report in canon, and SPEED is on it.
 *
 * GECMDS.C:2226-2258 prints, in order:
 *   SCAN01  Scanning The %s
 *   DASHES
 *   SCAN01A Ship Class: %s
 *   SCAN02  Commanded by: %s
 *   SCAN02A Alliance: %s              (only when teamcode > 0)
 *   SCAN03  Bearing: %d Heading: %d Dist: %s
 *   SCAN03A Galactic Heading: %d Sect: %d %d
 *   SCAN04  Speed: Warp %s
 *   SCAN04A Size: %sm long by %sm wide
 *   then, ONLY when neither ship is in hyperspace:
 *   SCAN05/06/07/07A  damage, shields, registered kills
 *
 * The port collapsed all of it into one line — class number, range, bearing —
 * and dropped speed entirely. Found in live play: a pilot spent several
 * minutes and a lot of energy trying to shoot a Sarten Attack Drone that was
 * doing warp 5, because nothing he could type would tell him it was moving.
 * Speed is the single field that decides whether a fight is possible: above
 * 999 a torpedo cannot lock at all, and a target in hyperspace needs a
 * Mark-PHATOWRP phaser to touch.
 *
 * Size is `max_tons/32` long by `max_tons/96` wide (GECMDS.C:2240-2242).
 */
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { MineRegistry } from '../../src/game/combat/mine.registry';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandResult } from '../../src/game/commands/command.types';
import { NUMITEMS } from '../../src/game/constants';
import { makeShip as baseMakeShip } from '../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'WildCat',
    xcoord: 5.0,
    ycoord: 5.0,
    phasrtype: 2,
    shieldtype: 1,
    items: new Array(NUMITEMS).fill(0n),
    topspeed: 8,
    channel: over.channel ?? over.shipno ?? 1,
    ...over,
  });
}

function makeService(ships: ShipState[]) {
  const shipClassCache = new ShipClassCacheService({} as never);
  shipClassCache.setForTest(1, { maxAcceleration: 0, maxWarp: 0, scanRange: 100_000, typeName: 'Interceptor', maxTons: 1_000 });
  shipClassCache.setForTest(24, { maxAcceleration: 0, maxWarp: 0, scanRange: 20_000, typeName: 'Sarten Attack Drone', maxTons: 9_600 });
  const service = new ScanHandlerService(
    {
      findAllShips: () => ships,
      findByName: (n: string) => ships.find((s) => s.shipname === n),
      findByUserid: () => [],
      get: (u: string, n: number) => ships.find((s) => s.userid === u && s.shipno === n),
    } as unknown as ShipStateService,
    {} as unknown as PrismaService,
    {
      getSectorPlanets: () => [], getSectorWormholes: () => [],
      findPlanetByName: () => null, getMeta: () => undefined, onModuleInit: () => undefined,
    } as unknown as GalaxyService,
    { get: () => undefined } as unknown as PlanetStateService,
    new MineRegistry(),
    undefined,
    shipClassCache,
  );
  return service;
}

const scan = async (service: ScanHandlerService, ship: ShipState, name: string) => {
  const r = await (service.command.handler(ship, ['sh', name], {} as never) as Promise<CommandResult>);
  return r.lines.map((l) => l.text).join('\n');
};

describe('`sca sh` reports what canon reports', () => {
  const target = () => makeShip({
    userid: 'ai', shipno: 2, shipname: 'SADx348871', shpclass: 24,
    xcoord: 6.7, ycoord: 5.0, speed: 5204, where: 1, heading: 90, channel: 2,
  });

  it('reports the target SPEED — the field that decides if a fight is possible', async () => {
    const me = makeShip();
    const out = await scan(await makeService([me, target()]), me, 'SADx348871');

    expect(out).toContain('Speed: Warp 5.20');
  });

  it('names the ship class rather than printing a bare number', async () => {
    const me = makeShip();
    const out = await scan(await makeService([me, target()]), me, 'SADx348871');

    expect(out).toContain('Ship Class: Sarten Attack Drone');
    expect(out).not.toMatch(/class 24/);
  });

  it('gives bearing, heading and distance on one line, as SCAN03 does', async () => {
    const me = makeShip();
    const out = await scan(await makeService([me, target()]), me, 'SADx348871');

    expect(out).toMatch(/Bearing: -?\d+ Heading: -?\d+ Dist: \d+/);
  });

  it('gives the galactic heading and the sector it is in', async () => {
    const me = makeShip();
    const out = await scan(await makeService([me, target()]), me, 'SADx348871');

    expect(out).toContain('Galactic Heading: 90 Sect: 6 5');
  });

  it('gives the hull size, max_tons/32 by max_tons/96', async () => {
    const me = makeShip();
    const out = await scan(await makeService([me, target()]), me, 'SADx348871');

    // 9600/32 = 300, 9600/96 = 100
    expect(out).toContain('Size: 300m long by 100m wide');
  });

  it('withholds damage, shields and kills while the target is in hyperspace', async () => {
    const me = makeShip();
    const out = await scan(await makeService([me, target()]), me, 'SADx348871');

    expect(out).not.toContain('Damage:');
    expect(out).not.toContain('Shields:');
    expect(out).not.toContain('Registered Kills:');
  });

  it('reveals them once neither ship is in hyperspace', async () => {
    const me = makeShip();
    const slow = target();
    slow.speed = 224;
    slow.where = 0;
    slow.kills = 3;
    const out = await scan(await makeService([me, slow]), me, 'SADx348871');

    // showarp gives the bare figure; 224 raw is warp 0.22 — plainly sub-warp.
    expect(out).toContain('Speed: Warp 0.22');
    expect(out).toContain('Damage:');
    expect(out).toContain('Shields: DOWN');
    expect(out).toContain('Registered Kills: 3');
  });
});

/**
 * "Commanded by:" must name the PILOT, not our primary key.
 *
 * Canon prints `username(wptr)` here (GECMDS.C:2229), which returns the hull
 * name for AI and the BBS login for a player. The port printed `target.userid`
 * literally — and OUR userid is a synthetic key, so scanning a friend showed:
 *
 *   Commanded by: usr_11aaf162ae9b2af979259bbd
 *
 * Reported from play. `displayName()` already exists for exactly this and its
 * own doc names `sca sh` as a caller; the call site was simply never wired.
 * @see src/game/ship/display-name.ts
 */
describe('`sca sh` — Commanded by', () => {
  it('names the pilot by their handle, never by the account key', async () => {
    const me = makeShip();
    const friend = makeShip({
      userid: 'usr_11aaf162ae9b2af979259bbd', shipno: 3, shipname: 'The AngryGoatBoy',
      username: 'AngryGoatBoy', status: 1, xcoord: 6.7, ycoord: 5.0, channel: 3,
    });
    const out = await scan(await makeService([me, friend]), me, 'The AngryGoatBoy');

    expect(out).toContain('Commanded by: AngryGoatBoy');
    expect(out).not.toContain('usr_11aaf162ae9b2af979259bbd');
  });

  it('names AI by its hull, as canon username() does', async () => {
    const me = makeShip();
    const cyb = makeShip({
      userid: 'Cybrg-222', shipno: 2, shipname: 'Cyberquad 44135', shpclass: 24,
      status: 2, xcoord: 6.7, ycoord: 5.0, channel: 2,
    });
    const out = await scan(await makeService([me, cyb]), me, 'Cyberquad 44135');

    expect(out).toContain('Commanded by: Cyberquad 44135');
    expect(out).not.toContain('Cybrg-222');
  });
});
