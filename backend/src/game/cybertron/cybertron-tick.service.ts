import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Inject, Optional } from '@nestjs/common';
import { TickService } from '../tick/tick.service';
import { TickContext, TickKind } from '../tick/tick.types';
import { ShipStateService } from '../ship/ship-state.service';
import { ShipClassCacheService } from '../physics/ship-class-cache.service';
import { Random, RANDOM } from '../combat/random.port';
import { MineRegistry } from '../combat/mine.registry';
import { MineRepository } from '../combat/mine.repository';
import { CybertronRepository } from './cybertron.repository';
import { buildCybertronClassConfigs, bootSeedEnabled } from './cybertron.config';
import type { CybertronClassConfig } from './cybertron.config';
import {
  CYBMAXPERTICK,
  UNIVMAX,
  GESTAT_AUTO,
} from '../constants';
import {
  CYBERTRON_EVENT,
  CybertronSpawnedPayload,
} from './cybertron-events';
import type { ShipState } from '../ship/ship-state.types';
import { shipKey } from '../ship/ship-state.types';
import {
  CombatShipDestroyedEvent,
  COMBAT_SHIP_DESTROYED,
} from '../combat/combat-events';
import { CANON_TOT_TO_CREATE, respawnDelayMs } from './cyb-population';
import {
  CYBERTRON_SCORED_KILL,
  CybertronScoredKillEvent,
} from '../player/player-score.service';
import {
  pickSpawnClass,
  randomInitLoadout,
  randomCybSkill,
} from './cyb-decisions';
import {
  releaseWon,
} from './cyb-transitions';
import { CombatTickService } from '../combat/combat-tick.service';
import { CybertronControlService } from './cybertron-control.service';
import { AiWeapons } from '../ai/ai-weapons';
import { CybertronBrain, isCybertronClass } from './cybertron-brain';
import { CybTraceService, tracedTransition } from './cyb-trace.service';
import { AI_HOUSE_RULES, PORT_RULES, type AiHouseRules } from '../ai/house-rules';

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
   * hulls dies. PORT-ORIGINAL @house-rule respawnHold — canon has no respawn delay.
   * @see cyb-population.ts respawnDelayMs, docs/DECISIONS.md 2026-09-20
   */
  private readonly respawnNotBefore = new Map<number, number>();

  /** Allowance owed per Cybertron user since the last flush. @see GECYBS.C:229 */
  private readonly pendingAllowance = new Map<string, bigint>();

  /** Maps classNumber → CybertronClassConfig (merged from env overrides + defaults). */
  private readonly classConfigs: Record<number, CybertronClassConfig>;

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
    // The port's AI house rules; production binds nothing and runs them all.
    // @see ../ai/house-rules.ts
    @Optional() @Inject(AI_HOUSE_RULES) private readonly rules: AiHouseRules = PORT_RULES,
  ) {
    this.classConfigs = buildCybertronClassConfigs(rules);
    this.weapons = new AiWeapons({
      shipState, classes: shipClassCache, events, random, logger: this.logger,
      combatTick, mineRegistry, mineRepo, trace,
    });
    this.brain = new CybertronBrain({
      shipState, shipClassCache, classConfigs: this.classConfigs, events, random,
      repository, trace, weapons: this.weapons, pendingAllowance: this.pendingAllowance,
      rules,
    });
  }

  /** The canon weapons this AI fires. @see ./ai-weapons.ts */
  private readonly weapons: AiWeapons;

  /** What each Cybertron decides on its activation. @see ./cybertron-brain.ts */
  private readonly brain: CybertronBrain;

  /**
   * Apply a claim transition, recording it in the ship's trace when there is
   * one. @see cyb-trace.service.ts tracedTransition
   */
  private tx(ship: ShipState, event: string, apply: () => void, detail?: string): void {
    tracedTransition(this.trace, ship, event, apply, detail);
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
      .filter((s) => s.status === GESTAT_AUTO && isCybertronClass(this.shipClassCache, s.shpclass));
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
        this.brain.cybLives(ship, ctx);
        activations++;
      } catch (err: unknown) {
        const id = shipKey(ship.userid, ship.shipno);
        const stack = err instanceof Error ? err.stack : String(err);
        this.logger.error(`cybLives fault for ${id}: ${stack}`);
      }
    }
  }

  /**
   * Fire phasers at target — emit COMBAT_PHASER_FIRED, compute damage, apply, emit COMBAT_HIT.
   * @see GECYBS.C:490-525 cyb_attack → firep
   */

  /**
   * How many Cybertrons currently hold this channel as their target — C's
   * `nc` loop. @see GECYBS.C:365-370
   */
  /** Find an active player ship by shipno. */
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
   * PORT-ORIGINAL @house-rule respawnHold, and armed by a DEATH rather than by a deficit: a galaxy that
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
    if (!this.rules.respawnHold) return;
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
