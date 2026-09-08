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

describe('sysClassIsValid', () => {
  it('accepts a class in range', () => {
    // GECMDS.C:4882 — `atoi(margv[2]) <= tot_classes && atoi(margv[2]) > 0`
    expect(sysClassIsValid(1, 34)).toBe(true);
    expect(sysClassIsValid(34, 34)).toBe(true);
  });

  it('rejects zero and negatives, as canon does', () => {
    expect(sysClassIsValid(0, 34)).toBe(false);
    expect(sysClassIsValid(-1, 34)).toBe(false);
  });

  it('rejects above the class count', () => {
    expect(sysClassIsValid(35, 34)).toBe(false);
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
