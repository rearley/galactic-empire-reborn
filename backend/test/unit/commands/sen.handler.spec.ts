import { SenHandlerService } from '../../../src/game/commands/handlers/sen.handler';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext, CommandResult } from '../../../src/game/commands/command.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    xcoord: 5.3,
    ycoord: 3.7,
    ...overrides,
  });
}

/**
 * A fresh handler per test. `sen` is rate limited now (CHAT_BURST inside
 * CHAT_WINDOW_MS, port-original — canon throttles `send` not at all), and these
 * cases fire far more than a person would inside one window. One instance per
 * test is the realistic shape: a limit is per pilot per session, not per suite.
 * @see src/game/commands/handlers/helpers/chat-throttle.ts
 */
let handler: SenHandlerService;
beforeEach(() => { handler = new SenHandlerService(); });
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

  describe('message > 500 chars rejected (deliberate: port-original cap, DECISIONS 2026-09-19)', () => {
    it('returns usage error and no broadcasts for overlong message', () => {
      const ship = makeShip();
      const longMsg = 'x'.repeat(501).split(' ');
      const result = handler.command.handler(ship, ['a', ...longMsg], ctx) as CommandResult;
      expect(result.broadcasts).toBeUndefined();
      // the answer to the wrong NUMBER of arguments, not a wrong channel.
      expect(result.lines[0].text).toMatch(/Type HELP SEND for the correct usage\./i);
    });

    it('accepts exactly 500 chars', () => {
      const ship = makeShip({ freq: [0, 0, 0] });
      const msg500 = 'x'.repeat(500);
      const result = handler.command.handler(ship, ['a', msg500], ctx) as CommandResult;
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
      // MSGSNT2 is "Message sent on all hailing channels, Sir!" — canon's
      // hail confirmation names no channel, because an open hail goes out on
      // all of them. The old assertion looked for the letter because the
      // invented line put one there.
      expect(
        result.lines.some((l) => l.category === 'system' && /all hailing channels/i.test(l.text)),
      ).toBe(true);
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
      // A channel outside A-C is BADCOM in canon (GECMDS.C:1868); SNDFMT is
      // the answer to the wrong NUMBER of arguments, not a wrong channel.
      expect(result.lines[0].text).toMatch(/Please specify com channel A, B, or C\./i);
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

/**
 * GEMAIN.C:2583 outsect / outwar take a `freq` argument, and when it is non-zero
 * they deliver ONLY to ships carrying that frequency on one of their three
 * channels. The port broadcast to the whole sector (or the whole galaxy)
 * regardless of what the recipient was tuned to, so a "private" channel was
 * audible to everyone and `fre` bought the player nothing.
 *
 * C also excludes the sender (`usrnum`) and gives them a separate confirmation
 * (MSGSNT4 / MSGSNT6) carrying the frequency.
 */
describe('SenHandlerService — frequency-scoped delivery (GECMDS.C:1853)', () => {
  it('tags a sector transmission with the frequency to filter on', () => {
    const ship = makeShip({ freq: [1234, 0, 0] });
    const result = handler.command.handler(ship, ['a', 'hello'], ctx) as CommandResult;
    const b = result.broadcasts![0];
    expect(b.room).toBe('sector:5:3');
    expect(b.freq).toBe(1234);
    expect(b.excludeSelf).toBe(true);
  });

  it('tags a galaxy transmission with the frequency too', () => {
    const ship = makeShip({ freq: [0, 25000, 0] });
    const result = handler.command.handler(ship, ['b', 'hello'], ctx) as CommandResult;
    const b = result.broadcasts![0];
    expect(b.room).toBe('galaxy');
    expect(b.freq).toBe(25000);
    expect(b.excludeSelf).toBe(true);
  });

  it('an open hail carries no frequency — everyone in range hears it', () => {
    const ship = makeShip({ freq: [0, 0, 0] });
    const result = handler.command.handler(ship, ['a', 'hello'], ctx) as CommandResult;
    const b = result.broadcasts![0];
    expect(b.room).toBe('hail');
    expect(b.freq).toBeUndefined();
    expect(b.excludeSelf).toBe(true);
  });

  it('the confirmation names the frequency the sender transmitted on', () => {
    const ship = makeShip({ freq: [1234, 0, 0] });
    const result = handler.command.handler(ship, ['a', 'hello'], ctx) as CommandResult;
    expect(result.lines[0].text).toContain('1234');
  });
});

/**
 * `%t` — the locked target's name, in a message.
 *
 *   loc sh f
 *   sen a Hunting %t, all mine!
 *
 * PORT-ORIGINAL, and the reason it lives in `sen` rather than in the f-key
 * expansion: it works identically whether the line was typed or came out of
 * `fset f4 sen a Hunting %t, all mine!`.
 */
describe('sen — %t expands to the locked ship', () => {
  const withTarget = (target: ShipState | undefined): SenHandlerService =>
    new SenHandlerService(undefined, {
      get: (userid: string, shipno: number) =>
        target && target.userid === userid && target.shipno === shipno ? target : undefined,
    } as never);

  it('names the ship this pilot has locked', () => {
    const target = makeShip({ userid: 'usr_wasp', shipno: 2, shipname: 'ICantStopDying' });
    const ship = makeShip({
      freq: [0, 0, 0], shipname: 'BigCat II', lockKey: 'usr_wasp:2', lock: 2,
    });

    const result = withTarget(target)
      .command.handler(ship, ['a', 'Hunting', '%t,', 'all', 'mine!'], ctx) as CommandResult;

    expect(result.broadcasts?.[0].payload).toMatchObject({
      text: 'Hunting ICantStopDying, all mine!',
    });
  });

  it('refuses rather than transmitting a line with a hole in it', () => {
    const ship = makeShip({ freq: [0, 0, 0], shipname: 'BigCat II', lockKey: null });

    const result = withTarget(undefined)
      .command.handler(ship, ['a', 'Hunting', '%t!'], ctx) as CommandResult;

    expect(result.broadcasts ?? []).toHaveLength(0);
    expect(result.lines[0].text).toContain('No target locked');
  });

  it('refuses when the lock names a ship that has left the game', () => {
    // A stale lock must not transmit a stale name. `lockKey` still reads
    // "usr_wasp:2"; nothing answers to it.
    const ship = makeShip({ freq: [0, 0, 0], shipname: 'BigCat II', lockKey: 'usr_wasp:2', lock: 2 });

    const result = withTarget(undefined)
      .command.handler(ship, ['a', 'Hunting', '%t!'], ctx) as CommandResult;

    expect(result.broadcasts ?? []).toHaveLength(0);
    expect(result.lines[0].text).toContain('No target locked');
  });

  it('leaves an ordinary message alone, lock or no lock', () => {
    const ship = makeShip({ freq: [0, 0, 0], shipname: 'BigCat II', lockKey: null });

    const result = withTarget(undefined)
      .command.handler(ship, ['a', 'shields', 'at', '50%'], ctx) as CommandResult;

    expect(result.broadcasts?.[0].payload).toMatchObject({ text: 'shields at 50%' });
  });
});
