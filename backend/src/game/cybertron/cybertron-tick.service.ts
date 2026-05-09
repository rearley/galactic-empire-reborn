import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Inject } from '@nestjs/common';
import { TickService } from '../tick/tick.service';
import { TickContext, TickKind } from '../tick/tick.types';
import { ShipStateService } from '../ship/ship-state.service';
import { ShipClassCacheService } from '../physics/ship-class-cache.service';
import { Random, RANDOM } from '../combat/random.port';
import { CybertronRepository } from './cybertron.repository';
import { buildCybertronClassConfigs } from './cybertron.config';
import type { CybertronClassConfig } from './cybertron.config';
import {
  CYB_ALLOW,
  CYBMAXPERTICK,
  CYBTICKTIME,
  CYB_MINDAM,
  CYB_TOUGH_1,
  CYB_BREAKOFF,
  PMINFIRE,
  FIRETICKS,
  DECOYTIME,
  WARP_THRESHOLD,
  MAXTORPS,
  CYB_BE_NICE,
  CYB_BE_EASY,
  CYBSLO,
  UNIVMAX,
} from '../constants';
import {
  CYBERTRON_EVENT,
  CybertronSpawnedPayload,
  CybertronTargetAcquiredPayload,
  CybertronTauntPayload,
  CybertronBrokeOffPayload,
} from './cybertron-events';
import type { ShipState } from '../ship/ship-state.types';
import { shipKey } from '../ship/ship-state.types';
import {
  cdistance,
  lineOfFire,
  phaserDamage,
  shieldhit,
} from '../combat/combat-math';
import {
  COMBAT_PHASER_FIRED,
  COMBAT_HIT,
  COMBAT_MISS,
  CombatPhaserFiredEvent,
  CombatHitEvent,
  CombatMissEvent,
  CombatShipDestroyedEvent,
} from '../combat/combat-events';
import {
  CYBERTRON_SCORED_KILL,
  CybertronScoredKillEvent,
} from '../player/player-score.service';
import { I_TORP, I_MINE, I_JAMMER, I_DECOY, I_ZIPPER } from '../constants/items';
import {
  pickSpawnClass,
  randomInitLoadout,
  randomCybSkill,
  pickPursuitBand,
  cybwhoops,
  gebemean,
  rollTorpedoCount,
} from './cyb-decisions';
import { pickTaunt } from './taunt-pool';

/**
 * Drives the Cybertron/Sartern AI state machine on every PHYSICS tick.
 * Subscribes AFTER CombatTickService (CybertronModule imports CombatModule — NestJS
 * runs onModuleInit in import-dependency order so this registers strictly after combat).
 *
 * @see GECYBS.C:198 cyb_lives — per-ship AI state machine
 * @see specs/007-cybertron-ai/plan.md R-1 (tick ordering), R-2 (spawn cadence)
 */
@Injectable()
export class CybertronTickService implements OnModuleInit {
  private readonly logger = new Logger(CybertronTickService.name);

  /** Modulo-30 counter that gates spawn-slot execution. @see GEMAIN.C outer loop (R-2) */
  private spawnTickCounter = 0;

