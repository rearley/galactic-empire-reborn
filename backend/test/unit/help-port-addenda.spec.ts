/**
 * A command the port extended says so on its own help page.
 *
 * Canon's pages are verbatim and are not ours to edit, so an extension is
 * appended after them (`PORT_HELP_ADDENDA`). The failure this guards is the one
 * that actually happened twice: the feature shipped, the web guide described
 * it, and the page a player reads IN GAME went on describing only canon — so
 * the only way to discover the feature was to be told about it out of band.
 *
 * The addendum also has to survive the way people actually type. The router
 * matches on three characters (GECMDS.C:249 `struct cmd * FUNC gesearch(ptr,tab,len)`), so
 * `hel tra` and `hel transfer` are the same question and must give the same
 * answer.
 */
import { canonHelpPage } from '../../src/game/commands/help/help-topics';

const addendumOf = (topic: string): string[] => {
  const page = canonHelpPage(topic);
  expect(page).not.toBeNull();
  const marker = (page ?? []).indexOf('ADDED BY THIS PORT');
  return marker === -1 ? [] : (page ?? []).slice(marker).map((l) => l);
};

describe('port additions appear on the canon help page', () => {
  it('tells a `sen` reader about %t', () => {
    const added = addendumOf('sen').join('\n');
    expect(added).toContain('%t');
    // The example is the documentation — a player who reads nothing else
    // copies the line.
    expect(added).toContain('sen a Hunting %t, all mine!');
  });

  it('says what happens with nothing locked, rather than leaving it to be found', () => {
    expect(addendumOf('sen').join('\n').toLowerCase()).toContain('locked');
  });

  it('still documents ship-to-ship transfer', () => {
    expect(addendumOf('transfer').join('\n')).toContain('tra <qty> <item> <ship>');
  });

  it('answers the three-letter form the router actually matches', () => {
    // `hel tra` used to return canon alone: the addendum was keyed on the full
    // word only, so the shortest spelling — the one a player types — was the
    // one that hid the feature.
    expect(addendumOf('tra')).toEqual(addendumOf('transfer'));
    expect(addendumOf('send')).toEqual(addendumOf('sen'));
  });

  it('leaves a page the port has not extended untouched', () => {
    expect(addendumOf('rot')).toEqual([]);
    expect(canonHelpPage('rot')).not.toContain('ADDED BY THIS PORT');
  });
});
