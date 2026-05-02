# Contract — `PlanetStateService`

In-memory authoritative source of truth for planet economic state, with
synchronous write-through to Postgres on every mutation.

## Module location

`backend/src/game/planet/planet-state.service.ts`

## Lifecycle

- `onModuleInit()` — runs after `GalaxyService.onModuleInit` (DI
  ordering via `PlanetModule` import of `GalaxyModule`). Reads every
  `Planet` row, hydrates the in-memory map, logs
  `hydrated <N> planets from Postgres`.
- `onModuleDestroy()` — none required (no timers; no buffered writes).

## Public surface

```ts
@Injectable()
export class PlanetStateService implements OnModuleInit {
  /** Returns the live PlanetState for a given (xsect, ysect, plnum), or undefined. */
  get(xsect: number, ysect: number, plnum: number): PlanetState | undefined;

  /** All currently-loaded planets, in stable insertion order. Snapshot copy. */
  all(): PlanetState[];

  /** Number of planets currently in the in-memory map. */
  size(): number;

  /**
   * Claim an unowned planet for `userid` with the given `name`.
   * Validates name. Refuses if already owned. Per-mutation flush.
   * @see GECMDS.C:cmd_land — claim path
   */
  claim(
    xsect: number, ysect: number, plnum: number,
    userid: string, name: string,
  ): Promise<{ ok: true } | { ok: false; reason: 'OWNED' | 'INVALID_NAME' | 'NOT_FOUND' }>;

  /**
   * Buy semantics — see GECMDS.C:cmd_buy.
   * Caller has already verified the ship is landed, the password (if any),
   * and the buyer's identity. Returns the actual quantity transferred and
   * the unit price used. Inside the neutral zone, planet state is NOT mutated
   * but the returned `transferred` is still > 0.
   *
   * Serialized per planet via runSerialized.
   */
  buy(
    planetKey: string,
    buyerUserid: string,
    itemIndex: number,
    requestedQty: number,
    buyerCargoCapacityRemaining: number,
  ): Promise<
    | { ok: true; transferred: number; unitPrice: number; totalCost: bigint }
    | { ok: false; reason: 'SELL_FLAG_OFF' | 'AT_RESERVE' | 'CAPACITY_FULL' | 'NOT_FOUND' }
  >;

  /**
   * Sell at neutral-zone plnum=1 (galactic-market sink). Refuses elsewhere.
   *
   * Critical-section ownership (matters under concurrency):
   *   - The cargo-sufficiency check AND the ship-side cargo decrement
   *     (ShipStateService.mutate → ship.items[itemIndex] -= transferred)
   *     BOTH happen inside this method's runSerialized(planetKey) block.
   *     This prevents two concurrent sell calls from both passing
   *     sufficiency before either deducts (lost-update / double-spend).
   *   - Planet state is NOT mutated; no planet flush.
   *   - The user-cash credit (user.cash += proceeds, prisma.user.update)
   *     is the HANDLER's responsibility, not this method's. Cash credit
   *     is safe to do outside the critical section because it is a
   *     monotonic increment on a different aggregate.
   *
   * @see GECMDS.C:cmd_sell, GECMDS.C:4127 (Zygor-3 location check)
   */
  sell(
    planetKey: string,
    sellerUserid: string,
    sellerShipno: number,
    itemIndex: number,
    requestedQty: number,
  ): Promise<
    | { ok: true; transferred: number; proceeds: bigint; fee: bigint }
    | { ok: false; reason: 'NOT_NEUTRAL_ZONE' | 'NOT_PLNUM_1' | 'INSUFFICIENT_CARGO' | 'NOT_FOUND' }
  >;

  /**
   * Apply a typed admin change. Refuses if `requesterUserid !== state.userid`.
   * Per-mutation flush.
   */
  applyAdminChange(
    planetKey: string,
    requesterUserid: string,
    change: AdminChange,
  ): Promise<{ ok: true } | { ok: false; reason: 'NOT_OWNER' | 'INVALID' | 'NOT_FOUND' }>;

  /**
   * Withdraw the entire accumulated tax pool to the requester.
   * Returns the amount withdrawn (can be 0). Per-mutation flush.
   */
  withdrawTax(
    planetKey: string,
    requesterUserid: string,
  ): Promise<
    | { ok: true; amount: bigint }
    | { ok: false; reason: 'NOT_OWNER' | 'NOT_FOUND' }
  >;

  /**
   * Run one planet-update tick on the planet identified by key.
   * Used by PlanetTickService — not intended for direct caller use.
   * Serialized per planet so it interleaves correctly with player trades.
   *
   * @see GEPLANET.C:multiply
   */
  runEconomicTickFor(planetKey: string): Promise<void>;
}

export type AdminChange =
  | { type: 'rate';     itemIndex: number; value: number }
  | { type: 'markup';   itemIndex: number; value: number }
  | { type: 'sellflag'; itemIndex: number; value: boolean }
  | { type: 'reserve';  itemIndex: number; value: number }
  | { type: 'taxrate';  value: number }
  | { type: 'beacon';   value: string }
  | { type: 'password'; value: string };
```

## Serialization guarantees

- All mutating methods (`claim`, `buy`, `sell`, `applyAdminChange`,
  `withdrawTax`, `runEconomicTickFor`) wrap their body in
  `runSerialized(planetKey, ...)`. Read-only methods (`get`, `all`, `size`)
  do NOT take the lock.
- Two concurrent mutations against the same planet observe each other
  in serial order — final state matches *some* ordering of the inputs
  (FR-013, SC-005).
- Mutations against *different* planets do not contend.

## Pure-math integration

Mutation methods consume the pure-math modules to compute their effect:

```ts
// inside PlanetStateService.buy(...)
const outcome = computeBuyOutcome({
  planet: snapshotOf(state),                // read-only view
  buyerIsOwner: state.userid === buyerUserid,
  itemIndex,
  requestedQty,
  buyerCargoCapacityRemaining,
  isNeutralZone: state.xsect === 0 && state.ysect === 0,
});
// outcome: { ok: true, transferred, unitPrice, totalCost, mutatePlanet: boolean } | { ok: false, ... }
if (!outcome.ok) return outcome;
// Apply to in-memory state
if (outcome.mutatePlanet) {
  state.items[itemIndex].qty -= BigInt(outcome.transferred);
  state.cash += outcome.totalCost;
}
// Flush
await this.prisma.planet.update({ where, data: stateToPrismaUpdate(state) });
return outcome;
```

`planet-trade.ts` and `planet-economy.ts` perform NO Prisma I/O and NO
mutation of the snapshot they receive. The split keeps the formula unit-
testable in isolation and concentrates the per-mutation flush in exactly
one place per planet.

## Persistence guarantees

- Every successful mutation calls `prisma.planet.update` (and, where
  applicable, the relevant ship/user updates) before returning. The
  in-memory write and the Postgres write happen in the same async
  function; if the Postgres write throws, the in-memory mutation is
  rolled back (FR-018).
- There is no batched flush, no dirty flag, no tick-driven write.
- Crash-loss window is at most one in-flight operation per planet.

## Invariants (asserted in tests)

- `state.items.length === NUMITEMS` for every loaded planet.
- `state.name.length <= 19` after every successful `claim` or admin name
  edit (admin doesn't allow rename per FR-003 — invariant only relevant
  on claim).
- `state.password.length <= 10`, `state.beacon.length <= 75`.
- Owner can never become an empty string after claim — only the
  destruction path (feature 006) clears it back to null.
- `state.tax >= 0`, `state.cash >= 0` after any mutation completes.
