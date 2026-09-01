import { cdistance } from '../combat/combat-math';
import { PLTYPE_PLNT } from '../constants';

/** A planet or wormhole a ship might fall into. */
export interface GravityBody {
  xcoord: number;
  ycoord: number;
  /** 1-based body number within the sector, for the message. */
  plnum: number;
  /** GALPLNT.type — 0 is an empty slot, PLTYPE_PLNT a planet, anything else a wormhole. */
  type: number;
  /** Where a wormhole comes out. Ignored for planets. */
  destination?: { xcoord: number; ycoord: number };
}

/** What happens when a ship reaches the innermost band. */
export type GravityEffect =
  | { kind: 'crash'; damage: number }
  | {
      kind: 'wormhole';
      destination: { xcoord: number; ycoord: number };
      damage: number;
      clearProjectiles: boolean;
    };

export interface GravityEvent {
  plnum: number;
  isWormhole: boolean;
  /** 1 = distant tug, 2 = strong pull, 3 = you have arrived. */
  band: 1 | 2 | 3;
  /** Present only on band 3. */
  effect?: GravityEffect;
}

/** GEFUNCS.C:855 `if (dist < 250)` — outside this, nothing happens at all. */
const GRAV_OUTER = 250;
/** GEFUNCS.C:857 `if (dist >= 50)` — the gentle warning band. */
const GRAV_MID = 50;
/** GEFUNCS.C:866 `if (dist >= 25)` — the strong warning band. */
const GRAV_INNER = 25;
/** GEFUNCS.C:887 `ptr->damage = 101.0` — past 100, which is death. */
const CRASH_DAMAGE = 101;
/** GEFUNCS.C:897 `ptr->damage += 5.5` — the toll for a wormhole transit. */
const WORMHOLE_DAMAGE = 5.5;

/**
 * Proximity check against every planet and wormhole in the ship's sector.
 *
 * Distances are RAW units (`cdistance(...) * 10000`), so these bands are a few
 * hundredths of a sector across — you have to be flying almost exactly at a
 * body to trigger them, which is what makes it a hazard rather than a nuisance.
 *
 * Returns the events for the caller to apply and announce; this function is
 * pure. Neither mechanic existed in the port before — the wormhole rows the
 * galaxy generator writes had no reader at all.
 *
 * @see GEFUNCS.C:836-905 gravity  @see GEFUNCS.C:794-795 the call from moveship
 */
export function checkGravity(
  ship: { xcoord: number; ycoord: number },
  bodies: readonly GravityBody[],
): GravityEvent[] {
  const events: GravityEvent[] = [];

  for (const body of bodies) {
    if (body.type === 0) continue; // empty planet slot

    const dist = Math.trunc(cdistance(ship, body) * 10_000); // C: `unsigned dist`
    if (dist >= GRAV_OUTER) continue;

    const isWormhole = body.type !== PLTYPE_PLNT;

    if (dist >= GRAV_MID) {
      events.push({ plnum: body.plnum, isWormhole, band: 1 });
      continue;
    }
    if (dist >= GRAV_INNER) {
      events.push({ plnum: body.plnum, isWormhole, band: 2 });
      continue;
    }

    events.push({
      plnum: body.plnum,
      isWormhole,
      band: 3,
      effect: isWormhole
        ? {
            kind: 'wormhole',
            destination: body.destination ?? { xcoord: ship.xcoord, ycoord: ship.ycoord },
            damage: WORMHOLE_DAMAGE,
            clearProjectiles: true,
          }
        : { kind: 'crash', damage: CRASH_DAMAGE },
    });
  }

  return events;
}
