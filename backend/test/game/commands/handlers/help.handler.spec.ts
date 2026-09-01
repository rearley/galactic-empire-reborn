/**
 * T021 — Unit tests for HelpHandlerService.
 * TDD red phase: help.handler.ts does not exist yet — tests are expected to FAIL.
 *
 * @see GECMDS.C cmd_help
 * @see specs/016-navigation-spy/
 */
import { HelpHandlerService } from '../../../../src/game/commands/handlers/help.handler';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { CommandContext, CommandResult } from '../../../../src/game/commands/command.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { HELP_TOPIC_IDS } from '../../../../src/game/commands/help/help-topics';

/** Synchronous helper — HelpHandler never returns a Promise. */
function invoke(h: HelpHandlerService, ship: ShipState, args: string[], ctx: CommandContext): CommandResult {
  return h.command.handler(ship, args, ctx) as CommandResult;
}

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.0, ycoord: 5.0, damage: 0, energy: 50000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
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

// ---------------------------------------------------------------------------
// Parametrised across both keywords: hel and ?
// ---------------------------------------------------------------------------

describe.each([
  ['hel keyword', 'hel'],
  ['? keyword', '?'],
])('HelpHandlerService — %s', (_label, _keyword) => {
  let handler: HelpHandlerService;
  let ship: ShipState;

  beforeEach(() => {
    handler = new HelpHandlerService();
    ship = makeShip();
  });

  // -------------------------------------------------------------------------
  // No-arg form: catalog listing
  // -------------------------------------------------------------------------

  describe('no-arg form', () => {
    it('emits the HELFMT catalog message', () => {
      const result = invoke(handler, ship,[], ctx);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].text).toBe(formatMessage(MessageId.HELFMT, HELP_TOPIC_IDS.join(', ')));
    });

    it('catalog message mentions all five topic IDs', () => {
      const result = invoke(handler, ship,[], ctx);
      const text = result.lines[0].text;
      for (const id of HELP_TOPIC_IDS) {
        expect(text).toContain(id);
      }
    });

    it('catalog line has category "info"', () => {
      const result = invoke(handler, ship,[], ctx);
      expect(result.lines[0].category).toBe('info');
    });
  });

  // -------------------------------------------------------------------------
  // Single-arg form: known topics
  // -------------------------------------------------------------------------

  describe.each(HELP_TOPIC_IDS.map((id) => [id]))(
    'hel %s — known topic',
    (topicId) => {
      it('returns topic body lines', () => {
        const result = invoke(handler, ship,[topicId], ctx);
        expect(result.lines.length).toBeGreaterThan(0);
      });

      it('first line text matches the topic title', () => {
        const result = invoke(handler, ship,[topicId], ctx);
        // First body line is the topic title (same as topic.title)
        expect(result.lines[0].text).toBeTruthy();
      });

      it('all lines have category "info"', () => {
        const result = invoke(handler, ship,[topicId], ctx);
        for (const line of result.lines) {
          expect(line.category).toBe('info');
        }
      });
    },
  );

  // -------------------------------------------------------------------------
  // Case-insensitive matching
  // -------------------------------------------------------------------------

  describe('case-insensitive topic matching', () => {
    it('accepts uppercase topic name (NAVIGATION)', () => {
      const result = invoke(handler, ship,['NAVIGATION'], ctx);
      expect(result.lines.length).toBeGreaterThan(0);
      expect(result.lines[0].category).toBe('info');
    });

    it('accepts mixed-case topic name (Navigation)', () => {
      const result = invoke(handler, ship,['Navigation'], ctx);
      expect(result.lines.length).toBeGreaterThan(0);
      expect(result.lines[0].category).toBe('info');
    });

    it('returns the same body regardless of case', () => {
      const lower = invoke(handler, ship,['combat'], ctx);
      const upper = invoke(handler, ship,['COMBAT'], ctx);
      const mixed = invoke(handler, ship,['Combat'], ctx);
      expect(lower.lines).toEqual(upper.lines);
      expect(lower.lines).toEqual(mixed.lines);
    });
  });

  // -------------------------------------------------------------------------
  // Unknown topic
  // -------------------------------------------------------------------------

  describe('unknown topic', () => {
    it('returns HEL_UNKNOWN with the offending input echoed', () => {
      const result = invoke(handler, ship,['quokka'], ctx);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].text).toBe(formatMessage(MessageId.HEL_UNKNOWN, 'quokka', HELP_TOPIC_IDS.join(', ')));
    });

    it('unknown topic line has category "system"', () => {
      const result = invoke(handler, ship,['quokka'], ctx);
      expect(result.lines[0].category).toBe('system');
    });
  });

  // -------------------------------------------------------------------------
  // Command metadata
  // -------------------------------------------------------------------------

  describe('command metadata', () => {
    it('keyword is "hel"', () => {
      expect(handler.command.keyword).toBe('hel');
    });

    it('aliases include "?"', () => {
      expect(handler.command.aliases).toContain('?');
    });

    it('minArgs is 0', () => {
      expect(handler.command.minArgs).toBe(0);
    });
  });
});
