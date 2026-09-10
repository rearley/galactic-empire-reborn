import { parseSysArgs, SYS_HELP_LINES, sysClassIsValid, sysTypeIsValid, sysGotoIsValid } from '../../../src/game/commands/handlers/sys-commands';

/**
 * Canon's sysop toolkit is 13 subcommands, and this port shipped one.
 *
 * The list comes from `sys help`'s own output (GECMDS.C:4762-4776) rather than
 * the header comment above cmd_sysop, which is stale: it advertises `cyborg`,
 * `cyborgoff` and `cybmine`, all three of which sit inside `#ifdef NOTHING`
 * (GECMDS.C:4850-4878) and were never compiled. `sys help` is what the shipped
 * binary actually offers.
 *
 * These are the pure parts — argument parsing and canon's validity checks.
 * Effects live in the handler, behind the sysop gate.
 */
describe('SYS_HELP_LINES', () => {
  it('lists exactly the 13 subcommands the shipped binary offers', () => {
    expect(SYS_HELP_LINES.length).toBe(13);
  });

  it('omits the three that only exist inside #ifdef NOTHING', () => {
    const text = SYS_HELP_LINES.join(' ').toLowerCase();
    expect(text).not.toMatch(/cyborg|cybmine/);
  });

  it('names every command it can actually dispatch', () => {
    const text = SYS_HELP_LINES.join(' ');
    ['help', 'get', 'kill', 'cash', 'goto', 'class', 'shieldtype',
     'phasertype', 'maint', 'unjam', 'list', 'classlist', 'cybpause']
      .forEach((c) => expect(text).toContain(`sys ${c}`));
  });
});

/**
 * Canon bounds `sys class` by `tot_classes` — the SLOT COUNT of the class table
 * — and treats the argument as a one-based index into it:
 *
 *   if (atoi(margv[2]) <= tot_classes && atoi(margv[2]) > 0)
 *       warsptr->shpclass = atoi(margv[2]) - 1;     GECMDS.C:4882
 *
 * The shipped table has 34 slots, S01..S33 plus S41, so `sys class 34` made a
 * sysop a Sysopian Death Star. Twenty-five of those slots are `<NONE>` and
 * canon lets you become one of those too.
 *
 * This port stores the class NUMBER rather than a slot index, and the numbers
 * are SPARSE: 1-9, 21-25, 31-33, 41. Comparing a number against a count is
 * therefore a category error, and it was the bug — with 18 classes defined the
 * bound accepted 1..18, which silently refused every class above 9. A sysop
 * could not become a Scout, a Cyberquad, a Base Star, a Droid or the Death
 * Star, and got "Huh?" with no hint why.
 *
 * The right test is membership: is this a class the table actually defines.
 */
describe('sysClassIsValid', () => {
  const TABLE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 21, 22, 23, 24, 25, 31, 32, 33, 41];

  it('accepts a player hull', () => {
    expect(sysClassIsValid(1, TABLE)).toBe(true);
    expect(sysClassIsValid(8, TABLE)).toBe(true);
  });

  it('accepts the sparse high numbers a count-based bound refused', () => {
    expect(sysClassIsValid(21, TABLE)).toBe(true); // Cybertron Scout
    expect(sysClassIsValid(25, TABLE)).toBe(true); // Sarten Obliterator
    expect(sysClassIsValid(33, TABLE)).toBe(true); // Vakory Survey Drone
    expect(sysClassIsValid(41, TABLE)).toBe(true); // Sysopian Death Star
  });

  it('rejects zero and negatives, as canon does', () => {
    expect(sysClassIsValid(0, TABLE)).toBe(false);
    expect(sysClassIsValid(-1, TABLE)).toBe(false);
  });

  it('rejects a number the table does not define', () => {
    expect(sysClassIsValid(10, TABLE)).toBe(false);
    expect(sysClassIsValid(34, TABLE)).toBe(false);
    expect(sysClassIsValid(99, TABLE)).toBe(false);
  });
});

describe('sysTypeIsValid — shieldtype and phasertype', () => {
  it('accepts below 255, which is canon\'s only check', () => {
    expect(sysTypeIsValid(0)).toBe(true);
    expect(sysTypeIsValid(254)).toBe(true);
  });

  it('rejects 255 and above', () => {
    expect(sysTypeIsValid(255)).toBe(false);
  });

  it('rejects negatives, which canon does NOT', () => {
    // GECMDS.C:4894 checks only `atoi(margv[2]) < 255`, so `-5` passes and
    // writes a negative shieldtype. That is a canon bug, not a canon feature:
    // shieldtype indexes into per-type tables and drives shieldchg arithmetic,
    // so a negative silently corrupts combat rather than doing anything useful.
    // A sysop tool that can quietly break a ship is not worth the fidelity.
    expect(sysTypeIsValid(-1)).toBe(false);
  });
});

describe('sysGotoIsValid', () => {
  it('accepts a sector inside the galaxy', () => {
    expect(sysGotoIsValid(10, -10, 100)).toBe(true);
  });

  it('rejects beyond the far edge, as canon does', () => {
    expect(sysGotoIsValid(101, 0, 100)).toBe(false);
  });

  it('rejects beyond the NEAR edge, which canon does not check', () => {
    // GECMDS.C:4832 is `if (i < univmax && j < univmax)` — an upper bound only.
    // `sys goto -9999 -9999` passes it and puts a ship outside the galaxy, off
    // every scan and outside the perimeter logic. Canon simply forgot the other
    // half of the comparison.
    expect(sysGotoIsValid(-101, 0, 100)).toBe(false);
    expect(sysGotoIsValid(0, -101, 100)).toBe(false);
  });
});

describe('parseSysArgs', () => {
  it('lower-cases the subcommand so `SYS UNJAM` works', () => {
    expect(parseSysArgs(['UNJAM']).sub).toBe('unjam');
  });

  it('keeps the rest verbatim — usernames are case-sensitive to look at', () => {
    expect(parseSysArgs(['kill', 'RickEarley']).rest).toEqual(['RickEarley']);
  });

  it('reads an integer argument, rejecting trailing garbage', () => {
    // parseInt('12abc') is 12, which would turn an operator's typo into a live
    // value. Number() rejects it. Same reasoning as score.config.
    expect(parseSysArgs(['cash', '500']).int(0)).toBe(500);
    expect(parseSysArgs(['cash', '12abc']).int(0)).toBeNull();
    expect(parseSysArgs(['cash']).int(0)).toBeNull();
  });

  it('reads a negative integer, because `sys cash -100` is a real use', () => {
    // canon uses atol and does not restrict the sign; taking cash away is as
    // legitimate an admin action as granting it.
    expect(parseSysArgs(['cash', '-100']).int(0)).toBe(-100);
  });
});
