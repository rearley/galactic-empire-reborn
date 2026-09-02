/**
 * SCRBONUS — the kill bonus that scales with the VICTIM's rank.
 *
 *   if (waruptr->rospos > 0)
 *       bonus = (long)(score_bonus/(waruptr->rospos));
 *   amt = scr + bonus;                              GEFUNCS.C:1150-1155
 *
 * `killem(ptr,usrn)` is called with the victim, so `waruptr` is the VICTIM's
 * user record. The higher-ranked the ship you killed, the bigger the prize.
 *
 * The port shipped SCRBONUS at 0 — the numopt FLOOR — and never implemented the
 * term at all, so every kill was worth its hull class and nothing more. That
 * ossifies the roster: an underdog has no reason to pick the hardest fight
 * available, which is the one fight that would actually move them up it.
 */

import { killScoreBonus } from '../../src/game/player/kill-score';
import { SCRBONUS } from '../../src/game/constants';

describe('SCRBONUS value', () => {
  it('is canon 1000, not the clamp floor of 0', () => {
    expect(SCRBONUS).toBe(1000);
  });
});

describe('killScoreBonus', () => {
  it('pays the full bonus for killing the #1 commander', () => {
    expect(killScoreBonus(1, SCRBONUS)).toBe(SCRBONUS);
  });

  it('falls off inversely with the victim rank', () => {
    expect(killScoreBonus(2, 1000)).toBe(500);
    expect(killScoreBonus(10, 1000)).toBe(100);
    expect(killScoreBonus(100, 1000)).toBe(10);
  });

  it('pays nothing for an unranked victim', () => {
    // rospos 0 is "not on the roster" — GEMAIN.C:1302-1332 assigns a position
    // only to qualifiers. An AI victim has no user row and lands here too.
    expect(killScoreBonus(0, 1000)).toBe(0);
    expect(killScoreBonus(-1, 1000)).toBe(0);
  });

  it('truncates like C long division', () => {
    expect(killScoreBonus(3, 1000)).toBe(333);
    expect(killScoreBonus(7, 1000)).toBe(142);
  });

  it('makes the top of the roster the most valuable target', () => {
    // The incentive the term exists to create.
    const forTop = killScoreBonus(1, SCRBONUS);
    const forMidfield = killScoreBonus(20, SCRBONUS);
    expect(forTop).toBeGreaterThan(forMidfield * 10);
  });
});
