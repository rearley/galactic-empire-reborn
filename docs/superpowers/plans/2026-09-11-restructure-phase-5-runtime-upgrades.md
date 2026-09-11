# Restructure Phase 5 — Runtime Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the backend to NestJS 12, Prisma 7, Vitest and TypeScript 7 **on CommonJS**, with the test suite as the oracle and zero intended change in game behaviour.

**Architecture:** Five upgrades that were believed to be one chain are actually four independent moves plus one ordering constraint. Each lands in its own commit with the full suite green between them, so a behaviour change has exactly one candidate cause. The only real ordering constraint is `ts-jest` → Vitest before TypeScript 7, because ts-jest declares `typescript: ">=4.3 <7"`.

**Tech Stack:** NestJS 12.0.1, Prisma 7.10.0 with `@prisma/adapter-pg`, Vitest 5.0.0 with `unplugin-swc`, TypeScript 7.0.2, Node 24, PostgreSQL 16.

**Spec:** `docs/superpowers/specs/2026-09-10-restructure-design.md` — Phase 5 section, as corrected 2026-09-11.

---

## Why this plan differs from the spec it implements

The spec's Phase 5 originally led with "Backend CommonJS → ESM", justified by
"Prisma 5 → 7 … Requires ESM". **That requirement does not exist.** It was
tested rather than trusted, before planning:

| Claim | Verified how | Result |
|---|---|---|
| Prisma 7 requires ESM | `moduleFormat = "cjs"` generator, compiled `module: commonjs`, `@prisma/adapter-pg`, real query against `ge_test` | **False** — returned a row |
| NestJS 12 requires ESM | Nest migration guide, verbatim | **False** — "can upgrade to v12 and stay CommonJS for as long as you like" |
| TypeScript 7 requires ESM | `module: commonjs` + `moduleResolution: bundler` compiled, `design:paramtypes` still emitted | **False** — only `moduleResolution: "node"` is removed |

Prisma's own upgrade guide says to set `"type": "module"` and never mentions
`moduleFormat`, so reading the documentation alone would have produced the
wrong plan. Rick ruled on 2026-09-11 to drop ESM and keep CommonJS.

**If you are implementing a task and find evidence that contradicts the table
above, stop and say so.** It is the load-bearing assumption of the whole plan.

## Global Constraints

Every task's requirements implicitly include this section.

- **Branch `restructure`. Nothing goes to master.** Production runs master.
- **`VERSION` is NOT bumped.** One bump at merge, not per phase.
- **Zero intended behaviour change.** Where an upgrade changes behaviour, the
  change is pinned by a test and recorded in `docs/DECISIONS.md`, never
  absorbed silently.
- **Pre-existing defects get a GitHub issue, not a fix.** Standing rule from
  2026-09-11. Fixing them in-phase makes the phase's diff unreviewable.
- **Run only ONE jest/vitest process at a time.** Concurrent runs race the
  shared `ge_test` database. This has produced two interleaved, disagreeing
  summaries in one output file and was misread as a flake.
- **Never `prisma db push` against a real database. Never `prisma migrate
  reset`.** Schema changes go through `prisma migrate dev --name <name>` and
  migrations are committed artifacts, never edited after being applied. The
  test global setup's `db push --force-reset` against `ge_test` is the one
  sanctioned exception and it already exists.
- **Canon precedence: C source (`reference/ge-source/`) → `.MSG` in `GE/REL/` →
  wiki. NEVER `GE/MSG/`. NEVER `GE/REL2/`.** `/reference/` is READ ONLY; read
  `reference/CLAUDE.md` before reading under it.
- **If a test encodes a deviation from canon, the test is wrong.**
- **Do not hand-transcribe canon.** Generate it, pin it with a test that
  re-reads the original file.
- **Commit trailers**, on every commit:

      Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
      Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz

- **Baseline to hold, measured 2026-09-11 at `6a066a8`:** 626 suites / 6385
  tests green, `npx tsc --noEmit` clean, `npm run lint` clean, both Docker
  images build.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `backend/tsconfig.json` | `moduleResolution` moves to `bundler`; `ignoreDeprecations` removed | 1, 8 |
| `.oxlintrc.json` | backend goes type-aware | 2 |
| `backend/test/integration/boot-order.spec.ts` | **new** — pins the lifecycle-hook ordering the game depends on, before Nest 12 can change it | 3 |
| `backend/package.json` | dependency bumps; `prisma` seed block; scripts | 4, 5, 7, 8 |
| `backend/prisma/schema.prisma` | `prisma-client` generator, `moduleFormat = "cjs"`, `url` removed from datasource | 5 |
| `backend/prisma.config.ts` | **new** — the connection URL Prisma CLI uses for migrations | 5 |
| `backend/src/prisma/prisma.service.ts` | constructs the pg driver adapter | 5 |
| `backend/src/prisma/client.ts` | **new** — the single re-export of the generated client, so 36 importers never name the output directory | 6 |
| `backend/Dockerfile`, `.github/workflows/ci.yml` | generate step and its output path | 6 |
| `backend/vitest.config.ts` | **new** — replaces `jest.config.ts`; SWC transform for decorator metadata | 7 |
| `backend/test/prisma-schema/helpers/global-setup.ts` | Vitest global setup signature | 7 |

