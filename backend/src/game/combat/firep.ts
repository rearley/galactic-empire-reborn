import { ShipState } from '../ship/ship-state.types';
import { cdistance, inScanRange, lineOfFire, phaserDamage } from './combat-math';
import { isInNeutralZone } from './neutral-zone';
import { PHATOWRP } from '../constants';

/**
 * What a discharge found. `victims` is what it hit; `unreachableAtWarp` counts
 * ships that WERE inside the cone and were excluded only by the hyperspace
 * gate, so a caller can say something true instead of "no targets in arc".
 * Canon prints no summary at all here — that line is this port's — but an
 * invented line that states something false is worse than canon's silence.
 */
export interface PhaserSweep {
  victims: PhaserVictim[];
  unreachableAtWarp: number;
}

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
  /**
   * The firing degree RELATIVE to the firer's heading — canon's `ptr->degrees`.
   * `lineOfFire` adds the heading itself to make canon's absolute
   * `normal(heading + degrees)`. This said "absolute" once, and the AI believed
   * it and added the heading twice. @see test/game/ai/ai-weapons-aim.spec.ts
   */
  degree: number;
  /** Focus width, `ptr->percent`. */
  focus: number;
  /** The charge the bank actually held. */
  phasrCharge: number;
  scanRange: number;
  maxTonsFor: (shpclass: number) => number;
}): PhaserSweep {
  const { firer, allShips, degree, focus, phasrCharge, scanRange, maxTonsFor } = args;
  const victims: PhaserVictim[] = [];
  let unreachableAtWarp = 0;

  for (const candidate of allShips) {
    // othusn != usrn
    if (candidate.userid === firer.userid && candidate.shipno === firer.shipno) continue;
    // ingegame(othusn) — a player (1) or an AI hull (2); nothing else is in the game.
    if (candidate.status !== 1 && candidate.status !== 2) continue;

    // `wptr->where != 1 || ptr->phasrtype >= phatowrp`. Canon tests WHERE, not
    // speed: the two coincide because the hyperspace transition fires exactly
    // at WARP_THRESHOLD (physics-math.ts), but `where` is what the C reads.
    const victimAtWarp = candidate.where === 1;
    const outOfReachAtWarp = victimAtWarp && firer.phasrtype < PHATOWRP;

    // !neutral(&wptr->coord)
    if (isInNeutralZone(candidate)) continue;

    // C-001 (audit 022): a phaser must not reach past the firer's scanner.
    if (!inScanRange(firer, candidate, scanRange)) continue;

    // smallest(heading,deg) < ptr->percent + PHABIAS
    if (!lineOfFire(firer, candidate, degree, focus)) continue;

    // Counted only AFTER the arc test, so this means "you were aimed at it and
    // the beam could not reach it", not "it exists somewhere at warp".
    if (outOfReachAtWarp) {
      unreachableAtWarp++;
      continue;
    }

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

  return { victims, unreachableAtWarp };
}
