/**
 * Canon's multi-page concept topics are separate, individually addressable
 * pages — and each one ENDS by telling the player how to reach the next.
 *
 *   {"planets",   HLPPLANT},
 *   {"planets2",  HLPPLAN2},
 *   {"planets3",  HLPPLAN3},
 *   {"battle",    HLPBATTL},
 *   {"battle2",   HLPBATT2},
 *   {"battle3",   HLPBATT3},
 *   -- GECMDS.C:229-241
 *
 * `cmd_gehelp` walks that table linearly with `genearas` and prints exactly ONE
 * message (GECMDS.C:461-470), so `hel planets` in the original shows section 1
 * and nothing else.
 *
 * The port concatenated all three sections under `planets`, on the reasoning
 * that wiring only the first page would hide the rest. The intent was right and
 * the fix was wrong: canon does not hide anything, it PAGINATES, and the pages
 * carry their own navigation — HLPPLANT closes with "Type HELP PLANETS2 for
 * more information on planets". Concatenating without registering `planets2`
 * and `planets3` left the game printing an instruction that the command parser
 * then rejected:
 *
 *     > help planets3
 *     Unknown help topic 'planets3'.
 *
 * Reported from play. This is the in-game text disagreeing with the command
 * table, which is the one thing a help system may never do.
 */

import { canonHelpPage } from '../../src/game/commands/help/help-topics';
import { CANON_HELP } from '../../src/game/commands/help/canon-help.generated';
import { HelpHandlerService } from '../../src/game/commands/handlers/help.handler';
import { CommandResult } from '../../src/game/commands/command.types';
import { ShipState } from '../../src/game/ship/ship-state.types';

const text = (lines: readonly string[] | null) => (lines ?? []).join('\n');

/**
 * Ask the QUESTION THE PLAYER ASKS. `canonHelpPage` is only one of the
 * handler's four resolution steps — `class`, for instance, is served by our own
 * topic table and would look dead if this checked the canon lookup alone.
 */
function helpAnswers(topic: string): boolean {
  const svc = new HelpHandlerService();
  const result = svc.command.handler({} as ShipState, topic.split(' '), {} as never) as CommandResult;
  return !result.lines.some((l) => /Unknown help topic/i.test(l.text));
}

describe('canon paginates planets/battle instead of concatenating (GECMDS.C:229-241)', () => {
  it.each([
    ['planets', 'HLPPLANT'],
    ['planets2', 'HLPPLAN2'],
    ['planets3', 'HLPPLAN3'],
    ['battle', 'HLPBATTL'],
    ['battle2', 'HLPBATT2'],
    ['battle3', 'HLPBATT3'],
  ])('`hel %s` resolves to %s alone', (topic, id) => {
    const page = canonHelpPage(topic);
    expect(page).not.toBeNull();
    expect(text(page)).toBe(text(CANON_HELP[id as keyof typeof CANON_HELP]));
  });

  /**
   * The cross-reference each page prints must be a command the player can
   * actually type. Canon writes these by hand in MBMGEHLP.MSG; we re-read them
   * rather than hard-coding the pairs, so a new "Type HELP X" line added to any
   * canon page is checked automatically.
   */
  it('every "Type HELP <topic>" a canon page prints is a reachable topic', () => {
    const referenced = new Set<string>();
    for (const page of Object.values(CANON_HELP)) {
      for (const line of page) {
        for (const m of line.matchAll(/\bHELP\s+([A-Z][A-Z0-9]*)\b/g)) {
          referenced.add(m[1].toLowerCase());
        }
      }
    }
    // Sanity: the scan found the references we came here for.
    expect(referenced).toContain('planets2');
    expect(referenced).toContain('planets3');

    const dead = [...referenced].filter((t) => !helpAnswers(t)).sort();
    expect(dead).toEqual([]);
  });
});