---

### Task 1: `moduleResolution` → `bundler`

The phase-0 blocker. `moduleResolution: "node"` (node10) is **removed** in
TypeScript 7, and `ignoreDeprecations: "6.0"` in `backend/tsconfig.json` is the
escape hatch currently silencing the deprecation. Verified: TypeScript 6.0.3
accepts `module: commonjs` with `moduleResolution: bundler`, so this lands
first, alone, under the current compiler.

**Files:**
- Modify: `backend/tsconfig.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a backend that type-checks under `bundler` resolution. Task 2 and Task 8 both depend on this.

- [ ] **Step 1: Read the current compiler options**

Run: `cat backend/tsconfig.json`

Confirm it still contains `"moduleResolution": "node"` and
`"ignoreDeprecations": "6.0"`. If either is already gone, stop and report —
someone has been here before you.

- [ ] **Step 2: Change both options in one edit**

In `backend/tsconfig.json`, replace:

```json
    "moduleResolution": "node",
    "ignoreDeprecations": "6.0",
```

with:

```json
    "moduleResolution": "bundler",
```

`ignoreDeprecations` goes with it: it exists only to silence the deprecation on
the option being removed, and leaving it behind would be a silencer with
nothing to silence.

- [ ] **Step 3: Type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: clean. `bundler` is strictly more permissive than `node10` for the
import shapes this repo uses (no `.js` extensions, no `exports`-map edge
cases), so a failure here is information — read it, do not work around it.

- [ ] **Step 4: Run the full suite**

Run: `cd backend && npx jest`
Expected: 626 suites / 6385 tests pass. `ts-jest` reads the same tsconfig, so
this is the real check that resolution still works at runtime, not just at
type-check.

- [ ] **Step 5: Build**

Run: `cd backend && npm run build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add backend/tsconfig.json
git commit -m "build(backend): moduleResolution node10 -> bundler

TypeScript 7 removes moduleResolution \"node\" outright, and
ignoreDeprecations: \"6.0\" was the escape hatch silencing the deprecation
warning for it. Verified that TypeScript 6.0.3 accepts module: commonjs with
moduleResolution: bundler, so this lands ahead of the compiler bump rather
than inside it.

This is the phase-0 blocker that kept backend oxlint syntax-only.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz"
```

---

### Task 2: Backend oxlint goes type-aware

The payoff for Task 1, and a phase-0 exit criterion that phase 0 could not
meet. The frontend already runs `--type-aware`; the backend runs syntax-only
because type-aware needs a resolution mode oxlint understands.

**Files:**
- Modify: `backend/package.json` (the `lint` script)
- Modify: `.oxlintrc.json` only if type-aware needs a rule configured

**Interfaces:**
- Consumes: Task 1's `moduleResolution: bundler`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: See what type-aware reports, before changing anything**

Run: `cd backend && npx oxlint -c ../.oxlintrc.json --type-aware .`
Record the full output to a file. Expect findings: this has never run here.

- [ ] **Step 2: Triage the findings**

For each finding, decide one of exactly two things:

1. **It is a pre-existing defect** → file a GitHub issue, do NOT fix it. This
   is the standing rule and it is what keeps the phase reviewable.
2. **The rule is wrong for this codebase** → disable it in `.oxlintrc.json`
   with a comment saying why, in the style of the existing
   `unicorn/no-new-array` entry (which explains the 27 call sites and why the
   rule's preference is a style opinion).

There is no third option. Do not fix code in this task.

**`.oxlintrc.json` has a parsing constraint:** comments must be on their own
line. `backend/test/unit/lint-gate.spec.ts` strips whole-line `//` comments
only, and a trailing comment breaks its `JSON.parse`.

- [ ] **Step 3: Turn it on**

In `backend/package.json`, change:

```json
    "lint": "oxlint -c ../.oxlintrc.json .",
```

to:

```json
    "lint": "oxlint -c ../.oxlintrc.json --type-aware .",
```

- [ ] **Step 4: Verify clean**

Run: `cd backend && npm run lint`
Expected: exits 0.

- [ ] **Step 5: Verify the gate test still passes**

Run: `cd backend && npx jest test/unit/lint-gate.spec.ts`
Expected: pass. It parses `.oxlintrc.json`; if you added a comment in the wrong
shape, this is what tells you.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json .oxlintrc.json
git commit -m "build(backend): oxlint goes type-aware

The frontend has run --type-aware since phase 0; the backend could not,
because type-aware resolution needs something better than moduleResolution
node10. Task 1 moved it to bundler, so this is now the cheap half.