  /** Maps classNumber → CybertronClassConfig (merged from env overrides + defaults). */
  private readonly classConfigs: Record<number, CybertronClassConfig> = buildCybertronClassConfigs();

  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly tickService: TickService,
    private readonly shipState: ShipStateService,
    private readonly shipClassCache: ShipClassCacheService,
    private readonly repository: CybertronRepository,
    private readonly events: EventEmitter2,
    @Inject(RANDOM) private readonly random: Random,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.tickService.subscribe(
      TickKind.PHYSICS,
      (ctx) => this.onPhysicsTick(ctx),
    );
    this.events.on('combat.ship-destroyed', (payload: unknown) =>
      this.onShipDestroyed(payload),
    );
    this.events.on(CYBERTRON_SCORED_KILL, (e: CybertronScoredKillEvent) =>
      this.onCybertronScoredKill(e),
    );
    this.logger.log('CybertronTickService subscribed to PHYSICS tick');
  }

  /**
   * Boot-time hydrate — load all Cybrg-* ships into ShipStateService before first tick.
   * Called by CybertronModule after full NestJS DI initialization.
   * @see GECYBS.C:88 cyb_init — loads existing Cybertron rows from DB
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.repository.hydrateAll();
  }

  private onPhysicsTick(_ctx: TickContext): void {
    this.spawnTickCounter++;
    if (this.spawnTickCounter % 30 === 0) {
      void this.runSpawnSlot(_ctx);
    }

    const ships = this.shipState.findAllShips().filter((s) => s.status === 2);
    let activationsThisTick = 0;
    for (const ship of ships) {
      if (activationsThisTick >= CYBMAXPERTICK) break;
      ship.tick = Math.max(0, ship.tick - 1);
      if (ship.tick === 0) {
        try {
          this.cybLives(ship, _ctx);
          activationsThisTick++;
        } catch (err: unknown) {
          const id = shipKey(ship.userid, ship.shipno);
          const stack = err instanceof Error ? err.stack : String(err);
          this.logger.error(`cybLives fault for ${id}: ${stack}`);
        }
      }
    }
  }

  /**
   * Per-ship AI state machine — executes when tick countdown reaches zero.
   * @see GECYBS.C:198 cyb_lives
   */
  private cybLives(ship: ShipState, ctx: TickContext): void {
    // Mark tick for recalc at end of cybLives (255 = sentinel)
    ship.tick = 255;

    const topSpeed = (ship.topspeed ?? 0) * 1000.0;

    // Allowance credit (@see GECYBS.C:229)
    ship.energy = Math.min(ship.energy + CYB_ALLOW, 999_999);

    // cybupdate decrement + direction wander (@see GECYBS.C:455 db_update)
    this.cybUpdateDb(ship, topSpeed);

    // Jammed branch vs normal engagement scan (@see GECYBS.C:236-319)
    if (ship.jammer === 0) {
      this.runEngagementScan(ship, topSpeed, ctx);
    } else {
      // Jammed: mine the area and pick random heading (@see GECYBS.C:308-319)
      const cls = this.shipClassCache.get(ship.shpclass);
      if (cls?.hasMine && Number(ship.items[I_MINE]) > 0 && Math.floor(this.random.next() * 5) === 0) {
        // Mine lay — US4 full impl; decrement inventory only for now
        ship.items = [...ship.items] as typeof ship.items;
        ship.items[I_MINE] = BigInt(Math.max(0, Number(ship.items[I_MINE]) - 1));
      }
      ship.speed2b = topSpeed + this.random.next() * 3000.0;
      ship.holdcourse = Math.floor(this.random.next() * 7) + 2;
    }

    // Defensive randomization on damage (@see GECYBS.C:321 cyb_check_damage)
    this.cybCheckDamage(ship, topSpeed);

    // Target acquisition and pursuit bands (@see GECYBS.C:323 cyb_check_lockon)
    this.cybCheckLockon(ship, topSpeed, ctx);

    // Restore energy to fixed value (@see GECYBS.C:325)
    ship.energy = 50_000;

    // Jammer speed override (@see GECYBS.C:331-336)
    if (ship.jammer > 0) {
      ship.speed2b = topSpeed + this.random.next() * 3000.0;
      ship.holdcourse = Math.floor(this.random.next() * 10) + 5;
    }

    // Recalculate next tick (@see GECYBS.C:338-352)
    if (ship.tick === 255) {
      const isTough = (this.shipClassCache.get(ship.shpclass)?.tough ?? 0) === CYB_TOUGH_1;
      if (ship.cantexit === 0) {
        ship.tick = (CYBTICKTIME + Math.floor(this.random.next() * CYBTICKTIME)) * 5;
      } else if (!isTough) {
        ship.tick = CYBTICKTIME + Math.floor(this.random.next() * CYBTICKTIME);
      } else {
        ship.tick = 2 + Math.floor(this.random.next() * CYBTICKTIME);
      }
    }

    ship.dirty = true;

    void ctx; // will be used for tickAt in event payloads
  }

  /**
   * `db_update` equivalent: decrement cybupdate, randomize direction when idle.
   * @see GECYBS.C:455 db_update
   */
  private cybUpdateDb(ship: ShipState, topSpeed: number): void {
    if (ship.cybupdate > 1) {
      ship.cybupdate--;
      return;
    }
    if (ship.cybupdate === 1) {
      if (ship.cybmine === 255) {
        ship.speed2b = this.random.next() * topSpeed;
        ship.head2b = this.random.next() * 359.9;
      }
      ship.cybupdate = 100 + Math.floor(this.random.next() * 100);
    }
  }

  /**
   * Defensive response to damage: lay mine, deploy jammer, randomize heading.
   * @see GECYBS.C:619 cyb_check_damage
   */
  private cybCheckDamage(ship: ShipState, topSpeed: number): void {
    if (
      ship.cybmine < 255 &&
      ship.damage > CYB_MINDAM &&
      Math.floor(this.random.next() * 10) === 0
    ) {
      const cls = this.shipClassCache.get(ship.shpclass);
      let dirty = false;
      if (cls?.hasMine && Number(ship.items[I_MINE]) > 0 && Math.floor(this.random.next() * 5) === 0) {
        ship.items = [...ship.items] as typeof ship.items;
        ship.items[I_MINE] = BigInt(Math.max(0, Number(ship.items[I_MINE]) - 1));
        dirty = true;
      }
      if (cls?.hasJammer && Number(ship.items[I_JAMMER]) > 0 && Math.floor(this.random.next() * 100) === 0) {
        // Jammer deploy — decrement inventory (full effect in US4/T054)
        ship.items = [...ship.items] as typeof ship.items;
        ship.items[I_JAMMER] = BigInt(Math.max(0, Number(ship.items[I_JAMMER]) - 1));
        dirty = true;
      }
      ship.speed2b = topSpeed;
      ship.head2b = this.random.next() * 359.9;
      ship.holdcourse = Math.floor(this.random.next() * 10) + 5;
      if (dirty) {
        void this.repository.flushShipsImmediate([shipKey(ship.userid, ship.shipno)]);
      }
    }
  }

  /**
   * Engagement scan: loop all active players in scan range, apply warp-fire or
   * normal-space combat (phaser + torp + decoy), breakoff roll, Zipper branch.
   * @see GECYBS.C:238-305
   */
  private runEngagementScan(ship: ShipState, topSpeed: number, ctx: TickContext): void {
    if (this.isInNeutralZone(ship)) return;

    const cls = this.shipClassCache.get(ship.shpclass);
    const config = this.classConfigs[ship.shpclass];
    const scanRange = cls?.scanRange ?? 100_000;
    const tooclose = config?.tooclose ?? 3_000;
    const tough = cls?.tough ?? 0;
    const tickAt = typeof ctx === 'object' && ctx !== null && 'tickNumber' in ctx
      ? (ctx as { tickNumber: number }).tickNumber : 0;

    for (const target of this.shipState.findAllShips()) {
      if (target.status !== 1) continue;
      if (target.cloak === 10) continue;
      if (this.isInNeutralZone(target)) continue; // neutral zone protects targets too

      const dist = cdistance(ship, target);
      const ddist = dist * 10_000;
      if (ddist > scanRange) continue;

      // Zipper: class detects mines nearby, deploys zipper and retreats (@see GECYBS.C:280-290)
      if (cls?.hasZipper && ship.minesnear > 0 && Number(ship.items[I_ZIPPER]) > 0) {
        ship.items = [...ship.items] as typeof ship.items;
        ship.items[I_ZIPPER] = BigInt(Number(ship.items[I_ZIPPER]) - 1);
        ship.cybmine = 255;
        ship.speed2b = topSpeed;
        ship.head2b = (ship.head2b + 180) % 360;
        // Prevent immediate re-acquisition so Cybertron actually retreats
        ship.holdcourse = Math.floor(this.random.next() * 10) + 5;
        return;
      }

      // Breakoff: non-quad, 1-in-CYB_BREAKOFF per visible target (@see GECYBS.C:255)
      if (tough !== CYB_TOUGH_1 && Math.floor(this.random.next() * CYB_BREAKOFF) === 0) {
        ship.cybmine = 255;
        ship.speed2b = topSpeed;
        const brokeOff: CybertronBrokeOffPayload = {
          attackerShipKey: shipKey(ship.userid, ship.shipno),
          targetShipKey: shipKey(target.userid, target.shipno),
          sector: { x: Math.floor(ship.xcoord), y: Math.floor(ship.ycoord) },
          tickAt,
        };
        this.events.emit(CYBERTRON_EVENT.BROKE_OFF, brokeOff);
        return;
      }

      // Warp-fire path: both ships in hyperwarp, gebemean, range < 30000 (@see GECYBS.C:263-272)
      if (ship.where === 1 && target.where === 1) {
        const targetCls = this.shipClassCache.get(target.shpclass);
        const mean = gebemean(tough, target.kills, CYB_BE_NICE, CYBSLO, this.random);
        const canHit = ddist < tooclose || (targetCls?.cybCanAttack ?? false) || target.cantexit > 0;
        if (mean && ddist < 30_000 && canHit && !this.isInNeutralZone(target)) {
          this.cybFirePhaser(ship, target, ctx);
        }
        continue;
      }

      // Normal-space path (@see GECYBS.C:274-305)
      if (ship.where === 0 && target.where !== 1) {
        // Point toward target
        const dx = target.xcoord - ship.xcoord;
        const dy = target.ycoord - ship.ycoord;
        if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
          ship.head2b = ((Math.atan2(dx, dy) * 180 / Math.PI) + 360) % 360;
        }

        // Attack condition: within tooclose range, or class is attackable, or target is battle-locked
        const targetCls = this.shipClassCache.get(target.shpclass);
        const rangeFactor = tooclose + this.random.next() * tooclose;
        const canAttack = ddist < rangeFactor || (targetCls?.cybCanAttack ?? false) || target.cantexit > 0;

        if (canAttack) {
          this.cybAttack(ship, target, tough, ddist, ctx);
        } else {
          this.cybAnnoy(ship, target, ctx);
        }

        this.cybLayDecoys(ship);
      }
    }
  }

  /**
   * Fire phasers at target — emit COMBAT_PHASER_FIRED, compute damage, apply, emit COMBAT_HIT.
   * @see GECYBS.C:490-525 cyb_attack → firep
   */
  private cybFirePhaser(ship: ShipState, target: ShipState, ctx: TickContext): void {
    if (ship.phasr < PMINFIRE) return;

    const attackerId = shipKey(ship.userid, ship.shipno);
    const dx = target.xcoord - ship.xcoord;
    const dy = target.ycoord - ship.ycoord;
    const absAngle = ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;
    const bearing = (absAngle - ship.heading + 360) % 360;
    const sector = { x: Math.floor(ship.xcoord), y: Math.floor(ship.ycoord) };
    const tickAt = ctx.firedAt;

    const firedEvent: CombatPhaserFiredEvent = {
      shipId: attackerId,
      bearing,
      percent: 100,
      hyper: false,
      sector,
      tickAt,
    };
    this.events.emit(COMBAT_PHASER_FIRED, firedEvent);

    let maxPhaser = 1;
    try {
      maxPhaser = this.shipClassCache.getMaxPhaser(ship.shpclass);
    } catch { /* fallback */ }

    const dist = cdistance(ship, target);
    if (lineOfFire(ship, target, bearing, 100)) {
      const damage = phaserDamage(100, dist, maxPhaser);
      const shieldUp = target.shieldstat === 1 && target.shield > 0;
      let hullDamage = Math.floor(damage);
      let shieldConsumed = 0;

      if (shieldUp) {
        const result = shieldhit(target.shield, target.shieldtype, Math.floor(damage));
        this.shipState.mutate(target.userid, target.shipno, (v) => {
          v.shield = result.newCharge;
          if (result.knockedDown) v.shieldstat = 0;
          v.lastfired = ship.shipno;
          v.cantexit = FIRETICKS;
        });
        hullDamage = 0;
        shieldConsumed = result.shieldConsumed;
      } else {
        this.shipState.mutate(target.userid, target.shipno, (v) => {
          v.damage = v.damage + hullDamage;
          v.lastfired = ship.shipno;
          v.cantexit = FIRETICKS;
        });
      }

      const hitEvent: CombatHitEvent = {
        attackerId,
        victimId: shipKey(target.userid, target.shipno),
        weapon: 'phaser',
        damageHull: hullDamage,
        damageShield: shieldConsumed,
        sector,
        tickAt,
      };
      this.events.emit(COMBAT_HIT, hitEvent);
    }

    ship.phasr = 0;
    ship.cantexit = FIRETICKS;
  }

  /**
   * Attack with phasers + torpedo volley, gated by cybwhoops.
   * @see GECYBS.C:490-543 cyb_attack
   */
  private cybAttack(ship: ShipState, target: ShipState, tough: number, ddist: number, ctx: TickContext): void {
    const cls = this.shipClassCache.get(ship.shpclass);

    if (!cybwhoops(ship.cybskill, this.random)) {
      this.cybFirePhaser(ship, target, ctx);
    }

    const torpCount = rollTorpedoCount(
      tough, target.kills, cls?.hasTorpedo ?? false, gebemean(tough, target.kills, CYB_BE_NICE, CYBSLO, this.random), CYB_BE_EASY, this.random,
    );
    for (let i = 0; i < torpCount && i < MAXTORPS; i++) {
      // Refill one torp slot before launching (@see GECYBS.C:534)
      if (Number(ship.items[I_TORP]) < 1) {
        ship.items = [...ship.items] as typeof ship.items;
        ship.items[I_TORP] = BigInt(Math.floor(this.random.next() * 5) + 1);
      }
      if (Number(ship.items[I_TORP]) > 0) {
        ship.items = [...ship.items] as typeof ship.items;
        ship.items[I_TORP] = BigInt(Number(ship.items[I_TORP]) - 1);
        this.cybLaunchTorpedo(ship, target, ddist);
      }
    }
  }

  /**
   * Taunt the target — pick message, emit cybertron.taunt. No weapon fire.
   * @see GECYBS.C:379 cyb_annoy
   */
  private cybAnnoy(ship: ShipState, target: ShipState, ctx: TickContext): void {
    const message = pickTaunt(this.random);
    const tickAt = typeof ctx === 'object' && ctx !== null && 'tickNumber' in ctx
      ? (ctx as { tickNumber: number }).tickNumber : 0;
    const taunt: CybertronTauntPayload = {
      attackerShipKey: shipKey(ship.userid, ship.shipno),
      targetShipKey: shipKey(target.userid, target.shipno),
      message,
      sector: { x: Math.floor(ship.xcoord), y: Math.floor(ship.ycoord) },
      tickAt,
    };
    this.events.emit(CYBERTRON_EVENT.TAUNT, taunt);
  }

  /**
   * Deploy a decoy slot if cybwhoops doesn't suppress and inventory allows.
   * @see GECYBS.C:556-567 cyb_lay_decoys
   */
  private cybLayDecoys(ship: ShipState): void {
    if (cybwhoops(ship.cybskill, this.random)) return;
    if (Number(ship.items[I_DECOY]) === 0) return;
    // Find an empty decout slot
    const emptySlot = ship.decout.findIndex((t) => t === 0);
    if (emptySlot === -1) return;
    ship.items = [...ship.items] as typeof ship.items;
    ship.items[I_DECOY] = BigInt(Number(ship.items[I_DECOY]) - 1);
    ship.decout = [...ship.decout] as typeof ship.decout;
    ship.decout[emptySlot] = DECOYTIME;
  }

  /**
   * Queue a torpedo into the target's incoming torpedo array.
   * @see GECYBS.C:534-543 cyb_attack — torp launch
   */
  private cybLaunchTorpedo(ship: ShipState, target: ShipState, ddist: number): void {
    const emptySlot = (target.ltorpsChannel as number[]).findIndex((ch) => ch === 255 || ch === undefined);
    if (emptySlot === -1) return; // all slots full
    this.shipState.mutate(target.userid, target.shipno, (v) => {
      while (v.ltorpsChannel.length <= emptySlot) v.ltorpsChannel.push(255);
      while (v.ltorpsDistance.length <= emptySlot) v.ltorpsDistance.push(0);
      v.ltorpsChannel[emptySlot] = ship.shipno;
      v.ltorpsDistance[emptySlot] = ddist;
    });
  }

  /**
   * Target acquisition and pursuit band selection.
   * @see GECYBS.C:649 cyb_check_lockon
   */
  private cybCheckLockon(ship: ShipState, topSpeed: number, ctx: TickContext): void {
    // 1. Respect holdcourse countdown (@see GECYBS.C:672)
    if (ship.holdcourse > 0) {
      ship.holdcourse--;
      return;
    }

    const cls = this.shipClassCache.get(ship.shpclass);
    const config = this.classConfigs[ship.shpclass];

    // 2. Validate current target (@see GECYBS.C:678-706)
    if (ship.cybmine !== 255) {
      const current = this.findPlayerByShipno(ship.cybmine);
      if (!current) {
        // Target left the game
        ship.cybmine = 255;
        ship.speed2b = this.random.next() * topSpeed;
        return;
      }
      if (current.cloak === 10) {
        // Target cloaked — hold course and maybe give up
        ship.holdcourse = Math.floor(this.random.next() * 5) + 5;
        ship.speed2b = this.random.next() * topSpeed;
        if (Math.floor(this.random.next() * 10) === 0) {
          ship.cybmine = 255;
        }
        return;
      }
    }

    // 3. If no target, scan for closest eligible player (@see GECYBS.C:709-731)
    if (ship.cybmine === 255) {
      const lowestToAttack = (cls?.cybLowestClassAttacks ?? 0) - 1;
      let lowDist = 999_999_999.0;
      let lowShipno = -1;

      for (const candidate of this.shipState.findAllShips()) {
        if (candidate.status !== 1) continue; // must be active player
        if (candidate.cloak === 10) continue;
        if (candidate.shpclass < lowestToAttack + 1) continue;

        // Neutral zone exclusion: Cybertron must not be in NZ, target must not be in NZ
        if (this.isInNeutralZone(ship)) continue;
        if (this.isInNeutralZone(candidate)) continue;

        // noClaim check: at most noClaim Cybertrons may claim this player
        if (!this.notClaimed(candidate.shipno, cls?.noClaim ?? 3)) continue;

        const dist = cdistance(ship, candidate);
        if (dist < lowDist) {
          lowDist = dist;
          lowShipno = candidate.shipno;
        }
      }

      if (lowShipno === -1) {
        // No eligible target — wander at random speed and rest for a while (@see GECYBS.C:733-737)
        ship.speed2b = this.random.next() * topSpeed;
        ship.head2b = this.random.next() * 359.9;
        ship.tick = 255;
        ship.cybmine = 255;
        return;
      }

      const wasAcquired = ship.cybmine === 255;
      ship.cybmine = lowShipno;

      if (wasAcquired) {
        const target = this.findPlayerByShipno(lowShipno);
        if (target) {
          const payload: CybertronTargetAcquiredPayload = {
            attackerShipKey: shipKey(ship.userid, ship.shipno),
            targetShipKey: shipKey(target.userid, target.shipno),
            sector: { x: Math.floor(ship.xcoord), y: Math.floor(ship.ycoord) },
            tickAt: typeof ctx === 'object' && ctx !== null && 'tickNumber' in ctx
              ? (ctx as { tickNumber: number }).tickNumber
              : 0,
          };
          this.events.emit(CYBERTRON_EVENT.TARGET_ACQUIRED, payload);
          void this.repository.flushShipsImmediate([shipKey(ship.userid, ship.shipno)]);
        }
      }
    }

    // 4. Apply pursuit band based on distance to current target (@see GECYBS.C:738-804)
    const target = this.findPlayerByShipno(ship.cybmine);
    if (!target) {
      ship.cybmine = 255;
      return;
    }

    const dist = cdistance(ship, target);
    const hyperdist1 = config?.hyperdist1 ?? 25;
    const hyperdist2 = config?.hyperdist2 ?? 10;
    const classMaxShields = cls?.maxShields ?? 2;

    // Detect hyperwarp exit (where: 1→0) for shield restore (@see R-9, T031)
    const prevWhere = ship.where;

    const band = pickPursuitBand(dist, hyperdist1, hyperdist2, prevWhere, classMaxShields, topSpeed, this.random);

    ship.speed2b = band.desiredSpeed;
    ship.where = band.where;
    if (band.shield !== undefined) {
      ship.shield = band.shield;
    }
    if (band.raiseShields) {
      ship.shieldstat = 1; // raise shields
    }

    // Point heading toward target
    const dx = target.xcoord - ship.xcoord;
    const dy = target.ycoord - ship.ycoord;
    if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
      // Convert to heading: 0=north, increasing clockwise — atan2 in standard math → bearing
      ship.head2b = ((Math.atan2(dx, dy) * 180 / Math.PI) + 360) % 360;
    }
  }

  /**
   * Returns true if the given coordinate is in the neutral zone (sector 0,0).
   * @see GEPLANET.C:866 neutral — floor(xcoord)==0 && floor(ycoord)==0
   */
  private isInNeutralZone(ship: { xcoord: number; ycoord: number }): boolean {
    return Math.floor(ship.xcoord) === 0 && Math.floor(ship.ycoord) === 0;
  }

  /**
   * Returns true if fewer than noClaim other Cybertrons already claim this player.
   * @see GECYBS.C:357 notclaimed
   */
  private notClaimed(targetShipno: number, noClaim: number): boolean {
    let count = 0;
    for (const s of this.shipState.findAllShips()) {
      if (s.status === 2 && s.cybmine === targetShipno) {
        count++;
        if (count >= noClaim) return false;
      }
    }
    return true;
  }

  /** Find an active player ship by shipno. */
  private findPlayerByShipno(shipno: number): ShipState | undefined {
    return this.shipState.findAllShips().find(
      (s) => s.shipno === shipno && s.status === 1,
    );
  }

  /**
   * Increment kill counter for a Cybertron attacker — triggered by CYBERTRON_SCORED_KILL
   * event emitted from PlayerScoreService to avoid a circular module dependency.
   * @see GECYBS.C — kill counter escalation (CYB_BE_NICE/CYB_BE_EASY thresholds)
   */
  private onCybertronScoredKill(e: CybertronScoredKillEvent): void {
    const colonIdx = e.attackerShipKey.lastIndexOf(':');
    if (colonIdx === -1) return;
    const shipno = parseInt(e.attackerShipKey.slice(colonIdx + 1), 10);
    if (isNaN(shipno)) return;
    void this.repository.incrementKills(shipno, e.attackerUserid);
  }

  /**
   * Gold transfer on Cybertron kill: attacker gets victim's cash, victim is zeroed.
   * Victim must match /^Cybrg-/ (covers Sarterns). @see GECYBS.C:104-105
   * @see specs/007-cybertron-ai/plan.md R-4 (gold transfer event)
   * @see specs/007-cybertron-ai/tasks.md T061
   */
  private onShipDestroyed(payload: unknown): void {
    const event = payload as CombatShipDestroyedEvent;
    if (!event?.victimUserid?.match(/^Cybrg-/)) return;
    if (!event.attackerUserid) return;
    void this.transferCybertronGold(event.victimUserid, event.attackerUserid);
  }

  private async transferCybertronGold(victimUserid: string, attackerUserid: string): Promise<void> {
    try {
      await this.repository.transferGold(victimUserid, attackerUserid);
      this.logger.log(`Gold transfer: ${victimUserid} → ${attackerUserid}`);
    } catch (err: unknown) {
      const stack = err instanceof Error ? err.stack : String(err);
      this.logger.error(`Gold transfer fault ${victimUserid}→${attackerUserid}: ${stack}`);
    }
  }

  private async runSpawnSlot(ctx: TickContext): Promise<void> {
    try {
      const classCounts = new Map<number, number>();
      for (const ship of this.shipState.findAllShips()) {
        if (ship.status !== 2) continue;
        const cls = ship.shpclass;
        classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1);
      }

      const chosenClass = pickSpawnClass(classCounts, this.classConfigs, this.random);
      if (chosenClass === null) return;

      const config = this.classConfigs[chosenClass];
      if (!config) return;

      const currentCount = classCounts.get(chosenClass) ?? 0;
      if (currentCount >= config.tot_to_create) return;

      const allAiShipnos = new Set(
        this.shipState.findAllShips().filter((s) => s.status === 2).map((s) => s.shipno),
      );
      let shipno = 200;
      while (allAiShipnos.has(shipno)) shipno++;

      const userid = `Cybrg-${shipno}`;
      const clsEntry = this.shipClassCache.get(chosenClass);
      const loadout = randomInitLoadout(config.cyb_gold, this.random);
      const cybskill = randomCybSkill(this.random);
      const tick = 6 + Math.floor(this.random.next() * 6);
      const xcoord = this.random.next() * UNIVMAX * 2.0 - UNIVMAX;
      const ycoord = this.random.next() * UNIVMAX * 2.0 - UNIVMAX;

      await this.repository.createSpawn({
        userid,
        shipno,
        classNumber: chosenClass,
        shipname: `Cybrg-${shipno * shipno + Math.floor(this.random.next() * 100)}`,
        xcoord,
        ycoord,
        phasrtype: clsEntry?.maxPhaser ?? 1,
        shieldtype: clsEntry?.maxShields ?? 1,
        loadout,
        cybskill,
        tick,
      });

      const payload: CybertronSpawnedPayload = {
        shipKey: `${userid}:${shipno}`,
        classNumber: chosenClass,
        sector: { x: Math.floor(xcoord), y: Math.floor(ycoord) },
        tickAt: ctx.tickNumber,
      };
      this.events.emit(CYBERTRON_EVENT.SPAWNED, payload);
      this.logger.log(`Spawned ${userid} class ${chosenClass}`);
    } catch (err: unknown) {
      const stack = err instanceof Error ? err.stack : String(err);
      this.logger.error(`Spawn slot fault: ${stack}`);
    }
  }
}
