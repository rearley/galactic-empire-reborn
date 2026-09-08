import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipState, shipKey } from '../ship/ship-state.types';
import { ShipStateService } from '../ship/ship-state.service';
import { FIRETICKS } from '../constants';
import { shipLetter } from '../commands/helpers/find-ship';
import { COMBAT_TARGET_WARNING, CombatTargetWarningEvent } from './combat-events';

/**
 * The consequences canon attaches to a fire-control lock, for BOTH ships.
 *
 * Canon has a single `lockon` (GECMDS.C:1341-1422) that `torp` and `missl` both
 * call, and its tail is the same either way the roll goes:
 *
 *   if (fact > .7) { ... prfmsg(LOCK2,shpltr(ship,usrn)); outprfge(FILTER,ship);
 *                    wptr->cantexit = FIRETICKS; ptr->cantexit = FIRETICKS; return 1; }
 *   else          { ... prfmsg(LOCK3,...); outprfge(FILTER,usrn);
 *                       prfmsg(LOCK4,shpltr(ship,usrn)); outprfge(FILTER,ship);
 *                    wptr->cantexit = FIRETICKS; ptr->cantexit = FIRETICKS; return 0; }
 *
 * Two things the port was missing, on both weapons:
 *
 *  - the TARGET was never told (LOCK2/LOCK4 existed in the generated string
 *    table and were emitted nowhere), so being painted was invisible;
 *  - the TARGET's `cantexit` was never set, so the ship being shot at could
 *    simply leave — including during a torpedo's whole flight time.
 *
 * This lives in one place because canon has one lockon. The port had the gate
 * copied into the torpedo and missile handlers separately, which is how the
 * hyperspace check once landed on only one of them.
 *
 * @see GECMDS.C:1395-1422
 */
export interface LockOutcomeDeps {
  shipState: ShipStateService;
  events: EventEmitter2;
  /** Scan letters as a given ship sees them — canon's `shpltr(viewer,subject)`. */
  lettersFor: (userid: string, shipno: number) => ReadonlyArray<{ shipKey: string; letter: string }>;
}

export function applyLockOutcome(
  firer: ShipState,
  target: ShipState,
  kind: 'lock-acquired' | 'lock-attempt',
  deps: LockOutcomeDeps,
): void {
  // Battle-lock BOTH. Canon does this whether the lock succeeded or failed.
  deps.shipState.mutate(firer.userid, firer.shipno, (s) => { s.cantexit = FIRETICKS; });
  deps.shipState.mutate(target.userid, target.shipno, (t) => { t.cantexit = FIRETICKS; });

  warnTarget(firer, target, kind, deps);
}

/**
 * Send one warning to the target, with no other side effect.
 *
 * The launch messages are announcements, not locks: canon prints TFIRE2/MFIRE2
 * as the tube empties and does not touch `cantexit` there — the lock that
 * preceded the shot already set it. @see GECMDS.C:1198, :1313
 *
 * `%c` is `shpltr(ship,usrn)` — the FIRER's letter as the TARGET sees it, so
 * the victim can match the warning to a contact on their own scan.
 */
export function warnTarget(
  firer: ShipState,
  target: ShipState,
  kind: CombatTargetWarningEvent['kind'],
  deps: Pick<LockOutcomeDeps, 'events' | 'lettersFor'>,
): void {
  // The letter is resolved by the GATEWAY, from `attackerId`, against the
  // victim's scan table at the moment of delivery — canon evaluates
  // `shpltr(shpnum, usrn)` inside the prfmsg to that user (GECMDS.C:1198).
  // One mechanism, so no emitter can get it wrong again; the AI path did,
  // naming letters that belonged to other contacts. `attackerLetter` stays
  // empty rather than being computed twice.
  deps.events.emit(COMBAT_TARGET_WARNING, {
    victimId: shipKey(target.userid, target.shipno),
    attackerId: shipKey(firer.userid, firer.shipno),
    kind,
    attackerLetter: '',
    tickAt: new Date(),
  } satisfies CombatTargetWarningEvent);
}
