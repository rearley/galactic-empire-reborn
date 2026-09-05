import { FreHandlerService } from '../../../src/game/commands/handlers/fre.handler';
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
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

const handler = new FreHandlerService();
const ctx: CommandContext = {};

describe('FreHandlerService', () => {
  describe('command metadata', () => {
    it('keyword is "fre"', () => {
      expect(handler.command.keyword).toBe('fre');
    });

    it('minArgs is 2', () => {
      expect(handler.command.minArgs).toBe(2);
    });

    it('argMissingMessage mentions usage', () => {
      expect(handler.command.argMissingMessage).toMatch(/Type HELP SET for the correct usage\./i);
    });
  });

  describe('FR-017: hail keyword sets freq to 0', () => {
    it('sets ship.freq[0] to 0 on "fre a hail"', () => {
      const ship = makeShip({ freq: [5, 0, 0] });
      handler.command.handler(ship, ['a', 'hail'], ctx);
      expect(ship.freq[0]).toBe(0);
    });

    it('hail is case-insensitive', () => {
      const ship = makeShip({ freq: [5, 0, 0] });
      handler.command.handler(ship, ['A', 'HAIL'], ctx);
      expect(ship.freq[0]).toBe(0);
    });

    it('returns hail confirmation line', () => {
      const ship = makeShip();
      const result = handler.command.handler(ship, ['a', 'hail'], ctx);
      const r = result as import('../../../src/game/commands/command.types').CommandResult;
      expect(r.lines[0].text).toMatch(/set to\nthe general hailing frequency/i);
      expect(r.lines[0].category).toBe('success');
    });
  });

  describe('FR-018: 1-19999 sector-scoped', () => {
    it('sets freq and returns sector confirmation', () => {
      const ship = makeShip({ freq: [0, 0, 0] });
      const result = handler.command.handler(ship, ['b', '5000'], ctx) as import('../../../src/game/commands/command.types').CommandResult;
      expect(ship.freq[1]).toBe(5000);
      expect(result.lines[0].text).toMatch(/is set to\nfrequency \d+/i);
      expect(result.lines[0].category).toBe('success');
    });
  });

  describe('FR-019: galaxy-wide for >= 20000', () => {
    it('sets freq and returns galaxy confirmation', () => {
      const ship = makeShip({ freq: [0, 0, 0] });
      const result = handler.command.handler(ship, ['c', '20000'], ctx) as import('../../../src/game/commands/command.types').CommandResult;
      expect(ship.freq[2]).toBe(20000);
      expect(result.lines[0].text).toMatch(/set to hyperspace\npacket code \d+/i);
    });
  });

  describe('FR-019: explicit 0 is rejected', () => {
    it('answers a zero frequency with FREQFMT, not the general usage line', () => {
      const ship = makeShip({ freq: [5, 0, 0] });
      const result = handler.command.handler(ship, ['a', '0'], ctx) as import('../../../src/game/commands/command.types').CommandResult;
      expect(result.lines[0].text).toMatch(/Type HELP FREQ for the correct usage\./i);
      expect(ship.freq[0]).toBe(5); // unchanged
    });
  });

  describe('FR-020: negative rejected', () => {
    it('rejects negative frequency', () => {
      const ship = makeShip();
      const result = handler.command.handler(ship, ['a', '-1'], ctx) as import('../../../src/game/commands/command.types').CommandResult;
      expect(result.lines[0].text).toMatch(/Type HELP SET for the correct usage\./i);
    });
  });

  describe('FR-020: non-integer rejected', () => {
    it('rejects decimal frequency', () => {
      const ship = makeShip();
      const result = handler.command.handler(ship, ['a', '1.5'], ctx) as import('../../../src/game/commands/command.types').CommandResult;
      expect(result.lines[0].text).toMatch(/Type HELP SET for the correct usage\./i);
    });
  });

  describe('bad channel letter rejected', () => {
    it('rejects invalid channel "d"', () => {
      const ship = makeShip();
      const result = handler.command.handler(ship, ['d', '5000'], ctx) as import('../../../src/game/commands/command.types').CommandResult;
      expect(result.lines[0].text).toMatch(/Type HELP SET for the correct usage\./i);
    });
  });

  describe('FR-021: dirty flag set on success', () => {
    it('sets dirty=true on successful fre', () => {
      const ship = makeShip({ dirty: false });
      handler.command.handler(ship, ['a', 'hail'], ctx);
      expect(ship.dirty).toBe(true);
    });

    it('does NOT set dirty on error', () => {
      const ship = makeShip({ dirty: false });
      handler.command.handler(ship, ['a', '0'], ctx);
      expect(ship.dirty).toBe(false);
    });
  });

  describe('FR-022: channel mapping', () => {
    it('channel A maps to freq[0]', () => {
      const ship = makeShip({ freq: [0, 0, 0] });
      handler.command.handler(ship, ['a', '1000'], ctx);
      expect(ship.freq[0]).toBe(1000);
    });

    it('channel B maps to freq[1]', () => {
      const ship = makeShip({ freq: [0, 0, 0] });
      handler.command.handler(ship, ['b', '1000'], ctx);
      expect(ship.freq[1]).toBe(1000);
    });

    it('channel C maps to freq[2]', () => {
      const ship = makeShip({ freq: [0, 0, 0] });
      handler.command.handler(ship, ['c', '1000'], ctx);
      expect(ship.freq[2]).toBe(1000);
    });
  });
});
