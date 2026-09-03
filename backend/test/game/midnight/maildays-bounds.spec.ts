/**
 * MAILDAYS is a sysop option with canon bounds, not a free-form number.
 *
 *   maildays = numopt(MAILDAYS,1,7);            GEMAIN.C:497
 *   MAILDAYS {How many days to save mail: 3} N 1 7
 *                                              GE/REL/MBMGEMSG.MSG:449
 *
 * The purge honours the value (GEMAIN.C:1186-1197 `i -= maildays`), and the
 * comment beside it — "back up 1 week" — is stale prose from an earlier
 * hard-coded 7, not the behaviour. This port's env override accepted 1..30, so
 * a sysop could set a retention window the original would refuse, and an
 * existing test pinned 14 as legal.
 */

import { loadMidnightConfig } from '../../../src/game/midnight/midnight.config';
import { MAILDAYS_DEFAULT } from '../../../src/game/midnight/midnight.constants';

describe('MAILDAYS bounds', () => {
  it('defaults to canon 3', () => {
    expect(MAILDAYS_DEFAULT).toBe(3);
    expect(loadMidnightConfig({}).mailDays).toBe(3);
  });

  it('accepts the whole canon range', () => {
    for (let d = 1; d <= 7; d++) {
      expect(loadMidnightConfig({ MIDNIGHT_MAILDAYS: String(d) }).mailDays).toBe(d);
    }
  });

  it('clamps above canon max 7', () => {
    expect(loadMidnightConfig({ MIDNIGHT_MAILDAYS: '14' }).mailDays).toBe(7);
    expect(loadMidnightConfig({ MIDNIGHT_MAILDAYS: '30' }).mailDays).toBe(7);
  });

  it('clamps below canon min 1', () => {
    expect(loadMidnightConfig({ MIDNIGHT_MAILDAYS: '0' }).mailDays).toBe(1);
    expect(loadMidnightConfig({ MIDNIGHT_MAILDAYS: '-5' }).mailDays).toBe(1);
  });

  it('falls back to the default on garbage', () => {
    expect(loadMidnightConfig({ MIDNIGHT_MAILDAYS: 'soon' }).mailDays).toBe(3);
    expect(loadMidnightConfig({ MIDNIGHT_MAILDAYS: '' }).mailDays).toBe(3);
  });
});
