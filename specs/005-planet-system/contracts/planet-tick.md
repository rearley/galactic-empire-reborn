# Contract — `PLANET_UPDATE` tick + `PlanetTickService`

## Tick kind addition

`backend/src/game/tick/tick.types.ts`:

```ts
export enum TickKind {
  SHIP_UPDATE = 'SHIP_UPDATE',
  PHYSICS = 'PHYSICS',
  PLANET_UPDATE = 'PLANET_UPDATE',   // NEW
}
```

`TickService` is extended with:

```ts
private planetUpdateTimer: NodeJS.Timeout | null = null;
private planetUpdateIntervalMs: number | null = null;

/**
 * Start the PLANET_UPDATE timer with a cadence computed by the caller.
 * Called by PlanetTickService.onModuleInit AFTER planets are hydrated so
 * the cadence reflects the actual planet count.
 *
 * Idempotent: calling twice replaces the timer.
 *
 * @see GEMAIN.C:656 plantime = plantock / numrecs
 */
startPlanetUpdateTimer(intervalMs: number): void;
```

In `onModuleDestroy()`, the planet timer is cleared alongside the other
two.

## Cadence formula

```ts
// backend/src/game/planet/planet-tick.service.ts

const numrecs = planetStateService.size();
const intervalSec = Math.max(
  PLANTIME_MIN_SECONDS,                                  // 4
  Math.floor(PLANTOCK_SECONDS / Math.max(1, numrecs)),   // PLANTOCK / count
);
this.tickService.startPlanetUpdateTimer(intervalSec * 1000);
```

Properties:
- `numrecs == 0` → cadence falls back to `PLANTIME_MIN_SECONDS` (would
  fire on an empty galaxy — handler trivially no-ops). Defensive only;
  in practice `GalaxyService` produces ≥ 5 planets (the s00 fixture).
- `numrecs == 1` → cadence is `PLANTOCK_SECONDS` (1800s); planet ticks
  exactly once per lock-time window.
- Large `numrecs` clamped at `PLANTIME_MIN_SECONDS = 4s`. With 200 planets
  and 1800s lock-time the formula yields 9s — well above the floor.

## `PlanetTickService` shape

```ts
@Injectable()
export class PlanetTickService implements OnModuleInit {
  private cursor = 0;             // round-robin index into keys[]
  private keys: string[] = [];

  async onModuleInit(): Promise<void> {
    // Snapshot of planet keys at boot — order is the prisma find order
    // (stable across restarts barring DB-level reordering).
    this.keys = this.planets.all().map(p => planetKey(p.xsect, p.ysect, p.plnum));

    const intervalSec = Math.max(
      PLANTIME_MIN_SECONDS,
      Math.floor(PLANTOCK_SECONDS / Math.max(1, this.keys.length)),
    );
    this.logger.log(`PLANET_UPDATE cadence: every ${intervalSec}s `
      + `(plantock=${PLANTOCK_SECONDS}s, planets=${this.keys.length})`);

    this.tickService.subscribe(TickKind.PLANET_UPDATE, () => this.advance());
    this.tickService.startPlanetUpdateTimer(intervalSec * 1000);
  }

  /** Move the cursor; run economic tick on exactly one planet. */
  private async advance(): Promise<void> {
    if (this.keys.length === 0) return;
    const key = this.keys[this.cursor];
    this.cursor = (this.cursor + 1) % this.keys.length;
    await this.planets.runEconomicTickFor(key);
  }
}
```

## Round-robin guarantee

After `keys.length` firings of `PLANET_UPDATE`, every planet has been
touched exactly once. Verified by `planet-tick-roundrobin.spec.ts`:

```ts
// Pseudocode for the test
seedPlanets(5);
fakeAdvanceTime(intervalMs * 5);
expect(visitCounts).toEqual([1, 1, 1, 1, 1]);
```

## Failure isolation

- An exception thrown by `runEconomicTickFor` is caught inside the
  promise returned to `TickService.dispatch` (existing behavior in
  `tick.service.ts:67-79`). The cursor still advances — a poison-pill
  planet does not stop the tick.
- The error is logged once per occurrence with the planet key.

## Test contract

| Test | What it pins |
|---|---|
| `planet-tick-cadence.spec.ts` | The formula `floor(PLANTOCK / N)` clamped to `>= 4s` for representative N values (1, 5, 100, 450, 1800). |
| `planet-tick-roundrobin.spec.ts` | Every planet is visited at least once within `keys.length` firings. |
| `planet-economy.spec.ts` | The output of one `multiply()` call against a known input matches a hand-calculated golden value. |
| `balance-planet.spec.ts` | `PLANTOCK_SECONDS = 1800`, `PLANTIME_MIN_SECONDS = 4`, `NUMITEMS = 14`, frozen `BASEPRICE`/`MANHOURS`/`MAXPL` arrays. |

## Constitutional compliance

- Raw `setInterval` started in `OnModuleInit`, cleared in
  `OnModuleDestroy` (Constitution III).
- No `@Interval` decorator; Jest fake timers work against this timer the
  same way they do against the existing two.
- Single-process safety preserved — no leader election.
