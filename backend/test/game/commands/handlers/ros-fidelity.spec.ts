/**
 * The roster lists ranked players, not everyone with an account.
 *
 * GECMDS.C:4037-4043:
 *
 *   if (tmpusr.score > 0 && tmpusr.userid[0] != tmpbuf2[0] && tmpusr.userid[0] != '@')
 *     ... sprintf(gechrbuf2, " %8.3fm", ((float)tmpusr.population)/100.0);
 *
 * Two things the port lost: the `score > 0` gate, so every dormant and
 * never-flown account padded the board (which is why it filled with e2e_*
 * rows on the shared dev database), and the population format — C prints
 * millions to three decimals, `population/100.0`, not a raw counter.
 */

import { rosterRows, formatPopulation } from '../../../../src/game/commands/handlers/ros-format';

describe('roster filtering — GECMDS.C:4038', () => {
  const rows = [
    { userid: 'ace', score: 5000n, population: 1234 },
    { userid: 'rookie', score: 0n, population: 0 },
    { userid: '@Droid-1', score: 900n, population: 0 },
    { userid: 'trader', score: 12n, population: 50 },
  ];

  it('drops anyone who has not scored', () => {
    expect(rosterRows(rows).map((r) => r.userid)).toEqual(['ace', 'trader']);
  });

  it('drops @-prefixed AI accounts even when they have scored', () => {
    expect(rosterRows(rows).some((r) => r.userid.startsWith('@'))).toBe(false);
  });

  it('keeps a low but non-zero score', () => {
    expect(rosterRows(rows).map((r) => r.userid)).toContain('trader');
  });
});

describe('population formatting — GECMDS.C:4043', () => {
  it('prints millions to three decimals', () => {
    expect(formatPopulation(1234).trim()).toBe('12.340m');
  });

  it('shows zero population as 0.000m', () => {
    expect(formatPopulation(0).trim()).toBe('0.000m');
  });

  it('is right-aligned in an 8-wide field, as C\'s %8.3f is', () => {
    expect(formatPopulation(0)).toHaveLength(10); // ' ' + 8 wide + 'm'
  });
});
