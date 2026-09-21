import { GESTAT_AUTO } from '../../constants';
import { CYB_TRACE_DEPTH, type CybTraceEntry } from '../../cybertron/cyb-trace.service';
import type { ShipState } from '../../ship/ship-state.types';

/**
 * The pure half of `sys trace`: which Cybertron a sysop means, and how its
 * trace reads. PORT-ORIGINAL. @see cyb-trace.service.ts, issue #60
 */

/**
 * AI hulls whose userid or ship name starts with `needle`, ignoring case. An
 * exact userid wins outright, so `Cybrg-20` is not ambiguous merely because
 * `Cybrg-205` exists. Players are never matched: only an AI has a trace.
 */
export function findTraceTargets(ships: readonly ShipState[], needle: string): ShipState[] {
  const n = needle.toLowerCase();
  const ai = ships.filter((s) => s.status === GESTAT_AUTO);
  const exact = ai.filter((s) => s.userid.toLowerCase() === n);
  if (exact.length > 0) return exact;
  return ai.filter((s) => s.userid.toLowerCase().startsWith(n) || s.shipname.toLowerCase().startsWith(n));
}

/** Whole numbers as they are, anything else to one place: a heading reads 211.4. */
function num(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** HH:MM:SS, UTC. */
function clock(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19);
}

export function renderTraceEntry(e: CybTraceEntry): string {
  const parts = [`${clock(e.at)} act ${e.act}`, e.event];
  if (e.changes.length > 0) parts.push(e.changes.map((c) => `${c.field} ${num(c.from)}→${num(c.to)}`).join(' '));
  if (e.detail !== undefined) parts.push(e.changes.length > 0 ? `(${e.detail})` : e.detail);
  return parts.join('  ');
}

/** The ship as it stands now, then its decisions oldest first. */
export function renderTrace(ship: ShipState, entries: readonly CybTraceEntry[]): string[] {
  const header =
    `${ship.userid} ${ship.shipname}  at (${ship.xcoord.toFixed(2)}, ${ship.ycoord.toFixed(2)})  ` +
    `cybmine ${ship.cybmine}  speed2b ${num(ship.speed2b)}  tick ${ship.tick}`;
  if (entries.length === 0) {
    return [header, 'No decisions recorded since the ship spawned or the server started.'];
  }
  return [
    header,
    ...entries.map(renderTraceEntry),
    `Times are UTC. Last ${CYB_TRACE_DEPTH} decisions, held in memory since the ship spawned or the server started.`,
  ];
}
