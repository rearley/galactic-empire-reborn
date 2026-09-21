import { tryEnergyDebit, cbearing } from '../physics/physics-math';
import { BeforeApplicationShutdown, Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { isInNeutralZone } from './neutral-zone';
import { COMBAT_TARGET_WARNING, CombatTargetWarningEvent } from './combat-events';
import { SHIP_PHASER_CHARGE, ShipPhaserChargeEvent } from '../ship/repair-events';
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
  PMINFIRE,
  GESTAT_AUTO,
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
import { attackerNameFromLastFired, LootTransfer, resolveKillSpoils } from './kill-resolution';
import {
  AiFireEventForInvariants,
  CombatEventForInvariants,
  pushBounded,
} from '../invariants/runtime-events';
import { releaseDeadTarget } from '../cybertron/cyb-transitions';
import { CybTraceService } from '../cybertron/cyb-trace.service';

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
export class CombatTickService implements OnModuleInit, BeforeApplicationShutdown {
  private unsubscribe?: Unsubscribe;

  /**
   * Non-null only while shutting down: the promises returned by the
   * COMBAT_SHIP_DESTROYED listeners, so the drain can wait for their database
   * work instead of racing process exit. @see beforeApplicationShutdown
   */
  private shutdownWrites: Promise<unknown>[] | null = null;

  constructor(
    private readonly tickService: TickService,
    private readonly shipState: ShipStateService,
    private readonly mineRepo: MineRepository,
    private readonly mineRegistry: MineRegistry,
    @Inject(RANDOM) private readonly random: Random,
    private readonly events: EventEmitter2,
    private readonly logger: Logger,
    private readonly shipClassCache: ShipClassCacheService,
    // Records a released claim in the holder's `sys trace`. Optional so the
    // hand-built harnesses keep compiling; untraced, the release still happens.
    @Optional() private readonly trace?: CybTraceService,
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
  /**
   * Announce a kill. On a live tick this is a plain synchronous emit; during
   * shutdown it uses `emitAsync` and keeps the listeners' promises, because the
   * hull DELETE and the score transfer are fire-and-forget and would otherwise
   * lose their race with process exit. @see beforeApplicationShutdown
   */
  private emitDestroyed(event: CombatShipDestroyedEvent): void {
    if (this.shutdownWrites) {
      this.shutdownWrites.push(this.events.emitAsync(COMBAT_SHIP_DESTROYED, event));
      return;
    }
    this.events.emit(COMBAT_SHIP_DESTROYED, event);
  }

  /**
   * Settle kills that are owed before the process goes away.
   *
   * A ship dies on the PHYSICS tick once `damage >= 100`, so up to six seconds
   * can pass between the shot that kills it and the kill being resolved. Stop
   * the server inside that window and the corpse walks: `damage` is a persisted
   * column, but the attacker's identity is not — `attackerSnapshot` is rebuilt
   * each tick and `lastfiredBy` has no column, while `lastfired` holds a CHANNEL
   * number that means nothing once everyone has reconnected. The first physics
   * tick after boot then kills the ship with `attacker=none`, and since
   * `resolveKillSpoils` needs an attacker, the kill, the score and the entire
   * hold are destroyed rather than transferred.
   *
   * Seen in production on 2026-09-08: a Sarten Obliterator died four seconds
   * after a watchtower redeploy carrying 1,146 gold, credited to nobody.
   *
   * Nest runs every `onModuleDestroy` before any `beforeApplicationShutdown`,
   * and TickService stops its timers there, so this cannot race a live tick.
   *
   * Canon has no counterpart: its server did not redeploy underneath a fight.
   */
  async beforeApplicationShutdown(): Promise<void> {
    this.shutdownWrites = [];
    try {
      this.runKillResolution({
        kind: TickKind.PHYSICS,
        tickNumber: -1,
        firedAt: new Date(),
      });
      const writes = this.shutdownWrites;
      if (writes.length > 0) {
        this.logger.log(`shutdown: settling ${writes.length} kill(s) before exit`);
        await Promise.allSettled(writes);
      }
    } catch (err: unknown) {
      // A failure here must not stop the process from shutting down.
      this.logger.error(`shutdown kill drain failed: ${err instanceof Error ? err.stack : String(err)}`);
    } finally {
      this.shutdownWrites = null;
    }
  }

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
    // Channels held by a ship still in the game, taken before any removal.
    // A recorded name is only trusted for a channel nobody holds any more.
    const liveChannels = new Set<number>();
    for (const s of ships) if (s.channel !== undefined) liveChannels.add(s.channel);
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
        //
        // The fallback is the killer who LOGGED OFF in the same tick. leave()
        // has already scrubbed the victim's `lastfired` by then, so no channel
        // lookup can name them — `lastfiredBy`, recorded when the damage
        // landed, is the only surviving evidence.
        // @see attackerNameFromLastFired
        // A collision names the body, not a person: `deathCause` is set by the
        // physics tick and outranks any stale `lastfiredBy`, because a pilot
        // who was shot at and then flew into a planet was killed by the planet.
        shipname: ship.deathCause
          ? ship.deathCause.what
          : attacker
            ? attacker.shipname
            : attackerNameFromLastFired(ship, (c) => liveChannels.has(c), ship.channel),
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
        // @see GEFUNCS.C:1116-1136, GEMAIN.C:1420
        const lootDropped: LootTransfer[] = [];
        const loot: LootTransfer[] = attacker
          ? resolveKillSpoils(victim, attacker, {
              mutate: (userid, shipno, fn) => this.shipState.mutate(userid, shipno, fn),
              maxTonsFor: (shpclass) => this.shipClassCache.getMaxTons(shpclass),
              random: this.random,
              onDropped: (t) => lootDropped.push(t),
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
          victimShipname: victim.shipname,
          victimClass: victim.shpclass,
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
          //
          // A COLLISION is the one cause we can name here, because the physics
          // tick recorded it on the ship this same tick.
          // `deathCause` is the more specific fact and outranks the last weapon
          // to touch the hull: a ship grazed by a torpedo and then flown into a
          // planet was killed by the planet. Otherwise report what actually
          // landed — `null` only when nothing recorded anything at all, which
          // is a genuine gap rather than a default.
          //
          // Every kind of `deathCause` wins here, not just gravity: the test
          // used to name one because gravity was the only kind there was.
          // @see issue #52 (the weapon half), issue #54 (the rest)
          cause: victim.deathCause?.kind ?? victim.lastWeapon ?? null,
          sector: { x: Math.floor(victim.xcoord), y: Math.floor(victim.ycoord) },
          tickAt: ctx.firedAt,
          loot,
          ...(lootDropped.length > 0 ? { lootDropped } : {}),
          scoreAwarded,
        };
        this.emitDestroyed(event);

        // Remove from active state map.
        this.shipState.removeFromGame(victim);

        // Clear cybmine on any Cybertron targeting the dead ship so they don't
        // immediately re-engage the player when they respawn. PORT-ORIGINAL:
        // canon's killem releases only the killer's claim.
        // @see cyb-transitions.ts releaseDeadTarget
        for (const s of this.shipState.findAllShips()) {
          // cybmine holds the claimed player's CHANNEL (C: a usernumber,
          // GECYBS.C:368) — matching on shipno released the wrong claims.
          if (s.status === GESTAT_AUTO && victim.channel !== undefined && s.cybmine === victim.channel) {
            const release = (): void => releaseDeadTarget(s);
            if (this.trace) {
              this.trace.transition(shipKey(s.userid, s.shipno), s, 'releaseDeadTarget', release,
                `${victim.username ?? victim.shipname} was destroyed`);
            } else release();
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
        // The layer's NAME, captured while they are still in the map. A mine
        // outlives its owner's session, so this is exactly the case a later
        // channel re-resolve cannot answer. @see attackerNameFromLastFired
        const mineOwnerName =
          this.shipState.findAllShips().find((m) => m.channel === channel)?.shipname ?? null;
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
            v.lastfiredBy = mineOwnerName === null ? undefined : { channel, name: mineOwnerName };
            v.lastWeapon = 'mine';
          });
          shieldConsumed = r.shieldConsumed;
        } else {
          this.shipState.mutate(ship.userid, ship.shipno, (v) => {
            v.damage = v.damage + hullDamage;
            v.lastfired = channel;
            v.lastfiredBy = mineOwnerName === null ? undefined : { channel, name: mineOwnerName };
            v.lastWeapon = 'mine';
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

  /**
   * PHSRUP / PHSRMAX — the bank reporting it can fire, and that it is full.
   * @see GEFUNCS.C:1037, :1046
   */
  private emitPhaserCharge(
    ship: ShipState, level: ShipPhaserChargeEvent['level'], ctx: TickContext,
  ): void {
    this.events.emit(SHIP_PHASER_CHARGE, {
      shipId: shipKey(ship.userid, ship.shipno),
      level,
      tickAt: ctx.firedAt,
    } satisfies ShipPhaserChargeEvent);
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

        // Canon tests the CROSSING before adding the charge, so PHSRUP fires
        // once — on the tick the bank becomes able to fire at all — rather than
        // on every tick above the threshold.
        // @see GEFUNCS.C:1035-1039
        const crossesMinimum = ship.phasr < PMINFIRE && ship.phasr + reloadAmt >= PMINFIRE;
        const reachesFull = ship.phasr + reloadAmt >= 100;

        this.shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.phasr = Math.min(100, s.phasr + reloadAmt);
          s.energy = debit.newEnergy;
        });

        if (crossesMinimum) this.emitPhaserCharge(ship, 'minimum', ctx);
        if (reachesFull) this.emitPhaserCharge(ship, 'full', ctx);
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
    // Canon's `flag`: one RED ALERT per TICK however many are tracking.
    // @see GEFUNCS.C:1595-1603
    let stillTracking = false;
    for (let i = 0; i < MAXTORPS; i++) {
      const ch = carrier.ltorpsChannel[i];
      if (ch === undefined || ch === 255) continue;

      // FR-027.3: carrier left game mid-flight — silently clear.
      if (!carrierIngame) {
        this.clearTorpSlot(carrier, i);
        continue;
      }

      const oldDist = carrier.ltorpsDistance[i] ?? 0;

      // A slot at distance 0 is DORMANT, not arrived — anything that cancels a
      // torpedo does it by zeroing the distance, and without this guard
      // `0 - TORPSPED` falls straight through to hit resolution and detonates
      // the cancelled torpedo on the target.
      //
      // The threshold is 0, not canon's 1, and that is a DELIBERATE deviation
      // on determinable intent. Canon opens this walk with
      // @see GEFUNCS.C:1548 `	if (tptr->distance > 1)`
      // while the still-flying branch eleven lines later asks
      // `if (tptr->distance > 0)` — two thresholds for one liveness question in
      // one loop. A torpedo decrements only while `distance > torpsped`, so it
      // can come to rest on exactly 1 and is then skipped FOREVER: never
      // detonating, never clearing, holding one of MAXTORPS 3 tubes for the
      // life of the hull. @see docs/DECISIONS.md 2026-09-15
      if (oldDist <= 0) {
        this.clearTorpSlot(carrier, i);
        continue;
      }

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
        stillTracking = true;
        continue;
      }

      // Hit resolution.
      this.resolveProjectileHit(carrier, ch, 'torpedo', TDAMMAX, ctx);
      this.clearTorpSlot(carrier, i);
    }

    if (stillTracking) this.raiseInboundAlert(carrier, 'torpedo-inbound');
  }

  /**
   * The tracking alert canon prints to the ship being chased, once per tick,
   * for as long as something is closing on it. This is the cue a pilot acts on
   * — it is what makes `decoy` a reaction rather than a guess.
   *
   * TORP1 and MISSL1 take no argument: canon tells you something is tracking
   * you, not who fired it.
   *
   * @see GEFUNCS.C:1600 (TORP1), :1685 (MISSL1)
   */
  private raiseInboundAlert(
    carrier: ShipState,
    kind: 'torpedo-inbound' | 'missile-inbound',
  ): void {
    this.events.emit(COMBAT_TARGET_WARNING, {
      victimId: shipKey(carrier.userid, carrier.shipno),
      kind,
      attackerLetter: '',
      tickAt: new Date(),
    } satisfies CombatTargetWarningEvent);
  }

  /**
   * Walk `carrier.lmissl[]` (incoming missiles). Same pattern as torpedoes
   * but uses `MISLSPED`, `MISSILE_DECOY_THRESHOLD`, and the per-missile
   * stored `lmisslEnergy[i]` as the damage cap.
   */
  private processIncomingMissiles(carrier: ShipState, ctx: TickContext): void {
    const carrierIngame = carrier.status === 1 || carrier.status === 2;
    // Canon's `flag` again — one alert per tick, not one per missile.
    // @see GEFUNCS.C:1680-1688
    let stillTracking = false;
    for (let i = 0; i < MAXMISSL; i++) {
      const ch = carrier.lmisslChannel[i];
      if (ch === undefined || ch === 255) continue;
      // Canon's liveness test is DISTANCE, not the channel:
      // `for (i=0,mptr=ptr->lmissl;i<MAXMISSL;++i,++mptr) if (mptr->distance > 0)`
      // (GEFUNCS.C:1611-1613). Guarding only on the channel meant anything that
      // zeroed a distance -- the warp shake, for one -- left a slot that was
      // still walked, went negative, and detonated.
      if ((carrier.lmisslDistance[i] ?? 0) <= 0) continue;

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

      // Canon's missile test is STRICT, unlike the torpedo's:
      //
      //   if (mptr->distance < mislsped)      GEFUNCS.C:1615   missile
      //   if (tptr->distance <= torpsped)     GEFUNCS.C:1550   torpedo
      //
      // So a missile sitting at exactly MISLSPED does NOT detonate this tick.
      // It falls to the else, is walked down to zero, and the `distance > 0`
      // guard skips it forever after. The asymmetry looks like a typo in the
      // original and is canon all the same; this port had the torpedo rule on
      // both, so a missile at exactly one tick's travel hit a tick early.
      if (newDist >= 0) {
        this.shipState.mutate(carrier.userid, carrier.shipno, (s) => {
          s.lmisslDistance[i] = newDist;
        });
        if (newDist > 0) stillTracking = true;
        continue;
      }

      // The stored charge is an energy value, NOT a damage cap — it is
      // normalised against MISSILE_CHARGE_MAX inside rollMissileHullDamage.
      // @see GEFUNCS.C:1620-1660
      const charge = carrier.lmisslEnergy[i] ?? MISSILE_CHARGE_MAX;
      this.resolveProjectileHit(carrier, ch, 'missile', charge, ctx);
      this.clearMisslSlot(carrier, i);
    }

    if (stillTracking) this.raiseInboundAlert(carrier, 'missile-inbound');
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
    // The firer's NAME, read now rather than re-resolved at kill time: a
    // torpedo in flight can outlive its firer's session, and the channel scrub
    // in ShipStateService.leave() would leave nothing behind to look up.
    const firerName =
      this.findShipByChannel(attackerChannel, carrier)?.shipname ?? null;
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
        v.lastfiredBy = firerName === null ? undefined : { channel: attackerChannel, name: firerName };
        v.lastWeapon = weapon;
      });
      shieldConsumed = r.shieldConsumed;
    } else {
      this.shipState.mutate(carrier.userid, carrier.shipno, (v) => {
        v.damage = v.damage + hullDamage;
        v.lastfired = attackerChannel;
        v.lastfiredBy = firerName === null ? undefined : { channel: attackerChannel, name: firerName };
        v.lastWeapon = weapon;
      });
    }

      // NO battle lock here. `checktm` touches `cantexit` exactly once, at the
      // top of the function, and only to count it DOWN:
      //
      //   if (ptr->cantexit > 0)
      //     --(ptr->cantexit);
      //
      // Every `= FIRETICKS` in the original is in GECMDS.C, at FIRE or LOCK
      // time — `lockon` arms both ships when the tube is locked, several ticks
      // before the torpedo arrives. Re-arming on IMPACT extended the window in
      // which neither ship could leave, on every hit, for the whole flight of
      // a volley. @see GEFUNCS.C:1541 `--(ptr->cantexit);`
    const attacker = this.findShipByChannel(attackerChannel, carrier);

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
