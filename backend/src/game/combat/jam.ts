import { EventEmitter2 } from '@nestjs/event-emitter';
import { FIRETICKS, JAMTIME } from '../constants';
import { I_JAMMER } from '../constants/items';
import type { ShipClassCacheService } from '../physics/ship-class-cache.service';
import type { ShipStateService } from '../ship/ship-state.service';
import type { ShipState } from '../ship/ship-state.types';
import { shipKey } from '../ship/ship-state.types';
import { COMBAT_TARGET_WARNING, CombatTargetWarningEvent } from './combat-events';
import { cdistance, jammerCounter } from './combat-math';

/**
 * Canon's `jam()` — ONE for the player's `jam`, a Cybertron and a Droid, as in
 * canon:
 *   GECMDS.C:1624 `void FUNC jam(ptr,usrn)`
 *   GECYBS.C:637 `jam(ptr,usrn);`
 *   GEDROIDS.C:515 `jam(ptr,usrn);`
 *
 * Every ship in the game within the jammer's scan range is blinded, the nearer
 * the longer, the jammer included — the loop has no self-exclusion:
 *   GECMDS.C:1644 `wptr->jammer = (unsigned)(((double)jamtime)*ddist);`
 * then one jammer is spent and the jammer is battle-locked:
 *   GECMDS.C:1649 `--ptr->items[I_JAMMERS];`
 *   GECMDS.C:1650 `ptr->cantexit = FIRETICKS;`
 *
 * The RANGE is the jammer's own class. Canon reads it off `warsptr`, the
 * current user's ship:
 *   GECMDS.C:1638 `if (ingegame(zothusn)   && ddist < (double)shipclass[warsptr->shpclass].scanrange)`
 * For a player that is the jammer. From the AI loop it is whoever `warsptr`
 * last pointed at, because the loop never sets it — only AI creation and
 * player input do:
 *   GECYBS.C:115 `warsptr = warshpoff(usrn);`
 *   GEMAIN.C:1498 `warsptr=warshpoff(usrnum);`
 * The evident intent is the jammer's own scanner, the one every other line of
 * the function reads.
 * The caller checks there is a jammer to spend. @see docs/DECISIONS.md 2026-09-21
 */
export function applyJam(
  jammer: ShipState,
  shipState: Pick<ShipStateService, 'findAllShips' | 'mutate'>,
  classes: Pick<ShipClassCacheService, 'getScanRange'>,
  events: EventEmitter2,
): void {
  let scanRange = 50_000;
  try {
    scanRange = classes.getScanRange(jammer.shpclass);
  } catch {
    // fall back
  }

  for (const candidate of shipState.findAllShips()) {
    // ingegame(zothusn): a player (1) or an AI hull (2).
    if (candidate.status !== 1 && candidate.status !== 2) continue;
    // cdistance() is in sector-units; scanRange is raw units. C scales the
    // distance up before both the gate and the falloff — without the
    // `* 10_000` every ship in the galaxy reads as point-blank.
    // @see GECMDS.C:1637 `ddist *= 10000;`
    const dist = cdistance(jammer, candidate) * 10_000;
    if (dist >= scanRange) continue; // C only writes jammer inside the range branch
    const value = jammerCounter(dist, scanRange, JAMTIME);
    shipState.mutate(candidate.userid, candidate.shipno, (s) => {
      s.jammer = value;
    });
    // Canon tells each ship it blinds: `prfmsg(JAMMER3); outprfge(FILTER,
    // zothusn)` — addressed to the VICTIM, inside the same range branch that
    // writes the counter: GECMDS.C:1645 `prfmsg(JAMMER3);`. Without it a victim's scan just
    // went blank, which reads as a bug rather than as an attack and gives no
    // cue to run or to call for `sys unjam`. The loop has no self-exclusion
    // in canon, so the firer is warned too; that is canon, not an oversight.
    events.emit(COMBAT_TARGET_WARNING, {
      victimId: shipKey(candidate.userid, candidate.shipno),
      kind: 'scanners-jammed',
      // JAMMER3 takes no argument — canon does not say who jammed you.
      attackerLetter: '',
      tickAt: new Date(),
    } satisfies CombatTargetWarningEvent);
  }

  shipState.mutate(jammer.userid, jammer.shipno, (s) => {
    s.items = [...s.items] as typeof s.items;
    s.items[I_JAMMER] = (s.items[I_JAMMER] ?? 0n) - 1n;
    s.cantexit = FIRETICKS;
  });
}