Findings triaged in two buckets only: pre-existing defects filed as issues,
and rules disabled with a stated reason. No code was fixed in this commit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz"
```

---

### Task 3: Pin boot order BEFORE Nest 12 can change it

**This task is the oracle for Task 4 and must land first.**

NestJS 12's migration guide names one behaviour change that matters here:
lifecycle hooks now execute **by component hierarchy level**, which can reorder
them. 19 files in `backend/src` implement lifecycle hooks, and the ones that
matter are the boot dependencies nothing currently asserts:

- `ship-class-cache.service.ts` — the class table must be warm before anything
  reads a ship's stats.
- `galaxy.service.ts` — the galaxy is generated on first boot.
- `tick.service.ts` — starts both heartbeats with raw `setInterval`.

If the heartbeats start before the class cache is warm, ships fly with a
default-zero `topspeed`. That is the exact shape of the bug that hid for 339
commits, so it gets a test before the upgrade, not after.

**Files:**
- Create: `backend/test/integration/boot-order.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a red-if-reordered assertion Task 4 must keep green.

- [ ] **Step 1: Confirm the shape before writing the test**

Run:

```bash
cd backend
grep -n "implements\|onModuleInit()\|onApplicationBootstrap()\|setInterval" \
  src/game/physics/ship-class-cache.service.ts \
  src/game/tick/tick.service.ts \
  src/game/galaxy/galaxy.service.ts
```

Expected, and already measured on 2026-09-11 — confirm it still holds:

| service | hook | what it does |
|---|---|---|
| `ShipClassCacheService` | `onModuleInit` | warms the class table |
| `GalaxyService` | `onModuleInit` | generates the galaxy on first boot |
| `TickService` | `onModuleInit` / `onModuleDestroy` | opens the 1s ship-update and 6s physics `setInterval`s, and clears all of them |

**All three sit in the same lifecycle phase.** Nest's phase ordering therefore
guarantees nothing between them: they are same-phase peers, which is precisely
the ordering NestJS 12 changes. If Step 1 shows a different picture, say so
before writing the test.

Note while you are here: `tick.service.ts` drives **three** heartbeats — ship
update at 1s, physics at 6s, and a planet update whose cadence comes from
`GEMAIN.C:656 plantime = plantock / numrecs` — while both `CLAUDE.md` and
`backend/src/game/CLAUDE.md` describe "the two tick timers". Only the first two
open in `onModuleInit`; the third is opened later by `startPlanetUpdateTimer`.
Do not change either document. It is a documentation gap, filed as an issue
rather than fixed, per the standing rule.

- [ ] **Step 2: Write the test**

Create `backend/test/integration/boot-order.spec.ts`:

```ts
/**
 * Boot order is a contract, not an accident.
 *
 * NestJS 12 executes lifecycle hooks by component hierarchy level, which can
 * reorder hooks that previously ran in registration order. `ShipClassCacheService`,
 * `GalaxyService` and `TickService` all implement `onModuleInit`, so they are
 * same-phase peers and Nest's phase ordering guarantees nothing between them.
 *
 * The heartbeats must not start before the class cache is warm. If they do,
 * every ship flies on a default-zero `topspeed` — the same shape as the
 * Cybertron movement bug that hid for 339 commits, and just as invisible to a
 * suite that only asserts the logic ran.
 *
 * Written BEFORE the Nest 12 upgrade so it is able to fail. A test written
 * afterwards would pin whatever the new order happened to be.
 */
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../src/game/tick/tick.service';

/**
 * Record when a hook runs WITHOUT replacing it. The real implementations still
 * run, so this observes the boot the application actually performs rather than
 * a boot made of doubles.
 */
function recordHook(
  order: string[],
  proto: { onModuleInit: (...args: never[]) => unknown },
  label: string,
): void {
  const original = proto.onModuleInit;
  jest.spyOn(proto, 'onModuleInit').mockImplementation(function (this: unknown, ...args: never[]) {
    order.push(label);
    return original.apply(this, args);
  });
}

describe('boot order', () => {
  afterEach(() => jest.restoreAllMocks());

  it('warms the ship-class cache before the heartbeats start', async () => {
    const order: string[] = [];
    recordHook(order, ShipClassCacheService.prototype, 'ship-class-cache');
    recordHook(order, GalaxyService.prototype, 'galaxy');
    recordHook(order, TickService.prototype, 'tick');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();

    // close() first, so TickService's onModuleDestroy clears the real intervals
    // before any assertion can fail and leaks them into the suite.
    await moduleRef.close();

    expect(order).toContain('ship-class-cache');
    expect(order).toContain('tick');
    expect(order.indexOf('ship-class-cache')).toBeLessThan(order.indexOf('tick'));
  });
});
```

`moduleRef.close()` runs before the assertions on purpose. `TickService` opens
real `setInterval` timers, and a failed assertion that skipped the close would
leak them into every later spec in the run — a flake whose cause is invisible.

- [ ] **Step 3: Run it and read the result**

Run: `cd backend && npx jest test/integration/boot-order.spec.ts`

