/**
 * Midnight is the GAME's midnight, not the host's.
 *
 * The cron fired at server-local 00:00 and the host runs UTC, so maintenance
 * landed at 8pm ET — the middle of the owner's evening rather than overnight.
 * That is a deployment choice, not a canon one: canon's sysop picked their own
 * hour, so there is nothing to be faithful to. @see docs/DECISIONS.md
 *
 * The subtle half is that TWO things have to agree. The cron decides WHEN the
 * pass fires; `runDateFor` decides WHICH DATE it records, and that date is the
 * idempotency key the self-heal reads to answer "has today already run?".
 * Compute one in ET and the other in UTC and they agree most of the time and
 * disagree either side of the boundary — the worst kind of bug, since a missed
 * or doubled midnight is invisible until scores are wrong.
 */
import { runDateFor, GAME_TIMEZONE } from '../../../src/game/midnight/midnight-time';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { MidnightService } from '../../../src/game/midnight/midnight.service';

describe('the game clock', () => {
  it('defaults to US Eastern', () => {
    expect(GAME_TIMEZONE).toBe('America/New_York');
  });

  it('gives the ET date, not the UTC date, just after ET midnight', () => {
    // 04:30 UTC on 5 Sep is 00:30 EDT on 5 Sep — same date, easy case.
    expect(runDateFor(new Date('2026-09-05T04:30:00Z'), GAME_TIMEZONE)).toBe('2026-09-05');
  });

  it('still says the 4th at 23:30 ET, when UTC has already rolled over', () => {
    // 03:30 UTC on 5 Sep is 23:30 EDT on 4 Sep. A UTC-based date would record
    // this run against the 5th and let the real 5th be skipped as "already
    // run" — the failure mode this exists to prevent.
    expect(runDateFor(new Date('2026-09-05T03:30:00Z'), GAME_TIMEZONE)).toBe('2026-09-04');
  });

  it('handles standard time as well as daylight time', () => {
    // January: EST is UTC-5, so 04:30 UTC is 23:30 on the 4th.
    expect(runDateFor(new Date('2026-01-05T04:30:00Z'), GAME_TIMEZONE)).toBe('2026-01-04');
    // 05:30 UTC is 00:30 on the 5th.
    expect(runDateFor(new Date('2026-01-05T05:30:00Z'), GAME_TIMEZONE)).toBe('2026-01-05');
  });

  it('is configurable — a sysop elsewhere picks their own hour, as canon did', () => {
    expect(runDateFor(new Date('2026-09-05T04:30:00Z'), 'UTC')).toBe('2026-09-05');
    expect(runDateFor(new Date('2026-09-05T04:30:00Z'), 'Australia/Sydney')).toBe('2026-09-05');
    expect(runDateFor(new Date('2026-09-04T20:30:00Z'), 'Australia/Sydney')).toBe('2026-09-05');
  });
});

describe('the midnight cron', () => {
  it('is scheduled in the game timezone, not the host timezone', () => {
    // The host runs UTC. Without this option the pass fires at 8pm ET.
    const opts = Reflect.getMetadata(
      SCHEDULE_CRON_OPTIONS,
      MidnightService.prototype.scheduledRun,
    );
    expect(opts).toMatchObject({ cronTime: '0 0 * * *', timeZone: GAME_TIMEZONE });
  });
});
