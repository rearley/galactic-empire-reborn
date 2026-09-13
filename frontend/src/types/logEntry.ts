import type { EventLogLine } from '@ge/wire';

/**
 * A log line as the UI holds it: the wire line plus a stable React key.
 *
 * `id` is assigned on append and is NOT part of the wire contract — the server
 * sends `EventLogLine`, the UI adds the key. It lives in its own type so the
 * COMPILER enforces that every path into the log goes through the appender.
 *
 * Why it has to be enforced: EventLog keys rows over a `slice(-500)` window.
 * When ids were optional, six combat-message paths appended without one and
 * fell back to `key={idx}` — which collides with the real ids, so React reused
 * the wrong DOM nodes and rendered stale text. Reported from play as the log
 * appearing to "go into the past" mid-battle.
 */
export type LogEntry = EventLogLine & { id: number };
