/**
 * An AI torpedo lock has canon's whole `lockon` tail, not just its arithmetic.
 *
 * Canon's `torp()` opens with GECMDS.C:1188 `if (lockon(ptr,0,shpnum,usrn) == 1)`,
 * and `lockon` does three things whichever way the roll goes — for a Cybertron,
 * GECYBS.C:538 `torp(ptr,usrn,zothusn);`, exactly as for a player:
 *
 *   if (fact > .7) { if (lockwarn == TRUE) { prfmsg(LOCK2,...); outprfge(FILTER,ship); }
 *                    lockwarn = TRUE; wptr->cantexit = FIRETICKS; ptr->cantexit = FIRETICKS;
 *                    return(1); }
 *   else           { if (lockwarn == TRUE) { ...; prfmsg(LOCK4,...); outprfge(FILTER,ship); }
 *                    lockwarn = TRUE; wptr->cantexit = FIRETICKS; ptr->cantexit = FIRETICKS;
 *                    return(0); }
 *   -- GECMDS.C:1395 `if (fact > .7)`
 *
 * LOCK2 is "Ship %c has a fire control scanner locked on us!", LOCK4 "Ship %c
 * is attempting to lock fire control scanners on us." The player's `tor` sent
 * both; the AI path computed the lock and dropped the tail, so a Cybertron that
 * painted you, or tried to, said nothing and pinned no one.
 *
 * `lockwarn` is what makes it once per volley: GECYBS.C:537
 * `if (i>0) lockwarn = FALSE;` silences every lockon after the first.
 *
 * Found in play, 2026-09-22: a Cyberquad killed a Star Cruiser and the pilot
 * reported torpedoes from a Quad at warp 10. The kill was a phaser; nothing on
 * prod could say what the torpedoes were. Hence the log line tested last.
 *
 * @see GECMDS.C:1339 `int FUNC lockon(ptr,type,ship,usrn)`
 */

import { Logger } from '@nestjs/common';
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Random } from '../../../src/game/combat/random.port';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS, I_TORP } from '../../../src/game/constants/items';
import { FIRETICKS } from '../../../src/game/constants';
import { COMBAT_TARGET_WARNING } from '../../../src/game/combat/combat-events';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'S',
    xcoord: 5,
    ycoord: 5,
    energy: 50_000,
    phasr: 100,
    phasrtype: 2,
    shieldtype: 1,
    ltorpsChannel: [255, 255, 255],
    ltorpsDistance: [0, 0, 0],
    items: Array.from({ length: NUMITEMS }, () => 0n),
    cybmine: 255,
    cybskill: 5,
    topspeed: 8,
    userKills: 6,
    cantexit: 0,
    ...over,
  });
}

/** A fixed draw sequence, then 0.999 forever. */
function draws(v: number[]): Random {
  let i = 0;
  return { next: () => (i < v.length ? v[i++] : 0.999) } as Random;
}

// Draw 1 fails the phaser roll, draw 2 passes the torpedo roll, draw 3 asks
// for the volley size (0.9 -> several tubes).
const FIRES_A_VOLLEY = [0.5, 0.1, 0.9];
// Both gebemean rolls fail: no torpedo is attempted, so no lockon runs.
const NO_VOLLEY = [0.5, 0.999, 0.999];

function attack(rand: Random, cyb: ShipState, target: ShipState, ddistRaw: number) {
  const ships = [cyb, target];
  const events = new EventEmitter2();
  const warnings: Array<{ kind: string; victimId: string; attackerId: string }> = [];
  events.on(COMBAT_TARGET_WARNING, (e: { kind: string; victimId: string; attackerId: string }) => warnings.push(e));

  const shipState = {
    findAllShips: () => ships,
    findByUserid: () => [],
    get: () => undefined,
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = ships.find((x) => x.userid === userid && x.shipno === shipno);
      if (s) fn(s);
    },
    loadShip: () => {}, removeFromGame: () => {}, size: () => ships.length,
  } as unknown as ShipStateService;

  const svc = new CybertronTickService(
    { subscribe: () => () => {} } as unknown as TickService,
    shipState,
    {
      get: () => ({ hasTorpedo: true, hasZipper: false, scanRange: 50_000, maxTons: 900 }),
      getMaxTons: () => 900,
      getTypeName: () => 'Cybertron Battle Cruiser',
    } as unknown as ShipClassCacheService,
    {
      hydrateAll: vi.fn().mockResolvedValue(undefined),
      clampCybertronCash: (n: bigint) => n,
    } as unknown as CybertronRepository,
    events,
    rand,
  );
  ((svc as unknown as { brain: unknown }).brain as {
    cybAttack: (s: ShipState, t: ShipState, tough: number, d: number, c: unknown) => void;
  }).cybAttack(cyb, target, 0, ddistRaw, { firedAt: new Date() });
  return warnings;
}

