/**
 * Running midnight twice must not re-mail the production reports.
 *
 * CLAUDE.md: "Midnight job must be tested for idempotency — running it twice
 * must produce identical results." It held for score, planets and teams —
 * round 5's timekeeper fired two runs a second apart and diffed User, Planet
 * and Team to empty. Mail was the exception, because the message number was
 * wall-clock:
 *
 *     const msgno = nowMs + BigInt(i);
 *
 * so every run inserted fresh rows. Five nights left one player holding 36
 * copies of the same report and buried the real distress mail underneath.
 *
 * The key is now derived from the DAY and the PLANET's own identity, so a
 * second run for the same day collides on the primary key and inserts
 * nothing. The planet query has no `orderBy`, so the loop index was never a
 * stable identity to key on in the first place.
 */
import { productionMailMsgno } from '../../../src/game/midnight/mailstat-builder';
import { UNIVMAX } from '../../../src/game/constants';

// Derived, never hardcoded: the deployed universe is 100 and the test config
// is smaller, so a literal ±100 here is out of range and collides.
const EDGE = UNIVMAX;

describe('production mail message numbers', () => {
  const planetA = { xsect: 3, ysect: -7, plnum: 2 };
  const planetB = { xsect: 3, ysect: -7, plnum: 3 };
  const planetC = { xsect: -7, ysect: 3, plnum: 2 };
  const day = new Date('2026-09-04T00:00:00Z');

  it('is identical for the same planet on the same day', () => {
    expect(productionMailMsgno(day, planetA)).toBe(productionMailMsgno(day, planetA));
  });

  it('differs between planets in the same sector', () => {
    expect(productionMailMsgno(day, planetA)).not.toBe(productionMailMsgno(day, planetB));
  });

  it('differs between sectors with mirrored coordinates', () => {
    // (3,-7) and (-7,3) must not collide — a naive x+y or x*y key would.
    expect(productionMailMsgno(day, planetA)).not.toBe(productionMailMsgno(day, planetC));
  });

  it('differs across days, and increases with them', () => {
    const later = new Date('2026-09-05T00:00:00Z');
    expect(productionMailMsgno(later, planetA))
      .toBeGreaterThan(productionMailMsgno(day, planetA));
  });

  it('orders newest-first correctly — a later day outranks every planet of an earlier one', () => {
    // The mailbox lists by msgno DESC, so yesterday's last planet must not
    // outrank today's first.
    const later = new Date('2026-09-05T00:00:00Z');
    const extreme = { xsect: EDGE, ysect: EDGE, plnum: 9 };
    expect(productionMailMsgno(later, planetA))
      .toBeGreaterThan(productionMailMsgno(day, extreme));
  });

  it('handles the full coordinate range without collision', () => {
    const seen = new Set<string>();
    for (const x of [-EDGE, -1, 0, 1, EDGE]) {
      for (const y of [-EDGE, -1, 0, 1, EDGE]) {
        for (const p of [1, 5, 9]) {
          seen.add(productionMailMsgno(day, { xsect: x, ysect: y, plnum: p }).toString());
        }
      }
    }
    expect(seen.size).toBe(5 * 5 * 3);
  });
});
