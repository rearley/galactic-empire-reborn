# Restructure Phase 3 — Persistence Boundary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put `PrismaService` behind per-feature repositories so it appears in one place per feature instead of 46 files, retire the `forwardRef` cycle between ship, planet and tick, and give the test suite a shared typed ship factory — with zero change to gameplay or to what any query returns.

**Architecture:** This phase extends an existing pattern rather than inventing one. Six repositories already exist (`team`, `mine`, `mail-inbox`, `midnight`, `player-score`, `cybertron`); `backend/src/game/team/team.repository.ts` is the template every new one follows — an `@Injectable()` holding `PrismaService`, exposing intention-revealing async methods that return narrow shapes, each carrying the canon citation that justifies it. Work proceeds seam-first: the test-fixture factory lands before anything that would churn fixtures, exactly as the gateway test factory did in Phase 2.

**Tech Stack:** NestJS 10, TypeScript 6.0.3, Prisma 5, Jest 30, PostgreSQL 16.

**Spec:** `docs/superpowers/specs/2026-09-10-restructure-design.md` — the "Phase 3 — persistence boundary" section.

## Global Constraints

Copied from the spec and from standing project rules. Every task's requirements implicitly include these.

- **Zero gameplay change.** Every task is structural. A repository method must issue the *same query* against the *same model* returning the *same shape* as the call it replaces — same `where`, same `select`, same ordering, same `take`. If a move would change what a query returns, or how often a side effect runs, stop and report instead of doing it.
- **`VERSION` is NOT bumped during the restructure phases.** The version bump happens once, when the branch merges.
- **Branch is `restructure`. Nothing goes to master.** Do not touch `.github/workflows/ci.yml`'s `on:` block or the `if: github.event_name == 'push'` image gate.
- **Pre-existing defects get a GitHub issue, not a fix.** If a task turns up something already broken on `master` and unrelated to the task, **flag it in the report and carry on.** Do not fix it inline and do not fold it into the task. The controller files the issue. This is Rick's standing rule for the restructure: the whole backlog is resolved after the restructure completes, then playtested, and only then is merging discussed.
- **Never `prisma db push`. Never `prisma migrate reset`.** This phase changes NO schema. If you believe a task needs a migration, stop and report — that is a design error, not a step.
- **Run only ONE jest process at a time.** Concurrent runs race the shared `ge_test` database and produce phantom failures.
- **Never pipe a test run through `tail`/`head`.** It discards the failing test's name and masks the exit code. Redirect to a file and grep it.
- **`npm run lint` must stay at exit 0.** It is green as of this plan; do not regress it.
- **No `any`, no `as never`, no non-null assertions in new PRODUCTION code** (`backend/src/`). Test files may use casts for partial doubles.
- **The C source is authoritative.** Every `@see GEFUNCS.C:` / `GECMDS.C:` / `GEMAIN.C:` / `GEPLANET.C:` citation moves WITH the code it documents, unchanged. Do not re-derive, re-word or tidy a citation while relocating it. Read `reference/CLAUDE.md` before opening anything under `/reference/`; that tree is READ ONLY.
- **TDD.** Failing test first, watch the red, then implement.

## Baseline — measure before you start

Recorded 2026-09-11 on `restructure` at `541914b`:

| | value |
|---|---|
| files injecting `PrismaService` | 46 |
| of those, command handlers | 17 |
| `prisma.user.*` calls, repo-wide | 53 |
| `prisma.shipClass.*` calls in commands | 8 |
| `forwardRef` occurrences | 7, across 3 module files |
| test files building a `ShipState` inline (`cybskill:`, see Task 1 Step 5) | 260 |
| `as never` in `backend/test/` | 509 |
| backend suite | 617 suites / 6,295 tests |

**Where the Prisma calls actually are.** This is the fact that shapes the task
order — the sprawl is concentrated, not evenly spread:

| feature dir | files touching Prisma |
|---|---|
| `game/commands` | 17 |
| `game/ship`, `game/planet` | 3 each |
| `game/team`, `game/player`, `game/onboarding`, `game/midnight`, `game/mail` | 2 each |
| `gateway` | 3 |
| everything else | 1 each |

**And which models the command layer reaches for:**

