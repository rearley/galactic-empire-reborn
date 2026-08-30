/**
 * Balance regression guard for constants that previously had no test.
 *
 * CLAUDE.md — Testing Standards: "every constant in GEMAIN.H that affects
 * gameplay must have a test that fails if the constant changes". An audit found
 * 20 exported constants in src/game/constants.ts referenced by no spec, so a
 * silent edit to any of them would not have failed the suite. Each value below
 * was verified against the original C source at the cited line.
 *
 * @see reference/ge-source/GEMAIN.H
 * @see reference/ge-source/GECMDS.C
 */

import {
  DESTRUCTRANGE,
  ENGRECHG,
  ENGYMIN,
  HYSCANRANGE,
  MAXPLANETS,
  MINE_TIMER_MAX,
  MINE_TIMER_MIN,
  NUM_MINES,
  PENGUSE,
  PMINENG,
  QUADMAXPERTICK,
  ROTAMT,
  SCANADJ,
  SECTYPE_NORMAL,
  SHENGUSE,
  SHMAXCHG,
  SHMINPWR,
  TELEDAM,
  TOPPHASOR,
  TOPSHIELD,
} from '../../src/game/constants';

describe('balance regression — previously unpinned constants', () => {
  describe('GEMAIN.H defines', () => {
    it.each([
      ['DESTRUCTRANGE', DESTRUCTRANGE, 10000],
      ['ENGRECHG', ENGRECHG, 1],
      ['ENGYMIN', ENGYMIN, 5000],
      ['HYSCANRANGE', HYSCANRANGE, 5],
      ['MAXPLANETS', MAXPLANETS, 9],
      ['NUM_MINES', NUM_MINES, 20],
      ['PENGUSE', PENGUSE, 57],
      ['PMINENG', PMINENG, 500],
      ['QUADMAXPERTICK', QUADMAXPERTICK, 5],
      ['ROTAMT', ROTAMT, 20],
      ['SCANADJ', SCANADJ, 40],
      ['SECTYPE_NORMAL', SECTYPE_NORMAL, 1],
      ['SHENGUSE', SHENGUSE, 100],
      ['SHMAXCHG', SHMAXCHG, 10],
      ['SHMINPWR', SHMINPWR, 200],
      ['TELEDAM', TELEDAM, 17],
      ['TOPPHASOR', TOPPHASOR, 19],
      ['TOPSHIELD', TOPSHIELD, 19],
    ])('%s matches GEMAIN.H', (_name, actual, expected) => {
      expect(actual).toBe(expected);
    });
  });

  describe('GECMDS.C:1722 mine deployment', () => {
    it('MINE_TIMER_MIN is 1', () => {
      expect(MINE_TIMER_MIN).toBe(1);
    });

    it('MINE_TIMER_MAX is 50', () => {
      expect(MINE_TIMER_MAX).toBe(50);
    });

    it('the mine timer range is well-formed', () => {
      expect(MINE_TIMER_MIN).toBeLessThan(MINE_TIMER_MAX);
    });
  });
});
