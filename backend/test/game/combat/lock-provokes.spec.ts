/**
 * #55. Firing on an AI with a torpedo or missile makes it hunt you, as a phaser
 * already did. Canon's single `lockon`, which both `torp` and `missl` call,
 * claims the target the moment it is found in range and uncloaked — BEFORE the
 * lock roll, so a lock that fails still turns the AI on you:
 *
 *   GECMDS.C:1371 `if (wptr->cloak < 10 && (dist*10000.0) < (double)shipclass[warsptr->shpclass].scanrange)`
 *   GECMDS.C:1374 `wptr->cybmine = usrn;`
 *
 * `applyLockOutcome` is the port's shared tail of that block, reached for a won
 * lock and a lost one alike, after the cloak and range gates.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { applyLockOutcome } from '../../../src/game/combat/lock-outcome';
import { CybTraceService } from '../../../src/game/cybertron/cyb-trace.service';
import { GESTAT_AUTO } from '../../../src/game/constants';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import type { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { makeShip } from '../../helpers/make-ship';

function rig(targetOver: Partial<ShipState>) {
  const firer = makeShip({ userid: 'pilot_Wasp', shipno: 1, username: 'Wasp', status: 1, channel: 18 });
  const target = makeShip({ userid: 'Cybrg-205', shipno: 205, status: GESTAT_AUTO, channel: 9, cybmine: 255, ...targetOver });
  const ships = [firer, target];
  const shipState = {
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => { const s = ships.find((x) => x.userid === u && x.shipno === n); if (s) fn(s); return s; },
  } as unknown as ShipStateService;
  const trace = new CybTraceService({ now: () => 0 });
  const deps = { shipState, events: new EventEmitter2(), lettersFor: () => [], trace };
  return { firer, target, deps, trace };
}

describe.each(['lock-acquired', 'lock-attempt'] as const)('a %s on an AI', (kind) => {
  it('claims it for the firer — who they are, not only their channel', () => {
    const { firer, target, deps } = rig({});
    applyLockOutcome(firer, target, kind, deps);
    expect(target.cybmine).toBe(18);
    expect(target.cybmineKey).toBe('pilot_Wasp:1');
  });

  it('overrides whatever the AI was already hunting — canon\'s assignment is bare', () => {
    const { firer, target, deps } = rig({ cybmine: 4, cybmineKey: 'pilot_Other:1' });
    applyLockOutcome(firer, target, kind, deps);
    expect(target.cybmine).toBe(18);
  });

  it('shows in the AI\'s sys trace as a provoke, naming the shooter', () => {
    const { firer, target, deps, trace } = rig({});
    applyLockOutcome(firer, target, kind, deps);
    expect(trace.read('Cybrg-205:205')).toEqual([expect.objectContaining({ event: 'provoke', detail: 'locked by Wasp' })]);
  });
});

describe('a lock on a player', () => {
  it('claims nothing — only an AI is conscripted', () => {
    const { firer, target, deps } = rig({ userid: 'pilot_Ace', shipno: 1, status: 1, cybmine: 255 });
    applyLockOutcome(firer, target, 'lock-acquired', deps);
    expect(target.cybmine).toBe(255);
  });
});
