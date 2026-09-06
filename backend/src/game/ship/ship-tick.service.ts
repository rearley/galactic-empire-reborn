import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlanetStateService } from '../planet/planet-state.service';
import { resolveIonCannonHit, PLANET_ION_FIRED } from '../planet/ion-cannon';
import { cdistance, shieldhit } from '../combat/combat-math';
import { I_ION } from '../constants/items';
import { I_FLUX } from '../constants/items';
import { Injectable, Logger, Optional, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TickService } from '../tick/tick.service';
import { TickContext, TickKind, Unsubscribe } from '../tick/tick.types';
import { ShipStateService } from './ship-state.service';
import { ShipState, shipKey } from './ship-state.types';
import { decideOverspeed, OverspeedRng } from './ship-overspeed';
import {
  SHIP_OVERSPEED,
} from './overspeed-events';
import {
  SHIP_SYSTEM_REPAIRED,
  RepairedSystem,
  ShipSystemRepairedEvent,
  SHIP_STATUS_NOTICE,
  ShipStatusNoticeEvent,
} from './repair-events';
import {
  SHIP_SHIELD_CHARGE,
  ShipShieldChargeEvent,
} from './shield-events';
import {
  ShipOverspeedEvent,
  overspeedMessage,
} from './overspeed-events';
import { MaintenanceService } from './maintenance.service';
import { decideAutoShield } from './auto-shield';
import { SHIELDDM,
  SHMINPWR,
  SHENGUSE,
  ENGYMAX,
  ENGYMIN,
  ENGRECHG,
  REPAIRRATE,
} from '../constants';

/**
 * Drives the 1-second SHIP_UPDATE tick for all active ships.
 * Subscribes to TickKind.SHIP_UPDATE (movement-side work) and TickKind.PHYSICS
 * (repair, shields, energy) in OnModuleInit; unsubscribes on OnModuleDestroy.
 *
 * Per-tick per-ship pipeline:
 *  1. Overspeed engine break evaluation (US2, FR-003/004)
 *  2. Auto-repair (US3, FR-005) when ship.autoRepair === true
 *  3. Auto-shield (US4, FR-006) when ship.autoShield === true
 *
 * Pattern parallels PhysicsTickService. Faults are isolated per ship.
 *
 * @see backend/src/game/physics/physics-tick.service.ts PhysicsTickService
 * @see GEMAIN.C:main loop (TICKTIME2=1s ship-update cadence)
 */
/** GEMAIN.C:2486 `zothusn += 3` — the 1s loop's stride over the ship table. */
const MOVE_STRIDE = 3;

/** `if (dist > 1000) ptr->hostile = 0;` — raw units. @see GEFUNCS.C:924 */
const HOSTILE_RANGE = 1000;

