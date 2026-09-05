import { I_MEN, I_FOOD } from '../constants/items';
import { clampRateToBudget, RateClampResult } from './rate-budget';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NEUTRAL_ZONE_SECTOR } from '../combat/neutral-zone';
import { MAXPLNTS } from '../constants';
import { PrismaService } from '../../prisma/prisma.service';
import { ShipStateService } from '../ship/ship-state.service';
import { AdminChange, PlanetState, planetKey } from './planet-state.types';
import { prismaPlanetToState, stateToPrismaUpdate } from './planet-state.mappers';
import { applyEconomyTick, applyNeutralZoneRestock, isNeutralZoneRestockPlanet } from './planet-economy';
import { PlanetEconomyService } from './planet-economy.service';
import { computeBuyOutcome, computeSellOutcome } from './planet-trade';
import { TAXRATE_MAX } from '../commands/handlers/helpers/tax-rate';
import { resolvePlanetPassword } from './planet-password';
import { OnEvent } from '@nestjs/event-emitter';
import { MIDNIGHT_COMPLETED } from '../midnight/midnight-events';

/**
 * The neutral-zone planets midnight restocks: Zygor-3 (all items) and
 * Nexus Prime (men, food, troops). @see midnight.repository.ts
 */
const NEUTRAL_ZONE_POSTS = [1, 2] as const;

/**
 * In-memory authoritative source of truth for planet economic state.
 * Write-through to Postgres on every mutation (no dirty flag — research Decision 1).
 * Per-planet async mutex prevents lost-update races (research Decision 2).
 * @see contracts/planet-state-service.md
 */
/**
 * Production rate a freshly claimed colony starts men and food at.
 * @see GEMAIN.C:2914-2915 mnu_admenu1
 */
