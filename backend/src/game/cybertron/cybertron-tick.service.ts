import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { isInNeutralZone as inNeutralZone } from '../combat/neutral-zone';
import { headingToward } from '../physics/physics-math';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Inject, Optional } from '@nestjs/common';
import { TickService } from '../tick/tick.service';
import { TickContext, TickKind } from '../tick/tick.types';
import { ShipStateService } from '../ship/ship-state.service';
import { NO_CHANNEL, CYBMINE_NONE } from '../ship/ship-channel.registry';
import { ShipClassCacheService } from '../physics/ship-class-cache.service';
import { Random, RANDOM } from '../combat/random.port';
import { MineRegistry } from '../combat/mine.registry';
import { MineRepository, MineRefusedError } from '../combat/mine.repository';
import { CybertronRepository } from './cybertron.repository';
import { buildCybertronClassConfigs, bootSeedEnabled , CYB_PHASER_FOCUS } from './cybertron.config';
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
  HPFIRAMT,
  HPMINFIR,
  TORFACT,
  CYB_BE_NICE,
  CYB_BE_EASY,
  CYBSLO,
  UNIVMAX,
  SHIELDDM,
  GESTAT_AUTO,
  AI_MINE_TIMER,
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
  inScanRange,
  lineOfFire,
  aiCanHitTarget,
  phaserDamage,
  shieldhit,
  torpedoLockSucceeds,
} from '../combat/combat-math';
import {
  COMBAT_PHASER_FIRED,
  COMBAT_HIT,
  COMBAT_MISS,
  CombatPhaserFiredEvent,
  CombatHitEvent,
  CombatMissEvent,
  CombatShipDestroyedEvent,
  COMBAT_SHIP_DESTROYED,
  COMBAT_TARGET_WARNING,
  CombatTargetWarningEvent,
} from '../combat/combat-events';
import { CANON_TOT_TO_CREATE, respawnDelayMs } from './cyb-population';
import { applyRandamageAndEmit } from '../combat/randamage.apply';
import { selectPhaserVictims } from '../combat/firep';
import { findFreeTorpSlot } from '../combat/projectile-slots';
import { selectHyperVictims } from '../combat/firehp';
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
  type PursuitBand,
  cybwhoops,
  gebemean,
  rollTorpedoCount,
  layDecoys,
  decideCybEvasion,
  canPursue,
  notClaimed,
  countCybertronClaims,
  isStationaryClass,
  shouldTaunt,
  creditsAreOwed,
  escalationKills,
} from './cyb-decisions';
import { pickTaunt, bandName, CYB_ANNOY_BANDS, type CybAnnoyBand } from './taunt-pool';
import {
  acquire,
  idleCadence,
  provoke,
  releaseBreakOff,
  releaseNoTarget,
  releaseStale,
  releaseTargetCloaked,
  releaseTargetLeft,
  releaseWon,
  releaseZoneEntry,
} from './cyb-transitions';
import { CombatTickService } from '../combat/combat-tick.service';
import { CybertronControlService } from './cybertron-control.service';
import { AiWeapons } from './ai-weapons';
import { CybTraceService, formatScanSummary, type CybScanTally } from './cyb-trace.service';

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
  /**
   * Earliest wall-clock time each class may be refilled, armed when one of its
   * hulls dies. PORT-ORIGINAL — canon has no respawn delay.
   * @see cyb-population.ts respawnDelayMs, docs/DECISIONS.md 2026-09-20
   */
  private readonly respawnNotBefore = new Map<number, number>();

  /** Allowance owed per Cybertron user since the last flush. @see GECYBS.C:229 */
  private readonly pendingAllowance = new Map<string, bigint>();

  /** Maps classNumber → CybertronClassConfig (merged from env overrides + defaults). */
  private readonly classConfigs: Record<number, CybertronClassConfig> = buildCybertronClassConfigs();

  private unsubscribe: (() => void) | null = null;
  private unsubscribeAi: (() => void) | null = null;

  constructor(
    private readonly tickService: TickService,
    private readonly shipState: ShipStateService,
    private readonly shipClassCache: ShipClassCacheService,
    private readonly repository: CybertronRepository,
    private readonly events: EventEmitter2,
    @Inject(RANDOM) private readonly random: Random,
    @Optional() private readonly cybControl?: CybertronControlService,
    @Optional() private readonly combatTick?: CombatTickService,
    // Optional so the many hand-built test harnesses keep working; a Cybertron
    // with no registry simply never sweeps, which is the pre-existing behaviour.
    @Optional() private readonly mineRegistry?: MineRegistry,
    @Optional() private readonly mineRepo?: MineRepository,
    // The sysop's `sys trace`. Optional for the same reason as the registry:
    // with none, every decision still runs and simply goes unrecorded.
    @Optional() private readonly trace?: CybTraceService,
  ) {
    this.weapons = new AiWeapons({
      shipState, classes: shipClassCache, events, random, logger: this.logger,
      combatTick, mineRegistry, mineRepo, trace,
    });
  }

  /** The canon weapons this AI fires. @see ./ai-weapons.ts */
  private readonly weapons: AiWeapons;

  /**
   * Apply a claim transition, recording it in the ship's trace when there is
   * one. The transition runs either way. @see cyb-trace.service.ts
   */
  private tx(ship: ShipState, event: string, apply: () => void, detail?: string): void {
    if (this.trace) this.trace.transition(shipKey(ship.userid, ship.shipno), ship, event, apply, detail);
    else apply();
  }

  /**
   * Subscribe to the PHYSICS tick, register event listeners, hydrate all Cybertron ships
   * from DB into the in-memory map, and optionally boot-seed the population to tot_to_create.
   *
   * Boot seeding fills the deficit immediately so the galaxy is not empty on first boot.
   * Controlled by CYBERTRON_BOOT_SEED env var (default true).
   *
   * @see GECYBS.C:88 cyb_init — loads existing Cybertron rows from DB
   * @see specs/024-ai-presence/plan.md Task 3
   */
  async onModuleInit(): Promise<void> {
    // C runs the whole automaton loop from `autortia`, re-armed with
    // `rtkick(1, autorti)` — one second (GEMAIN.C:2438). `wptr->tick` counts
    // SECONDS, so the countdown and the tick_func call belong on the 1s tick.
    // Spawn evaluation is the port's own 30-tick slot and stays on physics.
    this.unsubscribe = this.tickService.subscribe(
      TickKind.PHYSICS,
      (ctx) => this.onPhysicsTick(ctx),
    );
    this.unsubscribeAi = this.tickService.subscribe(
      TickKind.SHIP_UPDATE,
      (ctx) => this.onAiTick(ctx),
    );
    this.events.on(CYBERTRON_SCORED_KILL, (e: CybertronScoredKillEvent) =>
      this.onCybertronScoredKill(e),
    );
    this.events.on(COMBAT_SHIP_DESTROYED, (e: CombatShipDestroyedEvent) =>
      this.onAiHullDestroyed(e),
    );
    this.logger.log('CybertronTickService subscribed to PHYSICS and SHIP_UPDATE ticks');

    await this.repository.hydrateAll();

    if (bootSeedEnabled()) {
      for (const classNumStr of Object.keys(this.classConfigs)) {
        const classNumber = Number(classNumStr);
        const target = this.classConfigs[classNumber].tot_to_create;
        // Top up to tot_to_create; spawnOne self-limits, so loop at most `target` times.
        // The deficit-correctness of this boot-seed loop depends on repository.createSpawn(...)
        // synchronously loading the new ship into the in-memory map (via shipState.loadShip),
        // so each subsequent findAllShips() count reflects the just-spawned ship.
        for (let i = 0; i < target; i++) {
          const spawned = await this.spawnOne(classNumber);
          if (!spawned) break;
        }
      }
      this.logger.log('Boot-seed complete');
    }
  }

  private onPhysicsTick(_ctx: TickContext): void {
    this.spawnTickCounter++;
    if (this.spawnTickCounter % 30 === 0) {
      void this.runSpawnSlot(_ctx);
      void this.flushAllowances();
    }
  }

  /** Hand the accumulated allowance over to the purses. @see GECYBS.C:229 */
  private async flushAllowances(): Promise<void> {
    if (this.pendingAllowance.size === 0) return;
    const batch = new Map(this.pendingAllowance);
    this.pendingAllowance.clear();
    // Optional-chained: the many hand-built test harnesses stub the
    // repository with only the methods they exercise.
    await this.repository.creditAllowances?.(batch);
  }

  /**
   * C's `autortia` (GEMAIN.C:2401-2426), once a second: every Cybertron either
   * counts down or, at zero, runs its `tick_func`.
   *
   * The countdown is applied to EVERY ship before the activation cap is
   * consulted — capping the decrement as well as the activation, as the port
   * used to, meant a Cybertron behind a busy queue never acted at all.
   */
  /**
   * The ships this service is responsible for: CYBORG classes only.
   *
   * Canon binds one behaviour per CLASS at boot and dispatches through it —
   * `shipclass[i].tick_func = cyb_lives` for CLASSTYPE_CYBORG,
   * `= droid_lives` for CLASSTYPE_DROID (GEMAIN.C:878-895), called as
   * `(*(shipclass[wptr->shpclass].tick_func))(wptr,zothusn)` (:2418-2419).
   * A droid never runs cyb_lives.
   *
   * This filtered on `status === 2`, and droids spawn with `GESTAT_AUTO` (=2)
   * into the same map — so every droid ran the Cybertron brain on top of its
   * own, two services fought over one `tick` countdown, and droids took
   * `cybmine` claims that canon droids never take (the field does not appear
   * in GEDROIDS.C). With `noClaim` 1 for an Interceptor, a single droid claim
   * locked all 24 Cybertrons out of that player.
   */
  private selectAiShips(): ShipState[] {
    return this.shipState
      .findAllShips()
      .filter((s) => s.status === GESTAT_AUTO && this.isCybertronClass(s.shpclass));
  }

  private onAiTick(ctx: TickContext): void {
    // `sys cybpause nnn` — canon's cybhaltflg (GECMDS.C:4972). Returning before
    // the countdown, not just before the decisions, is deliberate: canon halts
    // the AI outright, and letting `tick` keep draining would make every
    // Cybertron act at once the instant the pause lifted.
    if (this.cybControl?.isPaused()) return;

    const ships = this.selectAiShips();

    const due: ShipState[] = [];
    for (const ship of ships) {
      if (ship.tick > 0) {
        ship.tick = ship.tick - 1;
        if (ship.tick > 0) continue;
      }
      due.push(ship);
    }

    let activations = 0;
    for (const ship of due) {
      if (activations >= CYBMAXPERTICK) break;
      try {
        this.cybLives(ship, ctx);
        activations++;
      } catch (err: unknown) {
        const id = shipKey(ship.userid, ship.shipno);
        const stack = err instanceof Error ? err.stack : String(err);
        this.logger.error(`cybLives fault for ${id}: ${stack}`);
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
    this.trace?.beginActivation(shipKey(ship.userid, ship.shipno));

    const topSpeed = (ship.topspeed ?? 0) * 1000.0;

    // Allowance is MONEY, not energy: `warusroff(usrn)->cash += CYB_ALLOW`.
    // The port credited `ship.energy`, which is overwritten with a flat 50000
    // a few lines below, so the allowance did nothing and a veteran Cybertron
    // carried no purse worth taking. Accumulated here and flushed on the
    // spawn-slot cadence rather than writing to Postgres every activation.
    // @see GECYBS.C:228-229
    // Droids share `status === GESTAT_AUTO` with Cybertrons but are ephemeral
    // and have no User row, so crediting them threw on every flush.
    if (creditsAreOwed(ship.userid)) {
      this.pendingAllowance.set(
        ship.userid,
        (this.pendingAllowance.get(ship.userid) ?? 0n) + BigInt(CYB_ALLOW),
      );
    }

    // cybupdate decrement + direction wander (@see GECYBS.C:455 db_update)
    // Traced only on the activation that re-rolls the course; the countdown
    // itself would fill the trace with one `cybupdate` decrement per activation.
    if (ship.cybupdate === 1) this.tx(ship, 'idleCadence', () => idleCadence(ship, topSpeed, this.random));
    else idleCadence(ship, topSpeed, this.random);

    // Jammed branch vs normal engagement scan (@see GECYBS.C:236-319)
    if (ship.jammer === 0) {
      this.runEngagementScan(ship, topSpeed, ctx);
    } else {
      // Jammed: mine the area and pick random heading (@see GECYBS.C:308-319)
      const cls = this.shipClassCache.get(ship.shpclass);
      if (cls?.hasMine && Number(ship.items[I_MINE]) > 0 && Math.floor(this.random.next() * 5) === 0) {
        this.weapons.laymine(ship);
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
        this.weapons.laymine(ship);
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

      // Break-off: it is the CYBERQUADS that take a breather, not the light
      // classes. `isquad(ptr)` is `tough_factor == CYB_TOUGH_1`
      // (GECYBS.C:834-838) and the port had the test inverted, so Base Stars
      // pursued relentlessly while Scouts and Drones wandered off. C also
      // falls through and still evaluates fire on this pass.
      // @see GECYBS.C:255
      if (tough === CYB_TOUGH_1 && Math.floor(this.random.next() * CYB_BREAKOFF) === 0) {
        this.tx(ship, 'releaseBreakOff', () => releaseBreakOff(ship, topSpeed), `broke off from ${target.username ?? target.shipname}`);
        const brokeOff: CybertronBrokeOffPayload = {
          attackerShipKey: shipKey(ship.userid, ship.shipno),
          targetShipKey: shipKey(target.userid, target.shipno),
          sector: { x: Math.floor(ship.xcoord), y: Math.floor(ship.ycoord) },
          tickAt,
        };
        this.events.emit(CYBERTRON_EVENT.BROKE_OFF, brokeOff);
      }

      // Warp-fire path: both ships in hyperwarp, gebemean, range < 30000 (@see GECYBS.C:263-272)
      if (ship.where === 1 && target.where === 1) {
        const targetCls = this.shipClassCache.get(target.shpclass);
        const mean = gebemean(tough, escalationKills(target), CYB_BE_NICE, CYBSLO, this.random);
        // `ddist < (tooclose+rndm(tooclose)) || cybs_can_att || wptr->cantexit > 0
        //  || ptr->cantexit > 0` — the random widening and the attacker's own
        // battle-lock were both missing. @see GECYBS.C:270-273
        const canHit =
          ddist < tooclose + this.random.next() * tooclose
          || (targetCls?.cybCanAttack ?? false)
          || target.cantexit > 0
          || ship.cantexit > 0;
        if (mean && ddist < 30_000 && canHit && !this.isInNeutralZone(target)) {
          // HYPER-phaser. Canon's hyperspace branch calls firehp, not firep
          // (GECYBS.C:279) — and firep discards a target at warp unless
          // phasrtype >= phatowrp (GECMDS.C:948), so routing this to the normal
          // sweep made a Cybertron's hyperspace pursuit completely harmless.
          this.weapons.firehp(ship, target, ctx);
        }
        continue;
      }

      // Normal-space path (@see GECYBS.C:274-305)
      if (ship.where === 0 && target.where !== 1) {
        // Point toward target
        const dx = target.xcoord - ship.xcoord;
        const dy = target.ycoord - ship.ycoord;
        if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
          // Same convention as the firing solution and every other bearing in the
          // port. This used atan2(dx, dy) — a Y-axis flip — so the Cybertron aimed
          // correctly and then drove the opposite way. @see physics-math.headingToward
          ship.head2b = headingToward(dx, dy);
        }

        // Attack condition: within tooclose range, or class is attackable, or target is battle-locked
        const targetCls = this.shipClassCache.get(target.shpclass);
        const rangeFactor = tooclose + this.random.next() * tooclose;
        const canAttack = ddist < rangeFactor || (targetCls?.cybCanAttack ?? false) || target.cantexit > 0;

        if (canAttack) {
          this.cybAttack(ship, target, tough, ddist, ctx);
          // cyb_annoy(ptr,zothusn,20,13,16) @see GECYBS.C:295
          this.cybAnnoy(ship, target, ctx, CYB_ANNOY_BANDS.ATTACK);
          this.cybLayDecoys(ship);
        } else {
          // C taunts in both branches, but only lays decoys when it engages.
          // cyb_annoy(ptr,zothusn,20,9,12) @see GECYBS.C:300
          this.cybAnnoy(ship, target, ctx, CYB_ANNOY_BANDS.DECLINE);
        }
      }
    }
  }

  /**
   * Fire phasers at target — emit COMBAT_PHASER_FIRED, compute damage, apply, emit COMBAT_HIT.
   * @see GECYBS.C:490-525 cyb_attack → firep
   */
  /**
   * Attack with phasers + torpedo volley.
   *
   * Canon calls `gebemean` TWICE — once to decide phasers (GECYBS.C:514) and
   * again, independently, to decide torpedoes (GECYBS.C:527):
   *
   *   if (ptr->phasr >= PMINFIRE && gebemean(ptr,zothusn)) { ...firep... }
   *   j = gernd()%6; ...
   *   if (!gebemean(ptr,zothusn)) j = 0;
   *
   * This used to evaluate it once and reuse the result, with a comment saying
   * that "preserves deterministic PRNG consumption". That had it backwards:
   * matching canon means consuming the generator the way canon consumes it,
   * which is twice. Coupling the two roughly halved how often a Cybertron did
   * anything at all — for a player under CYB_BE_NICE kills, `gebemean` is a
   * 1-in-CYBSLO roll, so canon attacks on 5/9 of passes and the port managed
   * 1/3. Found in play: Scouts that "just let me kill them".
   *
   * @see GECYBS.C:490-543 cyb_attack
   * @see docs/DECISIONS.md 2026-09-06 — gebemean is rolled once per weapon
   */
  private cybAttack(ship: ShipState, target: ShipState, tough: number, ddist: number, ctx: TickContext): void {
    const cls = this.shipClassCache.get(ship.shpclass);

    // Evaluate gebemean once — reused for phaser gate and torpedo-count roll (@see GECYBS.C:514,527)
    // Canon narrows the cone to focus 2 in the normal-space branch, alongside
    // the bearing assignment: `ptr->percent = 2;` @see GECYBS.C:282. The
    // hyperspace branch does NOT set it — firehp uses its own fixed HPBEAMW.
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.percent = CYB_PHASER_FOCUS;
    });

    // Roll 1 — phasers. @see GECYBS.C:514
    const meanForPhaser = gebemean(tough, escalationKills(target), CYB_BE_NICE, CYBSLO, this.random);
    if (ship.phasr >= PMINFIRE && meanForPhaser && !cybwhoops(ship.cybskill, this.random)) {
      this.weapons.firep(ship, target, ctx);
    }

    // Roll 2 — torpedoes, INDEPENDENT of the first. @see GECYBS.C:527
    const meanForTorps = gebemean(tough, escalationKills(target), CYB_BE_NICE, CYBSLO, this.random);
    const torpCount = rollTorpedoCount(
      tough, escalationKills(target), cls?.hasTorpedo ?? false, meanForTorps, CYB_BE_EASY, this.random,
    );
    // Canon runs `torp()` per tube and `torp()` opens with `lockon()`, so the
    // AI is bound by the same arithmetic as a player: a target at warp is a
    // hard zero, and the firer's own speed drives the term negative above
    // roughly warp 3.5. The port used to skip this entirely, which let an
    // Obliterator at warp 14 volley a Dreadnought to death.
    // @see GECYBS.C:538 -> GECMDS.C:1188 torp -> lockon
    const canLock = torpedoLockSucceeds(ship.speed, target.speed, ddist / 10_000, TORFACT);
    for (let i = 0; canLock && i < torpCount && i < MAXTORPS; i++) {
      // Refill one torp slot before launching (@see GECYBS.C:534)
      if (Number(ship.items[I_TORP]) < 1) {
        ship.items = [...ship.items] as typeof ship.items;
        ship.items[I_TORP] = BigInt(Math.floor(this.random.next() * 5) + 1);
      }
      if (Number(ship.items[I_TORP]) > 0) {
        ship.items = [...ship.items] as typeof ship.items;
        ship.items[I_TORP] = BigInt(Number(ship.items[I_TORP]) - 1);
        // `if (i>0) lockwarn = FALSE;` — canon warns ONCE per volley, not
        // once per tube. @see GECYBS.C:537
        this.weapons.torp(ship, target, ddist, i === 0);
      }
    }

    this.applyEvasion(ship, cls?.hasZipper ?? false);
  }

  /**
   * The tail of `cyb_attack` — mine evasion, attack-vector scrambling,
   * hyperspace missile evasion and the shield raise. @see GECYBS.C:541-585
   */
  private applyEvasion(ship: ShipState, hasZipper: boolean): void {
    const topSpeed = this.shipClassCache.get(ship.shpclass)?.maxWarp ?? 0;
    const hasIncomingMissile = ship.lmisslDistance.some((d) => (d ?? 0) > 0);

    const d = decideCybEvasion(
      {
        hasZipper,
        minesnear: ship.minesnear > 0,
        where: ship.where,
        hasIncomingMissile,
        topSpeed: topSpeed * 1000,
      },
      this.random,
    );

    if (d.fireZipper) {
      // `ptr->items[I_ZIPPERS] = 1; zip(ptr,usrn);` — C hands the Cybertron the
      // round it is about to fire rather than checking its hold, so the sweep
      // always happens. The port's old branch decremented an item and turned
      // around without ever clearing a mine.
      this.weapons.zip(ship);
    }
    if (d.clearMinesnear) ship.minesnear = 0;
    if (d.speed2b !== undefined) ship.speed2b = d.speed2b;
    if (d.head2b !== undefined) ship.head2b = d.head2b;
    if (d.holdcourse !== undefined) ship.holdcourse = d.holdcourse;
    if (d.raiseShields) ship.shieldstat = 1;
  }

  /**
   * Taunt the target — pick message, emit cybertron.taunt. No weapon fire.
   * @see GECYBS.C:379 cyb_annoy
   */
  private cybAnnoy(
    ship: ShipState,
    target: ShipState,
    ctx: TickContext,
    band: CybAnnoyBand,
  ): void {
    // `if ((gernd()%rnd) == 1)` — note `== 1`, not `== 0`. `rnd` is per call
    // site: 60 approaching, 30 braking, 20 in range. The port had no gate at
    // all and taunted every pass. @see GECYBS.C:391
    if (!shouldTaunt(this.random, band.odds)) return;

    // Release 3.2e draws from this class's own 16-message family, four
    // messages of which belong to this band. @see GECYBS.C:392-397
    const message = pickTaunt(this.random, ship.shpclass, band, ship.shipname);
    if (message === null) return;
    const tickAt = typeof ctx === 'object' && ctx !== null && 'tickNumber' in ctx
      ? (ctx as { tickNumber: number }).tickNumber : 0;
    const taunt: CybertronTauntPayload = {
      attackerShipKey: shipKey(ship.userid, ship.shipno),
      targetShipKey: shipKey(target.userid, target.shipno),
      message,
      band: bandName(band),
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
    // C fills all five slots at no inventory cost — a Cybertron's decoys are
    // part of the class, not cargo. @see GECYBS.C:606-612
    ship.decout = layDecoys(ship.decout);
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
      const current = this.findPlayerByChannel(ship.cybmine);
      if (!current) {
        this.tx(ship, 'releaseTargetLeft', () => releaseTargetLeft(ship, topSpeed, this.random));
        return;
      }
      if (this.isInNeutralZone(current)) {
        // PORT-ORIGINAL: the other half of the sanctuary rule in the scan below.
        // Falls through to that scan, which finds someone outside the zone or
        // nobody. @see cyb-transitions.ts releaseZoneEntry
        this.tx(ship, 'releaseZoneEntry', () => releaseZoneEntry(ship, topSpeed, this.random), `${current.username ?? current.shipname} is in the neutral zone`);
      } else if (current.cloak === 10) {
        this.tx(ship, 'releaseTargetCloaked', () => releaseTargetCloaked(ship, topSpeed, this.random), `${current.username ?? current.shipname} is cloaked`);
        return;
      }
    }

    // 3. If no target, scan for closest eligible player (@see GECYBS.C:709-731)
    if (ship.cybmine === 255) {
      // `lowest_to_attk` is the HUNTER's column and `noclaim` is the PREY's —
      // two different tables, read from opposite sides of the engagement.
      // @see GECYBS.C:711, 719 and GECYBS.C:357-376
      const hunterLowestToAttack = cls?.cybLowestClassAttacks ?? 0;
      let lowDist = 999_999_999.0;
      let lowChannel = -1;
      let lowName = '';
      // What the scan saw, for `sys trace`. Counting costs nothing and keeps
      // the loop's shape; only the summary line is skipped when untraced.
      const tally: CybScanTally = { seen: 0, cloaked: 0, outOfClass: 0, inZone: 0, claimedOut: 0, picked: null };

      for (const candidate of this.shipState.findAllShips()) {
        if (candidate.status !== 1) continue; // must be active player
        tally.seen++;
        if (candidate.cloak === 10) { tally.cloaked++; continue; }
        if (!canPursue(hunterLowestToAttack, candidate.shpclass)) { tally.outOfClass++; continue; }

        // PORT-ORIGINAL, and deliberate: a pilot inside sector (0,0) is not a
        // target. Canon's `cyb_check_lockon` has NO neutral test — the only
        // `neutral()` in GECYBS.C is line 251, which gates firing — so a canon
        // Cybertron locks a pilot on the hub, flies to them and shadows them at
        // matched speed until they step out. We make the zone a real sanctuary.
        // @see docs/DECISIONS.md 2026-09-20
        if (this.isInNeutralZone(candidate)) { tally.inZone++; continue; }

        // Gang-up limit belongs to the ship being hunted, not the hunter. A
        // Cyb# of 0 (Heavy Freighter, Freight Barge) is never claimable.
        const victimNoClaim = this.shipClassCache.get(candidate.shpclass)?.noClaim ?? 0;
        const claims = this.countClaims(candidate.channel ?? CYBMINE_NONE);
        if (!notClaimed(claims, victimNoClaim)) { tally.claimedOut++; continue; }

        const dist = cdistance(ship, candidate);
        if (dist < lowDist) {
          lowDist = dist;
          lowChannel = candidate.channel ?? CYBMINE_NONE;
          lowName = candidate.username ?? candidate.shipname;
        }
      }

      if (this.trace) {
        if (lowChannel !== -1) tally.picked = { name: lowName, channel: lowChannel, distance: lowDist };
        this.trace.note(shipKey(ship.userid, ship.shipno), 'scan', formatScanSummary(tally));
      }

      if (lowChannel === -1) {
        // Nobody to hunt: park the activation and coast on the current course.
        // @see cyb-transitions.ts releaseNoTarget
        this.tx(ship, 'releaseNoTarget', () => releaseNoTarget(ship));
        return;
      }

      const wasAcquired = ship.cybmine === 255;
      this.tx(ship, 'acquire', () => acquire(ship, lowChannel));

      if (wasAcquired) {
        const target = this.findPlayerByChannel(lowChannel);
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
    const target = this.findPlayerByChannel(ship.cybmine);
    if (!target) {
      this.tx(ship, 'releaseStale', () => releaseStale(ship));
      return;
    }

    const dist = cdistance(ship, target);
    const hyperdist1 = config?.hyperdist1 ?? 25;
    const hyperdist2 = config?.hyperdist2 ?? 10;
    const classMaxShields = cls?.maxShields ?? 2;

    // Detect hyperwarp exit (where: 1→0) for shield restore (@see R-9, T031)
    const prevWhere = ship.where;

    // The target's own motion decides the combat band: canon matches a runner
    // that has gone to hyperspace rather than crawling at 990. @see GECYBS.C:793-796
    // A Base Star is configured immobile (S23ACCL 0, S23WARP 0) and canon's
    // hyperwarp band moves it anyway. @see cyb-decisions.isStationaryClass
    const hullClass = this.shipClassCache.get(ship.shpclass);
    const stationary = isStationaryClass(
      hullClass?.maxAcceleration ?? 0,
      hullClass?.maxWarp ?? 0,
    );

    const band = pickPursuitBand(
      dist, hyperdist1, hyperdist2, prevWhere, topSpeed, this.random,
      { where: target.where, speed2b: target.speed2b },
      stationary,
    );

    // cyb_annoy in the pursuit ladder. C taunts in three of the four bands and
    // says nothing while actually in hyperwarp:
    //   low_dist >= hyperdist2      cyb_annoy(ptr,low_ship,60,1,4)   :769
    //   low_dist  >  3.0            cyb_annoy(ptr,low_ship,30,5,8)   :782
    //   low_dist <=  3.0            cyb_annoy(ptr,low_ship,30,5,8)   :801
    // `low_ship` is the hunted player, so the taunt goes to their own terminal.
    if (dist < hyperdist1) {
      this.cybAnnoy(
        ship,
        target,
        ctx,
        dist >= hyperdist2 ? CYB_ANNOY_BANDS.APPROACH : CYB_ANNOY_BANDS.BRAKE,
      );
    }

    const apply = (): void => this.applyBand(ship, band, target);
    if (this.trace) this.trace.band(shipKey(ship.userid, ship.shipno), ship, band.name, apply);
    else apply();
  }

  /**
   * Steer on the chosen pursuit band: speed, hyperwarp entry, shields, heading.
   * @see GECYBS.C:742 `if (low_dist >= hyperdist1)` and the bands after it
   */
  private applyBand(ship: ShipState, band: PursuitBand, target: ShipState): void {
    ship.speed2b = band.desiredSpeed;
    // C also touches `ptr->speed` directly in every band — a snap on hyperwarp
    // entry, a ceiling everywhere else — so a Cybertron actually brakes rather
    // than drifting toward the new speed over several ticks.
    // @see GECYBS.C:745-746, 760-761, 774-775, 789-790
    if (band.speed !== undefined) ship.speed = band.speed;
    if (band.speedClamp !== undefined && ship.speed > band.speedClamp) {
      ship.speed = band.speedClamp;
    }
    // Written only when the band ENTERS hyperwarp. Canon writes `ptr->where` in
    // that one band (GECYBS.C:749 `		ptr->where = 1;`) and never writes it back: a ship leaves
    // hyperspace by decelerating under warp 1, which `accel()` detects and
    // reports through `hyperspace(ptr,usrn,0)` — the same routine that took the
    // shields down on the way in.
    //
    // Writing `0` here was an exit by fiat. A Cybertron dropping from hyperwarp
    // into the brake or close band became `where = 0` while still moving at
    // 3,200 units, and the next activation read that as normal space and raised
    // its shields. A player at the same speed has theirs forced down, so the AI
    // fought at warp behind shields nothing could strip. @see issue #43
    if (band.where !== undefined) ship.where = band.where;
    if (band.shield !== undefined) {
      ship.shield = band.shield;
    }
    if (band.raiseShields) {
      ship.shieldstat = 1; // shieldup(ptr,usrn)
    } else if (band.where === 1) {
      ship.shieldstat = 0; // SHIELDDN on hyperwarp entry
    }

    // Point heading toward target
    const dx = target.xcoord - ship.xcoord;
    const dy = target.ycoord - ship.ycoord;
    if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
      // Same convention as the firing solution and every other bearing in the
      // port. This used atan2(dx, dy) — a Y-axis flip — so the Cybertron aimed
      // correctly and then drove the opposite way. @see physics-math.headingToward
      ship.head2b = headingToward(dx, dy);
    }
  }

  /**
   * Neutral-zone membership. Delegates to the shared helper, which now agrees
   * with this rule — it used to test a ±0.5 bubble, so the AI honoured a
   * boundary the player weapons did not.
   * @see combat/neutral-zone.ts, GEPLANET.C:866
   */
  private isInNeutralZone(ship: { xcoord: number; ycoord: number }): boolean {
    return inNeutralZone(ship);
  }

  /**
   * How many Cybertrons currently hold this channel as their target — C's
   * `nc` loop. @see GECYBS.C:365-370
   */
  /**
   * ONE definition of "is a Cybertron", shared with `selectAiShips`.
   *
   * These two were allowed to disagree, and that is the whole of B-01: filtering
   * which ships RUN the Cybertron brain does not change which ships get COUNTED
   * by it. @see docs/audits/2026-09-15-ge-next-bug-review.md
   */
  private isCybertronClass(shpclass: number): boolean {
    return this.shipClassCache.getCategory(shpclass) === 'CPU_COMBATIVE';
  }

  private countClaims(targetChannel: number): number {
    return countCybertronClaims(
      this.shipState.findAllShips(),
      targetChannel,
      (c) => this.isCybertronClass(c),
    );
  }

  /** Find an active player ship by shipno. */
  /**
   * The claimed player, by channel. `cybmine` is a *usernumber* in C — it is
   * compared against `usrn` and used as a terminal index (GECYBS.C:368, 670) —
   * so it names one ship. Matching on `shipno` meant a Cybertron that had
   * claimed one player would hunt, and count its claim against, whichever
   * player's first ship came up first.
   */
  private findPlayerByChannel(channel: number): ShipState | undefined {
    if (channel === CYBMINE_NONE) return undefined;
    return this.shipState.findAllShips().find(
      (s) => s.channel === channel && s.status === 1,
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

    // canon's cyb_won: release the claim, settle to warp 2, force a flush.
    // @see cyb-transitions.ts releaseWon
    this.shipState.mutate(e.attackerUserid, shipno, (s) => this.tx(s, 'releaseWon', () => releaseWon(s)));
  }

  /**
   * NO cash payout for killing a Cybertron.
   *
   * This service used to subscribe to `combat.ship-destroyed` and hand the
   * killer the victim's entire bank balance, citing
   * `GECYBS.C:104-105 kill gold transfer`. Those lines are the middle of
   * `cyb_init`'s name-building block; no such transfer exists in canon.
   *
   * Canon's only Cybertron cash sites are the CYB_MAXCASH clamp
   * (GECYBS.C:121-122) and the CYB_ALLOW allowance (GECYBS.C:229). In `killem`
   * the flotsam cash grab is commented out (GEFUNCS.C:1137-1139) and
   * `chgloser` is gated on both ships being GESTAT_USER (GEFUNCS.C:1200) —
   * strictly PvP. A Cybertron's cash is its purchasing power, not a prize.
   *
   * What a killer gets is the gold in the victim's HOLD, looted by the
   * ordinary flotsam loop under `chkweight`. @see combat/kill-resolution.ts
   * @see docs/DECISIONS.md 2026-09-06 — no cash payout for killing a Cybertron
   */

  /**
   * Start a class's respawn hold when one of its hulls dies.
   *
   * PORT-ORIGINAL, and armed by a DEATH rather than by a deficit: a galaxy that
   * has simply never been full — a fresh database, a raised `tot_to_create` —
   * must still fill at the old pace, or a new install would sit empty for half
   * an hour waiting for hulls that nobody killed.
   *
   * Guarded on the USERID, not the class. Only the AI spawner writes
   * `Cybrg-` rows, so a player dying cannot put a Cybertron class on hold even
   * if their hull somehow shares its class number.
   *
   * @see cyb-population.ts respawnDelayMs, docs/DECISIONS.md 2026-09-20
   */
  private onAiHullDestroyed(e: CombatShipDestroyedEvent): void {
    if (!e.victimUserid?.startsWith('Cybrg-')) return;
    // `victimClass` is optional — some callers build the event after the ship
    // is gone. With no class there is nothing to hold, and refilling at the old
    // pace is the safe failure.
    const classNumber = e.victimClass;
    if (typeof classNumber !== 'number') return;
    if (!this.classConfigs[classNumber]) return;

    const canonCount = CANON_TOT_TO_CREATE[classNumber];
    const delay = respawnDelayMs(canonCount ?? 0);
    this.respawnNotBefore.set(classNumber, Date.now() + delay);
  }

  /**
   * Whether a class is inside its v0.29.0 respawn hold. Clears an expired hold
   * as it goes. The one test both the slot's pick and `spawnOne` apply, so they
   * cannot disagree about which classes may spawn. @see cyb-population.ts
   */
  private isHeld(classNumber: number): boolean {
    const notBefore = this.respawnNotBefore.get(classNumber);
    if (notBefore === undefined) return false;
    if (Date.now() < notBefore) return true;
    this.respawnNotBefore.delete(classNumber);
    return false;
  }

  /**
   * Per-slot spawn entry point: pick a class (1-in-30 tick cadence) and spawn one ship.
   * One ship per slot — behavior unchanged from original game loop.
   * @see GEMAIN.C outer loop (R-2); GECYBS.C cyb_init spawn cadence
   */
  private async runSpawnSlot(ctx: TickContext): Promise<void> {
    try {
      const classCounts = new Map<number, number>();
      for (const ship of this.shipState.findAllShips()) {
        if (ship.status !== 2) continue;
        const cls = ship.shpclass;
        classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1);
      }

      const chosenClass = pickSpawnClass(classCounts, this.classConfigs, this.random, (n) => this.isHeld(n));
      if (chosenClass === null) return;

      await this.spawnOne(chosenClass, ctx);
    } catch (err: unknown) {
      const stack = err instanceof Error ? err.stack : String(err);
      this.logger.error(`Spawn slot fault: ${stack}`);
    }
  }

  /**
   * Create one AI ship of `classNumber` if below tot_to_create.
   * Self-limiting: returns false immediately if the class is already at capacity.
   * Used by both the per-slot tick cadence (runSpawnSlot) and the boot-seed loop (onModuleInit).
   *
   * @param classNumber  Cybertron/Sartern class number (21-25)
   * @param ctx          Optional tick context; if provided, the SPAWNED event includes the tick number
   * @returns            true if a ship was created, false if the class is already full
   * @see GECYBS.C cyb birth
   */
  private async spawnOne(classNumber: number, ctx?: TickContext): Promise<boolean> {
    const config = this.classConfigs[classNumber];
    if (!config) return false;

    // The respawn hold, checked HERE rather than in runSpawnSlot because this is
    // the single funnel every spawn passes through — including `pickSpawnClass`'s
    // 1% branch, which ignores population entirely and would otherwise hand back
    // an Obliterator minutes after one died.
    if (this.isHeld(classNumber)) return false;
    const aiShips = this.shipState.findAllShips().filter((s) => s.status === 2);
    const currentCount = aiShips.filter((s) => s.shpclass === classNumber).length;
    if (currentCount >= config.tot_to_create) return false;

    const allAiShipnos = new Set(aiShips.map((s) => s.shipno));
    let shipno = 200;
    while (allAiShipnos.has(shipno)) shipno++;

    const userid = `Cybrg-${shipno}`;
    const clsEntry = this.shipClassCache.get(classNumber);
    const loadout = randomInitLoadout(config.cyb_gold, this.random);
    const cybskill = randomCybSkill(this.random);
    const tick = 6 + Math.floor(this.random.next() * 6);
    const xcoord = this.random.next() * UNIVMAX * 2.0 - UNIVMAX;
    const ycoord = this.random.next() * UNIVMAX * 2.0 - UNIVMAX;

    await this.repository.createSpawn({
      userid,
      shipno,
      classNumber,
      // C builds the display name as sprintf("%s%u", shipclass[class].shipname,
      // usrn*usrn + gernd()%100) -- GECYBS.C:155. The prefix is canon's SNAME,
      // which differs per class: "Cybertron ", "Cyberquad ", "Cyber Base-",
      // "SADx3", "SOBx9". The port used one literal for all five, so every
      // hostile read as "Cybrg-nnnn" and a new pilot could not tell a Scout
      // from a Cyberquad from a Base Star -- in canon the name announces the
      // threat class, which is how you learn what to run from. `Cybrg-` remains
      // the USERID prefix used for lookups; this is the visible ship name.
      shipname: `${clsEntry?.shipNameTemplate ?? 'Cybrg-'}${shipno * shipno + Math.floor(this.random.next() * 100)}`,
      xcoord,
      ycoord,
      phasrtype: clsEntry?.maxPhaser ?? 1,
      shieldtype: clsEntry?.maxShields ?? 1,
      // Without this the hull cannot move at all — see SpawnSlotInit.topspeed.
      topspeed: clsEntry?.maxWarp ?? 1,
      loadout,
      cybskill,
      tick,
    });

    const tickAt = ctx ? ctx.tickNumber : 0;
    const payload: CybertronSpawnedPayload = {
      shipKey: `${userid}:${shipno}`,
      classNumber,
      sector: { x: Math.floor(xcoord), y: Math.floor(ycoord) },
      tickAt,
    };
    this.events.emit(CYBERTRON_EVENT.SPAWNED, payload);
    // A new hull in this slot: the previous one's trace is no longer about it.
    // Reset here rather than at death, so a dead Cybertron's last moves stay
    // readable until the slot is reused. @see cyb-trace.service.ts
    this.trace?.reset(shipKey(userid, shipno));
    this.logger.log(`Spawned ${userid} class ${classNumber}`);
    return true;
  }
}
