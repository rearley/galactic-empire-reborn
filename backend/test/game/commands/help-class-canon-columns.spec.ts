/**
 * `hel class` shows every column canon shows.
 *
 * Canon prints eighteen fields per hull (GECMDS.C:411-431):
 *
 *   prf("%2d %-20s%-2d %-2d %d %d %d %d %d %d %d %d %s %2d %s %s %s %3d\r",
 *       i+1, typename, max_shlds, max_phasr, max_torps, max_missl,
 *       has_decoy, has_jam, has_zip, has_mine, max_attk, max_cloak,
 *       accel, max_warp, tons, price, scanrange, max_points);
 *
 * under the header at MBMGEHLP.MSG HLPCLS1, and follows it with HLPCLS2, a
 * legend defining each abbreviation.
 *
 * The port printed seven columns — #, Class, Price, Phas, Shld, Cargo, Warp —
 * and no legend, dropping the eleven that tell you what a hull can actually
 * DO. Reported from play: on the columns shown, the Star Cruiser (700k) is a
 * Destroyer (600k) with 2,000 tons LESS cargo and nothing to show for the
 * extra hundred thousand. The three columns that justify the price — cloak,
 * acceleration and kill value — were all missing.
 *
 * Canon also orders it Shld before Phsr; the port had them the other way.
 *
 * @see GECMDS.C:375-431 cmd_gehelp, the `margc == 2` class-table branch
 * @see reference/ge-upstream/mbmgemp/GE/REL/MBMGEHLP.MSG HLPCLS1, HLPCLS2
 */

import { HELP_TOPICS } from '../../../src/game/commands/help/help-topics';

const body = () => HELP_TOPICS.class.body.join('\n');
const rowFor = (name: string) =>
  HELP_TOPICS.class.body.find((l) => l.includes(name)) ?? '';

describe('hel class — canon\'s eighteen columns (GECMDS.C:411)', () => {
  it('heads the table with canon\'s column set', () => {
    const text = body();
    for (const col of ['Shld', 'Phsr', 'Torp', 'Misl', 'Decy', 'Jamr',
                       'Zipr', 'Mine', 'Attk', 'Clok', 'Acc', 'Warp',
                       'Tons', 'Price', 'Scan', 'Pts']) {
      expect(text).toContain(col);
    }
  });

  it('answers the question the seven-column table could not', () => {
    // The reported case. Cloak is the column that explains the price gap.
    const destroyer = rowFor('Destroyer');
    const cruiser = rowFor('Star Cruiser');
    expect(destroyer).not.toBe('');
    expect(cruiser).not.toBe('');
    // Star Cruiser cloaks, Destroyer does not — canon prints 1/0.
    expect(cruiser).toMatch(/\b1\b/);
    expect(destroyer).not.toBe(cruiser);
  });

  it('prints the legend canon prints under the table (HLPCLS2)', () => {
    const text = body();
    expect(text).toContain('Clok');
    expect(text).toMatch(/Clok.*Cloaking System/);
    expect(text).toMatch(/Pts.*[Pp]oints for killing/);
    expect(text).toMatch(/Scan.*Scanner Range/);
  });

  it('keeps the Freight Barge honest — it mounts no torpedo or mine system', () => {
    // Class 9: hasTorpedo false, hasMine false, hasZipper false, no cloak.
    // With only Price/Phas/Shld/Cargo/Warp visible it looked like a bargain
    // hauler; it is unarmed.
    const barge = rowFor('Freight Barge');
    expect(barge).not.toBe('');
    expect(barge).toMatch(/\b0\b/);
  });
});
