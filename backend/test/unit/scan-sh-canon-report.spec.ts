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
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { MineRegistry } from '../../src/game/combat/mine.registry';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandResult } from '../../src/game/commands/command.types';
import { NUMITEMS } from '../../src/game/constants';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'WildCat', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.0, ycoord: 5.0, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 2, kills: 0, lastfired: 0,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 8, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
    channel: over.channel ?? over.shipno ?? 1,
  } as ShipState;
}

async function makeService(ships: ShipState[]) {
  const service = new ScanHandlerService(
    {
      findAllShips: () => ships,
      findByName: (n: string) => ships.find((s) => s.shipname === n),
      findByUserid: () => [],
      get: (u: string, n: number) => ships.find((s) => s.userid === u && s.shipno === n),
    } as unknown as ShipStateService,
    {
      shipClass: {
        findMany: async () => [
          { classNumber: 1, scanRange: 100_000, typeName: 'Interceptor', maxTons: 1_000 },
          { classNumber: 24, scanRange: 20_000, typeName: 'Sarten Attack Drone', maxTons: 9_600 },
        ],
      },
    } as unknown as PrismaService,
    {
      getSectorPlanets: () => [], getSectorWormholes: () => [],
      findPlanetByName: () => null, getMeta: () => undefined, onModuleInit: () => undefined,
    } as unknown as GalaxyService,
    { get: () => undefined } as unknown as PlanetStateService,
    new MineRegistry(),
  );
  await service.onModuleInit();
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