This test is **expected to pass on Nest 10** — it pins current behaviour. That
makes it a characterization test, not a red-green cycle, and the honest way to
prove it can fail is to break it on purpose:

- [ ] **Step 4: Prove it can fail**

Temporarily invert the assertion (`toBeGreaterThan` instead of
`toBeLessThan`), run it, confirm it fails, and put it back. A characterization
test nobody has watched fail is decoration. Record in the task report that you
did this and what the failure said.

- [ ] **Step 5: Full suite**

Run: `cd backend && npx jest`
Expected: 627 suites, all green. Check for leaked-timer warnings.

- [ ] **Step 6: Commit**

```bash
git add backend/test/integration/boot-order.spec.ts
git commit -m "test(boot): pin lifecycle order before Nest 12 can change it

NestJS 12 runs lifecycle hooks by component hierarchy level, which can reorder
hooks that previously fired in registration order. 19 files here implement
lifecycle hooks; the load-bearing one is that the ship-class cache is warm
before the two game heartbeats start. If it is not, every ship flies with a
zero topspeed.

A characterization test, written before the upgrade so it can fail. Proven to
fail by inverting the assertion, not assumed to work because it was green.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz"
```

---

### Task 4: NestJS 10 → 12

**Files:**
- Modify: `backend/package.json`
- Modify: whatever the upgrade's type errors point at — report each one, do not silence any

**Interfaces:**
- Consumes: Task 3's boot-order test.
- Produces: Nest 12 runtime. Task 7 (Vitest) is easier after it but does not require it.

- [ ] **Step 1: Bump every `@nestjs/*` in one go**

```bash
cd backend
npm i @nestjs/common@^12 @nestjs/core@^12 @nestjs/platform-express@^12 \
      @nestjs/platform-socket.io@^12 @nestjs/websockets@^12
npm i -D @nestjs/cli@^12 @nestjs/testing@^12
```

Leave `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/schedule`,
`@nestjs/event-emitter` and `@nestjs/throttler` alone for now — bump them only
if npm reports a peer conflict, and say which in the report.

- [ ] **Step 2: Check the peer graph**

Run: `cd backend && npm ls @nestjs/core @nestjs/common 2>&1 | head -30`
Expected: no `UNMET` and no `invalid`. If a satellite package demands Nest 11,
bump that package and note it.

- [ ] **Step 3: Type-check**

Run: `cd backend && npx tsc --noEmit`
Fix only what the upgrade broke. Every fix goes in the report with the error
text that prompted it.

- [ ] **Step 4: Boot order first, before anything else**

Run: `cd backend && npx jest test/integration/boot-order.spec.ts`
Expected: pass. **If it fails, that is the single most important result in this
phase.** Do not adjust the test. Report the new ordering, and stop.

- [ ] **Step 5: Full suite**

Run: `cd backend && npx jest`
Expected: 627 suites green.

- [ ] **Step 6: Boot the real thing**

Run: `cd backend && npm run build && node dist/src/main.js`
Watch for the Prisma connect line and the Nest bootstrap banner, confirm no
unhandled rejection, then stop it. A green suite does not prove the app boots —
the suite builds testing modules, not the real application.

- [ ] **Step 7: Commit**

```bash
git add backend/package.json package-lock.json
git commit -m "build(backend): NestJS 10 -> 12

Node 24 is already above the v20.19+/v22.12+ floor. CommonJS is retained:
Nest 12's migration guide states a CommonJS application can upgrade to v12 and
stay CommonJS.

The behaviour risk is lifecycle-hook ordering, which v12 runs by component
hierarchy level. test/integration/boot-order.spec.ts pins the dependency the
game relies on and was written in the previous commit for exactly this.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz"
```

---

### Task 5: Prisma 7 — schema, config, adapter

Prisma 7 changes three things at once: the generator (`prisma-client-js` →
`prisma-client`, output into the source tree, mandatory `output`), the
connection URL (out of the datasource block, into `prisma.config.ts`), and the
client constructor (a driver adapter is required).

**Verified before planning:** `moduleFormat = "cjs"` plus
`@prisma/adapter-pg`, compiled `module: commonjs`, runs a real query. Do not
set `"type": "module"` anywhere.

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma.config.ts`
- Modify: `backend/src/prisma/prisma.service.ts`
- Modify: `backend/package.json`
- Modify: `backend/.gitignore` (or the repo root's)

**Interfaces:**
- Consumes: nothing.
- Produces: a generated client at `backend/generated/prisma/`, and
  `PrismaService` still exported from the same place with the same public
  surface. Task 6 repoints the importers.

- [ ] **Step 1: Install**

```bash
cd backend
npm i -D prisma@^7
npm i @prisma/client@^7 @prisma/adapter-pg pg
npm i -D @types/pg
```

- [ ] **Step 2: Change the generator and drop the datasource url**

In `backend/prisma/schema.prisma`, replace:

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

with:

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../generated/prisma"
  moduleFormat = "cjs"
  runtime      = "nodejs"
}

datasource db {
  provider = "postgresql"
}
```

