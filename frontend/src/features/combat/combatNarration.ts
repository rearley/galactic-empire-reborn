/**
 * What the client should say about weapons fire — which is, in most cases,
 * nothing at all.
 *
 * These are the decisions the combat socket handlers used to make inline. They
 * are pure: an event plus who is watching, in; a line or `null`, out. Three of
 * the four paths return `null`, and each of those silences is a canon
 * derivation rather than an omission — see the comments on each branch.
 *
 * `combat.ship-destroyed` is deliberately NOT here: it keeps its own module.
 * @see features/combat/destructionLine.ts
 */
import type { EventLogLine } from '@ge/wire';

/** Who is watching, and how to name a ship the server did not name for us. */
export interface NarrationContext {
  localShipId: string | null;
  shipName(shipId: string): string;
}

/** The subset of `CombatHitEvent` these decisions actually read. */
export interface CombatHitNarrationEvent {
  attackerId: string;
  attackerName?: string;
  victimId: string;
  victimName?: string;
  weapon: string;
  damageHull: number;
  damageShield: number;
}

/**
 * Canon shows a bystander NOTHING about someone else's weapons fire.
 * `PFIRED` goes `outprfge(FILTER, usrn)` — to the firer alone
 * (GECMDS.C:943-944). The sector-wide broadcasts canon does make are cloak
 * collapse (GEFUNCS.C:1380), the self-destruct countdown (:1836), sector
 * entry/exit (:717-722), radio traffic and the destruction energy burst.
 * Combat is not among them: to know whether two ships off your bow are
 * fighting, you scan them and read their damage.
 * @see docs/DECISIONS.md 2026-09-07
 */
export function phaserFiredLine(
  _event: { shipId: string },
  _ctx: NarrationContext,
): EventLogLine | null {
  return null;
}

/**
 * A hit landing somewhere in the sector. Says something only when the LOCAL
 * ship fired ordnance canon does not already narrate to its firer.
 */
export function combatHitLine(
  event: CombatHitNarrationEvent,
  ctx: NarrationContext,
): EventLogLine | null {
  if (event.victimId === ctx.localShipId) {
    // Nothing. The gateway already relays canon's own text for whatever hit
    // you — THIT1/THIT2, MHIT1/MHIT2, PHITYOU/PHITDEF, MINE4 — over
    // `event.log`, and this banner was a second telling of the same event
    // with two departures baked in.
    //
    // Canon reports hull damage as a number NOWHERE: not to the attacker
    // (PHITHIM passes a damstr word), not to the victim (THIT2 gives no
    // magnitude at all), not even to you about your own ship — `rep` sends
    // REP14 with the damstr word too (GECMDS.C:2037-2040). Shield charge
    // gets a number; hull never does. And canon names the attacker at
    // LAUNCH (TFIRE2, by scan letter) and deliberately not at impact.
    //
    // So: you are told you were hit and by what. `rep` tells you your
    // condition, in words. @see docs/DECISIONS.md 2026-09-07
    return null;
  }

  // Ordnance the LOCAL ship fired: confirm the strike, assess nothing.
  //
  // Canon's silence to the firer is deliberate — every message about a
  // torpedo after launch goes to the TARGET: the tracking alert (TORP1),
  // the decoy intercept (TORDEST, GEFUNCS.C:1587-1588) and the impact
  // (THIT1/THIT2). The firer is meant to `sca sh <name>` and read
  // `Damage: severe damage` off the target, which is what the scan's damage
  // line exists for. Handing the shooter a hull percentage removed the
  // reason to type it, and was more precise than canon is anywhere: hull
  // condition is one of damstr's six words, always (GECMDS.C:2110).
  //
  // Phaser and hyper-phaser are excluded: canon narrates those to the firer
  // itself (PHITHIM / PDEFLECT, GECMDS.C:985-995) and the gateway relays
  // them, so a line here would duplicate — and arrive first, since the
  // broadcast leaves the server inside the command handler while
  // `command:result` is written only after it returns.
  if (event.attackerId === ctx.localShipId) {
    const narratedToFirer = event.weapon === 'phaser' || event.weapon === 'hyper-phaser';
    if (narratedToFirer) return null;
    // Prefer the ship name the server resolved: the roster excludes AI, so
    // falling back to the key would print a userid ("Cybrg-222") that no
    // command accepts — `sca sh` wants the ship name ("Cybrg-49340").
    const victim = event.victimName ?? ctx.shipName(event.victimId);
    return {
      text: `Sensors confirm a ${event.weapon} strike on ${victim}.`,
      category: 'combat',
    };
  }

  // Anyone else's fight is not narrated to you at all — see the note on
  // phaserFiredLine above.
  return null;
}
