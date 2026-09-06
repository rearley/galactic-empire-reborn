/**
 * Canon's `lockon` tells the TARGET it is being locked, and pins BOTH ships in
 * place whether the lock succeeds or fails:
 *
 *   if (fact > .7) {
 *       if (lockwarn == TRUE) {
 *   /*      prfmsg(LOCK1,shpltr(usrn,ship));       <- commented out in canon
 *           outprfge(FILTER,usrn); *\/
 *           prfmsg(LOCK2,shpltr(ship,usrn));
 *           outprfge(FILTER,ship);
 *       }
 *       lockwarn = TRUE;
 *       wptr->cantexit = FIRETICKS;    // the TARGET
 *       ptr->cantexit  = FIRETICKS;    // the firer
 *       return(1);
 *   } else {
 *       if (lockwarn == TRUE) {
 *           prfmsg(LOCK3,shpltr(usrn,ship));  outprfge(FILTER,usrn);
 *           prfmsg(LOCK4,shpltr(ship,usrn));  outprfge(FILTER,ship);
 *       }
 *       lockwarn = TRUE;
 *       wptr->cantexit = FIRETICKS;
 *       ptr->cantexit  = FIRETICKS;
 *       return(0);
 *   }
 *
 * @see GECMDS.C:1395-1422
 *
 * Three things the port did not do:
 *
 *  1. The target was never told. LOCK2 and LOCK4 exist in the generated string
 *     table and were emitted nowhere, so being painted by an enemy's fire
 *     control was invisible — and a FAILED lock, which in canon betrays a
 *     stalker's presence and scan letter, was invisible too.
 *  2. The TARGET's `cantexit` was never set. Only the firer was battle-locked,
 *     so the ship being shot at could simply `exit` and leave.
 *  3. Neither happened on the failure path at all, where canon still pins both
 *     ships for FIRETICKS.
 *
 * Note LOCK1 — the firer's "you have a lock" line — is COMMENTED OUT in canon,
 * so a successful lock tells the firer nothing extra. Only LOCK3 (failure) goes
 * to the firer, and the port already emits that as LOCK_FAIL.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ScanHandlerService } from '../../../../src/game/commands/handlers/scan.handler';
import { CommandContext } from '../../../../src/game/commands/command.types';
import { TorpedoHandlerService } from '../../../../src/game/commands/handlers/torpedo.handler';
import { MissileHandlerService } from '../../../../src/game/commands/handlers/missile.handler';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { Mulberry32Adapter } from '../../../../src/game/combat/random.port';
import { FIRETICKS } from '../../../../src/game/constants';
import { I_TORP, I_MISSL } from '../../../../src/game/constants/items';
import {
  COMBAT_TARGET_WARNING,
  CombatTargetWarningEvent,
} from '../../../../src/game/combat/combat-events';

function itemsWith(map: Record<number, bigint>): bigint[] {
  const arr: bigint[] = [];
  for (let i = 0; i < 14; i++) arr.push(0n);
  for (const [k, v] of Object.entries(map)) arr[Number(k)] = v;
  return arr;
}

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 100, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 1, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: itemsWith({ [I_TORP]: 5n, [I_MISSL]: 5n }),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
    channel: over.channel ?? over.shipno ?? 1,
  };
}

function makeHarness(ships: ShipState[]) {
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    get: (userid: string, shipno: number) => shipMap.get(shipKey(userid, shipno)),
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(shipKey(userid, shipno));
      if (!s) return undefined;
      fn(s);
      s.dirty = true;
      return s;
    },
  } as unknown as ShipStateService;

  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, {
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange: 100_000_000, maxTons: 5000,
    hasTorpedo: true, hasMissile: true,
  } as never);

  const events = new EventEmitter2();
  const warnings: CombatTargetWarningEvent[] = [];
  events.on(COMBAT_TARGET_WARNING, (e: CombatTargetWarningEvent) => warnings.push(e));

  const handler = new TorpedoHandlerService(
    shipState, cache, events, new Mulberry32Adapter(42),
    { lettersFor: () => [] } as unknown as ScanHandlerService,
  );
  const missile = new MissileHandlerService(
    shipState, cache, events, new Mulberry32Adapter(42),
    { lettersFor: () => [] } as unknown as ScanHandlerService,
  );
  return { handler, missile, warnings };
}

const ctx: CommandContext = {};

/** `mis <target> <energy>` — the warhead charge is the SECOND argument. */
const MISSILE_CHARGE = '1000';

