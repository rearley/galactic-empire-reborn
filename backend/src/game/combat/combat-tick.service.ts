import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShipState, shipKey } from '../ship/ship-state.types';
import { ShipStateService } from '../ship/ship-state.service';
import { TickService } from '../tick/tick.service';
import { TickContext, TickKind, Unsubscribe } from '../tick/tick.types';
import { ShipClassCacheService } from '../physics/ship-class-cache.service';
import {
  DECODDS,
  FIRETICKS,
  MAXMISSL,
  MAXTORPS,
  MDAMMAX,
  MISLSPED,
  PRELOAD,
  TDAMMAX,
  TORPSPED,
} from '../constants';
import { MineRegistry } from './mine.registry';
import { MineRepository } from './mine.repository';
import { RANDOM, Random } from './random.port';
import {
  decoyIntercept,
  randamage,
  shieldhit,
} from './combat-math';
import {
  COMBAT_DECOY_INTERCEPT,
  COMBAT_HIT,
  CombatDecoyInterceptEvent,
  CombatHitEvent,
} from './combat-events';

/** Decoy intercept distance threshold for torpedoes. @see specs/006b-combat/research.md */
const TORP_DECOY_THRESHOLD = 5000;
/** Decoy intercept distance threshold for missiles. @see specs/006b-combat/research.md */
const MISSILE_DECOY_THRESHOLD = 3000;

/**
 * Orchestrates the combat half of the 6-second PHYSICS tick: phaser cooldowns,
 * weapon flight, mine sweeps, decoy/jammer expiry, hit resolution, and
 * destruction events.
 *
 * Subscription ordering — CombatTickService MUST subscribe to TickKind.PHYSICS
 * AFTER PhysicsTickService so that combat math sees post-movement coordinates.
 * This is enforced by CombatModule importing PhysicsModule (which guarantees
 * PhysicsTickService.onModuleInit runs first), and exercised by
 * tick-subscription-order.spec.ts.
 *
 * Per-ship faults are caught and logged; a single bad ship MUST NOT abort the
 * batch. Ships are processed in ascending composite-shipId order so tests are
 * deterministic.
 *
 * @see specs/006b-combat/research.md R-1, R-2
 * @see GEFUNCS.C — combat handlers
 */
@Injectable()
export class CombatTickService implements OnModuleInit {
  private unsubscribe?: Unsubscribe;

  constructor(
    private readonly tickService: TickService,
    private readonly shipState: ShipStateService,
    private readonly mineRepo: MineRepository,
    private readonly mineRegistry: MineRegistry,
    @Inject(RANDOM) private readonly random: Random,
    private readonly events: EventEmitter2,
    private readonly logger: Logger,
    private readonly shipClassCache: ShipClassCacheService,
  ) {}

  /**
   * Hydrates the mine registry from Postgres, then registers the PHYSICS tick
   * subscriber. Registration happens AFTER PhysicsTickService because CombatModule
   * imports PhysicsModule — NestJS runs onModuleInit in import-dependency order,
   * guaranteeing combat runs after physics movement on every tick. (R-1)
   * @see specs/006b-combat/research.md R-1
   */
  async onModuleInit(): Promise<void> {
    const mines = await this.mineRepo.findAllActive();
    this.mineRegistry.hydrate(
      mines.map((m) => ({
        id: m.id,
        channel: m.channel,
        timer: m.timer,
        xcoord: m.xcoord,
        ycoord: m.ycoord,
        deployedBy: m.deployedBy,
      })),
    );
    this.unsubscribe = this.tickService.subscribe(TickKind.PHYSICS, (ctx) => this.onPhysicsTick(ctx));
    this.logger.log(`CombatTickService subscribed to PHYSICS — ${this.mineRegistry.getAll().length} mines hydrated`);
  }

  private onPhysicsTick(ctx: TickContext): void {
    const ships = this.shipState
      .findAllShips()
      .slice()
      .sort((a, b) => {
        const ka = shipKey(a.userid, a.shipno);
        const kb = shipKey(b.userid, b.shipno);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });

    for (const ship of ships) {
      try {
        this.processShipCombat(ship, ctx);
      } catch (err) {
        const id = shipKey(ship.userid, ship.shipno);
        const stack = err instanceof Error ? err.stack : String(err);
        this.logger.error(`Combat fault for ship ${id}: ${stack}`);
      }
    }
  }