`binaryTargets` goes: Prisma 7's client is Rust-free, so there is no engine
binary to target. The `url` moves to `prisma.config.ts` in the next step —
Prisma 7 rejects it here with `P1012`.

**Generate outside `src/`, deliberately.** `backend/test/balance/canon-citations.balance.spec.ts`
and `docs-truth.balance.spec.ts` both walk `backend/src` for `.ts` files, and
`backend/test/invariants/user-repository-boundary.spec.ts` names the exact
files permitted to touch `prisma.user`. Thousands of generated files under
`src/` would be scanned by all three.

- [ ] **Step 3: Create `backend/prisma.config.ts`**

```ts
/**
 * Where the Prisma CLI finds the database, since Prisma 7 removed `url` from
 * the datasource block.
 *
 * This is the MIGRATION connection only — `prisma migrate`, `prisma db push`.
 * The application's connection is built in `src/prisma/prisma.service.ts` from
 * `resolveDatabaseUrl()`, which is what keeps a test run off the development
 * database. The two are separate on purpose.
 */
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: env('DATABASE_URL') },
});
```

- [ ] **Step 4: Ignore the generated output**

Add to `backend/.gitignore`:

```
# Prisma 7 generates the client as TypeScript source. It is a build artifact:
# `prisma generate` runs in CI, in the Dockerfile, and in the Jest global
# setup. Committing it would put thousands of generated files in front of every
# reviewer and every repo-wide guard.
/generated/
```

- [ ] **Step 5: Generate, and look at what came out**

Run: `cd backend && npx prisma generate`
Then: `ls backend/generated/prisma`
Expected: `client.ts`, `models.ts`, `enums.ts`, `internal/`, `models/`.

- [ ] **Step 6: Write the failing test for the adapter**

Create `backend/test/prisma-schema/driver-adapter.spec.ts`:

```ts
/**
 * Prisma 7 requires a driver adapter — there is no engine to hand a URL to.
 * The adapter must be built from `resolveDatabaseUrl()`, because that function
 * is the only thing stopping a test run from truncating the development
 * database. A connection string read straight from `DATABASE_URL` here would
 * silently undo that protection and no existing test would notice.
 *
 * @see src/prisma/database-url.ts
 */
import { PrismaService } from '../../src/prisma/prisma.service';

describe('PrismaService under Prisma 7', () => {
  it('connects to the test database, not the development one', async () => {
    const service = new PrismaService();
    await service.onModuleInit();
    const [row] = await service.$queryRaw<Array<{ db: string }>>`
      SELECT current_database() AS db`;
    expect(row.db).toBe('ge_test');
    await service.onModuleDestroy();
  });
});
```

- [ ] **Step 7: Run it and watch it fail**

Run: `cd backend && npx jest test/prisma-schema/driver-adapter.spec.ts`
Expected: FAIL — the `datasources` option no longer exists, or the client
refuses to construct without an adapter.

- [ ] **Step 8: Rewrite `PrismaService`**

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './client';
import { resolveDatabaseUrl } from './database-url';

/**
 * Owns the Prisma lifecycle — connects on module init, disconnects on destroy.
 * If $connect() throws, the bootstrap error propagates and the process exits
 * non-zero (FR-013).
 *
 * Prisma 7 has no query engine to hand a URL to, so the connection is made
 * through a driver adapter instead of the old `datasources` option. The URL
 * still comes from `resolveDatabaseUrl()`, which binds test runs to
 * TEST_DATABASE_URL so a spec that truncates tables can never reach the
 * development database. @see ./database-url.ts
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: resolveDatabaseUrl() }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    console.log('[Nest] LOG [PrismaService]   Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    console.log('[Nest] LOG [PrismaService]   Disconnected from PostgreSQL');
  }
}
```

`resolveDatabaseUrl()` returns `string | undefined`; `PrismaPg` wants a
`string`. **Do not cast it away.** If the type complains, the honest fix is in
`database-url.ts` — it already throws when a test run has no
`TEST_DATABASE_URL`, so the `undefined` is only reachable when `DATABASE_URL`
is unset outside tests, which should also throw. Make that explicit and say so
in the report.

- [ ] **Step 9: Watch it pass**

Run: `cd backend && npx jest test/prisma-schema/driver-adapter.spec.ts`
Expected: PASS, reporting `ge_test`.

- [ ] **Step 10: Commit**

Task 6 finishes the migration; the suite is not expected to be green until
then. Commit this as the half it is:

```bash
git add backend/prisma/schema.prisma backend/prisma.config.ts \
        backend/src/prisma/prisma.service.ts backend/package.json \
        backend/.gitignore package-lock.json \
        backend/test/prisma-schema/driver-adapter.spec.ts
git commit -m "feat(prisma): generator, config and driver adapter for Prisma 7

Three breaking changes land together because they cannot land apart: the
prisma-client generator with a mandatory output path, the connection URL out
of the datasource block and into prisma.config.ts, and a @prisma/adapter-pg
driver adapter in place of the removed engine.

CommonJS is retained via moduleFormat = \"cjs\", verified before planning by
compiling a generated client as CommonJS and running a real query against
ge_test. Prisma's upgrade guide says to set \"type\": \"module\" and does not
mention moduleFormat; the guide alone would have produced the wrong plan.

The client generates to backend/generated/, outside src/, because three
repo-wide guards walk backend/src and would scan thousands of generated files.

Importers are repointed in the next commit; the suite is red in between.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz"
```

---

### Task 6: Prisma 7 — repoint importers, seed, global setup, Docker, CI

36 files import from `@prisma/client`. They will import from one re-export
instead, so the generated path is named in exactly one place.

**Files:**
- Create: `backend/src/prisma/client.ts`
- Modify: 36 importers of `@prisma/client`
- Modify: `backend/prisma/seed.ts` and `backend/package.json` (seed command)
- Modify: `backend/test/prisma-schema/helpers/global-setup.ts`
- Modify: `backend/Dockerfile`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 5's generated client at `backend/generated/prisma`.
- Produces: `backend/src/prisma/client.ts` re-exporting `PrismaClient`, `Prisma`, and the model types. Nothing after this imports `@prisma/client` directly.

- [ ] **Step 1: Create the single re-export**

```ts
/**
 * The one place that names where the Prisma client is generated.
 *
 * Prisma 7 generates the client as TypeScript source at a path the schema
 * chooses, so every importer would otherwise carry a relative path into a
 * build artifact — 36 of them, each of which breaks if the output moves. They
 * import from here instead.
 *
 * @see ../../prisma/schema.prisma — the `output` that this mirrors
 */
