import { ShipState } from '../ship/ship-state.types';
import { cdistance, inScanRange, lineOfFire, phaserDamage } from './combat-math';
import { isInNeutralZone } from './neutral-zone';
import { PHATOWRP } from '../constants';

/** One ship the discharge reached, and what it took. */
export interface PhaserVictim {
  victim: ShipState;
  damage: number;
}

/**
 * Every ship a phaser discharge reaches, with the damage each takes.
 *
 * Canon has exactly ONE `firep` and it sweeps the whole ship table
 * (GECMDS.C:946-1004) — the shot is a cone, not a shot at somebody:
 *
 *   for (othusn=0 ; othusn < nships ; othusn++)
 *       if (ingegame(othusn) && (wptr->where != 1 || ptr->phasrtype >= phatowrp))
 *           if (othusn != usrn && !neutral(&wptr->coord))
 *               if (smallest(heading,deg) < ptr->percent+PHABIAS) ... hit it
 *
 * `ingegame()` returns TRUE for GESTAT_AUTO, so bystanders and other AI are in
 * the cone exactly like players.
 *
 * The port had two implementations: the player's handler, which swept
 * correctly, and the Cybertron path, which resolved against a single chosen
 * target. Because they were separate, the same gate had to be fixed twice —
 * the hyperspace check (`where != 1 || phasrtype >= PHATOWRP`) landed on the
 * player path first and the AI shot people in transit for as long as it took
 * to notice. This function exists so there is one selection again.
 *
 * Ordering matters and mirrors the C: reachability, then self, then the
 * neutral zone, then range, then the arc, and finally the `damage >= 1` gate
 * that wraps the ENTIRE consequence block at GECMDS.C:975.
 *
 * @see GECMDS.C:946-1004 firep
 */
export function selectPhaserVictims(args: {
  firer: ShipState;
  allShips: readonly ShipState[];
  /** Absolute firing bearing — `normal(heading + degrees)` (GECMDS.C:941). */
  degree: number;
  /** Focus width, `ptr->percent`. */
  focus: number;
  /** The charge the bank actually held. */
  phasrCharge: number;
  scanRange: number;
  maxTonsFor: (shpclass: number) => number;
}): PhaserVictim[] {
  const { firer, allShips, degree, focus, phasrCharge, scanRange, maxTonsFor } = args;
  const victims: PhaserVictim[] = [];

  for (const candidate of allShips) {
    // othusn != usrn
    if (candidate.userid === firer.userid && candidate.shipno === firer.shipno) continue;
    // ingegame(othusn) — a player (1) or an AI hull (2); nothing else is in the game.
    if (candidate.status !== 1 && candidate.status !== 2) continue;

    // `wptr->where != 1 || ptr->phasrtype >= phatowrp`. Canon tests WHERE, not
    // speed: the two coincide because the hyperspace transition fires exactly
    // at WARP_THRESHOLD (physics-math.ts), but `where` is what the C reads.
    const victimAtWarp = candidate.where === 1;
    if (victimAtWarp && firer.phasrtype < PHATOWRP) continue;

    // !neutral(&wptr->coord)
    if (isInNeutralZone(candidate)) continue;

    // C-001 (audit 022): a phaser must not reach past the firer's scanner.
    if (!inScanRange(firer, candidate, scanRange)) continue;

    // smallest(heading,deg) < ptr->percent + PHABIAS
    if (!lineOfFire(firer, candidate, degree, focus)) continue;

    const damage = phaserDamage({
      phasrtype: firer.phasrtype,
      phasr: phasrCharge,
      distRaw: cdistance(firer, candidate) * 10000,
      focus,
      victimMaxTons: maxTonsFor(candidate.shpclass),
      victimAtWarp,
    });

    // `if (damage >= 1)` gates the whole consequence block, including
    // `lastfired` and `cantexit` — a graze must leave no trace at all.
    if (damage < 1) continue;

    victims.push({ victim: candidate, damage });
  }

  return victims;
}