const CLAIM_START_RATE = 50;

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

  /**
   * Re-read one planet's row into the in-memory map, discarding the live copy.
   *
   * For writers that bypass this service and update Postgres directly — the
   * only one today is midnight's `refreshNeutralZone`, which restocks the two
   * neutral-zone trading posts. Everything in play reads the map, so without
   * this the restock refills a copy nobody reads and the hub shop stays empty
   * until the process restarts.
   *
   * A missing row leaves the map untouched: planets are never deleted, so a
   * miss means a bad key or a racing write, neither of which should evict live
   * state.
   */
  async reloadPlanet(xsect: number, ysect: number, plnum: number): Promise<void> {
    const row = await this.prisma.planet.findFirst({ where: { xsect, ysect, plnum } });
    if (!row) {
      this.logger.warn(`reloadPlanet: no row for (${xsect},${ysect},${plnum})`);
      return;
    }
    const state = prismaPlanetToState(row);
    this.map.set(planetKey(state.xsect, state.ysect, state.plnum), state);
  }

  /**
   * Re-read the two neutral-zone trading posts after midnight restocked them.
   *
   * `refreshNeutralZone` writes Postgres inside the midnight transaction, but
   * every read in play goes through this map — so without this the restock
   * refilled a row nobody reads. The posts are not immune to the drain: they
   * carry 1,032,000 men, so `shouldRunEconomy` is true for them and each
   * PLANTOCK consumes their food and starves their troops exactly as it would
   * a colony's. Over days of uptime Zygor ran out and stayed out until the
   * process restarted.
   *
   * @see midnight.repository.ts refreshNeutralZone
   * @see GEMAIN.C:2147-2175 — "Updating Zygor" / "Updating T-station"
   */
  @OnEvent(MIDNIGHT_COMPLETED)
  async onMidnightCompleted(): Promise<void> {
    for (const plnum of NEUTRAL_ZONE_POSTS) {
      await this.reloadPlanet(NEUTRAL_ZONE_SECTOR.x, NEUTRAL_ZONE_SECTOR.y, plnum);
    }
    this.logger.log('reloaded neutral-zone trading posts after midnight restock');
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
  /**
   * Planets in a sector, ordered by plnum — the live view.
   *
   * GalaxyService keeps its own planet read-model, but it hydrates once at boot
   * and is never updated, so ownership and names there go stale the moment
   * anyone claims, renames or abandons a colony. Scans read this instead:
   * otherwise a claimed planet still shows as unowned and unnamed, players fly
   * to it, and only the landing refusal tells them it was taken.
   */
  bySector(xsect: number, ysect: number): PlanetState[] {
    return this.all()
      .filter((p) => p.xsect === xsect && p.ysect === ysect)
      .sort((a, b) => a.plnum - b.plnum);
  }

  /** Case-insensitive lookup by planet name across the galaxy. */
  byName(name: string): PlanetState | undefined {
    const needle = name.trim().toLowerCase();
    if (needle.length === 0) return undefined;
    return this.all().find((p) => p.name.toLowerCase() === needle);
  }

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

      // C hands the new owner a working colony: every production rate is zeroed
      // and men/food are set to 50 (GEMAIN.C:2908-2916 mnu_admenu1). Without it
      // a first world sat producing nothing until the pilot found `adm rate`,
      // and a re-claimed planet silently kept its last owner's settings.
      for (const item of state.items) {
        item.rate = 0;
      }
      state.items[I_MEN].rate = CLAIM_START_RATE;
      state.items[I_FOOD].rate = CLAIM_START_RATE;

      await this.prisma.planet.update({
        where: { xsect_ysect_plnum: { xsect, ysect, plnum } },
        data: stateToPrismaUpdate(state),
      });

      // C: `++waruptr->planets` in wonplnt() (GECMDS.C:4001). Without it a pilot
      // who had just claimed their first world was told "Planets: none." by
      // `rep acc` while `pla` listed it — the counter only came right at
      // midnight, when it is rebuilt from actual ownership.
      await this.prisma.user.updateMany({
        where: { userid },
        data: { planets: { increment: 1 } },
      });

      return { ok: true as const };
    });
  }

  /**
   * Release a planet the caller owns — the canonical `aba`.
   *
   * C clears `plptr->userid` and decrements the owner's planet counter, and
   * touches nothing else: the name, stock, production rates, cash, tax rate,
   * beacon and password all stay, so whoever claims it next inherits the colony
   * as it stands. Per-mutation flush, serialized per planet like `claim`.
   *
   * @see GECMDS.C:3420 cmd_abandon
   */
  async abandonPlanet(
    xsect: number,
    ysect: number,
    plnum: number,
    userid: string,
  ): Promise<{ ok: true; name: string } | { ok: false; reason: 'NOT_FOUND' | 'NOT_OWNER' }> {
    const key = planetKey(xsect, ysect, plnum);
    return this.runSerialized(key, async () => {
      const state = this.map.get(key);
      if (!state) return { ok: false as const, reason: 'NOT_FOUND' as const };

      // C: `if (sameas(plptr->userid, warsptr->userid))` — anything else, ABAN03.
      if (state.userid !== userid) {
        return { ok: false as const, reason: 'NOT_OWNER' as const };
      }

      const name = state.name;
      state.userid = null;

      await this.prisma.planet.update({
        where: { xsect_ysect_plnum: { xsect, ysect, plnum } },
        data: stateToPrismaUpdate(state),
      });

      // C: `if (--waruptr->planets < 0) waruptr->planets = 0;`. The live cap
      // reads countOwnedBy(), so this counter is only what the roster shows
      // until midnight rebuilds it — but leaving it stale overstates the player.
      await this.prisma.user.updateMany({
        where: { userid, planets: { gt: 0 } },
        data: { planets: { decrement: 1 } },
      });

      return { ok: true as const, name };
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
    buyerCash: bigint,
  ): Promise<
    | { ok: true; transferred: number; unitPrice: number; totalCost: bigint }
    // `available` is the count C prints in BUY3 — see planet-trade.ts.
    | { ok: false; reason: 'AT_RESERVE'; available: number }
    | {
        ok: false;
        reason:
          | 'SELL_FLAG_OFF'
          | 'CAPACITY_FULL'
          | 'WONT_FIT'
          | 'INSUFFICIENT_FUNDS'
          | 'NOT_FOUND';
      }
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
        buyerCash,
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
  ): Promise<
    | { ok: true; rateClamp?: RateClampResult }
    | { ok: false; reason: 'NOT_OWNER' | 'INVALID' | 'NOT_FOUND' }
  > {
    return this.runSerialized(key, async () => {
      const state = this.map.get(key);
      if (!state) return { ok: false as const, reason: 'NOT_FOUND' as const };
      if (state.userid !== requesterUserid) return { ok: false as const, reason: 'NOT_OWNER' as const };

      let rateClamp: RateClampResult | undefined;

      switch (change.type) {
        case 'rate': {
          if (change.itemIndex < 0 || change.itemIndex >= state.items.length || change.value < 0) {
            return { ok: false as const, reason: 'INVALID' as const };
          }
          // Rates share ONE 100% budget across all items (GEMAIN.C:3539-3560).
          // The clamp lives at the point of SETTING; the production loop trusts
          // whatever it is handed, which is why reading GEPLANET.C alone made
          // unlimited rates look legitimate. @see rate-budget.ts
          const clamp = clampRateToBudget(
            state.items.map((it) => it.rate),
            change.itemIndex,
            change.value,
          );
          state.items[change.itemIndex].rate = clamp.value;
          rateClamp = clamp;
          break;
        }
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
          // C's ceiling is 100 (GEMAIN.C:3224). @see handlers/helpers/tax-rate.ts
          if (change.value < 0 || change.value > TAXRATE_MAX) {
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
        case 'password': {
          if (change.value.length > 10) {
            return { ok: false as const, reason: 'INVALID' as const };
          }
          // "none"/"team" are keywords that also drive the planet's team lock;
          // storing the raw word left team access inert and let a teamless
          // owner's `adm password team` admit anyone typing "team".
          // @see planet-password.ts, GEMAIN.C:3266-3290
          const resolved = resolvePlanetPassword(change.value, change.ownerTeamcode);
          state.password = resolved.password;
          state.teamcode = resolved.teamcode;
          break;
        }
        default: {
          const _: never = change;
          return { ok: false as const, reason: 'INVALID' as const };
        }
      }

      await this.prisma.planet.update({
        where: { xsect_ysect_plnum: { xsect: state.xsect, ysect: state.ysect, plnum: state.plnum } },
        data: stateToPrismaUpdate(state),
      });

      return { ok: true as const, rateClamp };
    });
  }

  /**
   * Withdraw the entire accumulated tax pool to the requester.
   * Per-mutation flush. @see GECMDS.C:cmd_with
   */
  async withdrawTax(
    key: string,
    requesterUserid: string,
    /** Amount to move; omit to take the whole pool. @see helpers/withdraw-amount.ts */
    requested?: bigint,
  ): Promise<
    | { ok: true; amount: bigint }
    | { ok: false; reason: 'NOT_OWNER' | 'NOT_FOUND' }
  > {
    return this.runSerialized(key, async () => {
      const state = this.map.get(key);
      if (!state) return { ok: false as const, reason: 'NOT_FOUND' as const };
      if (state.userid !== requesterUserid) return { ok: false as const, reason: 'NOT_OWNER' as const };

      // C moves the amount asked for and leaves the rest (GEMAIN.C:3098).
      const amount = requested === undefined ? state.tax : requested;
      if (amount > state.tax) return { ok: false as const, reason: 'NOT_FOUND' as const };
      state.tax = state.tax - amount;

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

      // The GE22e restock is not conditional on the economy having run: both
      // patch blocks sit at the top level of `plarti`'s loop, after the
      // `multiply()` gate, and fire for the hub record on every pass.
      // @see GEMAIN.C:2145-2178
      const isHub = isNeutralZoneRestockPlanet(state);

      // Skip unowned planets — matches GEMAIN.C:2130 `plptr->userid[0] != 0` guard.
      if (state.userid === null && !isHub) return;

      if (state.userid !== null) {
        // Delegate to PlanetEconomyService when wired (production); otherwise
        // fall back to the pure tick formula (legacy unit-test path).
        const newState = this.economy
          ? (await this.economy.applyTick(state)).state
          : applyEconomyTick(state);
        // Copy mutated fields back
        Object.assign(state, newState);
      }

      // ...and immediately undo the MAXPL clamp on the two trading posts, as C
      // does on the same pass. Without this the hub sold MAXPL quantities for
      // the whole day between midnights — 5 spies, 250 ion cannons, no gold.
      if (isHub) {
        Object.assign(state, applyNeutralZoneRestock(state));
      }

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