// Clear of sector (0,0): firing in the neutral zone backfires (WPN_ZAP,
// GECMDS.C:937) and returns long before the lock is evaluated, so an
// engagement staged at the origin proves nothing about locking.
const HOME = 20;

/** Point-blank and stationary — `(1.2 - 0/5000) * ((5 - ~0)/TORFACT)` clears .7. */
function closeEngagement() {
  const firer = makeShip({ userid: 'attacker', shipno: 1, shipname: 'Hunter', xcoord: HOME, ycoord: HOME });
  const target = makeShip({ userid: 'victim', shipno: 2, shipname: 'Quarry', xcoord: HOME + 0.05, ycoord: HOME });
  return { firer, target, ...makeHarness([firer, target]) };
}

/** Near the 5-sector edge of the lock envelope — `(5 - 4.99)` collapses fact. */
function distantEngagement() {
  const firer = makeShip({ userid: 'attacker', shipno: 1, shipname: 'Hunter', xcoord: HOME, ycoord: HOME });
  const target = makeShip({ userid: 'victim', shipno: 2, shipname: 'Quarry', xcoord: HOME + 4.99, ycoord: HOME });
  return { firer, target, ...makeHarness([firer, target]) };
}

describe('lockon warns the target and pins both ships (GECMDS.C:1395-1422)', () => {
  describe('successful lock', () => {
    it('warns the target that fire control is locked on it', () => {
      const { handler, firer, target, warnings } = closeEngagement();

      handler.command.handler(firer, ['Quarry'], ctx);

      expect(warnings.map((w) => ({ kind: w.kind, victim: w.victimId })))
        .toContainEqual({ kind: 'lock-acquired', victim: shipKey(target.userid, target.shipno) });
    });

    it("pins the TARGET in place, not just the firer", () => {
      const { handler, firer, target } = closeEngagement();

      handler.command.handler(firer, ['Quarry'], ctx);

      expect({ firer: firer.cantexit, target: target.cantexit })
        .toEqual({ firer: FIRETICKS, target: FIRETICKS });
    });
  });

  describe('failed lock', () => {
    it('still warns the target — a failed lock betrays the stalker', () => {
      const { handler, firer, target, warnings } = distantEngagement();

      handler.command.handler(firer, ['Quarry'], ctx);

      expect(warnings.map((w) => ({ kind: w.kind, victim: w.victimId })))
        .toContainEqual({ kind: 'lock-attempt', victim: shipKey(target.userid, target.shipno) });
    });

    it('still pins BOTH ships for FIRETICKS', () => {
      const { handler, firer, target } = distantEngagement();

      handler.command.handler(firer, ['Quarry'], ctx);

      expect({ firer: firer.cantexit, target: target.cantexit })
        .toEqual({ firer: FIRETICKS, target: FIRETICKS });
    });
  });
});

describe('the missile path shares canon\'s lockon, so it warns identically', () => {
  // Canon has ONE lockon (GECMDS.C:1341-1422); `torp` and `missl` both call it,
  // so the warnings and the double battle-lock are not torpedo-specific. The
  // port reimplemented the gate separately in each handler, which is exactly
  // how the two drifted apart before.
  it('warns the target on a missile lock', () => {
    const { missile, firer, target, warnings } = closeEngagement();

    missile.command.handler(firer, ['Quarry', MISSILE_CHARGE], ctx);

    expect(warnings.map((w) => w.kind)).toContain('lock-acquired');
    expect(warnings.map((w) => w.victimId))
      .toContain(shipKey(target.userid, target.shipno));
  });

  it('pins both ships on a missile lock', () => {
    const { missile, firer, target } = closeEngagement();

    missile.command.handler(firer, ['Quarry', MISSILE_CHARGE], ctx);

    expect({ firer: firer.cantexit, target: target.cantexit })
      .toEqual({ firer: FIRETICKS, target: FIRETICKS });
  });

  it('warns and pins on a FAILED missile lock too', () => {
    const { missile, firer, target, warnings } = distantEngagement();

    missile.command.handler(firer, ['Quarry', MISSILE_CHARGE], ctx);

    expect(warnings.map((w) => w.kind)).toContain('lock-attempt');
    expect({ firer: firer.cantexit, target: target.cantexit })
      .toEqual({ firer: FIRETICKS, target: FIRETICKS });
  });
});
