/**
 * Integration test for ScanHandlerService.clearScantab lifecycle wiring.
 *
 * Tests the scantabMap Map and clearScantab method in isolation (no real sockets
 * or DB required). Gateway wiring is validated by the TypeScript build.
 *
 * @see contracts/scan-render.md §3
 * @see specs/015-scan-modes/tasks.md T007 T008
 */

import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { MineRegistry } from '../../src/game/combat/mine.registry';
import { buildScantab, Scantab } from '../../src/game/commands/handlers/helpers/scantab';
import { ShipState } from '../../src/game/ship/ship-state.types';

/** Minimal ShipState stub for scantab tests. */
function makeShip(userid: string, shipno: number): ShipState {
  return {
    userid,
    shipno,
    shipname: `Ship${shipno}`,
    shpclass: 1,
    xcoord: 1.0,
    ycoord: 1.0,
    heading: 0,
    speed: 0,
    energy: 1000,
    shields: 500,
    hull: 100,
    damage: 0,
    gold: 0n,
    credits: 0n,
    score: 0,
    kills: 0,
    where: 0,
    status: 0,
    cloak: 0,
    repair: 0,
    cantexit: 0,
    teamcode: 0,
    scanNames: false,
    scanHome: false, scanFull: false, msgFilter: false,
    torps: [],
    missiles: [],
    mines: [],
    decoys: [],
    lockedTarget: null,
  } as unknown as ShipState;
}

describe('ScanHandlerService — scantab lifecycle', () => {
  let service: ScanHandlerService;

  beforeEach(() => {
    // Create service with minimal mocks — we only test scantabMap behaviour.
    const shipService = {
      findAllShips: () => [],
      findByName: () => null,
      get: () => null,
    } as unknown as ShipStateService;

    const prisma = {
      shipClass: { findMany: async () => [] },
    } as unknown as PrismaService;

    const galaxyService = {
      getSectorPlanets: () => [],
      getSectorWormholes: () => [],
      findPlanetByName: () => null,
    } as unknown as GalaxyService;

    const planetService = {
      get: () => null,
    } as unknown as PlanetStateService;

    service = new ScanHandlerService(shipService, prisma, galaxyService, planetService,
    new MineRegistry(),
  );
  });

  it('clearScantab on a non-existent key is a no-op (does not throw)', () => {
    expect(() => service.clearScantab('user-ghost', 1)).not.toThrow();
  });

  it('clearScantab removes an existing scantab entry', () => {
    // Access private map via type assertion to seed a test entry.
    const map = (service as unknown as { scantabMap: Map<string, Scantab> }).scantabMap;

    const self = makeShip('alice', 1);
    const other = makeShip('bob', 2);
    // Build a minimal scantab with a scan range large enough to include `other`.
    const tab = buildScantab(self, [self, other], null, 999_999);

    map.set('alice#1', tab);
    expect(map.has('alice#1')).toBe(true);

    service.clearScantab('alice', 1);

    expect(map.has('alice#1')).toBe(false);
  });

  it('clearScantab only removes the targeted player — other entries untouched', () => {
    const map = (service as unknown as { scantabMap: Map<string, Scantab> }).scantabMap;

    const tabAlice: Scantab = [{ shipKey: 'bob#2', dist: 100, letter: 'A', bearing: 0, heading: 0, speed: 0, flag: 1 }];
    const tabBob: Scantab = [{ shipKey: 'alice#1', dist: 100, letter: 'A', bearing: 180, heading: 0, speed: 0, flag: 1 }];

    map.set('alice#1', tabAlice);
    map.set('bob#2', tabBob);

    service.clearScantab('alice', 1);

    expect(map.has('alice#1')).toBe(false);
    expect(map.has('bob#2')).toBe(true);
  });

  it('simulates disconnect lifecycle: entry is gone after clearScantab', () => {
    const map = (service as unknown as { scantabMap: Map<string, Scantab> }).scantabMap;

    // Simulate a scantab being written during a scan ra/se command.
    const tab: Scantab = [];
    map.set('player#3', tab);
    expect(map.size).toBe(1);

    // Simulate handleDisconnect calling clearScantab.
    service.clearScantab('player', 3);

    expect(map.size).toBe(0);
  });

  it('simulates death lifecycle: clearScantab for victim clears only victim entry', () => {
    const map = (service as unknown as { scantabMap: Map<string, Scantab> }).scantabMap;

    map.set('victim#1', []);
    map.set('attacker#2', []);

    // Simulate handleCombatShipDestroyed parsing victimShipKey and calling clearScantab.
    const victimShipKey = 'victim:1';
    const keyParts = victimShipKey.split(':');
    const victimShipno = Number(keyParts[keyParts.length - 1]);
    const victimUserid = 'victim';
    service.clearScantab(victimUserid, victimShipno);

    expect(map.has('victim#1')).toBe(false);
    expect(map.has('attacker#2')).toBe(true);
  });

  it('clearScantab is idempotent — calling twice does not throw', () => {
    const map = (service as unknown as { scantabMap: Map<string, Scantab> }).scantabMap;
    map.set('charlie#5', []);

    expect(() => {
      service.clearScantab('charlie', 5);
      service.clearScantab('charlie', 5); // second call — key already gone
    }).not.toThrow();

    expect(map.has('charlie#5')).toBe(false);
  });
});
