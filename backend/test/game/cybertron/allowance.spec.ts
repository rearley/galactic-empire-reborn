/**
 * A Cybertron's allowance is MONEY, not energy.
 *
 * GECYBS.C:228-229 — `warusroff(usrn)->cash += CYB_ALLOW;` — every time
 * `cyb_lives` runs, the Cybertron's *user record* gains CYB_ALLOW credits,
 * clamped to CYB_MAXCASH on load (GECYBS.C:121-122).
 *
 * The port added CYB_ALLOW to `ship.energy`, which was then overwritten with a
 * flat 50000 a few lines later — so the allowance did nothing at all. A
 * veteran Cybertron carried no accumulated purse, and killing a long-lived one
 * paid exactly the same as killing a fresh spawn. The port's own comment on
 * the constant already called it a "gold allowance".
 *
 * @see GECYBS.C:228-229  @see GEMAIN.H:170-171 CYB_ALLOW=35, CYB_MAXCASH=2000000
 */

import { CYB_ALLOW, CYB_MAXCASH } from '../../../src/game/constants';
import { creditAllowance } from '../../../src/game/cybertron/cyb-decisions';

describe('creditAllowance — GECYBS.C:229', () => {
  it('adds CYB_ALLOW to the purse', () => {
    expect(creditAllowance(1000n)).toBe(1000n + BigInt(CYB_ALLOW));
  });

  it('clamps at CYB_MAXCASH', () => {
    expect(creditAllowance(BigInt(CYB_MAXCASH))).toBe(BigInt(CYB_MAXCASH));
    expect(creditAllowance(BigInt(CYB_MAXCASH) - 1n)).toBe(BigInt(CYB_MAXCASH));
  });

  it('accumulates over a Cybertron\'s life, so an old one is worth robbing', () => {
    let purse = 0n;
    for (let i = 0; i < 100; i++) purse = creditAllowance(purse);
    expect(purse).toBe(BigInt(CYB_ALLOW) * 100n);
  });

  it('never goes backwards from an over-cap balance', () => {
    expect(creditAllowance(BigInt(CYB_MAXCASH) + 5000n)).toBe(BigInt(CYB_MAXCASH));
  });
});