export * from '../../generated/prisma/client';
```

- [ ] **Step 2: Find every importer**

```bash
cd backend
grep -rln "from '@prisma/client'" src test prisma --include=*.ts | sort
```

Expected: 36 files. Record the list in the report.

- [ ] **Step 3: Repoint them, then verify by counting**

Rewrite each import's specifier to the correct relative path to
`src/prisma/client`. Then prove none was missed:

```bash
cd backend
grep -rn "from '@prisma/client'" src test prisma --include=*.ts | wc -l
```

Expected: `0`.

**Do not trust a visual pass over 36 files.** This project has a recorded case
where a careful human read of 16 files found one silent drop and a script found
six.

- [ ] **Step 4: Fix the seed**

`backend/package.json` has `"prisma": { "seed": "ts-node prisma/seed.ts" }`.
Prisma 7 reads the seed command from `prisma.config.ts` instead. Move it:

```ts
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: env('DATABASE_URL') },
  migrations: { seed: 'ts-node prisma/seed.ts' },
});
```

and delete the `prisma` block from `backend/package.json`. Verify the seed runs
against `ge_test`, never `ge`:

```bash
cd backend && TEST_DATABASE_URL="$TEST_DATABASE_URL" npx prisma db seed
```

If the config's key name differs in 7.10, run `npx prisma db seed --help` and
use what it says. Report which you used.

- [ ] **Step 5: Update the test global setup**

`backend/test/prisma-schema/helpers/global-setup.ts` runs
`npx prisma db push --force-reset --schema=...`. Prisma 7 takes the connection
from `prisma.config.ts`, so passing `DATABASE_URL` in the child env still
works — but confirm it, do not assume. After the run, check the reset landed on
`ge_test`:

```bash
cd backend && npx jest test/prisma-schema/planet.spec.ts
```

Expected: pass, and global setup prints the reset line naming `ge_test`.

- [ ] **Step 6: Full suite**

Run: `cd backend && npx jest`
Expected: 628 suites green (627 plus the driver-adapter spec from Task 5).

- [ ] **Step 7: Docker**

`backend/Dockerfile` runs `RUN npx prisma generate` at line 27 after copying
`backend/prisma`, and the runtime stage copies `node_modules` for the engines.
Two changes:

1. The generate step now writes to `/app/backend/generated`, so that directory
   must reach the builder's `npm run build` — confirm the `COPY`/`RUN` order
   still puts generation before the build.
2. The comment about `node_modules/@prisma/engines` is now wrong: Prisma 7 has
   no engine binaries. Correct the comment rather than deleting it; say what
   changed.

Build both images:

```bash
docker build -f backend/Dockerfile -t ge-backend:phase5 .
docker build -f frontend/Dockerfile -t ge-frontend:phase5 .
```

Expected: both succeed. Then prove the client resolves inside the image:

```bash
docker run --rm ge-backend:phase5 node -e "require('./dist/src/prisma/client'); console.log('ok')"
```

- [ ] **Step 8: CI**

`.github/workflows/ci.yml` has a `Generate Prisma client` step at line 148.
Confirm it still works with the config file and that `DATABASE_URL` is
available to it. Do not touch the deploy gate — `branches: [master]` and
`if: github.event_name == 'push'` stay exactly as they are.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(prisma): repoint importers, seed, setup and images at Prisma 7

36 files imported from @prisma/client. They import from src/prisma/client.ts
instead, which is the one place naming the generated output path, so moving
that output later touches one file rather than 36. Verified by count, not by
reading: grep for the old specifier returns zero.

Seed command moves from package.json's prisma block into prisma.config.ts.
The Dockerfile comment about @prisma/engines was corrected rather than
deleted — Prisma 7's client is Rust-free and there are no engine binaries.

Deploy gate untouched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz"
```

