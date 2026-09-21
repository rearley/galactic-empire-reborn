/**
 * What must hold in a running galaxy, checked once per simulated second.
 *
 * Each rule is a property of PLAY, not a canon value, and each exists because
 * the port once broke it:
 *
 *  - `hub-trap` — no Cybertron stays in sector (0,0) longer than
 *    HUB_TRAP_SECONDS. The v0.27.4 absorbing state and the v0.27.7 crawl both
 *    ended with an Obliterator living on the hub.
 *  - `stale-claim` / `zone-claim` — a claim on a pilot who has left, or who is
 *    inside the zone, is gone once its holder has had its turn. A turn is canon's
 *    held course (`holdcourse` activations skip `cyb_check_lockon` entirely,
 *    GECYBS.C:672 `if (ptr->holdcourse > 0)`) plus one activation. v0.27.5 kept
 *    zone claims forever; v0.27.6 revived claims across a restart.
 *  - `fire-into-zone` — no Cybertron hit lands on a pilot in sector (0,0).
 *
 * A violation carries the ship's rendered `sys trace` (#60), so a failing
 * scenario reads like a sysop investigation rather than a bare assertion.
 * @see issue #61
 */
import type { ShipState } from '../../src/game/ship/ship-state.types';
import { shipKey } from '../../src/game/ship/ship-state.types';

/** Ten simulated minutes. Long enough for any honest pass through the hub. */
export const HUB_TRAP_SECONDS = 600;

/** The slice of a GalaxySim the checker reads. */
export interface SimWorld {
  elapsed: number;
  events: { at: number; name: string; payload: unknown }[];
  cybertrons(): ShipState[];
  pilots(): ShipState[];
  trace(key: string): string[];
}

export type SimRule = 'hub-trap' | 'stale-claim' | 'zone-claim' | 'fire-into-zone';

export interface SimViolation {
  rule: SimRule;
  at: number;
  shipKey: string;
  detail: string;
  trace: string[];
}

const inZone = (s: { xcoord: number; ycoord: number }): boolean =>
  Math.floor(s.xcoord) === 0 && Math.floor(s.ycoord) === 0;

interface ClaimWatch {
  rule: 'stale-claim' | 'zone-claim';
  channel: number;
  /** Activations the holder may still take before the claim must be gone. */
  allowance: number;
}

export function createInvariantChecker(world: SimWorld): { check(): void; violations: SimViolation[] } {
  const violations: SimViolation[] = [];
  const inHubSince = new Map<string, number>();
  const reported = new Set<string>();
  const lastTick = new Map<string, number>();
  const watches = new Map<string, ClaimWatch>();
  let eventCursor = 0;

  const report = (rule: SimRule, key: string, detail: string): void => {
    const once = `${rule}:${key}`;
    if (reported.has(once)) return;
    reported.add(once);
    violations.push({ rule, at: world.elapsed, shipKey: key, detail, trace: world.trace(key) });
  };

  const check = (): void => {
    const pilots = world.pilots();
    const byChannel = new Map(pilots.map((p) => [p.channel, p]));
    const byKey = new Map([...pilots, ...world.cybertrons()].map((s) => [shipKey(s.userid, s.shipno), s]));

    for (const c of world.cybertrons()) {
      const key = shipKey(c.userid, c.shipno);

      // hub-trap
      if (inZone(c)) {
        const since = inHubSince.get(key) ?? world.elapsed;
        inHubSince.set(key, since);
        // +1: the second it was first seen, it had already spent that second there.
        if (world.elapsed - since + 1 > HUB_TRAP_SECONDS) {
          report('hub-trap', key, `in sector (0,0) since t=${since}s at (${c.xcoord.toFixed(2)}, ${c.ycoord.toFixed(2)}), speed2b ${Math.round(c.speed2b)}`);
        }
      } else {
        inHubSince.delete(key);
      }

      // An activation resets the countdown upward. @see CybertronTickService.cybLives
      const prev = lastTick.get(key);
      const activated = prev !== undefined && c.tick > prev;
      lastTick.set(key, c.tick);

      // stale-claim / zone-claim
      if (c.cybmine === 255) { watches.delete(key); continue; }
      const target = byChannel.get(c.cybmine);
      const rule = !target ? 'stale-claim' : inZone(target) ? 'zone-claim' : null;
      const watch = watches.get(key);
      if (!rule) { watches.delete(key); continue; }
      if (!watch || watch.rule !== rule || watch.channel !== c.cybmine) {
        watches.set(key, { rule, channel: c.cybmine, allowance: c.holdcourse + 1 });
        continue;
      }
      if (activated) {
        if (watch.allowance <= 0) {
          report(rule, key, rule === 'stale-claim'
            ? `still claims channel ${c.cybmine}, which no active pilot holds`
            : `still claims ${target!.username ?? target!.shipname}, who is inside the neutral zone`);
        } else {
          watch.allowance--;
        }
      }
    }

    // fire-into-zone
    for (; eventCursor < world.events.length; eventCursor++) {
      const e = world.events[eventCursor];
      if (e.name !== 'combat.hit') continue;
      const p = e.payload as { attackerId?: string; victimId?: string };
      if (!p.attackerId?.startsWith('Cybrg-') || !p.victimId) continue;
      const victim = byKey.get(p.victimId);
      if (victim && victim.status === 1 && inZone(victim)) {
        report('fire-into-zone', p.attackerId, `hit ${victim.username ?? victim.shipname} inside the neutral zone`);
      }
    }
  };

  return { check, violations };
}

/** One violation as a block of text: what, when, who, then its `sys trace`. */
export function describeViolation(v: SimViolation): string {
  return [`${v.rule} at t=${v.at}s: ${v.shipKey} — ${v.detail}`, ...v.trace.map((l) => `  ${l}`)].join('\n');
}