function cybertron(over: Partial<ShipState> = {}): ShipState {
  const c = makeShip({
    userid: 'Cybrg-208', shipno: 208, shipname: 'Cyberquad 43332', shpclass: 22, status: 2, channel: 208, ...over,
  } as Partial<ShipState>);
  c.items = [...c.items];
  c.items[I_TORP] = 5n;
  return c;
}

function pilot(over: Partial<ShipState> = {}): ShipState {
  return makeShip({ userid: 'p1', shipno: 1, shipname: 'Hornet', xcoord: 5.1, ycoord: 5, ...over });
}

describe('an AI torpedo lock carries canon lockon\'s tail', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a FAILED lock warns the target once — LOCK4 — and launches nothing', () => {
    // Warp 10, 0.1 sectors: fact = (1.2 - 10000/5000) * (4.9/4) = -0.98.
    const cyb = cybertron({ speed: 10_000 });
    const target = pilot();
    const warnings = attack(draws(FIRES_A_VOLLEY), cyb, target, 1000);

    expect(warnings.map((w) => w.kind)).toEqual(['lock-attempt']);
    expect(warnings[0].victimId).toBe('p1:1');
    expect(warnings[0].attackerId).toBe('Cybrg-208:208');
  });

  it('a FAILED lock still battle-locks both ships', () => {
    const cyb = cybertron({ speed: 10_000 });
    const target = pilot();
    attack(draws(FIRES_A_VOLLEY), cyb, target, 1000);

    expect(target.cantexit).toBe(FIRETICKS);
    expect(cyb.cantexit).toBe(FIRETICKS);
  });

  it('a SUCCESSFUL lock warns once — LOCK2 — before the launch warning', () => {
    const cyb = cybertron();
    const target = pilot();
    const warnings = attack(draws(FIRES_A_VOLLEY), cyb, target, 1000);

    // One lock warning for the whole volley, then the launch.
    expect(warnings.map((w) => w.kind)).toEqual(['lock-acquired', 'torpedo-launched']);
    expect(target.cantexit).toBe(FIRETICKS);
    expect(cyb.cantexit).toBe(FIRETICKS);
  });

  it('no volley rolled means no lockon at all — no warning, no battle lock', () => {
    // `for (i=0;i<j;++i) torp(...)` with j == 0 never reaches lockon.
    const cyb = cybertron();
    const target = pilot();
    const warnings = attack(draws(NO_VOLLEY), cyb, target, 1000);

    expect(warnings.filter((w) => w.kind.startsWith('lock-'))).toEqual([]);
    expect(target.cantexit).toBe(0);
  });

  it('refuses a target in the neutral zone before the tail — no warning, no battle lock', () => {
    // GECMDS.C:1363 `if  (neutral(&(wptr->coord)))` returns 0 ahead of the
    // tail, so a pilot parked at the hub is never painted or pinned. The
    // canon-rules galaxy sim is what caught this missing.
    const cyb = cybertron({ xcoord: 0.4, ycoord: 0.5 });
    const target = pilot({ xcoord: 0.5, ycoord: 0.5 });
    const warnings = attack(draws(FIRES_A_VOLLEY), cyb, target, 1000);

    expect(warnings).toEqual([]);
    expect(target.cantexit).toBe(0);
    expect(target.ltorpsChannel.every((c) => c === 255)).toBe(true);
  });

  it('refuses when its own fire control is broken — no warning, no battle lock', () => {
    // GECMDS.C:1347 `if (ptr->firecntl > 0)` — the first test in lockon.
    const cyb = cybertron({ firecntl: 3 });
    const target = pilot();
    const warnings = attack(draws(FIRES_A_VOLLEY), cyb, target, 1000);

    expect(warnings).toEqual([]);
    expect(target.cantexit).toBe(0);
  });

  it('logs every AI torpedo lock with both speeds, the range and the verdict', () => {
    // Diagnostic, not canon: a pilot reported torpedoes from a Quad at warp 10
    // and prod had no record of what any AI torpedo was fired at, or how fast.
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const cyb = cybertron({ speed: 10_000 });
    const target = pilot({ speed: 250 });
    attack(draws(FIRES_A_VOLLEY), cyb, target, 1000);

    const lines = log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('ai torpedo lock:'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("firer='Cyberquad 43332'");
    expect(lines[0]).toContain('firerSpeed=10000');
    expect(lines[0]).toContain("target='Hornet'");
    expect(lines[0]).toContain('targetSpeed=250');
    expect(lines[0]).toContain('dist=0.1');
    expect(lines[0]).toContain('result=fail');
  });
});