---

### Task 7: Jest → Vitest

The only hard ordering constraint in the phase: `ts-jest` declares
`typescript: ">=4.3 <7"`, so TypeScript 7 cannot land while ts-jest is the
transform.

**The hazard specific to this migration:** esbuild, Vitest's default
transform, does **not** implement `emitDecoratorMetadata`. Without
`design:paramtypes`, every Nest constructor injection resolves to `undefined`
and the DI container fails at runtime, not at type-check. `unplugin-swc` is the
standard answer.

**Files:**
- Create: `backend/vitest.config.ts`
- Delete: `backend/jest.config.ts`, `backend/jest.manual.config.ts`
- Modify: `backend/package.json`, `backend/tsconfig.json` (`types`)
- Modify: `backend/test/prisma-schema/helpers/global-setup.ts`
- Modify: every spec that calls `jest.*`

**Interfaces:**
- Consumes: Nest 12 and Prisma 7.
- Produces: `npm test` runs Vitest. Task 8 depends on ts-jest being gone.

- [ ] **Step 1: Install**

```bash
cd backend
npm i -D vitest@^5 unplugin-swc @swc/core
npm un ts-jest jest @types/jest
```

- [ ] **Step 2: Write the config**

```ts
/**
 * Vitest for a NestJS backend that is still CommonJS.
 *
 * The SWC transform is not a preference. Vitest's default esbuild transform
 * does not implement `emitDecoratorMetadata`, so `design:paramtypes` is never
 * emitted, every Nest constructor injection resolves to undefined, and the
 * failure appears at runtime as an unrelated null dereference rather than at
 * type-check. @see https://docs.nestjs.com/recipes/swc
 *
 * `singleThread` replaces Jest's `maxWorkers: 1`. Every suite shares the one
 * `ge_test` database, and parallel runs let one suite's truncate wipe another's
 * fixtures. Sequential execution is the simplest correct isolation here, and
 * the reason is unchanged from the Jest config it replaces.
 */
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'nodenext' } })],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    globalSetup: ['test/prisma-schema/helpers/global-setup.ts'],
    setupFiles: ['test/helpers/test-galaxy-size.ts'],
    testTimeout: 30_000,
    poolOptions: { threads: { singleThread: true } },
  },
});
```

`globals: true` keeps `describe`/`it`/`expect` available without an import in
642 test files. Migrating those imports is not this task.

- [ ] **Step 3: Replace `jest.*` call sites**

```bash
cd backend && grep -rn "jest\." test --include=*.ts | wc -l
```

Expected: around 50. Replace `jest.fn` → `vi.fn`, `jest.mock` → `vi.mock`,
`jest.spyOn` → `vi.spyOn`, `jest.useFakeTimers` → `vi.useFakeTimers`, adding
`import { vi } from 'vitest'` where needed.

**`vi.mock` is hoisted and its factory cannot close over outer variables the
way `jest.mock` tolerated.** Where a mock factory references a variable, use
`vi.hoisted`. Report every place you had to.

- [ ] **Step 4: Fix the global setup signature**

Vitest's `globalSetup` receives a different argument than Jest's
`(globalConfig, projectConfig)`. `runTouchesDatabase()` reads
`globalConfig.testPathPatterns.patterns` and `projectConfig.roots`, and it
**fails closed** — a signature mismatch makes it reset every time, which is
safe but silently undoes issue #23.

Adapt it to Vitest's shape and keep the fail-closed property. Then prove both
directions still work, exactly as #23 was verified:

```bash
cd backend
npx vitest run test/balance/citation-scan.spec.ts   # expect the SKIP line
npx vitest run test/prisma-schema/planet.spec.ts    # expect the reset line
```

Both assertions belong in `test/prisma-schema/needs-database.spec.ts`, which
already exists and should keep passing.

- [ ] **Step 5: Update scripts and tsconfig types**

In `backend/package.json`: `"test": "vitest run"`, and replace `test:manual`
with its Vitest equivalent. In `backend/tsconfig.json`, change
`"types": ["jest", "node"]` to `"types": ["vitest/globals", "node"]`.

- [ ] **Step 6: Run everything**

```bash
cd backend && npx vitest run
```

Expected: 628 suites / ~6390 tests green. Compare the totals against the
Jest run before this task and account for any difference — a test that
silently stopped being collected looks exactly like a test that passed.

- [ ] **Step 7: CI**

`.github/workflows/ci.yml` line 66 names the job "Backend — Jest". Rename it
and confirm `npm test` still drives it.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "build(backend): Jest -> Vitest

