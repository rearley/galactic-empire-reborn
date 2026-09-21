import { ShipState } from '../ship/ship-state.types';
import { HPBEAMW } from '../constants';
import { cdistance, hyperPhaserDamage, inScanRange, withinArc } from './combat-math';
import { isInNeutralZone } from './neutral-zone';

/** One ship caught in a hyper-phaser beam, with the hull damage it takes. */
export interface HyperVictim {
  victim: ShipState;
  damage: number;
}

/**
 * The victims of one `firehp` discharge.
 *
 * @see GECMDS.C:1044-1083 firehp
 *
 * Three things separate this from `firep`, and all three are why it is worth
 * having as its own function rather than a flag on the normal sweep:
 *
 *  - the beam is a FIXED `HPBEAMW` (5 degrees) half-angle. `ptr->percent` is
 *    not consulted, so a focus that would collapse a normal shot is irrelevant;
 *  - damage is `pdamage * phasrtype / tonfact`, not firep's
 *    `(1 + phasrtype) / 2.5` — a different curve, not a scaled one;
 *  - it only engages ships in hyperspace, on both ends.
 *
 * Canon has ONE firehp, called by the player command and by the Cybertron AI
 * (GECYBS.C:279). This port had the hyper path in the player handler only, so
 * a Cybertron pursuing someone through hyperspace fired its NORMAL phaser —
 * which `firep` then discards against a target at warp unless
 * `phasrtype >= phatowrp` (GECMDS.C:948). The pursuit was therefore harmless.
 * Keeping the selection here means both callers cannot drift apart again.
 *
 * Damage application is deliberately left to the caller: canon's `wptr->damage
 * += damage` goes STRAIGHT TO HULL with no `shieldhit`, but the surrounding
 * bookkeeping (kill attribution, events, narration) differs between a player
 * pulling a trigger and an AI acting on a tick.
 */
export function selectHyperVictims(args: {
  firer: ShipState;
  allShips: readonly ShipState[];
  /**
   * The firing degree RELATIVE to the firer's heading — canon's `ptr->degrees`.
   * `withinArc` adds the heading itself. @see firep.ts, ai-weapons-aim.spec.ts
   */
  degree: number;
  /** The firer's class scan range, canon's hard cap (GECMDS.C:1054). */
  scanRange: number;
  maxTonsFor: (shpclass: number) => number;
}): HyperVictim[] {
  const { firer, allShips, degree, scanRange, maxTonsFor } = args;
  const out: HyperVictim[] = [];

  for (const candidate of allShips) {
    if (candidate.userid === firer.userid && candidate.shipno === firer.shipno) continue;
    // ingegame(othusn) — a player (1) or an AI hull (2).
    if (candidate.status !== 1 && candidate.status !== 2) continue;
    // firehp engages hyperspace only, on both ends (GECMDS.C:1045).
    if (candidate.where !== 1) continue;
    // Victims inside the neutral zone are immune (GECMDS.C:1047).
    if (isInNeutralZone(candidate)) continue;
    // `ddistance < shipclass[ptr->shpclass].scanrange` (GECMDS.C:1054).
    if (!inScanRange(firer, candidate, scanRange)) continue;
    // Fixed 5-degree half-angle (GECMDS.C:1050) — focus plays no part.
    if (!withinArc(firer, candidate, degree, HPBEAMW)) continue;

    const damage = hyperPhaserDamage({
      phasrtype: firer.phasrtype,
      distRaw: cdistance(firer, candidate) * 10_000,
      victimMaxTons: maxTonsFor(candidate.shpclass),
    });

    out.push({ victim: candidate, damage });
  }

  return out;
}