| model | calls | operations |
|---|---|---|
| `user` | 23 | `update` 11, `findUnique` 10, `updateMany` 1, `findMany` 1 |
| `shipClass` | 8 | reads only |
| `wormhole` | 3 | reads |
| `team` | 3 | reads |
| `planet` | 1 | read |

The command layer's selects are narrow — `{ cash: true }` and `{ options: true }`
dominate — so a small intention-revealing `UserRepository` covers most of it.
**`shipClass` needs no new repository at all**: `ShipClassCacheService`
(`backend/src/game/physics/ship-class-cache.service.ts`) already loads the whole
table into a `Map` at boot.

## The template to follow

`backend/src/game/team/team.repository.ts`, 88 lines. Read it before writing any
repository. Its shape:

```ts
@Injectable()
export class TeamRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * <what this answers, in domain terms, and WHY the query is shaped this way>
   * @see GECMDS.C:5277 cmd_team
   */
  async findByNameLower(name: string): Promise<{ teamcode: bigint; teamname: string; password: string } | null> {
    return this.prisma.team.findFirst({ ... });
  }
}
```

Three properties to copy: the method name says what the caller WANTS, not which
Prisma verb runs; the return type is a narrow literal shape, not a Prisma model;
and the docblock explains the query's shape, carrying its canon citation.

---

### Task 1: The shared ship fixture factory

**Why first:** 334 test files build a `ShipState` inline. Every later task in this
phase changes a service that those fixtures feed. Without a single place to build
one, each repository task risks touching dozens of spec files for reasons that
have nothing to do with its own deliverable. This is the same seam that made
Phase 2's constructor changes two-file diffs instead of 43-file ones.

**This task changes ZERO production code.**

**Files:**
- Create: `backend/test/helpers/make-ship.ts`
- Create: `backend/test/helpers/make-ship.spec.ts`
- Modify: the migrated spec files (see Step 5 for how many)

**Interfaces:**
- Consumes: nothing.
- Produces: `makeShip(overrides?: Partial<ShipState>): ShipState`. Every later
  task uses it instead of hand-building a ship.

- [ ] **Step 1: Read the existing seed**

A local `makeShip` already exists at `backend/test/team/tea-subcommands.spec.ts:15`.
It is the shape to generalise. Read it and the real interface:

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
sed -n '15,40p' test/team/tea-subcommands.spec.ts
grep -n "export interface ShipState" -A80 src/game/ship/ship-state.types.ts
```

Note it ends with `as ShipState`. **Your factory must NOT need that cast** — it
returns a fully-populated `ShipState`, so the compiler can check it. If a field
makes that impossible, say which and why in your report.

- [ ] **Step 2: Write the failing test**

Create `backend/test/helpers/make-ship.spec.ts`:

```typescript
import { makeShip } from './make-ship';