ts-jest declares typescript: \">=4.3 <7\", so it is what actually blocks the
TypeScript 7 bump. This is the only hard ordering constraint in the phase.

SWC rather than the default esbuild transform: esbuild does not implement
emitDecoratorMetadata, so design:paramtypes would never be emitted, every Nest
constructor injection would resolve to undefined, and the failure would surface
at runtime as an unrelated null dereference.

singleThread replaces maxWorkers: 1, for the same unchanged reason — every
suite shares one ge_test database.

The issue #23 database-reset skip was re-verified in both directions against
the new global-setup signature rather than assumed to survive it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz"
```

---

### Task 8: TypeScript 6 → 7

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/tsconfig.json` only if 7 rejects an option

**Interfaces:**
- Consumes: Task 1's `bundler` resolution and Task 7's removal of ts-jest.
- Produces: the phase's final toolchain.

- [ ] **Step 1: Install**

```bash
cd backend && npm i -D typescript@^7
npx tsc --version
```
Expected: `Version 7.0.2` or later.

- [ ] **Step 2: Type-check**

Run: `cd backend && npx tsc --noEmit`

Verified in advance: TypeScript 7 accepts `module: commonjs` with
`moduleResolution: bundler` and still emits `design:paramtypes` under
`emitDecoratorMetadata`, so Nest's DI survives. Anything else it reports is a
real finding — report it, do not silence it.

- [ ] **Step 3: Confirm decorator metadata really is emitted**

The check that matters is not the compiler's opinion, it is the emitted file:

```bash
cd backend && npm run build && grep -c "design:paramtypes" dist/src/app.module.js
```

Expected: at least 1. If it is 0, Nest DI is broken in the built output even
though the suite may be green, because the suite runs through SWC and the
build runs through tsc. **These are two different transforms and both have to
emit the metadata.**

- [ ] **Step 4: Boot the built app**

Run: `cd backend && node dist/src/main.js`
Confirm the Prisma connect line and the Nest banner, then stop it.

- [ ] **Step 5: Full suite and lint**

```bash
cd backend && npx vitest run && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add backend/package.json package-lock.json backend/tsconfig.json
git commit -m "build(backend): TypeScript 6 -> 7

Unblocked by the Vitest migration: ts-jest capped TypeScript below 7.

Decorator metadata was checked in the emitted output, not inferred from a
green suite — the suite runs through SWC and the build runs through tsc, and
both have to emit design:paramtypes for Nest DI to work. dist/src/app.module.js
carries it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz"
```

---

### Task 9: Close out the phase

**Files:**
- Modify: `docs/superpowers/specs/2026-09-10-restructure-design.md` (tick the boxes)
- Modify: `docs/DECISIONS.md` (append)
- Modify: `docs/PROGRESS.md` (append)

**Interfaces:**
- Consumes: Tasks 1-8.
- Produces: the phase record.

- [ ] **Step 1: Measure, do not recall**

```bash
cd backend && npx vitest run 2>&1 | tail -5
cd backend && npx tsc --noEmit && npm run lint && npm run build
docker build -f backend/Dockerfile -t ge-backend:phase5 . && \
docker build -f frontend/Dockerfile -t ge-frontend:phase5 .
git log --oneline 6a066a8..HEAD
```

`6a066a8` is this phase's base — the commit that closed issues #11, #13 and #23.

- [ ] **Step 2: Check the deploy gate did not move, in this phase's own range**

```bash
git diff 6a066a8..HEAD -- .github/workflows/ci.yml | grep -E "^[-+].*(branches|github.event_name)"
```

Expected: no output. Compare against **this phase's base**, never against
master — master's `.github/` legitimately differs by every earlier phase.

- [ ] **Step 3: Confirm `VERSION` did not move**

```bash
git diff 6a066a8..HEAD -- VERSION
```
Expected: no output.

- [ ] **Step 4: Write the records**

`docs/DECISIONS.md` and `docs/PROGRESS.md` are **append-only** — annotate in
place with CORRECTION/AMENDED, never rewrite. The decision entry must record:
the ESM premise being false and how that was established, the CommonJS ruling,
Nest 12's lifecycle ordering and whether it actually changed anything here, and
the generated-client location and why it is outside `src/`.

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs(restructure): close out phase 5 — the runtime upgrades

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz"
```

---

## What this phase does NOT do

- **No ESM.** Struck on evidence; see the table at the top.
- **No frontend changes.** The frontend is already ESM, already on Vitest 5,
  React 19, Vite 8 and TypeScript 6 from phase 0. TypeScript 7 for the frontend
  is a separate decision, not a Phase 5 task.
- **No fixes to pre-existing defects.** They get issues. The open backlog is
  #1, #2, #4, #5, #6, #7, #8, #12, #14, #15, #16, #17, #18, #19, #20, #21, #22,
  #24, #25, #26.
- **No `VERSION` bump.** One bump at merge.
- **No merge to master, and no deploy.** Playtests on local dev and on
  `restructure` come first, then the merge conversation.
