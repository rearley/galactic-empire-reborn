import { WhoHandlerService } from '../../../src/game/commands/handlers/who.handler';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../src/game/commands/command.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Alpha',
    shpclass: 1, heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 3, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

const ctx: CommandContext = {};

describe('WhoHandlerService', () => {
  describe('command metadata', () => {
    it('keyword is "who"', () => {
      const svc = new WhoHandlerService({ findAllShips: () => [] } as unknown as ShipStateService);
      expect(svc.command.keyword).toBe('who');
    });

    it('minArgs is 0', () => {
      const svc = new WhoHandlerService({ findAllShips: () => [] } as unknown as ShipStateService);
      expect(svc.command.minArgs).toBe(0);
    });
  });

  describe('FR-001: header line present', () => {
    it('emits header as first line', () => {
      const svc = new WhoHandlerService({ findAllShips: () => [] } as unknown as ShipStateService);
      const result = svc.command.handler(makeShip(), [], ctx) as ReturnType<typeof svc.command.handler>;
      const lines = (result as import('../../../src/game/commands/command.types').CommandResult).lines;
      expect(lines[0].text).toMatch(/Shipname/i);
      expect(lines[0].category).toBe('system');
    });
  });

  describe('FR-002: lists active non-cloaked ships', () => {
    it('includes self in listing', () => {
      const ship = makeShip({ userid: 'u1', shipno: 1, shipname: 'Alpha', cloak: 0 });
      const svc = new WhoHandlerService({ findAllShips: () => [ship] } as unknown as ShipStateService);
      const result = svc.command.handler(ship, [], ctx) as import('../../../src/game/commands/command.types').CommandResult;
      const infoLines = result.lines.filter((l) => l.category === 'info');
      expect(infoLines.some((l) => l.text.includes('Alpha'))).toBe(true);
    });

    it('returns one row when alone', () => {
      const ship = makeShip({ shipname: 'Solo', cloak: 0 });
      const svc = new WhoHandlerService({ findAllShips: () => [ship] } as unknown as ShipStateService);
      const result = svc.command.handler(ship, [], ctx) as import('../../../src/game/commands/command.types').CommandResult;
      const infoLines = result.lines.filter((l) => l.category === 'info');
      expect(infoLines).toHaveLength(1);
    });
  });

  describe('FR-003: excludes cloaked ships', () => {
    it('omits cloaked ships from listing', () => {
      const visible = makeShip({ userid: 'u1', shipno: 1, shipname: 'Visible', cloak: 0 });
      const cloaked = makeShip({ userid: 'u2', shipno: 2, shipname: 'Shadow', cloak: 1 });
      const svc = new WhoHandlerService({ findAllShips: () => [visible, cloaked] } as unknown as ShipStateService);
      const result = svc.command.handler(visible, [], ctx) as import('../../../src/game/commands/command.types').CommandResult;
      expect(result.lines.some((l) => l.text.includes('Shadow'))).toBe(false);
    });
  });

  describe('FR-003a: sorts by shipname ascending case-insensitive', () => {
    it('orders rows alphabetically case-insensitively', () => {
      const ships = [
        makeShip({ userid: 'u3', shipno: 3, shipname: 'zebra', cloak: 0 }),
        makeShip({ userid: 'u1', shipno: 1, shipname: 'Alpha', cloak: 0 }),
        makeShip({ userid: 'u2', shipno: 2, shipname: 'beta', cloak: 0 }),
      ];
      const svc = new WhoHandlerService({ findAllShips: () => ships } as unknown as ShipStateService);
      const result = svc.command.handler(ships[0], [], ctx) as import('../../../src/game/commands/command.types').CommandResult;
      const infoLines = result.lines.filter((l) => l.category === 'info');
      const names = infoLines.map((l) => l.text.trim().split(/\s+/)[0]);
      expect(names).toEqual(['Alpha', 'beta', 'zebra']);
    });
  });

  describe('empty galaxy', () => {
    it('returns only the header when no ships present', () => {
      const svc = new WhoHandlerService({ findAllShips: () => [] } as unknown as ShipStateService);
      const result = svc.command.handler(makeShip(), [], ctx) as import('../../../src/game/commands/command.types').CommandResult;
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].category).toBe('system');
    });
  });
});

/**
 * Playtest: `who` in a live galaxy printed rows whose Sector and Kills columns
 * wandered. Coordinates were padded to two characters, so any ship in a
 * negative double-digit sector (`(-13, 1)`) pushed the rest of the row right;
 * a 22-character shipname did the same.
 */
describe('WhoHandlerService — column alignment', () => {
  const build = (ships: ShipState[]): string[] => {
    const svc = new WhoHandlerService({ findAllShips: () => ships } as unknown as ShipStateService);
    const result = svc.command.handler(ships[0] ?? makeShip(), [], ctx) as { lines: { text: string }[] };
    return result.lines.map((l) => l.text);
  };

  it('keeps every row the same length regardless of coordinate width', () => {
    const lines = build([
      makeShip({ shipname: 'Alpha', xcoord: 5, ycoord: 3 }),
      makeShip({ shipname: 'Beta', xcoord: -13, ycoord: -14 }),
      makeShip({ shipname: 'Gamma', xcoord: 0, ycoord: 0 }),
    ]);
    const rowLengths = new Set(lines.slice(1).map((l) => l.length));
    expect(rowLengths.size).toBe(1);
  });

  it('an over-long shipname does not push the later columns right', () => {
    const lines = build([
      makeShip({ shipname: 'Alpha' }),
      makeShip({ shipname: 'Lydorian Garbage Scow9999' }),
    ]);
    expect(lines[1].length).toBe(lines[2].length);
  });

  it('the Kills header sits over the Kills values', () => {
    const lines = build([makeShip({ shipname: 'Alpha', kills: 7, xcoord: -13, ycoord: -14 })]);
    const end = (line: string): number => {
      const m = [...line.matchAll(/\S+/g)];
      return m[m.length - 1].index! + m[m.length - 1][0].length;
    };
    expect(end(lines[1])).toBe(end(lines[0]));
  });
});