describe('makeShip', () => {
  it('returns a ShipState with every field populated', () => {
    const ship = makeShip();
    expect(ship.userid).toBe('u1');
    expect(ship.shipno).toBe(1);
  });

  it('applies overrides over the defaults', () => {
    expect(makeShip({ shipname: 'Beta', damage: 40 })).toMatchObject({
      shipname: 'Beta',
      damage: 40,
      shipno: 1,
    });
  });

  it('gives each call its own arrays, so one test cannot mutate another', () => {
    const a = makeShip();
    const b = makeShip();
    a.freq.push(9);
    expect(b.freq).toEqual([0, 0, 0]);
  });

  it('defaults every domain-checked field inside its canon domain', () => {
    // These four are the fields test/invariants/fixture-domains.spec.ts guards.
    // topspeed is a warp FACTOR (real ships have 8, 10, 15), not raw units —
    // `topspeed: 8000` in fixtures once hid the Cybertron movement bug for 339
    // commits. @see MBMGESHP.MSG S**WARP `N 0 255`
    const s = makeShip();
    expect(s.topspeed).toBeGreaterThanOrEqual(0);
    expect(s.topspeed).toBeLessThanOrEqual(255);
    expect(s.shpclass).toBeGreaterThanOrEqual(0);
    expect(s.shpclass).toBeLessThanOrEqual(41);
    expect(s.phasrtype).toBeGreaterThanOrEqual(0);
    expect(s.phasrtype).toBeLessThanOrEqual(20);
    expect(s.percent).toBeGreaterThanOrEqual(0);
    expect(s.percent).toBeLessThanOrEqual(99);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/helpers/make-ship.spec.ts > /tmp/red.txt 2>&1; echo "exit=$?"
grep -E "Cannot find module|FAIL" /tmp/red.txt
```

Expected: FAIL — `Cannot find module './make-ship'`.

- [ ] **Step 4: Write the factory**

Create `backend/test/helpers/make-ship.ts`. Generalise the seed, with two changes
that matter:

- **Fresh arrays per call.** `freq`, `items`, `ltorpsChannel`, `decout` and the
  rest must be constructed inside the function, never shared module-level
  constants — a shared array mutated by one test corrupts the next.
- **Defaults inside the canon domains** that
  `backend/test/invariants/fixture-domains.spec.ts` enforces: `topspeed` 0-255
  (a warp factor), `shpclass` 0-41, `phasrtype`/`shieldtype` 0-20, `cloak`
  -200..10, `percent` 0-99.

Document why the factory exists, in the file, in the style of
`backend/test/helpers/make-gateway.ts`.

- [ ] **Step 5: Run it, then migrate the densest files**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/helpers/make-ship.spec.ts > /tmp/green.txt 2>&1; echo "exit=$?"
grep -E "^Tests:|FAIL" /tmp/green.txt
```

Then find where inline ships are densest and migrate **the top 15 files only**:

```bash
for f in $(grep -rl "cybskill:" test/); do echo "$(grep -c 'cybskill:' $f) $f"; done | sort -rn | head -15
```

**Count on `cybskill:`, not `xcoord:`.** A test legitimately passes `xcoord` as an
override when it cares about position, so that string does not distinguish "builds a
whole ship" from "overrides one field" — measured on it, this task's own migration
makes the number go UP. `cybskill` is a field almost nothing overrides, so it tracks
full inline builds. Baseline at the start of this phase: **260 files**.

**Migrate only those 15 in this task.** A 334-file sweep in one commit is
unreviewable, and unreviewable is how a real bug reached the end of Phase 2. The
remainder is Task 6's, in batches.

Run each file's spec after migrating it. If a file's inline ship deliberately
carries an out-of-domain value with a `domain-ok:` annotation, **keep that value
and the annotation** — pass it as an override.

- [ ] **Step 6: Full suite, then commit**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx tsc --noEmit; echo "tsc=$?"
npm run lint > /tmp/lint.txt 2>&1; echo "lint=$?"
npx jest > /tmp/full.txt 2>&1; echo "jest=$?"
grep -E "^Tests:|^Test Suites:|FAIL" /tmp/full.txt
```

```bash
git add test/helpers/make-ship.ts test/helpers/make-ship.spec.ts test/
git commit -m "test: one typed ship factory, and the 15 densest files onto it

334 spec files hand-build a ShipState. Each repository task in this phase
touches services those fixtures feed, so without one place to build a ship
every task risks a diff full of files it has no business changing."
```

---

### Task 2: `UserRepository`

**Why second:** `prisma.user` is 53 calls repo-wide, 23 of them in command
handlers — the single largest concentration in the codebase. The selects are
narrow (`{ cash: true }`, `{ options: true }`), so a handful of
intention-revealing methods replaces all of them.

**Files:**
- Create: `backend/src/game/player/user.repository.ts`
- Create: `backend/test/game/player/user.repository.spec.ts`
- Modify: `backend/src/game/player/player.module.ts` (register and export the provider)
- Modify: the command handlers that currently call `prisma.user.*`

**Interfaces:**
- Consumes: `makeShip` from Task 1 where a spec needs a ship.
- Produces: `class UserRepository`, injectable from any module importing
  `PlayerModule`. Tasks 3 and 4 do not depend on it.

- [ ] **Step 1: Inventory the calls before changing anything**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
grep -rn "prisma\.user\." src/ > /tmp/user-calls.txt
wc -l /tmp/user-calls.txt          # expect 53
grep -oE "prisma\.user\.[a-zA-Z]+" /tmp/user-calls.txt | sort | uniq -c
```

For each call record: the `where`, the `select`, and what the caller does with
the result. **Put that inventory in your report as a table** — it is how a
reviewer checks that each method preserves its query, and it is the deliverable
of this step.

Group them by INTENTION, not by Prisma verb. Calls that read `{ cash: true }` are
one method however many call sites they have.

- [ ] **Step 2: Write the failing test**

Create `backend/test/game/player/user.repository.spec.ts`. Assert the query shape,
because that is what must not change:

```typescript
import { UserRepository } from '../../../src/game/player/user.repository';

describe('UserRepository', () => {
  it('reads cash with a narrow select, not the whole row', async () => {
    const findUnique = jest.fn().mockResolvedValue({ cash: 500n });
    const repo = new UserRepository({ user: { findUnique } } as never);

    await expect(repo.getCash('usr_a')).resolves.toBe(500n);
    expect(findUnique).toHaveBeenCalledWith({
      where: { userid: 'usr_a' },
      select: { cash: true },
    });
  });

  it('returns null when the account is gone, rather than throwing', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const repo = new UserRepository({ user: { findUnique } } as never);
    await expect(repo.getCash('usr_missing')).resolves.toBeNull();
  });
});
```

Write one such case per method you identified in Step 1. **Derive each expected
`where`/`select` from the call you are replacing**, not from what looks tidy — an
added or dropped `select` field changes what the database returns.

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/game/player/user.repository.spec.ts > /tmp/red.txt 2>&1; echo "exit=$?"
grep -E "Cannot find module|FAIL" /tmp/red.txt
```

- [ ] **Step 4: Write the repository**

Create `backend/src/game/player/user.repository.ts` following
`backend/src/game/team/team.repository.ts`. Each method carries the canon
citation from the call site it replaces, moved unchanged.

- [ ] **Step 5: Repoint the callers, one file at a time**

Register the provider in `player.module.ts` and export it. Then replace call
sites file by file, running that file's spec after each.

**Do not batch this with a regex.** The `where` clauses vary and a mechanical
rewrite pairs the wrong one with the wrong method — the same failure mode
positional constructor arguments caused in Phase 2.

If a call site does something no method covers, add a method rather than reaching
past the repository for `prisma`. If you cannot, stop and report.

- [ ] **Step 6: Verify the boundary actually moved**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
grep -rn "prisma\.user\." src/ | grep -v "user.repository.ts"
```

Expected: no output, or a short list you name and justify in your report.

- [ ] **Step 7: Full suite, then commit**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx tsc --noEmit; echo "tsc=$?"
npm run lint > /tmp/lint.txt 2>&1; echo "lint=$?"
npx jest > /tmp/full.txt 2>&1; echo "jest=$?"
grep -E "^Tests:|^Test Suites:|FAIL" /tmp/full.txt
```

```bash
git add -A src/game/player src/game/commands test/
git commit -m "refactor(player): user reads and writes go through a repository"
```

---

### Task 3: Route `shipClass` reads through the cache that already exists

**Why:** the command layer makes 8 `prisma.shipClass` calls, and
`ShipClassCacheService` (`backend/src/game/physics/ship-class-cache.service.ts`)
already loads the entire table into a `Map` in `onModuleInit`. Those 8 calls are
querying a table the process has fully in memory. **No new repository here** —
this is deleting queries, not moving them.

**Files:**
- Modify: `backend/src/game/physics/ship-class-cache.service.ts` (only if a needed accessor is missing)
- Modify: the command handlers calling `prisma.shipClass.*`
- Test: the spec for each handler touched

**Interfaces:**
- Consumes: `ShipClassCacheService`'s existing accessors.
- Produces: no new type. Later tasks do not depend on this one.

- [ ] **Step 1: Compare what callers need against what the cache holds**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
grep -rn -A6 "prisma\.shipClass\." src/ > /tmp/shipclass-calls.txt
cat /tmp/shipclass-calls.txt
grep -n "select:" -A25 src/game/physics/ship-class-cache.service.ts
```

**This is the whole risk of the task.** If a caller selects a column the cache
does not load, you cannot serve it from the cache without widening the cache's
`select` — which changes what is read at boot. Widening it is acceptable and is
in scope; doing so *silently* is not. **Report every column you add and why.**

If a call reads a shipClass row that could have changed since boot, the cache is
the wrong answer for it — **leave that call alone and say so.**

- [ ] **Step 2: Write the failing test**

For each handler you convert, add a case to its existing spec asserting the
handler no longer queries the database for class data:

```typescript
it('reads the ship class from the boot-time cache, not the database', async () => {
  const findFirst = jest.fn();
  const shipClassCache = { getTypeName: jest.fn().mockReturnValue('Interceptor') };
  // ...build the handler with both, run the command...
  expect(shipClassCache.getTypeName).toHaveBeenCalled();
  expect(findFirst).not.toHaveBeenCalled();
});
```

Name the real accessor on `ShipClassCacheService` rather than inventing one.

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest <the specs you touched> > /tmp/red.txt 2>&1; echo "exit=$?"
grep -E "FAIL|●" /tmp/red.txt
```

- [ ] **Step 4: Convert the call sites**

Replace each query with a cache read. Canon citations move with the code.

- [ ] **Step 5: Verify, then commit**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
grep -rn "prisma\.shipClass\." src/ | grep -v "ship-class-cache.service.ts"
npx tsc --noEmit; echo "tsc=$?"
npx jest > /tmp/full.txt 2>&1; echo "jest=$?"
grep -E "^Tests:|^Test Suites:|FAIL" /tmp/full.txt
```

```bash
git add -A src/game test/
git commit -m "refactor(commands): ship-class lookups read the boot cache, not the table"
```

---

### Task 4: The remaining feature repositories, and the gateway's last two queries

**Files:**
- Create: `backend/src/game/galaxy/wormhole.repository.ts`
- Create: `backend/src/game/ship/ship.repository.ts`
- Modify: `backend/src/game/team/team.repository.ts` (add the methods the command layer needs)
- Modify: `backend/src/gateway/game.gateway.ts` — the two `prisma.ship.findFirst` calls
- Modify: the owning modules, to register and export each provider
- Test: one spec per new repository

**Interfaces:**
- Consumes: `makeShip` from Task 1.
- Produces: `WormholeRepository`, `ShipRepository`. Task 5 does not depend on them.

**The gateway's two calls are Phase 2 debt.** Phase 2's plan targeted zero Prisma
in the gateway and left two, at `game.gateway.ts:565` and `:629`, both
`prisma.ship.findFirst`. They were in onboarding/ship-select command handling, a
region Phase 2's task breakdown never assigned to anyone. They are recorded in
`docs/DECISIONS.md` and they are yours.

- [ ] **Step 1: Inventory what is left**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
grep -rn "this\.prisma\.\|prisma\." src/ --include=*.ts \
  | grep -v "\.repository\.ts\|prisma/prisma\.\|prisma/database-url" > /tmp/left.txt
cut -d: -f1 /tmp/left.txt | sort | uniq -c | sort -rn
```

Report the list. Some entries legitimately stay — `PrismaService` itself, the
health check, `auth.service.ts`. **Name which you are leaving and why** rather
than moving something into a repository just to empty a grep.

- [ ] **Step 2: Write the failing tests**

One spec per new repository, asserting query shape, in the style of Task 2's:

```typescript
import { ShipRepository } from '../../../src/game/ship/ship.repository';

describe('ShipRepository', () => {
  it('finds a captain\'s first hull by userid alone', async () => {
    const findFirst = jest.fn().mockResolvedValue({ userid: 'usr_a', shipno: 1 });
    const repo = new ShipRepository({ ship: { findFirst } } as never);

    await repo.findFirstForUser('usr_a');
    expect(findFirst).toHaveBeenCalledWith({ where: { userid: 'usr_a' } });
  });

  it('finds one specific hull by userid and shipno', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repo = new ShipRepository({ ship: { findFirst } } as never);

    await repo.findHull('usr_a', 2);
    expect(findFirst).toHaveBeenCalledWith({ where: { userid: 'usr_a', shipno: 2 } });
  });
});
```

**Take the exact `where` and `select` from the call you are replacing.** The two
gateway calls have no `select` — they read the whole row, and
`prismaShipToState` needs it. Preserve that.

- [ ] **Step 3: Run them and watch them fail**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/game/ship/ship.repository.spec.ts test/game/galaxy/wormhole.repository.spec.ts > /tmp/red.txt 2>&1; echo "exit=$?"
grep -E "Cannot find module|FAIL" /tmp/red.txt
```

- [ ] **Step 4: Write the repositories and repoint callers**

Follow `team.repository.ts`. Register each provider in its module.

For the gateway: it gains `ShipRepository` as a constructor dependency and loses
`PrismaService` if nothing else there uses it. **`backend/test/helpers/make-gateway.ts`
is the only test file that should need changing** — it fronts the constructor for
43 specs. Confirm with `git diff --stat backend/test/` before committing.

- [ ] **Step 5: Verify the gateway is finally clean**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
grep -c "this.prisma" src/gateway/game.gateway.ts    # expect 0
grep -rn "PrismaService" src/gateway/                 # expect only what you justify
```

- [ ] **Step 6: Full suite, then commit**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx tsc --noEmit; echo "tsc=$?"
npm run lint > /tmp/lint.txt 2>&1; echo "lint=$?"
npx jest > /tmp/full.txt 2>&1; echo "jest=$?"
grep -E "^Tests:|^Test Suites:|FAIL" /tmp/full.txt
```

```bash
git add -A src test/
git commit -m "refactor: wormhole and ship repositories, and the gateway's last two queries"
```

---

### Task 5: Break the ship / planet / tick cycle

**Why last of the implementation tasks:** it changes module wiring, which is the
one thing here that can fail at boot rather than in a test.

**The cycle, measured:**

| module | imports | for |
|---|---|---|
| `ship` | `forwardRef(() => PlanetModule)` | `PlanetStateService` in `maintenance.service.ts` and `ship-tick.service.ts`; `resolveIonCannonHit` from `planet/ion-cannon` |
| `planet` | `forwardRef(() => ShipModule)`, `forwardRef(() => TickModule)` | `ShipStateService` in `planet-attack.service.ts` and `planet-state.service.ts` |
| `tick` | `forwardRef(() => ShipModule)` | `ShipStateService` in `sector-transition.subscriber.ts` |

Neither side needs the whole of the other's state service. That is what the
spec means by "narrow interfaces at the injection seams".

**Files:**
- Create: `backend/src/game/ship/ship-state.port.ts`
- Create: `backend/src/game/planet/planet-state.port.ts`
- Modify: `backend/src/game/ship/ship.module.ts`, `planet/planet.module.ts`, `tick/tick.module.ts`
- Modify: the four consumer services named above
- Test: `backend/test/game/ship/ship-state.port.spec.ts`

**Interfaces:**
- Consumes: `makeShip` from Task 1.
- Produces: `SHIP_STATE_PORT` / `PLANET_STATE_PORT` injection tokens and their
  interfaces.

- [ ] **Step 1: Establish what each consumer actually uses**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
grep -n "shipState\.\|shipStateService\." src/game/planet/planet-attack.service.ts src/game/planet/planet-state.service.ts src/game/tick/sector-transition.subscriber.ts | grep -oE "\.[a-zA-Z]+\(" | sort | uniq -c
grep -n "planetState\." src/game/ship/maintenance.service.ts src/game/ship/ship-tick.service.ts | grep -oE "\.[a-zA-Z]+\(" | sort | uniq -c
```

The port interface is **exactly** that method list — no more. Put both lists in
your report.

- [ ] **Step 2: Write the failing test**

Create `backend/test/game/ship/ship-state.port.spec.ts`:

```typescript
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import type { ShipStatePort } from '../../../src/game/ship/ship-state.port';

describe('ShipStatePort', () => {
  it('is satisfied by the real ShipStateService', () => {
    // A compile-time assertion: if ShipStateService stops satisfying the port,
    // this file fails to compile, which is the point. The runtime assertion is
    // incidental.
    const port: ShipStatePort = {} as ShipStateService;
    expect(port).toBeDefined();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx jest test/game/ship/ship-state.port.spec.ts > /tmp/red.txt 2>&1; echo "exit=$?"
grep -E "Cannot find module|FAIL" /tmp/red.txt
```

- [ ] **Step 4: Define the ports**

```ts
// backend/src/game/ship/ship-state.port.ts
import type { ShipState } from './ship-state.types';

/** What the planet and tick subsystems need from ship state, and nothing more. */
export interface ShipStatePort {
  // exactly the methods Step 1 found, with their real signatures
}

export const SHIP_STATE_PORT = Symbol('SHIP_STATE_PORT');
```

Mirror it for `PlanetStatePort` / `PLANET_STATE_PORT`.

- [ ] **Step 5: Bind the tokens and drop the `forwardRef` calls**

Provide each token from the module that owns the implementation, export it, and
import the token rather than the module on the consuming side. Change consumers
to `@Inject(SHIP_STATE_PORT) private readonly ships: ShipStatePort`.

Remove the `forwardRef` wrappers **only once the cycle is actually gone**. If one
proves load-bearing for a reason Step 1 did not reveal, leave it, and report what
it is — a `forwardRef` that genuinely masks nothing is better than a broken boot.

- [ ] **Step 6: Prove the app still boots**

`tsc` does not prove Nest DI. Boot the real `AppModule` far enough to see it
report a successful start, confirm no `UnknownDependenciesException`, then stop
it. **Paste the literal output into your report.** A DI failure here is a hard
crash at startup, not a degraded path.

- [ ] **Step 7: Full suite, then commit**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
grep -rn "forwardRef" src/     # expect none, or only ones you justified
npx tsc --noEmit; echo "tsc=$?"
npm run lint > /tmp/lint.txt 2>&1; echo "lint=$?"
npx jest > /tmp/full.txt 2>&1; echo "jest=$?"
grep -E "^Tests:|^Test Suites:|FAIL" /tmp/full.txt
```

```bash
git add -A src test/
git commit -m "refactor(game): narrow ports retire the ship/planet/tick forwardRefs"
```

---

### Task 6: Sweep the remaining inline ship fixtures

**Why separate, and why last:** Task 1 migrated the 15 densest files. Roughly 300
remain. This is mechanical volume with no design content, and it must not be
mixed into a task that has design content.

**Do this in BATCHES BY DIRECTORY, one commit each.** A single 300-file commit
cannot be reviewed, and Phase 2 shipped a player-visible bug precisely because
one diff was too large to hold.

**Files:**
- Modify: remaining spec files under `backend/test/`, in batches

**Interfaces:**
- Consumes: `makeShip` from Task 1.
- Produces: nothing.

- [ ] **Step 1: Establish the batches**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
for d in test/gateway test/game test/integration test/unit test/balance test/invariants; do
  echo "$d: $(grep -rl 'cybskill:' $d 2>/dev/null | wc -l) files"
done
```

Count on `cybskill:` — see Task 1 Step 5 for why `xcoord:` is the wrong proxy.

- [ ] **Step 2: Migrate one directory, run it, commit it**

For each batch, in order of smallest first:

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
# ...migrate the files in <dir> to makeShip({ ... })...
npx jest <dir> > /tmp/batch.txt 2>&1; echo "exit=$?"
grep -E "^Tests:|^Test Suites:|FAIL" /tmp/batch.txt
git add test/ && git commit -m "test: <dir> builds ships through the shared factory"
```

**Preserve every deliberate out-of-domain value and its `domain-ok:` annotation**
— pass it as an override. Those annotations mark values chosen to prove a bound
is enforced; silently normalising one removes a real test.

**If a file's inline ship differs from the factory default in a way that looks
load-bearing** — a field set to something unusual with no comment — do not
"tidy" it. Pass it as an override and note it in your report.

- [ ] **Step 3: Confirm the sweep landed**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
grep -rl "cybskill:" test/ | grep -v "helpers/make-ship.ts" | wc -l   # was 260 at phase start, 248 after Task 1
grep -ro "as never" test/ | wc -l                                      # was 509 at phase start
```

Report both numbers. If files remain, name them and say why they resisted.

- [ ] **Step 4: Full suite**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
npx tsc --noEmit; echo "tsc=$?"
npx jest > /tmp/full.txt 2>&1; echo "jest=$?"
grep -E "^Tests:|^Test Suites:|FAIL" /tmp/full.txt
```

---

### Task 7: Close out the phase

**Files:**
- Modify: `docs/superpowers/specs/2026-09-10-restructure-design.md` — tick Phase 3, mark it complete with the date, set the status line to phase 4 next
- Modify: `docs/PROGRESS.md` — append
- Modify: `docs/DECISIONS.md` — append, if any ruling was made
- Modify: `backend/src/game/CLAUDE.md` — only if the module map moved

- [ ] **Step 1: Measure against the baseline**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
echo "files injecting PrismaService: $(grep -rl 'PrismaService' src/ | wc -l)"   # was 46
echo "forwardRef: $(grep -rn 'forwardRef' src/ | wc -l)"                          # was 7
echo "inline ship fixtures: $(grep -rl 'cybskill:' test/ | wc -l)"                # was 260 at phase start
echo "as never in test/: $(grep -ro 'as never' test/ | wc -l)"                    # was 509
echo "prisma in gateway: $(grep -c 'this.prisma' src/gateway/game.gateway.ts)"    # was 2
```

- [ ] **Step 2: Verify the deploy gate is untouched**

```bash
cd /home/rick/dev/galactic-empire-reborn
git diff --name-only 8af4ed2..HEAD -- .github/
grep -n "branches:\|github.event_name" .github/workflows/ci.yml
git diff master -- VERSION
```

**Use `8af4ed2..HEAD`, this phase's own range — NOT `master..HEAD`.** Phases 0, 1
and 2 legitimately changed `ci.yml` (the Docker build context at `540f65f`, the lint
gating at `1050298`), so a comparison against master reports work that is correct and
already reviewed. The first and third commands must produce no output.

The two greps check the gate's CONTENT rather than whether the file differs at all:
`on.push.branches` must still be `[master]` and the image job still gated on
`if: github.event_name == 'push'`. **If this phase's diff touches either, stop and
report — do not fix it yourself.**

- [ ] **Step 3: Verify both Docker images build**

Phase 1 shipped without this check and both images were broken for a day.

```bash
cd /home/rick/dev/galactic-empire-reborn
docker build -f backend/Dockerfile -t ge-backend-p3 .
docker build -f frontend/Dockerfile -t ge-frontend-p3 .
docker run --rm --entrypoint node ge-backend-p3 -e "require.resolve('@ge/wire'); console.log('wire ok')"
```

- [ ] **Step 4: Append to the living docs**

`docs/DECISIONS.md` and `docs/PROGRESS.md` are **APPEND-ONLY** — annotate in place
with CORRECTION/AMENDED, never rewrite. Read `docs/CLAUDE.md` for the format.

Record the before/after table, the new repository map, and any query left outside
a repository with the reason it stays.

- [ ] **Step 5: Commit and push**

```bash
git add -A docs/
git commit -m "docs(restructure): close out phase 3 — the persistence boundary"
git push origin restructure
```

---

## Self-review

**Spec coverage.** Phase 3's bullets are: per-feature repositories so
`PrismaService` appears once per feature (Tasks 2, 3, 4); retire the 7
`forwardRef` calls by fixing the cycles they mask (Task 5); narrow interfaces at
the injection seams (Task 5's ports, and every repository's narrow return types);
and the test-fixture fix the spec folds in (Tasks 1 and 6). Task 7 verifies.
No bullet is unclaimed.

**Ordering rationale.** Task 1 is a seam, not a deliverable — it exists because
334 files build ships inline and every later task touches services those fixtures
feed. Task 3 deletes queries rather than moving them, so it is independent of the
repository work. Task 5 is last because module wiring is the only thing here that
fails at boot rather than in a test.

**Known risks.** Task 3 is the subtle one: serving a read from a boot-time cache
is only correct if the row cannot change after boot, and the plan makes the
implementer state that per call rather than assume it. Task 5 is the loud one: a
DI failure is a hard crash, which is why Step 6 requires a real boot and not
`tsc`.

**Deliberately not in this plan.** The `as never` count is reported but not
targeted directly — the spec's claim is that typed seams make those casts
unnecessary, so it is an outcome to measure in Task 7, not a number to chase.
Nothing here touches the frontend; that is Phase 4 and runs independently.
