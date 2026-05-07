import { SenHandlerService } from '../../../src/game/commands/handlers/sen.handler';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext, CommandResult } from '../../../src/game/commands/command.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Alpha',
    shpclass: 1, heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.3, ycoord: 3.7, damage: 0, energy: 1000,
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
    scanNames: false, scanHome: false,
    dirty: false,
    ...overrides,
  };
}

const handler = new SenHandlerService();
const ctx: CommandContext = {};

describe('SenHandlerService', () => {
  describe('command metadata', () => {
    it('keyword is "sen"', () => {
      expect(handler.command.keyword).toBe('sen');
    });

    it('minArgs is 2', () => {
      expect(handler.command.minArgs).toBe(2);
    });
  });

  describe('FR-012: hail produces room: "hail"', () => {
    it('emits broadcast with room "hail" when freq[ch] is 0', () => {
      const ship = makeShip({ freq: [0, 0, 0], shipname: 'Sender' });
      const result = handler.command.handler(ship, ['a', 'hello', 'world'], ctx) as CommandResult;
      expect(result.broadcasts).toHaveLength(1);
      expect(result.broadcasts![0].room).toBe('hail');
    });
  });

  describe('FR-013: unset freq treated as hail', () => {
    it('defaults to hail when freq array is empty', () => {
      const ship = makeShip({ freq: [] });
      const result = handler.command.handler(ship, ['a', 'hi'], ctx) as CommandResult;
      expect(result.broadcasts![0].room).toBe('hail');
    });
  });

  describe('FR-014: sector produces room "sector:{x}:{y}"', () => {
    it('emits sector room when freq is 1-19999', () => {
      const ship = makeShip({ freq: [5000, 0, 0], xcoord: 5.3, ycoord: 3.7 });
      const result = handler.command.handler(ship, ['a', 'ping'], ctx) as CommandResult;
      expect(result.broadcasts![0].room).toBe('sector:5:3');
    });
  });

  describe('FR-015: galaxy produces room "galaxy"', () => {
    it('emits galaxy room when freq >= 20000', () => {
      const ship = makeShip({ freq: [20000, 0, 0] });
      const result = handler.command.handler(ship, ['a', 'broadcast'], ctx) as CommandResult;
      expect(result.broadcasts![0].room).toBe('galaxy');
    });
  });

  describe('FR-016a: message > 200 chars rejected', () => {
    it('returns usage error and no broadcasts for overlong message', () => {
      const ship = makeShip();
      const longMsg = 'x'.repeat(201).split(' ');
      const result = handler.command.handler(ship, ['a', ...longMsg], ctx) as CommandResult;
      expect(result.broadcasts).toBeUndefined();
      expect(result.lines[0].text).toMatch(/Usage: sen/i);
    });

    it('accepts exactly 200 chars', () => {
      const ship = makeShip({ freq: [0, 0, 0] });
      const msg200 = 'x'.repeat(200);
      const result = handler.command.handler(ship, ['a', msg200], ctx) as CommandResult;
      expect(result.broadcasts).toHaveLength(1);
    });
  });

  describe('payload shape', () => {
    it('broadcast payload has from, channel, text fields', () => {
      const ship = makeShip({ freq: [0, 0, 0], shipname: 'Sender' });
      const result = handler.command.handler(ship, ['a', 'hello'], ctx) as CommandResult;
      const payload = result.broadcasts![0].payload as { from: string; channel: string; text: string };
      expect(payload.from).toBe('Sender');
      expect(payload.channel).toBe('A');
      expect(payload.text).toBe('hello');
    });

    it('event is "message.send"', () => {
      const ship = makeShip({ freq: [0, 0, 0] });
      const result = handler.command.handler(ship, ['a', 'hi'], ctx) as CommandResult;
      expect(result.broadcasts![0].event).toBe('message.send');
    });
  });

  describe('FR-016: confirmation line returned to sender', () => {
    it('returns system confirmation line to sender', () => {
      const ship = makeShip({ freq: [0, 0, 0] });
      const result = handler.command.handler(ship, ['a', 'hi'], ctx) as CommandResult;
      expect(result.lines.some((l) => l.category === 'system' && l.text.includes('A'))).toBe(true);
    });
  });

  describe('channel case-insensitive', () => {
    it('accepts uppercase B', () => {
      const ship = makeShip({ freq: [0, 0, 0] });
      const result = handler.command.handler(ship, ['B', 'hi'], ctx) as CommandResult;
      expect(result.broadcasts).toHaveLength(1);
    });

    it('rejects invalid channel "d"', () => {
      const ship = makeShip({ freq: [0, 0, 0] });
      const result = handler.command.handler(ship, ['d', 'hi'], ctx) as CommandResult;
      expect(result.lines[0].text).toMatch(/Usage: sen/i);
    });
  });

  describe('multi-word message', () => {
    it('joins remaining args into a single message text', () => {
      const ship = makeShip({ freq: [0, 0, 0] });
      const result = handler.command.handler(ship, ['a', 'hello', 'there', 'world'], ctx) as CommandResult;
      const payload = result.broadcasts![0].payload as { text: string };
      expect(payload.text).toBe('hello there world');
    });
  });
});
