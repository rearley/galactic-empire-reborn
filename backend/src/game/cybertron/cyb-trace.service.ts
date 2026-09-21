import { Inject, Injectable, Optional } from '@nestjs/common';
import type { CybClaimState } from './cyb-transitions';

/** Entries kept per Cybertron. @see issue #60 */
export const CYB_TRACE_DEPTH = 50;

/** The fields a trace entry compares before and after. */
const TRACED_FIELDS = ['cybmine', 'speed2b', 'head2b', 'holdcourse', 'cybupdate', 'tick'] as const;
type TracedField = (typeof TRACED_FIELDS)[number];

export interface CybTraceChange {
  field: TracedField;
  from: number;
  to: number;
}

export interface CybTraceEntry {
  /** Epoch milliseconds. */
  at: number;
  /** The ship's own activation count when this was recorded; 0 before its first. */
  act: number;
  /** A transition's name, `scan`, or `band <name>`. */
  event: string;
  detail?: string;
  changes: CybTraceChange[];
}

export interface CybTraceClock {
  now(): number;
}
export const CYB_TRACE_CLOCK = Symbol('CYB_TRACE_CLOCK');

interface Slot {
  entries: CybTraceEntry[];
  act: number;
  /** The last band recorded, so an unchanged chase is logged once. */
  lastBand: string | null;
}

/**
 * What each Cybertron decided, for a sysop to read with `sys trace`.
 *
 * PORT-ORIGINAL @not-a-house-rule: a sysop diagnostic, not AI behaviour. Canon's nearest thing is `sys list`, which shows where an AI
 * is and whom it has claimed, never why:
 *   GECMDS.C:4936 `prf("Chn Name xsect ysect damage tick cybmine\r");` Every Obliterator investigation on
 * 2026-09-20 began from such a row — `Cybrg-205`, `cybmine` 18, `speed2b` 284 —
 * and worked backwards to guess which branch had put it there: five passes,
 * each a deploy. This records the branch.
 *
 * Three kinds of entry, each in canon's own field names:
 *  - a claim transition from `cyb-transitions.ts`, with before → after for the
 *    fields it changed (none changed, nothing recorded);
 *  - a scan summary: who was looked at, what ruled each out, who was picked;
 *  - a pursuit band, recorded when it CHANGES — a long chase re-applies the
 *    same band every activation and would otherwise push everything else out.
 *
 * In memory only, `CYB_TRACE_DEPTH` entries per ship, lost on restart: it is a
 * live diagnostic, not a history. A slot is reset when a new hull spawns into
 * it, not when the old one dies, so a dead Cybertron's last moves stay readable.
 *
 * Lives in `CybertronControlModule`, the leaf the command side already imports,
 * so the tick, `pha` and the kill sweep can all record without a module cycle.
 * @see issue #60, docs/DECISIONS.md 2026-09-21
 */
@Injectable()
export class CybTraceService {
  private readonly slots = new Map<string, Slot>();

  constructor(
    @Optional() @Inject(CYB_TRACE_CLOCK)
    private readonly clock: CybTraceClock = { now: () => Date.now() },
  ) {}

  /** Start a ship's next activation; later entries carry its number. */
  beginActivation(key: string): void {
    this.slot(key).act++;
  }

  /**
   * Run a claim transition and record what it changed. The transition always
   * runs — tracing never alters behaviour — and an unchanged ship records
   * nothing, so a repeated hit from the same shooter does not flood the trace.
   */
  transition(key: string, ai: CybClaimState, event: string, apply: () => void, detail?: string): void {
    const changes = this.diff(ai, apply);
    if (changes.length === 0) return;
    const slot = this.slot(key);
    slot.lastBand = null;
    this.push(slot, event, changes, detail);
  }

  /** Apply a pursuit band, recording it only when it differs from the last one. */
  band(key: string, ai: CybClaimState, name: string, apply: () => void): void {
    const changes = this.diff(ai, apply);
    const slot = this.slot(key);
    if (slot.lastBand === name) return;
    slot.lastBand = name;
    this.push(slot, `band ${name}`, changes);
  }

  /** A free-text entry, such as a scan summary. */
  note(key: string, event: string, detail: string): void {
    this.push(this.slot(key), event, [], detail);
  }

  /** Oldest first. A copy: the caller cannot rewrite the trace. */
  read(key: string): readonly CybTraceEntry[] {
    return [...(this.slots.get(key)?.entries ?? [])];
  }

  /** Forget a slot — a new hull is taking it. */
  reset(key: string): void {
    this.slots.delete(key);
  }

  private slot(key: string): Slot {
    let s = this.slots.get(key);
    if (!s) {
      s = { entries: [], act: 0, lastBand: null };
      this.slots.set(key, s);
    }
    return s;
  }

  private diff(ai: CybClaimState, apply: () => void): CybTraceChange[] {
    const before = TRACED_FIELDS.map((f) => ai[f]);
    apply();
    return TRACED_FIELDS.flatMap((field, i) =>
      ai[field] === before[i] ? [] : [{ field, from: before[i], to: ai[field] }]);
  }

  private push(slot: Slot, event: string, changes: CybTraceChange[], detail?: string): void {
    const entry: CybTraceEntry = { at: this.clock.now(), act: slot.act, event, changes };
    if (detail !== undefined) entry.detail = detail;
    slot.entries.push(entry);
    if (slot.entries.length > CYB_TRACE_DEPTH) slot.entries.shift();
  }
}

/**
 * Apply a claim transition, recording it in the ship's trace when there is one.
 * The transition runs either way. One definition for every AI piece that
 * changes a claim — the brain, the scheduler and the weapons.
 */
export function tracedTransition(
  trace: CybTraceService | undefined,
  ship: CybClaimState & { userid: string; shipno: number },
  event: string,
  apply: () => void,
  detail?: string,
): void {
  if (trace) trace.transition(`${ship.userid}:${ship.shipno}`, ship, event, apply, detail);
  else apply();
}

/** What one target scan saw. @see GECYBS.C:709 `if (ptr->cybmine == (byte)255)` */
export interface CybScanTally {
  /** Active pilots looked at. */
  seen: number;
  cloaked: number;
  /** Below the hunter's `lowest_to_attk`. */
  outOfClass: number;
  /** Inside the neutral zone — the port-original sanctuary. */
  inZone: number;
  /** Already claimed by as many Cybertrons as their class's `noclaim` allows. */
  claimedOut: number;
  picked: { name: string; channel: number; distance: number } | null;
}

/** `3 pilots: 1 in zone, 2 claimed-out → no target` */
export function formatScanSummary(t: CybScanTally): string {
  const ruledOut = [
    [t.cloaked, 'cloaked'],
    [t.outOfClass, 'out of class'],
    [t.inZone, 'in zone'],
    [t.claimedOut, 'claimed-out'],
  ].filter(([n]) => (n as number) > 0).map(([n, why]) => `${n} ${why}`);
  const seen = `${t.seen} pilot${t.seen === 1 ? '' : 's'}${ruledOut.length ? `: ${ruledOut.join(', ')}` : ''}`;
  const result = t.picked
    ? `${t.picked.name} (ch ${t.picked.channel}) at ${t.picked.distance.toFixed(1)} sectors`
    : 'no target';
  return `${seen} → ${result}`;
}