  /** Per-ship combat work — filled in by subsequent user-story phases. */
  private processShipCombat(ship: ShipState, ctx: TickContext): void {
    // Phaser reload (FR-004): phasr += PRELOAD, capped at class maxPhaser.
    // Only ships with a phaser mounted accumulate charge.
    // @see GEFUNCS.C — phaser reload pass
    if (ship.phasrtype > 0) {
      try {
        const maxPhaser = this.shipClassCache.getMaxPhaser(ship.shpclass);
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.phasr = Math.min(maxPhaser, s.phasr + PRELOAD);
        });
      } catch {
        // Class not in cache — skip reload silently; logged at hydration time.
      }
    }

    // Projectile travel pass (T029) — walk the carrier's own incoming arrays.
    // Slots represent INCOMING projectiles per GEFUNCS.C:1546.
    this.processIncomingTorpedoes(ship, ctx);
    this.processIncomingMissiles(ship, ctx);
  }

  /**
   * Walk `carrier.ltorps[]` (incoming torpedoes). Decrement distance; on
   * decoy intercept emit COMBAT_DECOY_INTERCEPT and clear; on distance ≤ 0
   * resolve hit, emit COMBAT_HIT, clear. If carrier is no longer ingame,
   * silently clear the slot (FR-027.3).
   *
   * @see GEFUNCS.C:1546 incoming-torp walk
   */
  private processIncomingTorpedoes(carrier: ShipState, ctx: TickContext): void {
    const carrierIngame = carrier.status === 1 || carrier.status === 2;
    for (let i = 0; i < MAXTORPS; i++) {
      const ch = carrier.ltorpsChannel[i];
      if (ch === undefined || ch === 255) continue;

      // FR-027.3: carrier left game mid-flight — silently clear.
      if (!carrierIngame) {
        this.clearTorpSlot(carrier, i);
        continue;
      }

      const oldDist = carrier.ltorpsDistance[i] ?? 0;
      const newDist = oldDist - TORPSPED;

      // Decoy intercept threshold check.
      if (newDist < TORP_DECOY_THRESHOLD && this.hasActiveDecoy(carrier)) {
        if (decoyIntercept(this.random, DECODDS)) {
          this.emitDecoyIntercept(carrier, ch, 'torpedo', ctx);
          this.clearTorpSlot(carrier, i);
          continue;
        }
      }

      if (newDist > 0) {
        this.shipState.mutate(carrier.userid, carrier.shipno, (s) => {
          s.ltorpsDistance[i] = newDist;
        });
        continue;
      }

      // Hit resolution.
      this.resolveProjectileHit(carrier, ch, 'torpedo', TDAMMAX, ctx);
      this.clearTorpSlot(carrier, i);
    }
  }

  /**
   * Walk `carrier.lmissl[]` (incoming missiles). Same pattern as torpedoes
   * but uses `MISLSPED`, `MISSILE_DECOY_THRESHOLD`, and the per-missile
   * stored `lmisslEnergy[i]` as the damage cap.
   */
  private processIncomingMissiles(carrier: ShipState, ctx: TickContext): void {
    const carrierIngame = carrier.status === 1 || carrier.status === 2;
    for (let i = 0; i < MAXMISSL; i++) {
      const ch = carrier.lmisslChannel[i];
      if (ch === undefined || ch === 255) continue;

      if (!carrierIngame) {
        this.clearMisslSlot(carrier, i);
        continue;
      }

      const oldDist = carrier.lmisslDistance[i] ?? 0;
      const newDist = oldDist - MISLSPED;

      if (newDist < MISSILE_DECOY_THRESHOLD && this.hasActiveDecoy(carrier)) {
        if (decoyIntercept(this.random, DECODDS)) {
          this.emitDecoyIntercept(carrier, ch, 'missile', ctx);
          this.clearMisslSlot(carrier, i);
          continue;
        }
      }

      if (newDist > 0) {
        this.shipState.mutate(carrier.userid, carrier.shipno, (s) => {
          s.lmisslDistance[i] = newDist;
        });
        continue;
      }

      // Damage cap is the stored charge.
      const charge = carrier.lmisslEnergy[i] ?? MDAMMAX;
      this.resolveProjectileHit(carrier, ch, 'missile', charge, ctx);
      this.clearMisslSlot(carrier, i);
    }
  }

  private hasActiveDecoy(carrier: ShipState): boolean {
    for (const t of carrier.decout) if (t > 0) return true;
    return false;
  }

  private clearTorpSlot(carrier: ShipState, i: number): void {
    this.shipState.mutate(carrier.userid, carrier.shipno, (s) => {
      while (s.ltorpsChannel.length <= i) s.ltorpsChannel.push(255);
      while (s.ltorpsDistance.length <= i) s.ltorpsDistance.push(0);
      s.ltorpsChannel[i] = 255;
      s.ltorpsDistance[i] = 0;
    });
  }

  private clearMisslSlot(carrier: ShipState, i: number): void {
    this.shipState.mutate(carrier.userid, carrier.shipno, (s) => {
      while (s.lmisslChannel.length <= i) s.lmisslChannel.push(255);
      while (s.lmisslDistance.length <= i) s.lmisslDistance.push(0);
      while (s.lmisslEnergy.length <= i) s.lmisslEnergy.push(0);
      s.lmisslChannel[i] = 255;
      s.lmisslDistance[i] = 0;
      s.lmisslEnergy[i] = 0;
    });
  }

  private emitDecoyIntercept(
    carrier: ShipState,
    attackerChannel: number,
    weapon: 'torpedo' | 'missile',
    ctx: TickContext,
  ): void {
    const attacker = this.findShipByChannel(attackerChannel, carrier);
    const event: CombatDecoyInterceptEvent = {
      defenderId: shipKey(carrier.userid, carrier.shipno),
      attackerId: attacker ? shipKey(attacker.userid, attacker.shipno) : `?:${attackerChannel}`,
      weapon,
      sector: { x: Math.floor(carrier.xcoord), y: Math.floor(carrier.ycoord) },
      tickAt: ctx.firedAt,
    };
    this.events.emit(COMBAT_DECOY_INTERCEPT, event);
  }

  private resolveProjectileHit(
    carrier: ShipState,
    attackerChannel: number,
    weapon: 'torpedo' | 'missile',
    dmgMax: number,
    ctx: TickContext,
  ): void {
    let ton = 5000;
    try {
      ton = this.shipClassCache.getMaxTons(carrier.shpclass);
    } catch {
      // fall back to default
    }
    const damage = randamage(this.random, dmgMax, ton);
    const shieldUp = carrier.shieldstat === 1 && carrier.shield > 0;
    const result = shieldhit(carrier.shield, damage, shieldUp);

    this.shipState.mutate(carrier.userid, carrier.shipno, (v) => {
      v.shield = result.newShield;
      v.damage = v.damage + result.hullDamage;
      v.lastfired = attackerChannel;
      v.cantexit = FIRETICKS;
    });

    // Find the attacker ship (by shipno = channel) and set their cantexit too.
    const attacker = this.findShipByChannel(attackerChannel, carrier);
    if (attacker) {
      this.shipState.mutate(attacker.userid, attacker.shipno, (a) => {
        a.cantexit = FIRETICKS;
      });
    }

    const hitEvent: CombatHitEvent = {
      attackerId: attacker ? shipKey(attacker.userid, attacker.shipno) : `?:${attackerChannel}`,
      victimId: shipKey(carrier.userid, carrier.shipno),
      weapon,
      damageHull: result.hullDamage,
      damageShield: result.shieldDamage,
      sector: { x: Math.floor(carrier.xcoord), y: Math.floor(carrier.ycoord) },
      tickAt: ctx.firedAt,
    };
    this.events.emit(COMBAT_HIT, hitEvent);
  }

  /**
   * Look up the attacker ship by channel (= shipno in this port). Skips the
   * carrier itself. Returns undefined if not found (firer left game).
   */
  private findShipByChannel(channel: number, carrier: ShipState): ShipState | undefined {
    const carrierKey = shipKey(carrier.userid, carrier.shipno);
    for (const s of this.shipState.findAllShips()) {
      if (s.shipno !== channel) continue;
      if (shipKey(s.userid, s.shipno) === carrierKey) continue;
      if (s.status !== 1 && s.status !== 2) continue;
      return s;
    }
    return undefined;
  }

  /** Reference the random port so DI-injected adapter is reachable in subclass tests. */
  protected getRandom(): Random {
    return this.random;
  }

  /** Reference EventEmitter2 to keep the field used; subclasses/users emit. */
  protected getEvents(): EventEmitter2 {
    return this.events;
  }
}
