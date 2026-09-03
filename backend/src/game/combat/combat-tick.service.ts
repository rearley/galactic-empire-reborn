import { tryEnergyDebit, cbearing } from '../physics/physics-math';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { isInNeutralZone } from './neutral-zone';
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
  MISSILE_CHARGE_MAX,
  MINERANGE,
  MISLSPED,
  TDAMMAX,
  TORPSPED,
  SHIELDDM,
  PENGUSE,
  USEENERGY_RESERVE,
} from '../constants';
import { MineRegistry, MineState } from './mine.registry';
import { MineRepository } from './mine.repository';
import { RANDOM, Random } from './random.port';
import {
  cdistance,
  tryDecoyIntercept,
  mineFalloff,
  phaserReloadAmount,
  rollHullDamage,
  rollProjectileHullDamage,
  rollMissileHullDamage,
  missileShieldDrain,
  mineShieldedDamage,
  MINE_SHIELD_DRAIN_BONUS,
  SHIELD_DRAIN_MIN,
  SHIELD_DRAIN_SPREAD,
  shieldhit,
} from './combat-math';
import {
  COMBAT_DECOY_INTERCEPT,
  COMBAT_HIT,
  COMBAT_MINE_DETONATION,
  COMBAT_MINE_WARNING,
  COMBAT_SHIP_DESTROYED,
  CombatDecoyInterceptEvent,
  CombatHitEvent,
  CombatMineDetonationEvent,
  CombatMineWarningEvent,
  CombatShipDestroyedEvent,
} from './combat-events';
import { applyRandamageAndEmit } from './randamage.apply';
import { LootTransfer, resolveKillSpoils } from './kill-resolution';
import {
  AiFireEventForInvariants,
  CombatEventForInvariants,
  pushBounded,
} from '../invariants/runtime-events';

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
    this.tickService.registerSnapshotProvider('combatEvents', () => this.getRecentEvents());
    this.tickService.registerSnapshotProvider('aiFireEvents', () => this.getRecentAiFireEvents());
    this.logger.log(`CombatTickService subscribed to PHYSICS — ${this.mineRegistry.getAll().length} mines hydrated`);
  }

  /**
   * Bounded ring buffer of recent player/AI weapon-fire events for the
   * `weaponFireRangeRespected` invariant. Producers (PhaserHandlerService,
   * mine sweep here, AI tick services) push via {@link recordCombatEvent}.
   * Bounded at `MAX_EVENTS` items (see runtime-events.ts).
   */
  private readonly recentCombatEvents: CombatEventForInvariants[] = [];
  /**
   * Bounded ring buffer of recent AI phaser fires for the AI-targeting
   * invariants. Cybertron + Droid tick services push via
   * {@link recordAiFireEvent}.
   */
  private readonly recentAiFireEvents: AiFireEventForInvariants[] = [];

  /** @internal — pushed to by combat producers. */
  recordCombatEvent(event: CombatEventForInvariants): void {
    pushBounded(this.recentCombatEvents, event);
  }

  /** @internal — pushed to by AI tick services. */
  recordAiFireEvent(event: AiFireEventForInvariants): void {
    pushBounded(this.recentAiFireEvents, event);
  }

  /** @returns A frozen snapshot of recent combat events (≤ MAX_EVENTS). */
  getRecentEvents(): ReadonlyArray<CombatEventForInvariants> {
    return this.recentCombatEvents.slice();
  }

  /** @returns A frozen snapshot of recent AI fire events (≤ MAX_EVENTS). */
  getRecentAiFireEvents(): ReadonlyArray<AiFireEventForInvariants> {
    return this.recentAiFireEvents.slice();
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

    // Mine sweep pass — runs AFTER per-ship combat so projectile damage
    // settles first. tickAll() decrements timers; sweepCandidates() returns
    // mines on the timer % 5 === 0 cadence (matches GEFUNCS.C:minesweep).
    this.runMineSweep(ships, ctx);

    // Kill-resolution pass — runs LAST so any damage applied by phaser,
    // projectile, or mine passes this tick is settled before kills are
    // attributed and dead ships removed from the in-memory map.
    this.runKillResolution(ctx);
  }

  /**
   * Walk all active ships; any with `damage >= 100` is killed. Attribution
   * uses the victim's `lastfired` (= attacker's shipno/channel). The attacker's
   * `kills` is incremented, COMBAT_SHIP_DESTROYED is emitted galaxy-wide, and
   * the dead ship is removed from the in-memory map. After removal, in-flight
   * cleanup clears every other ship's incoming projectile slots that reference
   * the dead firer's shipno (FR-027, GEFUNCS.C:1755-1778).
   *
   * @see GEFUNCS.C:killem (line 1103)
   * @see GEFUNCS.C:acctm  (line 1118)
   */
  private runKillResolution(ctx: TickContext): void {
    const ships = this.shipState
      .findAllShips()
      .slice()
      .sort((a, b) => {
        const ka = shipKey(a.userid, a.shipno);
        const kb = shipKey(b.userid, b.shipno);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });

    // Pre-removal attacker snapshot — captures attacker userid and shipKey BEFORE
    // any removeFromGame() runs. Closes the mutual-kill same-tick attribution gap
    // where ship A is removed first, making ship B's attacker lookup return null
    // even though both were alive at the start of kill resolution.
    // @see specs/019-physics-polish/spec.md §Plan-Phase Decisions
    const attackerSnapshot = new Map<string, {
      userid: string | null; shipKey: string | null; shipname: string | null;
    }>();
    for (const ship of ships) {
      if (ship.damage < 100) continue;
      if (ship.status !== 1 && ship.status !== 2) continue;
      const attacker = this.findActiveAttackerByChannel(ship.lastfired, ship);
      attackerSnapshot.set(shipKey(ship.userid, ship.shipno), {
        userid: attacker ? attacker.userid : null,
        shipKey: attacker ? shipKey(attacker.userid, attacker.shipno) : null,
        // The NAME has to be captured here too. It is read off the attacker
        // before removeFromGame, and anything downstream that is not the
        // gateway — the ship-loss mail, for one — has no way to resolve a
        // shipKey afterwards. Leaving it unset made every mail read "destroyed
        // by an unknown assailant", including kills by a named Cybertron.
        shipname: attacker ? attacker.shipname : null,
      });
    }

    for (const victim of ships) {
      try {
        if (victim.damage < 100) continue;
        // Skip ships already removed from the active set (defensive).
        if (victim.status !== 1 && victim.status !== 2) continue;

        const attackerChannel = victim.lastfired;
        // Use pre-snapshot userid; fall back to live lookup for cargo access.
        const snapshot = attackerSnapshot.get(shipKey(victim.userid, victim.shipno));
        const attacker = this.findActiveAttackerByChannel(attackerChannel, victim);

        // Canon's killem does the kill credit and the cargo transfer in one
        // place, and so do we now: the gateway's disconnect kill calls the
        // same helper instead of shipping an empty hold.
        // @see GEFUNCS.C:1116-1136, GEMAIN.C:1418
        const loot: LootTransfer[] = attacker
          ? resolveKillSpoils(victim, attacker, {
              mutate: (userid, shipno, fn) => this.shipState.mutate(userid, shipno, fn),
              maxTonsFor: (shpclass) => this.shipClassCache.getMaxTons(shpclass),
              random: this.random,
            })
          : [];

        // Score points for this kill — GEFUNCS.C:killem (1145).
        let scoreAwarded = 0;
        try { scoreAwarded = this.shipClassCache.getPoints(victim.shpclass); } catch { /* class not cached */ }

        // Use snapshot for attackerUserid/attackerShipKey so mutual-kill
        // scenarios correctly attribute kills even after the first removeFromGame().
        const snapshotAttackerUserid = snapshot?.userid ?? null;
        const snapshotAttackerShipKey = snapshot?.shipKey ?? null;
        const event: CombatShipDestroyedEvent = {
          victimId: shipKey(victim.userid, victim.shipno),
          attackerId: snapshotAttackerShipKey,
          victimShipKey: shipKey(victim.userid, victim.shipno),
          attackerShipKey: snapshotAttackerShipKey,
          victimUserid: victim.userid,
          attackerUserid: snapshotAttackerUserid,
          attackerName: snapshot?.shipname ?? null,
          attackerChannel,
          // Weapon type is not separately tracked at kill time; the per-hit
          // events emitted earlier this tick carry the weapon. Leave null.
          //
          // A planet kill is NOT inferred here from `attackerChannel === -1`:
          // that value is also NO_CHANNEL ("nobody has fired on me"), which a
          // victim is reset to when its firer leaves the game. The gateway
          // names the planet, because it holds the actual evidence — a
          // recorded ion hit. @see planet-kill.ts
          weapon: null,
          sector: { x: Math.floor(victim.xcoord), y: Math.floor(victim.ycoord) },
          tickAt: ctx.firedAt,
          loot,
          scoreAwarded,
        };
        this.events.emit(COMBAT_SHIP_DESTROYED, event);

        // Remove from active state map.
        this.shipState.removeFromGame(victim);

        // Clear cybmine on any Cybertron targeting the dead ship so they don't
        // immediately re-engage the player when they respawn. @see GEFUNCS.C:killem
        for (const s of this.shipState.findAllShips()) {
          // cybmine holds the claimed player's CHANNEL (C: a usernumber,
          // GECYBS.C:368) — matching on shipno released the wrong claims.
          if (s.status === 2 && victim.channel !== undefined && s.cybmine === victim.channel) {
            s.cybmine = 255;
          }
        }

        // In-flight cleanup — clear any other ship's incoming projectile slots
        // fired by the dead ship. Keyed on its channel: shipno is per-user, so
        // it used to clear a live player's incoming fire as well.
        if (victim.channel !== undefined) this.clearInFlightFromDeadFirer(victim.channel);
      } catch (err) {
        const id = shipKey(victim.userid, victim.shipno);
        const stack = err instanceof Error ? err.stack : String(err);
        this.logger.error(`Kill-resolution fault for ship ${id}: ${stack}`);
      }
    }
  }

  /**
   * After a firer dies, walk every other active ship's incoming torpedo /
   * missile slots and clear (channel = 255) any whose `.channel` references the
   * dead firer. Mirrors the firer-dies cleanup in GEFUNCS.C:1755-1778.
   */
  private clearInFlightFromDeadFirer(deadChannel: number): void {
    for (const carrier of this.shipState.findAllShips()) {
      for (let i = 0; i < MAXTORPS; i++) {
        if (carrier.ltorpsChannel[i] === deadChannel) {
          this.clearTorpSlot(carrier, i);
        }
      }
      for (let i = 0; i < MAXMISSL; i++) {
        if (carrier.lmisslChannel[i] === deadChannel) {
          this.clearMisslSlot(carrier, i);
        }
      }
    }
  }

  /**
   * Like findShipByChannel but does not require excluding the carrier (used
   * during kill-resolution where we want to find the attacker for a known
   * dead victim).
   */
  private findActiveAttackerByChannel(channel: number, victim: ShipState): ShipState | undefined {
    // Channels are unique per in-game ship (this port's `usrnum`), so the
    // attacker is a direct lookup. This used to scan for `s.shipno === channel`,
    // which matched the first ship in the map with that per-user index — i.e.
    // essentially any player's first ship — and handed them the kill, the loot
    // and the score. @see ShipChannelRegistry, GEMAIN.H:340
    if (channel < 0) return undefined;
    const attacker = this.shipState.findAllShips().find((s) => s.channel === channel);
    if (attacker === undefined) return undefined;
    if (shipKey(attacker.userid, attacker.shipno) === shipKey(victim.userid, victim.shipno)) return undefined;
    if (attacker.status !== 1 && attacker.status !== 2) return undefined;
    return attacker;
  }

  /** @see GEFUNCS.C:minesweep */
  private runMineSweep(ships: ShipState[], ctx: TickContext): void {
    this.mineRegistry.tickAll();
    const sweepMines = this.mineRegistry.sweepCandidates();
    for (const mine of sweepMines) {
      try {
        this.processMineSweep(mine, ships, ctx);
      } catch (err) {
        const stack = err instanceof Error ? err.stack : String(err);
        this.logger.error(`Mine sweep fault for mine ${mine.id}: ${stack}`);
      }
    }
  }

  private processMineSweep(mine: MineState, ships: ShipState[], ctx: TickContext): void {
    for (const ship of ships) {
      // Skip ships not in game.
      if (ship.status !== 1 && ship.status !== 2) continue;
      // Neutral zone (0,0) — ships inside sector (0,0) are immune to mines (R-3).
      if (isInNeutralZone(ship)) {
        continue;
      }

      // cdistance is in SECTORS; MINERANGE is 10000 RAW units (one sector), so
      // the comparison must be made in raw units. C does `ddist *= 10000`
      // before testing against MINERANGE — without it the guard never fires and
      // every ship in the galaxy sits inside the blast.
      // @see GEFUNCS.C:1428-1432
      const dist = cdistance(ship, mine) * 10_000;
      if (dist > MINERANGE) continue;

      if (mine.timer === 0) {
        // Detonate — apply damage, emit hit + detonation.
        let damageFactor = 100;
        try {
          damageFactor = this.shipClassCache.getDamageFactor(ship.shpclass);
        } catch {
          // fall back
        }
        const damage = mineFalloff(dist, damageFactor);
        // C branches solely on `shieldstat != SHIELDUP` (GECMDS.C:986).
    // shieldup() grants no charge (GEFUNCS.C:2409-2415), so a shield
    // raised on an empty capacitor still absorbs the next hit in full —
    // and blows on it. Requiring charge > 0 here handed full hull damage
    // to anyone who had just raised shields.
    const shieldUp = ship.shieldstat === 1;
        const channel = mine.channel;
        let hullDamage = damage;
        let shieldConsumed = 0;
        if (shieldUp) {
          // GEFUNCS.C:1447 — shields DIVIDE mine damage by (gernd()%5 +
          // shieldtype); hull damage is still applied (the common
          // `wptr->damage += damage` at GEFUNCS.C:1463 covers both branches).
          hullDamage = mineShieldedDamage(this.random, damage, ship.shieldtype);
          // GEFUNCS.C:1450 — drain uses the REDUCED damage plus 20.
          const r = shieldhit(ship.shield, ship.shieldtype, hullDamage + MINE_SHIELD_DRAIN_BONUS);
          const applied = hullDamage;
          this.shipState.mutate(ship.userid, ship.shipno, (v) => {
            v.damage = v.damage + applied;
            v.shield = r.newCharge;
            // Only a BLOWN shield goes out of action, and it goes into SHIELDDM
          // — not plain "down" — so `shi up` refuses until it is repaired.
          // @see GEFUNCS.C:2459-2462
          if (r.outcome === 'damaged') v.shieldstat = SHIELDDM;
            v.lastfired = channel;
          });
          shieldConsumed = r.shieldConsumed;
        } else {
          this.shipState.mutate(ship.userid, ship.shipno, (v) => {
            v.damage = v.damage + hullDamage;
            v.lastfired = channel;
          });
        }

        const sector = { x: Math.floor(ship.xcoord), y: Math.floor(ship.ycoord) };
        const hitEvent: CombatHitEvent = {
          attackerId: `?:${mine.channel}`,
          victimId: shipKey(ship.userid, ship.shipno),
          weapon: 'mine',
          damageHull: hullDamage,
          damageShield: shieldConsumed,
          sector,
          tickAt: ctx.firedAt,
        };
        this.events.emit(COMBAT_HIT, hitEvent);

        // @see GEFUNCS.C:randamage — called after every mine hit (GECMDS.C:1999)
        applyRandamageAndEmit(this.random, this.events, this.shipClassCache, ship, sector, ctx.firedAt);

        // Mine detonation: the mine is the "shooter"; MINERANGE is the cap.
        this.recordCombatEvent({
          weapon: 'mine',
          shooter: { x: mine.xcoord, y: mine.ycoord },
          target: { x: ship.xcoord, y: ship.ycoord },
          maxRange: MINERANGE,
        });

        const det: CombatMineDetonationEvent = {
          mineId: mine.id,
          channel: mine.channel,
          sector: { x: Math.floor(mine.xcoord), y: Math.floor(mine.ycoord) },
          tickAt: ctx.firedAt,
        };
        this.events.emit(COMBAT_MINE_DETONATION, det);
      } else if (ship.jammer === 0) {
        // Proximity warning — mine in range but not yet armed. C prints MINE6
        // with BEARING and DISTANCE (GEFUNCS.C:1472-1478), and suppresses it
        // entirely while the ship is jammed. The bearing is the entire value of
        // the warning: it is what lets a pilot steer away from a mine that will
        // otherwise do up to MNDAMMAX to them.
        const warn: CombatMineWarningEvent = {
          mineId: mine.id,
          victimId: shipKey(ship.userid, ship.shipno),
          sector: { x: Math.floor(mine.xcoord), y: Math.floor(mine.ycoord) },
          bearing: Math.round(cbearing(ship, mine, ship.heading)),
          distance: Math.trunc(cdistance(ship, mine) * 10_000),
          tickAt: ctx.firedAt,
        };
        this.events.emit(COMBAT_MINE_WARNING, warn);
      }
    }

    // Destroy mine if its time is up.
    if (mine.timer === 0) {
      void this.mineRepo.delete(mine.id).catch((err: unknown) => {
        const stack = err instanceof Error ? err.stack : String(err);
        this.logger.error(`Mine repo delete fault for mine ${mine.id}: ${stack}`);
      });
      this.mineRegistry.remove(mine.id);
    }
  }

  /** Per-ship combat work — filled in by subsequent user-story phases. */
  private processShipCombat(ship: ShipState, ctx: TickContext): void {
    // Phaser reload: phasr += phasrtype * PRELOAD, capped at class maxPhaser.
    // Only ships with a phaser mounted accumulate charge (phasrtype > 0).
    // Interceptor double-reload bonus (shpclass==2) is commented out in shipped C.
    // @see GEFUNCS.C:checkdam line 1031
    // Negative phasr is handled only by the 1s ship-update tick (GEFUNCS.C:1015-1018 checkdam).
    // The 6s reload must not lift negative phasr — gate requires phasr >= 0.
    if (ship.phasrtype > 0 && ship.phasr >= 0 && ship.phasr < 100) {
      // C wraps the whole preload in `if (useenergy(ptr,usrn,PENGUSE) == 1)`,
      // and useenergy refuses unless `energy >= amount + 500` — spending
      // nothing and charging nothing when it refuses. Charging unconditionally
      // and clamping energy at zero let a flat ship keep its phasers topped up
      // for free. @see GEFUNCS.C:1028 checkdam, GEFUNCS.C:1500-1514 useenergy
      const debit = tryEnergyDebit(ship.energy, PENGUSE, USEENERGY_RESERVE);
      if (debit.ok) {
        const reloadAmt = phaserReloadAmount(ship.phasrtype);
        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.phasr = Math.min(100, s.phasr + reloadAmt);
          s.energy = debit.newEnergy;
        });
      }
    }

    // Decoy slot expiry — each active decoy decrements toward 0 each tick.
    // Jammer counter expiry — decrement until 0.
    // cantexit (FR-028a) — battle-lock counter; decremented BEFORE hit
    // resolution so a hit during this tick that re-arms cantexit to
    // FIRETICKS sticks at FIRETICKS rather than FIRETICKS-1.
    // @see GECMDS.C:cmd_decoy, GECMDS.C:cmd_jammer
    const hasDecoy = ship.decout.some((t) => t > 0);
    const hasJammer = ship.jammer > 0;
    const hasCantexit = ship.cantexit > 0;
    if (hasDecoy || hasJammer || hasCantexit) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        for (let i = 0; i < s.decout.length; i++) {
          if (s.decout[i] > 0) s.decout[i] -= 1;
        }
        if (s.jammer > 0) s.jammer -= 1;
        if (s.cantexit > 0) s.cantexit -= 1;
      });
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

      // Decoy intercept: one roll per LIVE decoy, and the slot that wins is
      // spent. @see GEFUNCS.C:1581-1592
      if (newDist < TORP_DECOY_THRESHOLD) {
        const slot = tryDecoyIntercept(this.random, carrier.decout, DECODDS);
        if (slot >= 0) {
          this.consumeDecoy(carrier, slot);
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

      // @see GEFUNCS.C:1666-1677 — same per-slot loop as torpedoes.
      if (newDist < MISSILE_DECOY_THRESHOLD) {
        const slot = tryDecoyIntercept(this.random, carrier.decout, DECODDS);
        if (slot >= 0) {
          this.consumeDecoy(carrier, slot);
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

      // The stored charge is an energy value, NOT a damage cap — it is
      // normalised against MISSILE_CHARGE_MAX inside rollMissileHullDamage.
      // @see GEFUNCS.C:1620-1660
      const charge = carrier.lmisslEnergy[i] ?? MISSILE_CHARGE_MAX;
      this.resolveProjectileHit(carrier, ch, 'missile', charge, ctx);
      this.clearMisslSlot(carrier, i);
    }
  }

  /** Burn out the decoy that just did its job: `dptr[j] = 0`. @see GEFUNCS.C:1588 */
  private consumeDecoy(carrier: ShipState, slot: number): void {
    this.shipState.mutate(carrier.userid, carrier.shipno, (s) => {
      s.decout[slot] = 0;
    });
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
    let damageFactor = 100;
    try {
      damageFactor = this.shipClassCache.getDamageFactor(carrier.shpclass);
    } catch {
      // fall back to default
    }
    // C branches solely on `shieldstat != SHIELDUP` (GECMDS.C:986).
    // shieldup() grants no charge (GEFUNCS.C:2409-2415), so a shield
    // raised on an empty capacitor still absorbs the next hit in full —
    // and blows on it. Requiring charge > 0 here handed full hull damage
    // to anyone who had just raised shields.
    const shieldUp = carrier.shieldstat === 1;
    // GEFUNCS.C:1552-1576 — hull damage is applied in BOTH branches. Shields
    // halve the roll and cost charge; they are not immunity.
    //
    // Torpedoes and missiles differ on both rolls: a torpedo's `dmgMax` is
    // already TDAMMAX, while a missile's is a 1..50000 charge that has to be
    // normalised first, and a missile through raised shields rolls rndm(.1)
    // rather than rndm(.5). @see GEFUNCS.C:1641-1659
    const hullDamage =
      weapon === 'missile'
        ? rollMissileHullDamage(this.random, dmgMax, damageFactor, shieldUp)
        : rollProjectileHullDamage(this.random, dmgMax, damageFactor, shieldUp);
    let shieldConsumed = 0;
    if (shieldUp) {
      // Torpedo drain is an independent 10..29 roll in C, NOT the hull damage;
      // a missile instead drains in proportion to the charge it carried.
      // @see GEFUNCS.C:1563 (torp) and GEFUNCS.C:1649-1651 (missile)
      const drain =
        weapon === 'missile'
          ? missileShieldDrain(this.random, dmgMax, damageFactor)
          : SHIELD_DRAIN_MIN + Math.floor(this.random.next() * SHIELD_DRAIN_SPREAD);
      const r = shieldhit(carrier.shield, carrier.shieldtype, drain);
      this.shipState.mutate(carrier.userid, carrier.shipno, (v) => {
        v.damage = v.damage + hullDamage;
        v.shield = r.newCharge;
        // Only a BLOWN shield goes out of action, and it goes into SHIELDDM
          // — not plain "down" — so `shi up` refuses until it is repaired.
          // @see GEFUNCS.C:2459-2462
          if (r.outcome === 'damaged') v.shieldstat = SHIELDDM;
        v.lastfired = attackerChannel;
        v.cantexit = FIRETICKS;
      });
      shieldConsumed = r.shieldConsumed;
    } else {
      this.shipState.mutate(carrier.userid, carrier.shipno, (v) => {
        v.damage = v.damage + hullDamage;
        v.lastfired = attackerChannel;
        v.cantexit = FIRETICKS;
      });
    }

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
      damageHull: hullDamage,
      damageShield: shieldConsumed,
      sector: { x: Math.floor(carrier.xcoord), y: Math.floor(carrier.ycoord) },
      tickAt: ctx.firedAt,
    };
    this.events.emit(COMBAT_HIT, hitEvent);

    // @see GEFUNCS.C:randamage — called after every hit, outside shield if/else (GECMDS.C:999,1082)
    applyRandamageAndEmit(this.random, this.events, this.shipClassCache, carrier, { x: Math.floor(carrier.xcoord), y: Math.floor(carrier.ycoord) }, ctx.firedAt);
  }

  /**
   * Look up the ship holding a channel. Skips the carrier itself. Returns
   * undefined if the firer has left the game — C nulls the reference the same
   * way (GEFUNCS.C:1224).
   */
  private findShipByChannel(channel: number, carrier: ShipState): ShipState | undefined {
    if (channel < 0) return undefined;
    const found = this.shipState.findAllShips().find((s) => s.channel === channel);
    if (found === undefined) return undefined;
    if (shipKey(found.userid, found.shipno) === shipKey(carrier.userid, carrier.shipno)) return undefined;
    if (found.status !== 1 && found.status !== 2) return undefined;
    return found;
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
