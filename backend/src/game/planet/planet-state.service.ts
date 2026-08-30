import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NEUTRAL_ZONE_SECTOR } from '../combat/neutral-zone';
import { MAXPLNTS } from '../constants';
import { PrismaService } from '../../prisma/prisma.service';
import { ShipStateService } from '../ship/ship-state.service';
import { AdminChange, PlanetState, planetKey } from './planet-state.types';
import { prismaPlanetToState, stateToPrismaUpdate } from './planet-state.mappers';
import { applyEconomyTick } from './planet-economy';
import { PlanetEconomyService } from './planet-economy.service';
import { computeBuyOutcome, computeSellOutcome } from './planet-trade';

/**
 * In-memory authoritative source of truth for planet economic state.
 * Write-through to Postgres on every mutation (no dirty flag — research Decision 1).
 * Per-planet async mutex prevents lost-update races (research Decision 2).
 * @see contracts/planet-state-service.md
 */
@Injectable()
export class PlanetStateService implements OnModuleInit {
  private readonly logger = new Logger(PlanetStateService.name);
  private readonly map = new Map<string, PlanetState>();
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ships: ShipStateService,
    /**
     * Optional — when omitted (legacy unit-test wiring) the pure
     * `applyEconomyTick` formula is used directly with no revolt branch.
     * Production wiring via PlanetModule injects PlanetEconomyService so
     * the revolt branch (FR-028) fires.
     */
    private readonly economy?: PlanetEconomyService,
  ) {}

  async onModuleInit(): Promise<void> {
    const rows = await this.prisma.planet.findMany();
    for (const row of rows) {
      const state = prismaPlanetToState(row);
      this.map.set(planetKey(state.xsect, state.ysect, state.plnum), state);
    }
    this.logger.log(`hydrated ${this.map.size} planets from Postgres`);
  }

  /** Returns the live PlanetState for a given (xsect, ysect, plnum), or undefined. */
  get(xsect: number, ysect: number, plnum: number): PlanetState | undefined {
    return this.map.get(planetKey(xsect, ysect, plnum));
  }

  /** All currently-loaded planets, in stable insertion order. Snapshot copy. */
  all(): PlanetState[] {
    return Array.from(this.map.values());
  }

  /** Number of planets currently in the in-memory map. */
  size(): number {
    return this.map.size;
  }

  /**
   * Public per-planet mutex for use by the attack handler.
   * The caller acquires the lock, re-validates preconditions, mutates state,
   * and flushes to Postgres — all inside a single serialized section.
   * Serializes all att invocations against the same planet (research.md D1).
   * @see GECMDS.C:3515 cmd_attack — per-planet serialization point
   */
  async withPlanetLock<T>(xsect: number, ysect: number, plnum: number, fn: () => Promise<T>): Promise<T> {
    const key = planetKey(xsect, ysect, plnum);
    return this.runSerialized(key, fn);
  }

  /**
   * Flush a specific planet's in-memory state to Postgres.
   * Called from within the attack lock after combat resolution.
   * @see planet-state.service.ts runSerialized — flush is always called inside the lock
   */
  async flushPlanet(xsect: number, ysect: number, plnum: number): Promise<void> {
    const state = this.map.get(planetKey(xsect, ysect, plnum));
    if (!state) return;
    await this.prisma.planet.update({
      where: { xsect_ysect_plnum: { xsect, ysect, plnum } },
      data: stateToPrismaUpdate(state),
    });
  }

  /**
   * Per-planet promise-chain mutex. All write methods acquire this before
   * touching in-memory state or Postgres. Mutations against different planets
   * do not contend (research Decision 2).
   */
  private async runSerialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(key, next.catch(() => undefined));
    return next;
  }

  /**
   * How many planets this player currently owns.
   *
   * MAXPLNTS is a PER-PLAYER cap in the original — GECMDS.C:3487 checks
   * `waruptr->planets`, the claiming user's own count, not a world total.
   */
  countOwnedBy(userid: string): number {
    let n = 0;
    for (const state of this.map.values()) {
      if (state.userid === userid) n++;
    }
    return n;
  }

  /**
   * Claim an unowned planet for `userid` with the given `name`.
   * Per-mutation flush. @see GECMDS.C:cmd_land — claim path
   */
  async claim(
    xsect: number,
    ysect: number,
    plnum: number,
    userid: string,
    name: string,
  ): Promise<{ ok: true } | { ok: false; reason: 'OWNED' | 'INVALID_NAME' | 'NOT_FOUND' | 'PLANET_LIMIT' | 'NEUTRAL_ZONE' }> {
    const key = planetKey(xsect, ysect, plnum);
    return this.runSerialized(key, async () => {
      // Nothing in the neutral zone (sector 0,0) is claimable. It holds the
      // trade hub where `new ship <N>` is bought and most trade happens, so a
      // player owning it distorts the whole early game.
      //
      // C creates these planets ALREADY OWNED — build_plan_1/build_plan_2 copy
      // `s00[idx].owner` into `planet.userid` (GEPLANET.C:671, 737) — and the
      // claim path only fires on an unowned planet (GECMDS.C:3486). Guarding on
      // the sector states that rule directly and holds even if a neutral-zone
      // planet is somehow released.
      if (xsect === NEUTRAL_ZONE_SECTOR.x && ysect === NEUTRAL_ZONE_SECTOR.y) {
        return { ok: false as const, reason: 'NEUTRAL_ZONE' as const };
      }

      const state = this.map.get(key);
      if (!state) return { ok: false as const, reason: 'NOT_FOUND' as const };

      // Per-player planet cap. @see GECMDS.C:3487 waruptr->planets >= max_plnts
      if (this.countOwnedBy(userid) >= MAXPLNTS) {
        return { ok: false as const, reason: 'PLANET_LIMIT' as const };
      }

      const trimmed = name.trim();
      if (
        trimmed.length < 1 ||
        trimmed.length > 19 ||
        !/^[\x20-\x7E]+$/.test(trimmed)
      ) {
        return { ok: false as const, reason: 'INVALID_NAME' as const };
      }

      if (state.userid !== null) {
        return { ok: false as const, reason: 'OWNED' as const };
      }

      state.userid = userid;
      state.name = trimmed;

      await this.prisma.planet.update({
        where: { xsect_ysect_plnum: { xsect, ysect, plnum } },
        data: stateToPrismaUpdate(state),
      });

      return { ok: true as const };
    });
  }

  /**
   * Buy semantics — see GECMDS.C:cmd_buy.
   * Serialized per planet. Inside neutral zone, planet state is NOT mutated.
   */
  async buy(
    key: string,
    buyerUserid: string,
    itemIndex: number,
    requestedQty: number,
    buyerCargoCapacityRemaining: number,
  ): Promise<
    | { ok: true; transferred: number; unitPrice: number; totalCost: bigint }
    | { ok: false; reason: 'SELL_FLAG_OFF' | 'AT_RESERVE' | 'CAPACITY_FULL' | 'NOT_FOUND' }
  > {
    return this.runSerialized(key, async () => {
      const state = this.map.get(key);
      if (!state) return { ok: false as const, reason: 'NOT_FOUND' as const };

      const isNeutralZone = state.xsect === 0 && state.ysect === 0;
      const outcome = computeBuyOutcome({
        planet: state,
        buyerIsOwner: state.userid === buyerUserid,
        itemIndex,
        requestedQty,
        buyerCargoCapacityRemaining,
        isNeutralZone,
      });

      if (!outcome.ok) return outcome;

      if (outcome.mutatePlanet) {
        state.items[itemIndex].qty -= BigInt(outcome.transferred);
        state.cash += outcome.totalCost;
        await this.prisma.planet.update({
          where: { xsect_ysect_plnum: { xsect: state.xsect, ysect: state.ysect, plnum: state.plnum } },
          data: stateToPrismaUpdate(state),
        });
      }

      return {
        ok: true as const,
        transferred: outcome.transferred,
        unitPrice: outcome.unitPrice,
        totalCost: outcome.totalCost,
      };
    });
  }

  /**
   * Sell at neutral-zone plnum=1 (galactic-market sink). Refuses elsewhere.
   * Critical section: cargo-sufficiency check AND ship-side cargo decrement
   * both happen inside runSerialized to prevent double-spend.
   * Planet state is NOT mutated; no planet flush.
   * The caller (handler) is responsible for user.cash credit.
   * @see GECMDS.C:cmd_sell, GECMDS.C:4127 (Zygor-3 location check)
   */
  async sell(
    key: string,
    sellerUserid: string,
    sellerShipno: number,
    itemIndex: number,
    requestedQty: number,
  ): Promise<
    | { ok: true; transferred: number; proceeds: bigint; fee: bigint }
    | { ok: false; reason: 'NOT_NEUTRAL_ZONE' | 'NOT_PLNUM_1' | 'INSUFFICIENT_CARGO' | 'NOT_FOUND' }
  > {
    return this.runSerialized(key, async () => {
      const state = this.map.get(key);
      if (!state) return { ok: false as const, reason: 'NOT_FOUND' as const };

      if (state.xsect !== 0 || state.ysect !== 0) {
        return { ok: false as const, reason: 'NOT_NEUTRAL_ZONE' as const };
      }
      if (state.plnum !== 1) {
        return { ok: false as const, reason: 'NOT_PLNUM_1' as const };
      }

      const ship = this.ships.get(sellerUserid, sellerShipno);
      const sellerShipQty = ship ? Number(ship.items[itemIndex] ?? 0n) : 0;

      const outcome = computeSellOutcome({
        itemIndex,
        requestedQty,
        sellerShipQty,
      });

      if (!outcome.ok) return outcome;

      // Ship-side cargo decrement inside the critical section to prevent double-spend
      this.ships.mutate(sellerUserid, sellerShipno, (s) => {
        s.items[itemIndex] = (s.items[itemIndex] ?? 0n) - BigInt(outcome.transferred);
      });

      // No planet flush — galactic-market sink

      return {
        ok: true as const,
        transferred: outcome.transferred,
        proceeds: outcome.proceeds,
        fee: outcome.fee,
      };
    });
  }

  /**
   * Apply a typed admin change. Refuses if requesterUserid !== state.userid.
   * Per-mutation flush. @see GECMDS.C:cmd_admin
   */
  async applyAdminChange(
    key: string,
    requesterUserid: string,
    change: AdminChange,
  ): Promise<{ ok: true } | { ok: false; reason: 'NOT_OWNER' | 'INVALID' | 'NOT_FOUND' }> {
    return this.runSerialized(key, async () => {
      const state = this.map.get(key);
      if (!state) return { ok: false as const, reason: 'NOT_FOUND' as const };
      if (state.userid !== requesterUserid) return { ok: false as const, reason: 'NOT_OWNER' as const };

      switch (change.type) {
        case 'rate':
          if (change.itemIndex < 0 || change.itemIndex >= state.items.length || change.value < 0) {
            return { ok: false as const, reason: 'INVALID' as const };
          }
          state.items[change.itemIndex].rate = change.value;
          break;
        case 'markup':
          if (change.itemIndex < 0 || change.itemIndex >= state.items.length || change.value < 0) {
            return { ok: false as const, reason: 'INVALID' as const };
          }
          state.items[change.itemIndex].markup2a = change.value;
          break;
        case 'sellflag':
          if (change.itemIndex < 0 || change.itemIndex >= state.items.length) {
            return { ok: false as const, reason: 'INVALID' as const };
          }
          state.items[change.itemIndex].sell = change.value;
          break;
        case 'reserve':
          if (change.itemIndex < 0 || change.itemIndex >= state.items.length || change.value < 0) {
            return { ok: false as const, reason: 'INVALID' as const };
          }
          state.items[change.itemIndex].reserve = change.value;
          break;
        case 'taxrate':
          if (change.value < 0 || change.value > 119) {
            return { ok: false as const, reason: 'INVALID' as const };
          }
          state.taxrate = change.value;
          break;
        case 'beacon':
          if (change.value.length > 75) {
            return { ok: false as const, reason: 'INVALID' as const };
          }
          state.beacon = change.value;
          break;
        case 'password':
          if (change.value.length > 10) {
            return { ok: false as const, reason: 'INVALID' as const };
          }
          state.password = change.value;
          break;
        default: {
          const _: never = change;
          return { ok: false as const, reason: 'INVALID' as const };
        }
      }

      await this.prisma.planet.update({
        where: { xsect_ysect_plnum: { xsect: state.xsect, ysect: state.ysect, plnum: state.plnum } },
        data: stateToPrismaUpdate(state),
      });

      return { ok: true as const };
    });
  }

  /**
   * Withdraw the entire accumulated tax pool to the requester.
   * Per-mutation flush. @see GECMDS.C:cmd_with
   */
  async withdrawTax(
    key: string,
    requesterUserid: string,
  ): Promise<
    | { ok: true; amount: bigint }
    | { ok: false; reason: 'NOT_OWNER' | 'NOT_FOUND' }
  > {
    return this.runSerialized(key, async () => {
      const state = this.map.get(key);
      if (!state) return { ok: false as const, reason: 'NOT_FOUND' as const };
      if (state.userid !== requesterUserid) return { ok: false as const, reason: 'NOT_OWNER' as const };

      const amount = state.tax;
      state.tax = 0n;

      await this.prisma.planet.update({
        where: { xsect_ysect_plnum: { xsect: state.xsect, ysect: state.ysect, plnum: state.plnum } },
        data: stateToPrismaUpdate(state),
      });

      return { ok: true as const, amount };
    });
  }

  /**
   * Run one planet-update tick on the planet identified by key.
   * Used by PlanetTickService. Serialized per planet.
   * @see GEPLANET.C:multiply
   */
  async runEconomicTickFor(key: string): Promise<void> {
    return this.runSerialized(key, async () => {
      const state = this.map.get(key);
      if (!state) {
        this.logger.warn(`runEconomicTickFor: planet ${key} not found`);
        return;
      }

      // Skip unowned planets — matches GEMAIN.C:2132 `plptr->userid[0] != 0` guard.
      // Neutral-zone planets are unowned and refreshed by midnight instead.
      if (state.userid === null) return;

      // Delegate to PlanetEconomyService when wired (production); otherwise
      // fall back to the pure tick formula (legacy unit-test path).
      const newState = this.economy
        ? (await this.economy.applyTick(state)).state
        : applyEconomyTick(state);
      // Copy mutated fields back
      Object.assign(state, newState);

      await this.prisma.planet.update({
        where: { xsect_ysect_plnum: { xsect: state.xsect, ysect: state.ysect, plnum: state.plnum } },
        data: stateToPrismaUpdate(state),
      });
    }) as Promise<void>;
  }

  /**
   * Transfer items from ship cargo down to planet surface.
   * Caller must already hold the ship item in ship.items[itemIndex].
   * Requires requester to own the planet.
   * @see GECMDS.C:3300 trans_down
   */
  async depositToPlanet(
    key: string,
    requesterUserid: string,
    itemIndex: number,
    qty: bigint,
  ): Promise<{ ok: true } | { ok: false; reason: 'NOT_FOUND' | 'NOT_OWNER' }> {
    return this.runSerialized(key, async () => {
      const state = this.map.get(key);
      if (!state) return { ok: false as const, reason: 'NOT_FOUND' as const };
      if (state.userid !== requesterUserid) return { ok: false as const, reason: 'NOT_OWNER' as const };

      state.items[itemIndex].qty += qty;

      await this.prisma.planet.update({
        where: { xsect_ysect_plnum: { xsect: state.xsect, ysect: state.ysect, plnum: state.plnum } },
        data: stateToPrismaUpdate(state),
      });

      return { ok: true as const };
    });
  }

  /**
   * Transfer items from planet surface up to ship cargo.
   * Requires requester to own the planet (or planet to be unowned — pre-claim loot).
   * @see GECMDS.C:3354 trans_up
   */
  async withdrawFromPlanet(
    key: string,
    requesterUserid: string,
    itemIndex: number,
    qty: bigint,
  ): Promise<{ ok: true } | { ok: false; reason: 'NOT_FOUND' | 'NOT_OWNER' | 'INSUFFICIENT' }> {
    return this.runSerialized(key, async () => {
      const state = this.map.get(key);
      if (!state) return { ok: false as const, reason: 'NOT_FOUND' as const };

      // Allow owner OR unowned planet (trans_up from unclaimed planet)
      if (state.userid !== null && state.userid !== requesterUserid) {
        return { ok: false as const, reason: 'NOT_OWNER' as const };
      }

      if (state.items[itemIndex].qty < qty) {
        return { ok: false as const, reason: 'INSUFFICIENT' as const };
      }

      state.items[itemIndex].qty -= qty;

      await this.prisma.planet.update({
        where: { xsect_ysect_plnum: { xsect: state.xsect, ysect: state.ysect, plnum: state.plnum } },
        data: stateToPrismaUpdate(state),
      });

      return { ok: true as const };
    });
  }
}

