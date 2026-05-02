import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { Command, CommandContext, CommandResult } from '../../src/game/commands/command.types';
import { MessageId, formatMessage } from '../../src/game/commands/messages';
import { ShipState } from '../../src/game/ship/ship-state.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    dirty: false,
    ...overrides,
  };
}

function makeCmd(overrides: Partial<Command> & { keyword: string }): Command {
  return {
    keyword: overrides.keyword,
    aliases: overrides.aliases ?? [],
    minArgs: overrides.minArgs ?? 0,
    argMissingMessage: overrides.argMissingMessage ?? 'missing arg',
    handler: overrides.handler ?? jest.fn().mockReturnValue({ lines: [{ text: 'ok', category: 'success' }] }),
  };
}

describe('CommandRouterService', () => {
  let router: CommandRouterService;
  let ctx: CommandContext;
  let ship: ShipState;

  beforeEach(() => {
    router = new CommandRouterService();
    ctx = {};
    ship = makeShip();
  });

  describe('tokenisation', () => {
    it('leading/trailing whitespace is stripped', () => {
      const handler = jest.fn().mockReturnValue({ lines: [] });
      router.register(makeCmd({ keyword: 'rotate', minArgs: 1, handler, argMissingMessage: 'ROTFMT' }));
      router.dispatch('   rotate 90   ', ship, ctx);
      expect(handler).toHaveBeenCalledWith(ship, ['90'], ctx);
    });

    it('internal whitespace is collapsed', () => {
      const handler = jest.fn().mockReturnValue({ lines: [] });
      router.register(makeCmd({ keyword: 'rotate', minArgs: 1, handler, argMissingMessage: 'ROTFMT' }));
      router.dispatch('rotate     90', ship, ctx);
      expect(handler).toHaveBeenCalledWith(ship, ['90'], ctx);
    });

    it('mixed-case keyword "ROT" matches "rotate"', () => {
      const handler = jest.fn().mockReturnValue({ lines: [] });
      router.register(makeCmd({ keyword: 'rotate', minArgs: 1, handler, argMissingMessage: 'ROTFMT' }));
      router.dispatch('ROT 45', ship, ctx);
      // ROT is not an alias — should be unknown
      const result = router.dispatch('ROT 45', ship, ctx) as CommandResult;
      expect(result.lines[0].text).toBe(formatMessage(MessageId.UNKNOWN_CMD));
    });

    it('lower-cased keyword "rotate" matches', () => {
      const handler = jest.fn().mockReturnValue({ lines: [] });
      router.register(makeCmd({ keyword: 'rotate', minArgs: 1, handler, argMissingMessage: 'ROTFMT' }));
      router.dispatch('rotate 90', ship, ctx);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('alias resolution', () => {
    it('alias dispatches to the canonical handler', () => {
      const handler = jest.fn().mockReturnValue({ lines: [] });
      router.register(makeCmd({ keyword: 'impulse', aliases: ['imp'], minArgs: 1, handler, argMissingMessage: 'IMPFMT' }));
      router.dispatch('imp 50', ship, ctx);
      expect(handler).toHaveBeenCalledWith(ship, ['50'], ctx);
    });

    it('alias args are passed correctly', () => {
      const handler = jest.fn().mockReturnValue({ lines: [] });
      router.register(makeCmd({ keyword: 'rotate', aliases: ['rot'], minArgs: 1, handler, argMissingMessage: 'ROTFMT' }));
      router.dispatch('rot 45', ship, ctx);
      expect(handler).toHaveBeenCalledWith(ship, ['45'], ctx);
    });
  });

  describe('empty input', () => {
    it('empty string returns no lines (silent drop)', () => {
      const result = router.dispatch('', ship, ctx) as CommandResult;
      expect(result.lines).toEqual([]);
    });

    it('whitespace-only returns no lines', () => {
      const result = router.dispatch('   ', ship, ctx) as CommandResult;
      expect(result.lines).toEqual([]);
    });
  });

  describe('unknown keyword', () => {
    it('unknown keyword returns exactly UNKNOWN_CMD system line', () => {
      const result = router.dispatch('flarp', ship, ctx) as CommandResult;
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].text).toBe(formatMessage(MessageId.UNKNOWN_CMD));
      expect(result.lines[0].category).toBe('system');
    });

    it('unknown keyword does not mutate ship state', () => {
      const before = { ...ship };
      router.dispatch('flarp', ship, ctx);
      expect(ship.dirty).toBe(before.dirty);
    });
  });

  describe('missing args', () => {
    it('insufficient args returns per-command argMissingMessage', () => {
      router.register(makeCmd({
        keyword: 'rotate',
        aliases: ['rot'],
        minArgs: 1,
        argMissingMessage: formatMessage(MessageId.ROTFMT),
      }));
      const result = router.dispatch('rotate', ship, ctx) as CommandResult;
      expect(result.lines[0].text).toBe(formatMessage(MessageId.ROTFMT));
    });

    it('arg array passed to handler is post-trim post-split', () => {
      const handler = jest.fn().mockReturnValue({ lines: [] });
      router.register(makeCmd({ keyword: 'warp', minArgs: 1, handler, argMissingMessage: 'WARPFMT' }));
      router.dispatch('warp  5  ', ship, ctx);
      expect(handler).toHaveBeenCalledWith(ship, ['5'], ctx);
    });
  });

  describe('case-insensitive keyword dispatch', () => {
    it('mixed-case keyword "RoTaTe" dispatches correctly', () => {
      const handler = jest.fn().mockReturnValue({ lines: [] });
      router.register(makeCmd({ keyword: 'rotate', minArgs: 1, handler, argMissingMessage: 'ROTFMT' }));
      router.dispatch('RoTaTe 90', ship, ctx);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('mixed-case alias "IMP" dispatches to impulse handler', () => {
      const handler = jest.fn().mockReturnValue({ lines: [] });
      router.register(makeCmd({ keyword: 'impulse', aliases: ['imp'], minArgs: 1, handler, argMissingMessage: 'IMPFMT' }));
      router.dispatch('IMP 50', ship, ctx);
      expect(handler).toHaveBeenCalledWith(ship, ['50'], ctx);
    });
  });

  // T039: additional forgiving-input coverage (US3)
  describe('US3 — forgiving input and safe error handling', () => {
    it('WARP (all-caps) dispatches to warp handler', () => {
      const handler = jest.fn().mockReturnValue({ lines: [] });
      router.register(makeCmd({ keyword: 'warp', aliases: ['war'], minArgs: 1, handler, argMissingMessage: 'WARPFMT' }));
      router.dispatch('WARP 5', ship, ctx);
      expect(handler).toHaveBeenCalledWith(ship, ['5'], ctx);
    });

    it('WAR (upper-case alias) dispatches to warp handler', () => {
      const handler = jest.fn().mockReturnValue({ lines: [] });
      router.register(makeCmd({ keyword: 'warp', aliases: ['war'], minArgs: 1, handler, argMissingMessage: 'WARPFMT' }));
      router.dispatch('WAR 5', ship, ctx);
      expect(handler).toHaveBeenCalledWith(ship, ['5'], ctx);
    });

    it('rotate with invalid arg passes through to handler — validator failure, not router failure', () => {
      // The router dispatches the call; the handler's validator returns NUMOOR.
      // This verifies the router does NOT intercept validator failures.
      const handler = jest.fn().mockReturnValue({
        lines: [{ text: formatMessage(MessageId.NUMOOR, -180, 180), category: 'system' }],
      });
      router.register(makeCmd({ keyword: 'rotate', aliases: ['rot'], minArgs: 1, handler, argMissingMessage: 'ROTFMT' }));
      const result = router.dispatch('rotate abc', ship, ctx) as CommandResult;
      expect(handler).toHaveBeenCalledWith(ship, ['abc'], ctx);
      expect(result.lines[0].text).toBe(formatMessage(MessageId.NUMOOR, -180, 180));
    });

    it('unknown command produces exactly one system line, zero state mutations', () => {
      const result = router.dispatch('flarp 99', ship, ctx) as CommandResult;
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].text).toBe(formatMessage(MessageId.UNKNOWN_CMD));
      expect(result.lines[0].category).toBe('system');
      expect(ship.dirty).toBe(false);
    });
  });
});