@Injectable()
export class ShipTickService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShipTickService.name);
  private unsubscribe: Unsubscribe | null = null;
  private unsubscribeRestore: Unsubscribe | null = null;
  /** C's `clicker` — each ship is moved once every MOVE_STRIDE 1s firings. */
  private moveClicker = 0;

  /** Deterministic RNG wrapper reusing Math.random for now; tests inject deterministic. */
  private readonly rng: OverspeedRng = {
    intBelow: (n: number) => Math.floor(Math.random() * n),
  };

  /** Random port for the ion-cannon roll. */
  private readonly rng2 = { next: () => Math.random() };

  constructor(
    private readonly tickService: TickService,
    private readonly shipState: ShipStateService,
    private readonly maintenanceService: MaintenanceService,
    // Optional: a planet's ion cannons need the live planet map, and the many
    // hand-built test harnesses construct this service without one.
    @Optional() private readonly planets?: PlanetStateService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  onModuleInit(): void {
    // C splits ship housekeeping across two timers, and the split matters:
    //
    //   warrti2a (1s, GEMAIN.C:2470-2495)  rotate, accelerate, move, destruct
    //   warrtia  (6s, GEMAIN.C:2256-2274)  repairship, shieldstat, shieldchg,
    //                                      cloakstat, checktm, recharge, checkdam
    //
    // The whole restorative block used to run on the 1s tick with C's per-call
    // amounts, so hulls healed 18 points per 6 seconds instead of 3 and a shot
    // out helm or fire control came back six times sooner. Only the overspeed
    // roll belongs on the fast tick, because C runs it inside moveship.
    this.unsubscribe = this.tickService.subscribe(TickKind.SHIP_UPDATE, (ctx) =>
      this.forEachShip(ctx, (ship) => this.processMovementTick(ship)),
    );
    this.unsubscribeRestore = this.tickService.subscribe(TickKind.PHYSICS, (ctx) =>
      this.forEachShip(ctx, (ship) => this.processRestorativeTick(ship)),
    );
    this.logger.log('Subscribed to SHIP_UPDATE and PHYSICS ticks');
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.unsubscribeRestore?.();
    this.unsubscribeRestore = null;
    this.logger.log('Unsubscribed from SHIP_UPDATE and PHYSICS ticks');
  }

  private forEachShip(ctx: TickContext, fn: (ship: ShipState) => void): void {
    for (const ship of this.shipState.findAllShips()) {
      try {
        fn(ship);
      } catch (err: unknown) {
        const id = `${ship.userid}:${ship.shipno}`;
        const msg = err instanceof Error ? err.stack : String(err);
        this.logger.error(`ShipTickService fault for ${id} on tick ${ctx.tickNumber}: ${msg}`);
      }
    }
  }

  /**
   * The 1-second tick: only what C's `warrti2a` does for a ship. Movement and
   * rotation live in PhysicsTickService; the overspeed roll is here because C
   * runs it inside `moveship`.
   */
  private processMovementTick(ship: ShipState): void {
    // Overspeed engine break (US2, FR-003/004).
    //
    // C's 1-second `warrti2a` walks the ship table in strides of three
    // (`zothusn += 3; clicker = (clicker+1)%3`, GEMAIN.C:2472-2488), so each
    // ship is moved — and therefore rolled for overspeed, since the check
    // lives inside moveship — once every three seconds, not every second.
    this.moveClicker = (this.moveClicker + 1) % MOVE_STRIDE;
    if (this.moveClicker !== 0) return;

    const overspeed = decideOverspeed(ship, this.rng);
    switch (overspeed.kind) {
      case 'warn':
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.warncntr = overspeed.warncntr;
        });
        // `prfmsg(WARPFAST + ptr->warncntr)` — the rung BEFORE the increment,
        // so the first strain warning is rung 0. @see overspeed-events.ts
        this.events?.emit(SHIP_OVERSPEED, {
          shipId: `${ship.userid}:${ship.shipno}`,
          kind: 'warn',
          text: overspeedMessage('warn', overspeed.warncntr - 1),
        } satisfies ShipOverspeedEvent);
        break;
      case 'break':
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.warncntr = overspeed.warncntr;
          s.topspeed = overspeed.topspeed;
          s.speed2b = overspeed.speed2b;
          s.damage += overspeed.damage;
        });
        this.events?.emit(SHIP_OVERSPEED, {
          shipId: `${ship.userid}:${ship.shipno}`,
          kind: 'break',
          text: overspeedMessage('break', overspeed.warncntr),
        } satisfies ShipOverspeedEvent);
        break;
      case 'recover':
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.topspeed = overspeed.topspeed;
          s.speed2b = overspeed.speed2b;
          s.warncntr = overspeed.warncntr;
        });
        break;
      case 'noop':
        break;
    }
  }

  /**
   * The 6-second tick: C's `warrtia` — repair, shields, subsystem recovery,
   * energy. @see GEMAIN.C:2256-2274
   */
  private processRestorativeTick(ship: ShipState): void {
    // 1. Auto-flux — GEFUNCS.C:1307-1330 fluxstat. C calls this FIRST in
    // warrtia (GEMAIN.C:2256), before shields drain and before the recharge
    // trickle, so a ship that dipped under ENGYMIN last tick starts this one
    // full. Without it energy only ever fell outside the manual `flux`
    // command, and a pilot could sit at zero with a hold full of pods.
    if (ship.energy < ENGYMIN && (ship.items[I_FLUX] ?? 0n) > 0n) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.energy = ENGYMAX;
        s.items[I_FLUX] = (s.items[I_FLUX] ?? 0n) - 1n;
      });
    }

    // 2. Repair tick — GEFUNCS.C:390 repairship
    // Each 1s tick: subtract 3 hull damage, recalculate queue, clear when done.
    if (ship.repair > 0) {
      if (ship.cantexit > 0) {
        // Combat interrupts repair — GEFUNCS.C:397 — and the yard SAYS SO:
        // `prfmsg(MAINT10)`, the maintenance team downing tools under their
        // union contract. The port cancelled the paid-for repair silently, so a
        // captain undocked believing they were repaired. @see GEFUNCS.C:399
        this.shipState.mutate(ship.userid, ship.shipno, (s) => { s.repair = 0; });
        this.events?.emit(SHIP_STATUS_NOTICE, {
          shipId: shipKey(ship.userid, ship.shipno),
          notice: 'maint-interrupted',
          tickAt: new Date(),
        } satisfies ShipStatusNoticeEvent);
      } else {
        let maintComplete = false;
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.damage = s.damage > 3 ? s.damage - 3 : 0;
          s.repair = Math.floor(s.damage / 3);
          if (s.repair <= 1) {
            maintComplete = true;
            // A finished repair puts the ship back to factory condition — C
            // restores seven fields here, not three. topspeed is the one that
            // matters most: overspeeding sets it to 0 and `warp` refuses on
            // it, so without this a blown engine was permanent for the session.
            // @see GEFUNCS.C:406-421
            s.repair = 0;
            s.damage = 0;
            s.phasr = 100;
            s.tactical = 0;
            s.helm = 0;
            s.firecntl = 0;
            s.shieldstat = 0; // SHIELDDN
            s.shield = 0;
            // maxWarp is denormalised onto ShipState at hydration, exactly as
            // maxTons is — reaching for ShipClassCacheService from here would
            // put a cycle between ShipModule and PhysicsModule.
            if (s.maxWarp !== undefined) s.topspeed = s.maxWarp;
          }
        });

        // `prfmsg(MAINT7)` — the yard reporting the job done. Without it a
        // captain had no way to know the repair had finished except by watching
        // `rep`. @see GEFUNCS.C:422
        if (maintComplete) {
          this.events?.emit(SHIP_STATUS_NOTICE, {
            shipId: shipKey(ship.userid, ship.shipno),
            notice: 'maint-complete',
            tickAt: new Date(),
          } satisfies ShipStatusNoticeEvent);
        }
      }
    }

    // 2b. Subsystem repair — temporary disruptions recover toward operational each tick.
    // tactical/helm: negative values increment by +1 toward 0.
    // firecntl: positive values decrement by -1 toward 0.
    // shield (SHIELDDM state): negative shield value increments toward 0; when it reaches 0
    //   shieldstat is cleared to 0 so the player can re-raise shields.
    // Unlike hull repair, cantexit does NOT interrupt — disruptions are temporary effects.
    // @see GECMDS.C C-010 / S-007 (Plan 4 Task 3)
    // `cloak` is deliberately NOT in this list: ShipManagementTickService owns
    // the cloak ramp on the 6s tick, and C has exactly one increment site
    // (cloakstat, GEFUNCS.C:1388-1398, called once per warrtia). Repairing it
    // here as well healed a shot-out cloak at 7 points per 6 seconds.
    const needsSubsystemRepair = ship.tactical < 0 || ship.helm < 0
      || ship.firecntl > 0 || ship.phasr < 0 || (ship.shieldstat === SHIELDDM && ship.shield < 0);
    if (needsSubsystemRepair) {
      // Damage Control reports each system EXACTLY ONCE, on the tick its
      // counter reaches zero — `if (ptr->helm == 0) prfmsg(HLREPR);` and the
      // three like it. @see GEFUNCS.C:1016-1080
      const repaired: RepairedSystem[] = [];
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        if (s.tactical < 0) {
          s.tactical = Math.min(0, s.tactical + 1);
          if (s.tactical === 0) repaired.push('tactical');
        }
        if (s.helm < 0) {
          s.helm = Math.min(0, s.helm + 1);
          if (s.helm === 0) repaired.push('helm');
        }
        if (s.firecntl > 0) {
          s.firecntl = Math.max(0, s.firecntl - 1);
          if (s.firecntl === 0) repaired.push('firecntl');
        }
        // GEFUNCS.C:1015-1018 checkdam: negative phasr recovers +1/tick (energy-free, separate from preload)
        if (s.phasr < 0) {
          s.phasr = Math.min(0, s.phasr + 1);
          if (s.phasr === 0) repaired.push('phaser');
        }
        if (s.shieldstat === SHIELDDM && s.shield < 0) {
          // GEFUNCS.C:2473-2484 shieldrep: shield recovers at +shieldtype per tick (Fix 4)
          s.shield = Math.min(0, s.shield + s.shieldtype);
          if (s.shield >= 0) {
            s.shieldstat = 0; // back to "down" state so player can re-raise shields
          }
        }
      });

      for (const system of repaired) {
        this.events?.emit(SHIP_SYSTEM_REPAIRED, {
          shipId: shipKey(ship.userid, ship.shipno),
          system,
          tickAt: new Date(),
        } satisfies ShipSystemRepairedEvent);
      }
    }

    // 3. Passive hull repair — GEFUNCS.C:1009-1010, the last thing checkdam
    // does. `if (ptr->damage > 0.0) ptr->damage -= repairrate;` runs for every
    // ship on every TICKTIME pass, outside every combat guard, and on top of
    // the queued repair above. Canon's order is repairship (GEMAIN.C:2257)
    // then checkdam (:2267), so this sits after it.
    //
    // The port had no repairrate at all, so hull damage only ever fell inside
    // the repair `mai` buys. A pilot who came out of a fight mauled and broke
    // had no way back; canon lets them fly it off at 0.6 damage a minute.
    if (ship.damage > 0) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.damage = s.damage > REPAIRRATE ? s.damage - REPAIRRATE : 0;
      });
    }

    // 4. Shield status — GEFUNCS.C:1336-1352 shieldstat
    // Raised shields either collapse for want of power or charge; the debit in
    // shieldchg happens at the TOP of the function, before the charge test, so
    // holding a fully-charged shield up still costs `type * SHENGUSE`.
    // @see GEFUNCS.C:2497-2499
    if (ship.shieldstat === 1) {
      if (ship.energy < SHMINPWR) {
        // SHDNNOP — not enough power to hold them up at all.
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.shieldstat = 0;
          s.shield = 0;
        });
      } else if (ship.shieldtype > 0 && ship.shieldtype < 20) {
        const maxCharge = 40 + ship.shieldtype * 10;
        let reachedFull = false;
        let charging = false;
        let percent = 0;
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.energy = Math.max(0, s.energy - s.shieldtype * SHENGUSE);
          if (s.shield < maxCharge) {
            s.shield = Math.min(maxCharge, s.shield + s.shieldtype * 3);
            if (s.shield >= maxCharge) reachedFull = true;
            else { charging = true; percent = Math.floor((s.shield * 100) / maxCharge); }
          }
        });

        // C narrates every tick of the climb: SHLDUP on reaching full,
        // SHLDAT with a percentage otherwise (GEFUNCS.C:2515-2523). The port
        // charged silently, so a pilot who raised shields and warped fought
        // believing they were protected while sitting at 0%.
        if (reachedFull || charging) {
          this.events?.emit(SHIP_SHIELD_CHARGE, {
            shipId: shipKey(ship.userid, ship.shipno),
            kind: reachedFull ? 'full' : 'charging',
            percent: reachedFull ? 100 : percent,
          } satisfies ShipShieldChargeEvent);
        }
      }
    }

    // 3b. Passive recharge — GEFUNCS.C:1290-1300. A trickle (ENGRECHG is 1),
    // but it means no energy state is a dead end. `recharge` runs near the END
    // of warrtia, after the shields have taken their bite.
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.energy = s.energy < ENGYMAX ? Math.min(ENGYMAX, s.energy + ENGRECHG) : ENGYMAX;
    });

    // 5. Auto-repair (US3, FR-005).
    if (ship.autoRepair === true) {
      void this.maintenanceService.runAutoRepair(ship);
    }

    // 6. Ion cannons — a planet you have attacked shoots back.
    // @see GEFUNCS.C:1785-1812 fireion, called from warrtia (GEMAIN.C:2265)
    this.fireIon(ship);

    // 7. Auto-shield (US4, FR-006).
    if (ship.autoShield === true && ship.shieldstat === 0) {
      const decision = decideAutoShield(ship);
      if (decision.action === 'raise') {
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.shieldstat = 1;
          s.recentlyWarpedExit = false;
          s.recentlySelfFiredTorp = false;
        });
      }
    }
  }
  /**
   * A planet the pilot has attacked fires its ion cannons at them.
   *
   *   if (ptr->hostile > 1) {
   *     plnum = ptr->hostile - 10;
   *     if (plptr->items[I_IONCANNON].qty > 0) { ... }
   *   }
   *
   * `hostile` is set to `where` (10 + plnum) by `att` (GECMDS.C:3568) and is
   * this routine's only consumer — before this existed, ion cannons were a
   * tradeable item with no effect and there was no reason to garrison a
   * colony. `checkdist` (GEFUNCS.C:907-930) drops the mark once the pilot is
   * more than 1000 raw units from the planet, so pulling away ends it.
   *
   * @see GEFUNCS.C:1785-1812 fireion, GEFUNCS.C:797-798 the checkdist call
   */
  private fireIon(ship: ShipState): void {
    if (ship.hostile <= 1 || !this.planets) return;

    const plnum = ship.hostile - 10;
    const planet = this.planets.get(Math.floor(ship.xcoord), Math.floor(ship.ycoord), plnum);
    if (!planet) return;

    // checkdist: far enough away and the planet stops caring.
    if (cdistance(ship, planet) * 10_000 > HOSTILE_RANGE) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => { s.hostile = 0; });
      return;
    }

    if ((planet.items[I_ION]?.qty ?? 0n) <= 0n) return;

    const shieldsUp = ship.shieldstat === 1;
    const hit = resolveIonCannonHit(this.rng2, shieldsUp);

    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.damage = s.damage + hit.hullDamage;
      // `ptr->lastfired = -1` — killed by a planet, credited to nobody.
      // The recorded NAME has to go with it. `lastfiredBy` survives a channel
      // scrub on purpose, so leaving it set here meant: shooter hits you,
      // shooter logs off, a colony's ion cannons finish you, and the ship-loss
      // mail credits the pilot with a kill the planet made.
      // @see GEFUNCS.C:1797 fireion, kill-resolution.ts attackerNameFromLastFired
      s.lastfired = -1;
      s.lastfiredBy = undefined;
      if (shieldsUp && hit.shieldKnock > 0) {
        const r = shieldhit(s.shield, s.shieldtype, hit.shieldKnock);
        s.shield = r.newCharge;
        if (r.outcome === 'damaged') s.shieldstat = SHIELDDM;
      }
    });

    this.events?.emit(PLANET_ION_FIRED, {
      shipId: `${ship.userid}:${ship.shipno}`,
      plnum,
      planetName: planet.name ?? '',
      hullDamage: hit.hullDamage,
      shieldKnock: hit.shieldKnock,
      shieldsUp,
    });
  }

}
