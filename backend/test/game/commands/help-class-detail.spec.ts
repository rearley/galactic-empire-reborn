/**
 * `hel class <n>` prints canon's per-class detail page.
 *
 *   if (margc == 3) {
 *       i = atoi(margv[2])-1;
 *       if (i < cyb_class && shipclass[i].max_type == CLASSTYPE_USER)
 *           prfmsg(shipclass[i].hlpmsg);      // the S<nn>HELP block
 *       else
 *           prfmsg(HLPCLS3);                  // "Type HELP CLASS for a list"
 *   }
 *   -- GECMDS.C:438-453
 *
 * HLPCLS2's closing note advertises the command ("For more details on a class
 * of ship use the HELP CLASS nn command"), and the port had the note but not
 * the command — so the table pointed at something that did not exist.
 *
 * The pages carry what the summary table cannot: mission profile, hull
 * dimensions, and the standard-versus-maximum fit for shields and phasers.
 * They are GENERATED from MBMGESHP.MSG by tools/extract-class-help.mjs and
 * pinned by test/balance/class-help-canon.balance.spec.ts.
 */

import { HELP_TOPICS } from '../../../src/game/commands/help/help-topics';
import { CLASS_HELP } from '../../../src/game/commands/help/class-help.generated';
import { classDetailPage } from '../../../src/game/commands/help/class-detail';
import { HelpHandlerService } from '../../../src/game/commands/handlers/help.handler';

describe('hel class <n> — canon detail page (GECMDS.C:438)', () => {
  it('returns the Interceptor page for class 1', () => {
    const page = classDetailPage('1');
    expect(page).not.toBeNull();
    const text = page!.join('\n');
    expect(text).toContain('Ship Class:       Interceptor');
    expect(text).toContain('Mission Profile:');
    // The detail the summary table cannot carry.
    expect(text).toMatch(/Length:\s+62m/);
    expect(text).toMatch(/Mark-1 Standard\/Mark-10 maximum/);
  });

  it('returns the Stealth Fighter page for class 2', () => {
    const text = classDetailPage('2')!.join('\n');
    expect(text).toContain('Stealth Fighter');
  });

  it('refuses a class that is not sold, pointing at the table', () => {
    // Canon answers HLPCLS3 for anything outside the purchasable range.
    const page = classDetailPage('99');
    expect(page).not.toBeNull();
    expect(page!.join('\n')).toMatch(/HELP CLASS for a list/i);
  });

  it('refuses a non-numeric argument the same way', () => {
    expect(classDetailPage('banana')!.join('\n')).toMatch(/HELP CLASS for a list/i);
  });

  it('every hull the table lists has a detail page', () => {
    // The table and the pages must not drift apart: HLPCLS2 tells the player
    // that every row above has one.
    const listed = HELP_TOPICS.class.body
      .map((l) => /^\s*(\d+)\s+\S/.exec(l)?.[1])
      .filter((n): n is string => n !== undefined);
    expect(listed.length).toBeGreaterThan(5);
    for (const n of listed) {
      expect(CLASS_HELP[Number(n)]).toBeDefined();
    }
  });
});

/**
 * And through the actual command, since the module being right is only half of
 * it — the handler has to route `hel class 2` to the page rather than letting
 * the summary table swallow the number.
 */
describe('hel class <n> through the command router', () => {

  const run = (args: string[]) =>
    new HelpHandlerService().command.handler({} as never, args, {} as never) as
      { lines: Array<{ text: string }> };

  it('`hel class 2` returns the Stealth Fighter page', () => {
    expect(run(['class', '2']).lines.map((l) => l.text).join('\n'))
      .toContain('Stealth Fighter');
  });

  it('`hel class` with no number still returns the summary table', () => {
    const text = run(['class']).lines.map((l) => l.text).join('\n');
    expect(text).toContain('Class Name');
    expect(text).toContain('Clok');
  });

  it('`hel class 99` points back at the table', () => {
    expect(run(['class', '99']).lines.map((l) => l.text).join('\n'))
      .toMatch(/HELP CLASS for a list/i);
  });
});
