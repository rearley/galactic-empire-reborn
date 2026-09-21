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

import { nextDroidTick } from './droid-cadence';
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
  MAXDROID,
  DROID_CLASS_SCOW,
  DROID_CLASS_TRANSPORT,
  DROID_CLASS_VAKORY,
  DROID_USERID_PREFIX,
  GESTAT_USER,
  PMINFIRE,
  JAMTIME,
  TORFACT,
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
} from '../combat/combat-events';
import { torpedoLockSucceeds } from '../combat/combat-math';
import { CombatTickService } from '../combat/combat-tick.service';
import { AiWeapons } from '../ai/ai-weapons';

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
  ) {
    this.weapons = new AiWeapons({
      shipState, classes: classCache, events, random, logger: this.logger,
      combatTick, mineRegistry, mineRepo,
    });
  }

  /** The player's own weapons, which is what canon's droids fire. @see ../ai/ai-weapons.ts */
  private readonly weapons: AiWeapons;

  /** Droids fire outside a tick context; the weapons only read its clock. */
  private fireCtx(): TickContext {
    return { kind: TickKind.SHIP_UPDATE, tickNumber: 0, firedAt: new Date() };
  }

  async onModuleInit(): Promise<void> {
    // Spawn evaluation is the port's own slot mechanic and stays on the 6s
    // tick; droid ACTIONS are C's `autortia`, once a second, gated by each
    // droid's own countdown. @see GEMAIN.C:2406-2438, GEDROIDS.C:216-227
    // Spawning and droid actions both live in C's `autortia`, which runs once
    // a SECOND (GEMAIN.C:2296). Running the spawn counter on the 6s physics
    // tick made `ticktock2 >= 30` mean 180 seconds instead of 30, so the
    // Murdonian Transport — the designated starter target — was absent for
    // most of a session.
    this.tickService.subscribe(TickKind.SHIP_UPDATE, (ctx) => this.onAiTick(ctx));
    this.logger.log('DroidTickService subscribed to the SHIP_UPDATE tick (C autortia)');
  }

  /** Returns the live population map — exposed for tests. */
  getLivePopulation(): Map<number, Set<string>> {
    return this.livePopulation;
  }

  /**
   * C's `autortia`: once a second it both evaluates the spawn slot (every
   * 30th call — `ticktock2 >= 30`, GEMAIN.C:2321) and lets every droid count
   * down or act. @see GEMAIN.C:2296-2424
   */
  private onAiTick(ctx: TickContext): void {
    const hasPlayer = this.shipState.findAllShips().some((s) => s.status === GESTAT_USER);
    if (!hasPlayer) return;

    this.spawnTickCounter = (this.spawnTickCounter + 1) % DROID_SPAWN_TICK_CADENCE;
    if (this.spawnTickCounter === 0) this.runSpawnEvaluation(ctx);

    this.runDroidActions(ctx);
  }

  /** Live droids across every class — the quantity MAXDROID caps. */
  private totalDroidPopulation(): number {
    let n = 0;
    for (const set of this.livePopulation.values()) n += set.size;
    return n;
  }

  private runSpawnEvaluation(ctx: TickContext): void {
    for (const classNumber of DROID_CLASSES) {
      // DROID_MAX_PER_CLASS caps each class independently, so without an
      // overall limit the real ceiling was classes x per-class. MAXDROID is the
      // total the sysop configured. @see GEMAIN.C:471 numopt(MAXDROID,0,500)
      if (this.totalDroidPopulation() >= MAXDROID) return;

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
          const droid = this.shipState.get(userid, 1);
          if (droid && droid.tick > 0) {
            droid.tick -= 1;
            if (droid.tick > 0) continue;
          }
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
    // scanRange comes from the ShipClass table (canon MBMGESHP.MSG SxxSRNG),
    // NOT from droid config. DroidClassConfig used to keep its own copy, which
    // drifted to the old compressed 3_750 while the table said 25_000 -- so a
    // Murdonian would not return fire at a range the class table said it could
    // see. One rule, one home.
    const scanRange = this.classCache.get(classNumber)?.scanRange ?? 25_000;
    const tickAt = ctx.tickNumber;

    let detected = false;
    if (classNumber === DROID_CLASS_SCOW) {
      detected = this.actClass10(droid, players, scanRange, tickAt);
    } else if (classNumber === DROID_CLASS_TRANSPORT) {
      detected = this.actClass11(droid, players, scanRange, tickAt);
    } else if (classNumber === DROID_CLASS_VAKORY) {
      detected = this.actClass12(droid, players, scanRange, tickAt);
    }

    // @see GEDROIDS.C:214 — energy reset after droid_lives
    droid.energy = 50_000;
    // Re-arm the countdown. A droid that has been shot at — or that has just
    // spotted someone — reacts about three times as often as one that is
    // cruising. @see GEDROIDS.C:216-227, 335, 442
    droid.tick = nextDroidTick(detected || droid.cantexit > 0 ? 1 : 0, this.random);
    this.enforceFreeze(droid);
    droid.dirty = true;
  }

  /**
   * DEV-ONLY: re-pin a droid that a playtester spawned with `stationary=1`.
   *
   * Canon is that a droid rolls a fresh drift speed the moment it detects a
   * player — GEDROIDS.C:328-331,
   * `if (ptr->holdcourse == 0) ptr->speed2b = rndm(999.9);` — and that is left
   * exactly as it is. The AI runs in full, decides, chatters, shoots; this only
   * re-zeroes the resulting velocity afterwards, and only for a droid whose key
   * the debug spawn endpoint put in DroidSpawner's freeze registry. A droid
   * from the normal spawn path is never in that registry, so nothing here can
   * touch it.
   *
   * Why it matters: phaser damage falls off as dd^PFIRDST (a sysop option,
   * shipped at 5: MBMGEMSG.MSG:417, read at GEMAIN.C:493), so
   * uncontrolled drift moves every damage figure a playtest records.
   */
  private enforceFreeze(droid: ShipState): void {
    if (!this.spawner.isFrozen(droid.userid, droid.shipno)) return;
    droid.speed2b = 0;
    droid.speed = 0;
  }

  // ── Class 10: Lydorian Garbage Scow ───────────────────────────────────────

  private actClass10(droid: ShipState, players: ShipState[], scanRange: number, tickAt: number): boolean {
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

    return action.detected === true;
  }

  // ── Class 11: Murdonian Transport ─────────────────────────────────────────

  private actClass11(droid: ShipState, players: ShipState[], scanRange: number, tickAt: number): boolean {
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
      return false;
    }

    // `if (ptr->holdcourse == 0) ptr->speed2b = rndm(999.9);` — the drop
    // happens on DETECTION, not on the 1-in-4 chatter roll that follows it.
    // Gating it behind `passiveAnnoys.length > 0` meant three spotted players
    // in four were sailed straight past. @see GEDROIDS.C:330-331
    if (action.scanSpeed !== undefined) {
      droid.speed2b = action.scanSpeed;
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

    return action.detected === true;
  }

  // ── Class 12: Vakory Survey Drone ─────────────────────────────────────────

  private actClass12(droid: ShipState, players: ShipState[], scanRange: number, tickAt: number): boolean {
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
      return false;
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
      }

      // The torpedo volley sits OUTSIDE the phaser guard in C — a Vakory with
      // its phaser below PMINFIRE still shoots back. Nesting it inside the
      // 'normal' branch let a player suppress torpedoes by draining the phaser.
      // @see GEDROIDS.C:476-483
      // GEDROIDS.C:482 calls `torp()`, and `torp()` opens with `lockon()` —
      // a Droid is bound by the same lock arithmetic as a player. A target at
      // warp is a hard zero; the firer's own speed kills the term above
      // roughly warp 3.5. @see GECMDS.C:1378-1395
      const canLock = torpedoLockSucceeds(droid.speed, fb.target.speed, fb.ddist / 10_000, TORFACT);
      for (let i = 0; canLock && i < fb.torpCount; i++) {
        // Replenish before fire @see GEDROIDS.C:480
        droid.items = [...droid.items] as typeof droid.items;
        droid.items[I_TORP] = BigInt(Math.floor(this.random.next() * 5) + 1);
        this.launchTorpedo(droid, fb.target, fb.ddist, i === 0);
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

    return action.detected === true;
  }

  // ── Combat helpers ─────────────────────────────────────────────────────────

  /** Normal-space phaser fire. @see GEDROIDS.C:363-370 firep */
  /**
   * Canon's droid phaser: it does NOT aim. Before `firep` the droid points its
   * beam straight down its own nose at focus 2,
   *   GEDROIDS.C:361 `ptr->degrees = 0;`
   *   GEDROIDS.C:362 `ptr->percent = 2;`
   * then fires only with a charged bank at a target that is not cloaked:
   *   GEDROIDS.C:363 `if (ptr->phasr >= PMINFIRE && wptr->cloak != 10)`
   * — and `firep` sweeps that arc, hitting whatever is in it. The port had
   * grown a droid-only copy that aimed at the target and hit only it.
   * @see AiWeapons.firep, docs/DECISIONS.md 2026-09-21
   */
  private firePhaser(droid: ShipState, target: ShipState): void {
    droid.degrees = 0;
    droid.percent = 2;
    if (droid.phasr < PMINFIRE || target.cloak === 10) return;
    this.weapons.firep(droid, target, this.fireCtx(), { aimAtTarget: false });
  }

  /** Hyperspace phaser fire (firehp). @see GEDROIDS.C:351-355 */
  /**
   * Canon's droid hyper-phaser: within 30,000 of its target, aim and fire
   * `firehp`, the player's own.
   *   GEDROIDS.C:351 `if (ddist < 30000)`
   *   GEDROIDS.C:353 `ptr->degrees = (int)(cbearing(&ptr->coord,&wptr->coord,ptr->heading)+.5);`
   *   GEDROIDS.C:354 `firehp(ptr,usrn);`
   * `AiWeapons.firehp` aims exactly so, and carries firehp's flux gate, its
   * cost, and its randamage roll. @see AiWeapons.firehp
   */
  private fireHyperPhaser(droid: ShipState, target: ShipState, ddist: number): void {
    const { fightbackHyperspaceMaxDist } = this.config.global;
    if (ddist >= fightbackHyperspaceMaxDist) return;
    this.weapons.firehp(droid, target, this.fireCtx());
  }

  /** Launch a torpedo at target. @see GEDROIDS.C:472-480 torp */
  /**
   * Canon's `torp`, the player's own. @see GEDROIDS.C:482 `torp(ptr,usrn,zothusn);`
   * The volley warns its target once: GEDROIDS.C:481 `if (i>0) lockwarn = FALSE;`
   * @see AiWeapons.torp
   */
  private launchTorpedo(droid: ShipState, target: ShipState, ddist: number, announce = true): void {
    this.weapons.torp(droid, target, ddist, announce);
  }

  /** Lay a mine at current position. @see GEDROIDS.C:512 laymine */
  /**
   * Canon's `laymine`, the player's own, with canon's droid fuse of 10.
   * @see GEDROIDS.C:512 `laymine(ptr,usrn,10);`, AiWeapons.laymine
   */
  private layMine(droid: ShipState): void {
    if (Number(droid.items[I_MINE] ?? 0n) <= 0) return;
    this.weapons.laymine(droid);
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
    // Release any dev freeze so a recycled userid cannot inherit it.
    this.spawner.unfreeze(userid, 1);

    this.logger.log(`Droid died: ${userid}`);
  }

  /** @see GEDROIDS.C:534 droid_won — set speed2b = rndm(5000.0) */
  private handleDroidWon(attackerUserid: string): void {
    const droid = this.shipState.get(attackerUserid, 1);
    if (!droid) return;
    droid.speed2b = this.random.next() * 5_000.0;
    // A dev-frozen droid stays frozen even after a kill. @see enforceFreeze
    this.enforceFreeze(droid);
    droid.dirty = true;
  }
}
