/**
 * Drives the Droid AI state machine on every PHYSICS tick.
 * Subscribes AFTER CybertronTickService (DroidModule imports CybertronModule).
 *
 * On every 30th tick (DROID_SPAWN_TICK_CADENCE):
 *   1. Gate on ≥1 GESTAT_USER ship online.
 *   2. Top up per-class population (cap = DROID_MAX_PER_CLASS).
 *   3. Drive per-Droid decision trees (class 10/11/12).
 *
 * @see GEMAIN.C:2325-2400 — outer ticktock2 >= 30 loop
 * @see GEDROIDS.C:droid_lives, droid_won, droid_died
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Inject, Optional } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { TickService } from '../tick/tick.service';
import { TickContext, TickKind } from '../tick/tick.types';
import { ShipStateService } from '../ship/ship-state.service';
import { ShipClassCacheService } from '../physics/ship-class-cache.service';
import { MineRegistry } from '../combat/mine.registry';
import { MineRepository } from '../combat/mine.repository';
import { Random, RANDOM } from '../combat/random.port';
import type { ShipState } from '../ship/ship-state.types';
import { shipKey } from '../ship/ship-state.types';
import {
  DROID_SPAWN_TICK_CADENCE,
  DROID_MAX_PER_CLASS,
  DROID_CLASS_SCOW,
  DROID_CLASS_TRANSPORT,
  DROID_CLASS_VAKORY,
  DROID_USERID_PREFIX,
  GESTAT_USER,
  GESTAT_AUTO,
  PMINFIRE,
  FIRETICKS,
  HPBEAMW,
  JAMTIME,
  MAXTORPS,
  WARP_THRESHOLD,
} from '../constants';
import { I_TORP, I_MINE, I_JAMMER } from '../constants/items';
import { buildDroidConfig } from './droid.config';
import { DroidSpawner } from './droid-spawner';
import { droidActClass10 } from './droid-act-class-10';
import { droidActClass11 } from './droid-act-class-11';
import { droidActClass12 } from './droid-act-class-12';
import { pickAnnoy } from './droid-message-pool';
import {
  DroidEvents,
  DroidAnnoyEvent,
  DroidSpawnedEvent,
  DroidKilledEvent,
} from './droid-events';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
  COMBAT_PHASER_FIRED,
  COMBAT_HIT,
  CombatPhaserFiredEvent,
  CombatHitEvent,
} from '../combat/combat-events';
import { cdistance, hyperPhaserDamage, inScanRange, lineOfFire, phaserDamage, shieldhit, withinArc } from '../combat/combat-math';
import { CombatTickService } from '../combat/combat-tick.service';

const DROID_CLASSES = [DROID_CLASS_SCOW, DROID_CLASS_TRANSPORT, DROID_CLASS_VAKORY] as const;

@Injectable()
export class DroidTickService implements OnModuleInit {
  private readonly logger = new Logger(DroidTickService.name);

  /** Modulo counter — on rollover, run spawn + per-Droid actions. @see GEMAIN.C:2325 */
  private spawnTickCounter = 0;

  /** Per-class live Droid population. @see data-model.md §DroidTickService private state */
  private readonly livePopulation = new Map<number, Set<string>>([
    [DROID_CLASS_SCOW, new Set()],
    [DROID_CLASS_TRANSPORT, new Set()],
    [DROID_CLASS_VAKORY, new Set()],
  ]);

  private readonly config = buildDroidConfig();

  constructor(
    private readonly tickService: TickService,
    private readonly shipState: ShipStateService,
    private readonly classCache: ShipClassCacheService,
    private readonly spawner: DroidSpawner,
    private readonly mineRegistry: MineRegistry,
    private readonly mineRepo: MineRepository,
    private readonly events: EventEmitter2,
    @Inject(RANDOM) private readonly random: Random,
    @Optional() private readonly combatTick?: CombatTickService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.tickService.subscribe(TickKind.PHYSICS, (ctx) => this.onPhysicsTick(ctx));
    this.logger.log('DroidTickService subscribed to PHYSICS tick');
  }

  /** Returns the live population map — exposed for tests. */
  getLivePopulation(): Map<number, Set<string>> {
    return this.livePopulation;
  }

  private onPhysicsTick(ctx: TickContext): void {
    this.spawnTickCounter = (this.spawnTickCounter + 1) % DROID_SPAWN_TICK_CADENCE;
    if (this.spawnTickCounter !== 0) return;

    // Gate: at least one human player must be online
    const hasPlayer = this.shipState.findAllShips().some((s) => s.status === GESTAT_USER);
    if (!hasPlayer) return;

    this.runSpawnEvaluation(ctx);
    this.runDroidActions(ctx);
  }

  private runSpawnEvaluation(ctx: TickContext): void {
    for (const classNumber of DROID_CLASSES) {
      const pop = this.livePopulation.get(classNumber) ?? new Set<string>();
      if (pop.size >= DROID_MAX_PER_CLASS) continue;

      const state = this.spawner.spawn(classNumber, this.livePopulation);
      if (!state) continue;

      const spawned: DroidSpawnedEvent = {
        shipId: state.userid,
        shipname: state.shipname,
        shpclass: state.shpclass,
        sector: { x: Math.floor(state.xcoord), y: Math.floor(state.ycoord) },
        ephemeral: true,
        spawnedAt: Date.now(),
      };
      this.events.emit(DroidEvents.SPAWNED, spawned);
      this.logger.debug(`Spawned ${state.userid} class ${classNumber}`);
    }
  }

  private runDroidActions(ctx: TickContext): void {
    const players = this.shipState.findAllShips().filter(
      (s) => s.status === GESTAT_USER && !(Math.floor(s.xcoord) === 0 && Math.floor(s.ycoord) === 0),
    );

    for (const classNumber of DROID_CLASSES) {
      const pop = this.livePopulation.get(classNumber);
      if (!pop) continue;

      for (const userid of pop) {
        try {
          this.actOnDroid(userid, classNumber, players, ctx);
        } catch (err: unknown) {
          this.logger.error(`Droid action fault ${userid}:`, err);
        }
      }
    }
  }

  private actOnDroid(userid: string, classNumber: number, players: ShipState[], ctx: TickContext): void {
    const droid = this.shipState.get(userid, 1);
    if (!droid) {
      // Droid was removed (killed) — clean up population
      this.livePopulation.get(classNumber)?.delete(userid);
      return;
    }

    const clsConfig = this.config.classes[classNumber];
    const scanRange = clsConfig?.scanRange ?? 25_000;
    const tickAt = ctx.tickNumber;

    if (classNumber === DROID_CLASS_SCOW) {
      this.actClass10(droid, players, scanRange, tickAt);
    } else if (classNumber === DROID_CLASS_TRANSPORT) {
      this.actClass11(droid, players, scanRange, tickAt);
    } else if (classNumber === DROID_CLASS_VAKORY) {
      this.actClass12(droid, players, scanRange, tickAt);
    }

    // @see GEDROIDS.C:214 — energy reset after droid_lives
    droid.energy = 50_000;
    droid.dirty = true;
  }

  // ── Class 10: Lydorian Garbage Scow ───────────────────────────────────────

  private actClass10(droid: ShipState, players: ShipState[], scanRange: number, tickAt: number): void {
    const action = droidActClass10(
      droid,
      players,
      scanRange,
      (shipname, rng) => pickAnnoy(DROID_CLASS_SCOW, 'passive', shipname, rng),
      this.random,
    );

    if (action.jammedSpeed !== undefined) {
      droid.speed2b = action.jammedSpeed;
      droid.holdcourse = action.jammedHoldcourse ?? 0;
    }

    this.applyShieldCommand(droid, action.shieldCommand);

    for (const { target, message } of action.annoys) {
      this.emitAnnoy(droid, target, message, DROID_CLASS_SCOW, 'passive', tickAt);
    }
  }

  // ── Class 11: Murdonian Transport ─────────────────────────────────────────

  private actClass11(droid: ShipState, players: ShipState[], scanRange: number, tickAt: number): void {
    const { confuseDenom_class11: confuseDenom } = this.config.global;

    const action = droidActClass11(
      droid,
      players,
      scanRange,
      confuseDenom,
      (shipname, rng) => pickAnnoy(DROID_CLASS_TRANSPORT, 'passive', shipname, rng),
      (shipname, rng) => pickAnnoy(DROID_CLASS_TRANSPORT, 'help', shipname, rng),
      this.random,
    );

    if (action.jammedFlee) {
      droid.speed2b = action.jammedFlee.speed2b;
      droid.holdcourse = action.jammedFlee.holdcourse;
      return;
    }

    // Scan-range speed adjustment when not on hold course
    if (action.passiveAnnoys.length > 0 && droid.holdcourse === 0) {
      droid.speed2b = this.random.next() * 999.9;
    }

    if (action.shieldCommand !== undefined) {
      this.applyShieldCommand(droid, action.shieldCommand);
    }

    for (const { target, message } of action.passiveAnnoys) {
      this.emitAnnoy(droid, target, message, DROID_CLASS_TRANSPORT, 'passive', tickAt);
    }

    if (action.fightback) {
      const fb = action.fightback;
      this.emitAnnoy(droid, fb.target, fb.helpMessage, DROID_CLASS_TRANSPORT, 'help', tickAt);

      if (fb.fireMode === 'hyper') {
        this.fireHyperPhaser(droid, fb.target, fb.ddist);
      } else if (fb.fireMode === 'normal') {
        this.firePhaser(droid, fb.target);
      }

      if (fb.confuse) {
        droid.speed2b = fb.confuse.speed2b;
        droid.head2b = fb.confuse.head2b;
        droid.holdcourse = fb.confuse.holdcourse;
      }

      if (fb.hypEvade) {
        droid.speed2b = fb.hypEvade.speed2b;
        droid.holdcourse = fb.hypEvade.holdcourse;
      } else if (fb.raiseShields) {
        this.applyShieldCommand(droid, 1);
      }
    }
  }

  // ── Class 12: Vakory Survey Drone ─────────────────────────────────────────

  private actClass12(droid: ShipState, players: ShipState[], scanRange: number, tickAt: number): void {
    const { alterVectorDenom_class12: alterVectorDenom, vakoryDamageThreshold } = this.config.global;

    const action = droidActClass12(
      droid,
      players,
      scanRange,
      alterVectorDenom,
      vakoryDamageThreshold,
      (shipname, rng) => pickAnnoy(DROID_CLASS_VAKORY, 'passive', shipname, rng),
      (shipname, rng) => pickAnnoy(DROID_CLASS_VAKORY, 'help', shipname, rng),
      this.random,
    );

    if (action.jammedFlee) {
      droid.speed2b = action.jammedFlee.speed2b;
      droid.holdcourse = action.jammedFlee.holdcourse;
      return;
    }

    if (action.shieldCommand !== undefined) {
      this.applyShieldCommand(droid, action.shieldCommand);
    }

    for (const { target, message } of action.passiveAnnoys) {
      this.emitAnnoy(droid, target, message, DROID_CLASS_VAKORY, 'passive', tickAt);
    }

    if (action.fightback) {
      const fb = action.fightback;
      this.emitAnnoy(droid, fb.target, fb.helpMessage, DROID_CLASS_VAKORY, 'help', tickAt);

      if (fb.fireMode === 'hyper') {
        this.fireHyperPhaser(droid, fb.target, fb.ddist);
      } else if (fb.fireMode === 'normal') {
        this.firePhaser(droid, fb.target);

        // @see GEDROIDS.C:472 — torpedo volley j=gernd()%2
        for (let i = 0; i < fb.torpCount; i++) {
          // Replenish before fire @see GEDROIDS.C:480
          droid.items = [...droid.items] as typeof droid.items;
          droid.items[I_TORP] = BigInt(Math.floor(this.random.next() * 5) + 1);
          this.launchTorpedo(droid, fb.target, fb.ddist);
        }
      }

      if (fb.alterVector) {
        droid.speed2b = fb.alterVector.speed2b;
        droid.head2b = fb.alterVector.head2b;
        droid.holdcourse = fb.alterVector.holdcourse;
      }

      if (fb.missileEvade) {
        droid.speed2b = fb.missileEvade.speed2b;
        droid.holdcourse = fb.missileEvade.holdcourse;
      }

      // Shield by speed (@see GEDROIDS.C:500-502)
      this.applyShieldCommand(droid, droid.speed < 1000.0 ? 1 : 0);

      if (fb.damageFlee) {
        if (fb.damageFlee.layMine) this.layMine(droid);
        if (fb.damageFlee.deployJammer) this.deployJammer(droid);
        droid.speed2b = fb.damageFlee.speed2b;
        droid.head2b = fb.damageFlee.head2b;
        droid.holdcourse = fb.damageFlee.holdcourse;
      }
    }
  }

  // ── Combat helpers ─────────────────────────────────────────────────────────

  /** Normal-space phaser fire. @see GEDROIDS.C:363-370 firep */
  private firePhaser(droid: ShipState, target: ShipState): void {
    if (droid.phasr < PMINFIRE) return;
    if (target.cloak === 10) return;

    // A-002: defense-in-depth range gate. Decision functions (class 11/12)
    // already gate on scanRange (A-001), but `firePhaser` bypasses
    // `PhaserHandlerService.handle()` and therefore inherits NONE of C-001's
    // player-side gate. Mirror it here so future callers cannot bypass.
    // @see specs/022-fidelity-audit-v2/findings.md A-002
    let scanRangeGate = 25_000;
    try { scanRangeGate = this.classCache.getScanRange(droid.shpclass); } catch { /* fallback */ }
    if (!inScanRange(droid, target, scanRangeGate)) return;

    const dx = target.xcoord - droid.xcoord;
    const dy = target.ycoord - droid.ycoord;
    const absAngle = ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;
    const bearing = (absAngle - droid.heading + 360) % 360;
    const sector = { x: Math.floor(droid.xcoord), y: Math.floor(droid.ycoord) };

    this.events.emit(COMBAT_PHASER_FIRED, {
      shipId: shipKey(droid.userid, droid.shipno),
      bearing,
      percent: 100,
      hyper: false,
      sector,
      tickAt: new Date(),
    } satisfies CombatPhaserFiredEvent);

    const dist = cdistance(droid, target);
    // Runtime invariants — record at fire time. scanRangeGate is the legal cap.
    if (this.combatTick) {
      this.combatTick.recordAiFireEvent({
        shipClass: String(droid.shpclass),
        shooter: { x: droid.xcoord, y: droid.ycoord },
        target: { x: target.xcoord, y: target.ycoord },
        scanRange: scanRangeGate,
        distanceRaw: dist * 10_000,
      });
      this.combatTick.recordCombatEvent({
        weapon: 'phaser',
        shooter: { x: droid.xcoord, y: droid.ycoord },
        target: { x: target.xcoord, y: target.ycoord },
        maxRange: scanRangeGate / 10_000,
      });
    }
    if (lineOfFire(droid, target, bearing, 0)) {
      const damage = phaserDamage({
        phasrtype: droid.phasrtype,
        phasr: droid.phasr,
        distRaw: dist * 10000,
        focus: 0,
        victimMaxTons: this.classCache.getMaxTons(target.shpclass),
        victimAtWarp: target.speed >= WARP_THRESHOLD,
      });
      const shieldUp = target.shieldstat === 1 && target.shield > 0;
      let hullDamage = damage;
      let shieldConsumed = 0;
      if (shieldUp) {
        const r = shieldhit(target.shield, target.shieldtype, damage);
        this.shipState.mutate(target.userid, target.shipno, (v) => {
          v.shield = r.newCharge;
          if (r.knockedDown) v.shieldstat = 0;
          v.lastfired = droid.shipno;
          v.cantexit = FIRETICKS;
        });
        hullDamage = 0;
        shieldConsumed = r.shieldConsumed;
      } else {
        this.shipState.mutate(target.userid, target.shipno, (v) => {
          v.damage = v.damage + hullDamage;
          v.lastfired = droid.shipno;
          v.cantexit = FIRETICKS;
        });
      }
      this.events.emit(COMBAT_HIT, {
        attackerId: shipKey(droid.userid, droid.shipno),
        victimId: shipKey(target.userid, target.shipno),
        weapon: 'phaser',
        damageHull: hullDamage,
        damageShield: shieldConsumed,
        sector,
        tickAt: new Date(),
      } satisfies CombatHitEvent);
    }

    droid.phasr = 0;
    droid.cantexit = FIRETICKS;
  }

  /** Hyperspace phaser fire (firehp). @see GEDROIDS.C:351-355 */
  private fireHyperPhaser(droid: ShipState, target: ShipState, ddist: number): void {
    const { fightbackHyperspaceMaxDist } = this.config.global;
    if (ddist >= fightbackHyperspaceMaxDist) return;

    // A-002: defense-in-depth range gate. C-source `firehp` has explicit
    // `ddistance < shipclass.scanrange` (GECMDS.C:1054). Even though
    // `fightbackHyperspaceMaxDist` caps at 30000, also enforce per-class
    // scanRange so heavy-scanner classes don't outrange their own arc.
    // @see specs/022-fidelity-audit-v2/findings.md A-002
    let scanRangeGate = 25_000;
    try { scanRangeGate = this.classCache.getScanRange(droid.shpclass); } catch { /* fallback */ }
    if (ddist > scanRangeGate) return;
    const dx = target.xcoord - droid.xcoord;
    const dy = target.ycoord - droid.ycoord;
    const absAngle = ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;
    const bearing = (absAngle - droid.heading + 360) % 360;
    const sector = { x: Math.floor(droid.xcoord), y: Math.floor(droid.ycoord) };

    this.events.emit(COMBAT_PHASER_FIRED, {
      shipId: shipKey(droid.userid, droid.shipno),
      bearing,
      percent: 100,
      hyper: true,
      sector,
      tickAt: new Date(),
    } satisfies CombatPhaserFiredEvent);

    const dist = cdistance(droid, target);
    // Runtime invariants — record at fire time.
    if (this.combatTick) {
      this.combatTick.recordAiFireEvent({
        shipClass: String(droid.shpclass),
        shooter: { x: droid.xcoord, y: droid.ycoord },
        target: { x: target.xcoord, y: target.ycoord },
        scanRange: scanRangeGate,
        distanceRaw: ddist,
      });
      this.combatTick.recordCombatEvent({
        weapon: 'hyper-phaser',
        shooter: { x: droid.xcoord, y: droid.ycoord },
        target: { x: target.xcoord, y: target.ycoord },
        maxRange: scanRangeGate / 10_000,
      });
    }
    // C-009 Fix 4: droid hyper arc = HPBEAMW (5°) — fixed beam width, NOT
    // PHABIAS-based. `firehp` uses HPBEAMW half-angle (GECMDS.C:1050).
    // C-009 Fix 1: firehp applies damage straight to hull (`wptr->damage += damage`,
    // GECMDS.C:1078) — no shieldhit call, shields bypassed entirely.
    if (withinArc(droid, target, bearing, HPBEAMW)) {
      const damage = hyperPhaserDamage({
        phasrtype: droid.phasrtype,
        distRaw: dist * 10000,
        victimMaxTons: this.classCache.getMaxTons(target.shpclass),
      });
      if (damage >= 1) {
        this.shipState.mutate(target.userid, target.shipno, (v) => {
          v.damage = v.damage + damage;
          v.lastfired = droid.shipno;
          v.cantexit = FIRETICKS;
        });

        this.events.emit(COMBAT_HIT, {
          attackerId: shipKey(droid.userid, droid.shipno),
          victimId: shipKey(target.userid, target.shipno),
          weapon: 'phaser',
          damageHull: damage,
          damageShield: 0,
          sector,
          tickAt: new Date(),
        } satisfies CombatHitEvent);
      }
    }
    droid.phasr = 0;
    droid.cantexit = FIRETICKS;
  }

  /** Launch a torpedo at target. @see GEDROIDS.C:472-480 torp */
  private launchTorpedo(droid: ShipState, target: ShipState, ddist: number): void {
    const emptySlot = target.ltorpsChannel.findIndex((ch) => ch === 255 || ch === undefined);
    if (emptySlot === -1) return;
    this.shipState.mutate(target.userid, target.shipno, (v) => {
      while (v.ltorpsChannel.length <= emptySlot) v.ltorpsChannel.push(255);
      while (v.ltorpsDistance.length <= emptySlot) v.ltorpsDistance.push(0);
      v.ltorpsChannel[emptySlot] = droid.shipno;
      v.ltorpsDistance[emptySlot] = ddist;
    });
  }

  /** Lay a mine at current position. @see GEDROIDS.C:512 laymine */
  private layMine(droid: ShipState): void {
    const mineCount = Number(droid.items[I_MINE] ?? 0n);
    if (mineCount <= 0) return;
    droid.items = [...droid.items] as typeof droid.items;
    droid.items[I_MINE] = BigInt(mineCount - 1);

    void this.mineRepo.create({
      channel: droid.shipno,
      timer: 100,
      xcoord: droid.xcoord,
      ycoord: droid.ycoord,
      deployedBy: droid.userid,
    }).then((mine) => this.mineRegistry.add({ ...mine, deployedBy: droid.userid }))
      .catch((err: unknown) => this.logger.error('Droid mine lay failed:', err));
  }

  /** Deploy jammer. @see GEDROIDS.C:515 jam — sets jammer=JAMTIME */
  private deployJammer(droid: ShipState): void {
    const jamCount = Number(droid.items[I_JAMMER] ?? 0n);
    if (jamCount <= 0) return;
    droid.items = [...droid.items] as typeof droid.items;
    droid.items[I_JAMMER] = BigInt(jamCount - 1);
    droid.jammer = JAMTIME;
  }

  /** @see GEDROIDS.C:287-298 shieldup/shielddn */
  private applyShieldCommand(droid: ShipState, command: 1 | 0 | undefined): void {
    if (command === undefined) return;
    droid.shieldstat = command;
  }

  private emitAnnoy(
    droid: ShipState,
    target: ShipState,
    message: string,
    classNumber: number,
    variant: 'passive' | 'help',
    tickAt: number,
  ): void {
    const annoy: DroidAnnoyEvent = {
      fromShipKey: shipKey(droid.userid, droid.shipno),
      fromShipname: droid.shipname,
      toUserid: target.userid,
      toShipno: target.shipno,
      message,
      sector: { x: Math.floor(droid.xcoord), y: Math.floor(droid.ycoord) },
      tickAt,
      classNumber,
      variant,
    };
    this.events.emit(DroidEvents.ANNOY, annoy);
  }

  // ── combat.ship-destroyed consumer ────────────────────────────────────────

  @OnEvent(COMBAT_SHIP_DESTROYED)
  onShipDestroyed(payload: unknown): void {
    const event = payload as CombatShipDestroyedEvent;
    if (!event) return;

    // Droid was killed
    if (event.victimUserid?.startsWith(DROID_USERID_PREFIX)) {
      this.handleDroidDied(event);
    }

    // Droid made a kill
    if (event.attackerUserid?.startsWith(DROID_USERID_PREFIX)) {
      this.handleDroidWon(event.attackerUserid);
    }
  }

  /** @see GEDROIDS.C:534 droid_died */
  private handleDroidDied(event: CombatShipDestroyedEvent): void {
    const userid = event.victimUserid!;

    // Determine class from live population
    let classNumber: number | undefined;
    for (const [cls, pop] of this.livePopulation.entries()) {
      if (pop.has(userid)) { classNumber = cls; break; }
    }

    const droid = this.shipState.get(userid, 1);

    // Emit killed event before removal
    const killed: DroidKilledEvent = {
      shipId: userid,
      shipname: droid?.shipname ?? userid,
      shpclass: classNumber ?? droid?.shpclass ?? 0,
      sector: event.sector,
      killedBy: event.attackerUserid ?? null,
      killedAt: Date.now(),
    };
    this.events.emit(DroidEvents.KILLED, killed);

    // Remove from in-memory map (no DB delete — ephemeral)
    this.shipState.removeFromGame({ userid, shipno: 1 });

    // Free slot
    if (classNumber !== undefined) {
      this.livePopulation.get(classNumber)?.delete(userid);
    }

    this.logger.log(`Droid died: ${userid}`);
  }

  /** @see GEDROIDS.C:534 droid_won — set speed2b = rndm(5000.0) */
  private handleDroidWon(attackerUserid: string): void {
    const droid = this.shipState.get(attackerUserid, 1);
    if (!droid) return;
    droid.speed2b = this.random.next() * 5_000.0;
    droid.dirty = true;
  }
}
