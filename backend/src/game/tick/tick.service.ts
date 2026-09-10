import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TickContext, TickHandler, TickKind, Unsubscribe } from './tick.types';
import { TickOrder } from './tick-order';

/** A registered handler and its position in canon's warrtia sequence. */
interface OrderedHandler {
  handler: TickHandler;
  order: number;
}
import { InvariantRegistry } from '../invariants/harness';
import { WorldSnapshot } from '../invariants/invariants.types';

/** Keys on WorldSnapshot a snapshot provider may populate. */
export type SnapshotKey = Exclude<keyof WorldSnapshot, undefined>;
/** Returns a slice value for one WorldSnapshot key (or undefined to skip). */
export type SnapshotProvider = () => unknown;

/**
 * Drives the three game heartbeats using raw setInterval managed in lifecycle hooks.
 * No @nestjs/schedule — reserved for feature 009's midnight @Cron.
 * @see GEMAIN.C main loop (TICKTIME=6s physics, TICKTIME2=1s ship update)
 * @see GEMAIN.H TICKTIME, TICKTIME2
 * @see GEMAIN.C:656 plantime = plantock / numrecs (PLANET_UPDATE cadence)
 */
@Injectable()
export class TickService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TickService.name);
  private shipUpdateTimer: NodeJS.Timeout | null = null;
  private physicsTimer: NodeJS.Timeout | null = null;
  private planetUpdateTimer: NodeJS.Timeout | null = null;
  private planetUpdateIntervalMs: number | null = null;

  private readonly handlers: Map<TickKind, OrderedHandler[]> = new Map([
    [TickKind.SHIP_UPDATE, []],
    [TickKind.PHYSICS, []],
    [TickKind.PLANET_UPDATE, []],
  ]);

  /**
   * Services self-register slice providers via `registerSnapshotProvider`.
   * The map is consulted only when `INVARIANTS_RUNTIME=1`, but providers
   * always register at module init so flipping the flag mid-session is cheap.
   */
  private readonly snapshotProviders: Map<SnapshotKey, SnapshotProvider> = new Map();

  constructor(private readonly invariants: InvariantRegistry) {}

  private tickNumbers: Record<TickKind, number> = {
    [TickKind.SHIP_UPDATE]: 0,
    [TickKind.PHYSICS]: 0,
    [TickKind.PLANET_UPDATE]: 0,
  };

  onModuleInit(): void {
    this.tickNumbers = {
      [TickKind.SHIP_UPDATE]: 0,
      [TickKind.PHYSICS]: 0,
      [TickKind.PLANET_UPDATE]: 0,
    };
    this.shipUpdateTimer = setInterval(() => this.fire(TickKind.SHIP_UPDATE), 1000);
    this.physicsTimer = setInterval(() => this.fire(TickKind.PHYSICS), 6000);
    console.log('[Nest] LOG [TickService]     Started SHIP_UPDATE @1000ms, PHYSICS @6000ms');
  }

  onModuleDestroy(): void {
    if (this.shipUpdateTimer !== null) {
      clearInterval(this.shipUpdateTimer);
      this.shipUpdateTimer = null;
    }
    if (this.physicsTimer !== null) {
      clearInterval(this.physicsTimer);
      this.physicsTimer = null;
    }
    if (this.planetUpdateTimer !== null) {
      clearInterval(this.planetUpdateTimer);
      this.planetUpdateTimer = null;
    }
    console.log('[Nest] LOG [TickService]     Stopped SHIP_UPDATE, PHYSICS, PLANET_UPDATE');
  }

  /**
   * Start the PLANET_UPDATE timer with a cadence computed by PlanetTickService.
   * Idempotent: calling twice clears the prior timer and starts fresh.
   * @see GEMAIN.C:656 plantime = plantock / numrecs
   */
  startPlanetUpdateTimer(intervalMs: number): void {
    if (this.planetUpdateTimer !== null) {
      clearInterval(this.planetUpdateTimer);
    }
    this.planetUpdateIntervalMs = intervalMs;
    this.planetUpdateTimer = setInterval(() => this.fire(TickKind.PLANET_UPDATE), intervalMs);
  }

  /**
   * Register a handler for a tick kind. Returns an idempotent unsubscribe function.
   * Registering the same handler reference twice for the same kind is a no-op.
   *
   * `order` places the handler in canon's `warrtia` sequence — LOWER RUNS
   * EARLIER. It is not decoration: `fluxstat` runs before `cloakstat` in
   * GEMAIN.C:2256-2259 so a starving ship reloads before its cloak is tested,
   * and this port had that pair backwards because handlers fired in whatever
   * order Nest constructed them. Use the named values in `TickOrder` rather
   * than a literal, so the reason for a position is written down next to it.
   *
   * Omitting `order` puts the handler at the BACK. A handler with no stated
   * ordering requirement must never be able to displace one that has.
   *
   * @see ./tick-order.ts
   */
  subscribe(kind: TickKind, handler: TickHandler, order: number = TickOrder.DEFAULT): Unsubscribe {
    const list = this.handlers.get(kind)!;
    if (!list.some((e) => e.handler === handler)) {
      // Stable insert: ahead of the first entry with a HIGHER order, so
      // handlers sharing an order keep registration order between them.
      const at = list.findIndex((e) => e.order > order);
      const entry = { handler, order };
      if (at === -1) list.push(entry);
      else list.splice(at, 0, entry);
    }
    return () => {
      const l = this.handlers.get(kind)!;
      const i = l.findIndex((e) => e.handler === handler);
      if (i !== -1) l.splice(i, 1);
    };
  }

  /** Returns current tick counters for the debug endpoint. */
  getStats(): Record<TickKind, number> {
    return { ...this.tickNumbers };
  }

  private fire(kind: TickKind): void {
    this.tickNumbers[kind]++;
    const ctx: TickContext = { kind, tickNumber: this.tickNumbers[kind], firedAt: new Date() };
    this.dispatch(kind, ctx);
    if (kind === TickKind.PHYSICS && process.env.INVARIANTS_RUNTIME === '1') {
      const violations = this.invariants.runAll(this.snapshotForInvariants());
      if (violations.length > 0) {
        this.logger.warn(
          `invariant violations: ${violations
            .map((v) => `${v.rule}(${v.severity}):${v.detail}`)
            .join('; ')}`,
        );
      }
    }
  }

  /**
   * Register a provider for one slice of the WorldSnapshot. Called by services
   * (ShipStateService, CombatTickService, AI tick services, PhaserHandlerService)
   * at module init. Re-registering the same key replaces the prior provider.
   *
   * Population is opt-in per key: any key without a provider is left undefined
   * and the corresponding invariant short-circuits via its narrowing helper.
   *
   * NOTE: `scanResults` is intentionally left without a runtime provider this
   * round — the scan-range invariant runs primarily under Jest. The Task 8
   * plan §"Recent scan results" defers the live wiring.
   *
   * NOTE: `dbShips` is deferred (P-021 in specs/022-fidelity-audit-v2/findings.md).
   * Populating it requires an async pre-fetch keyed on the in-memory ship map
   * — the `inMemoryShipMatchesDb` / `noOrphanShipState` invariants tolerate
   * `dbShips` being undefined (they early-return `[]`).
   */
  registerSnapshotProvider(key: SnapshotKey, provider: SnapshotProvider): void {
    this.snapshotProviders.set(key, provider);
  }

  private snapshotForInvariants(): WorldSnapshot {
    const snap: WorldSnapshot = {};
    for (const [key, provider] of this.snapshotProviders) {
      try {
        const value = provider();
        if (value !== undefined) (snap as Record<string, unknown>)[key] = value;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`snapshot provider for "${key}" threw: ${msg}`);
      }
    }
    return snap;
  }

  /** @see GEMAIN.C main loop — one bad subscriber must not stop siblings or the next tick. */
  private dispatch(kind: TickKind, ctx: TickContext): void {
    // Snapshot: a handler may unsubscribe during dispatch (destruct does).
    for (const { handler } of [...this.handlers.get(kind)!]) {
      try {
        const result = handler(ctx);
        if (result instanceof Promise) {
          result.catch((err: unknown) => {
            console.error(`[TickService] async handler error on ${kind} tick ${ctx.tickNumber}:`, err);
          });
        }
      } catch (err) {
        console.error(`[TickService] handler error on ${kind} tick ${ctx.tickNumber}:`, err);
      }
    }
  }
}
