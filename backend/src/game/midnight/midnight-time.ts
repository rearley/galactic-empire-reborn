/**
 * The game's calendar day.
 *
 * Midnight maintenance is dated and scheduled in ONE timezone, named here.
 * The host runs UTC, so a server-local cron put the nightly pass at 8pm ET —
 * inside the evening it was meant to happen after. Which hour is right is a
 * deployment choice, not a canon one (canon's sysop set their own), so this is
 * configurable rather than fixed. @see docs/DECISIONS.md
 *
 * Both the cron's firing time and the run's recorded date must read from here.
 * They are two halves of one decision: the date is the idempotency key the
 * boot self-heal checks to answer "has today already run?", so a cron in ET
 * against a date computed in UTC agrees most of the time and disagrees either
 * side of the boundary — silently skipping or doubling a midnight.
 */

/** IANA zone the game's day is measured in. */
export const GAME_TIMEZONE = process.env.GAME_TIMEZONE ?? 'America/New_York';

/**
 * The calendar date, in `zone`, that `instant` falls on — as `YYYY-MM-DD`.
 *
 * Intl does the offset lookup so DST is handled without a table of our own;
 * `en-CA` is chosen purely because it formats as ISO.
 */
export function runDateFor(instant: Date, zone: string = GAME_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * The same date as a `Date` pinned to UTC midnight, for the Postgres `date`
 * column. UTC midnight — not host-local — because Prisma serializes a `Date`
 * by its UTC instant, so a host-local midnight east of Greenwich would store
 * the previous day.
 */
export function runDateValue(instant: Date, zone: string = GAME_TIMEZONE): Date {
  return new Date(`${runDateFor(instant, zone)}T00:00:00.000Z`);
}
