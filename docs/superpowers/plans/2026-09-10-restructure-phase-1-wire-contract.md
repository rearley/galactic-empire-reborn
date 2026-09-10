# Restructure Phase 1 — Typed Wire Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one declaration the single source of truth for every Socket.io event crossing between the backend and the frontend, and make the compiler enforce it on the side that produces the payloads.

**Architecture:** A new `packages/wire` workspace holds the event-name constants and the payload interfaces. The backend types its `Server` with Socket.io's `ServerToClientEvents` / `ClientToServerEvents` generics so a wrong payload is a build error rather than a runtime surprise. The frontend imports the same declaration instead of its hand-synced copy, and the parity test that guarded the copy is retired because the duplication it guarded is gone.

**Tech Stack:** npm workspaces, TypeScript 6.0.3, Socket.io 4.8 typed events, NestJS 10 (CommonJS), Vite 8 (ESM).

**Spec:** `docs/superpowers/specs/2026-09-10-restructure-design.md`

## Why this is phase 1

The contract is unenforced on the producing side. It exists twice, at
`frontend/src/types/contracts.ts` and
`specs/003-ship-commands/contracts/shared-types.ts`, kept identical by
`frontend/test/contracts-parity.spec.ts`. **The backend imports neither and
declares neither.** Every payload is an untyped object literal written inline at
the emit site. So the contract is enforced between two consumers and unenforced
against the producer, which is the wrong way round.

Fixing that first is what makes phases 2, 3 and 4 independently safe: after this
lands, a change to a payload shape breaks the build instead of silently breaking
the client.

## Measured surface, 2026-09-10

Established by reading the code, not assumed. **The wire surface is confined to
two backend files:** `backend/src/gateway/game.gateway.ts` and
`backend/src/auth/ws-auth.guard.ts`. Nothing else in `backend/src/` emits to a
socket. Every other `.emit()` in the codebase is an in-process NestJS
`EventEmitter2` domain event and is **not** wire traffic. Do not confuse the two:
the gateway subscribes to the in-process events and forwards a subset of them to
sockets, and only that subset is contract.

**Client to server: two events.** `'command'` and `'prompt:reply'`, both
`@SubscribeMessage` handlers in the gateway (lines 930 and 1029).

**Server to client: 30 distinct names.**

| name | notes |
|---|---|
| `event.log` | ~45 emit sites, the highest-traffic event. `{ text, category }` |
| `command:result` | 9 sites |
| `scan:render` | split out of `command:result` |
| `error` | `{ code, message, event? }`, typed locally today as `GatewayError` at `game.gateway.ts:128` — the ONE payload that already has a type |
| `auth:logout` | `{ reason }` |
| `prompt:ship-name` | `{ step, rule }` |
| `prompt:ship-select` | |
| `player.snapshot` | `{ players, selfShipId? }` |
| `player.joined` | |
| `player.left` | `{ shipId }` |
| `player.sector` | `{ updates }` |
| `fkeys.snapshot` | `{ fkeys }` |
| `physics.sector-transition` | |
| `sector:ship-left` / `sector:ship-entered` | `{ shipId, shipName }` |
| `combat.phaser-fired`, `combat.hit`, `combat.miss`, `combat.decoy-intercept`, `combat.mine-detonation`, `combat.ship-destroyed` | from `combat-events.ts` |
| `cybertron.taunt`, `cybertron.broke-off` | from `CYBERTRON_EVENT` |
| `droid.annoy`, `droid.spawned`, `droid.killed` | from `DroidEvents` |
| `beacon` | `BEACON_EVENT` in `gateway/events/beacon.event.ts` |
| `command.notice`, `message.send`, `ship.renamed` | reached only via the dynamic broadcast path |

**The dynamic broadcast path is typeable.** `game.gateway.ts` lines 2622, 2643
and 2677 emit `broadcast.event`, a name carried in a command handler's result
(`broadcasts` in `backend/src/game/commands/command.types.ts:39`, where it is
typed `event: string`). That looks untypeable but is not: across all 55 handlers
the set of names actually used is exactly five — `command.notice`, `event.log`,
`message.send`, `player.snapshot`, `ship.renamed`. Narrowing that field from
`string` to a union of those five is what lets the typed emit map cover the
dynamic path.

**Five events are emitted and nothing listens.** The frontend has no handler for
`combat.miss`, `combat.mine-detonation`, `cybertron.broke-off`, `beacon`, or
`command.notice`. There are no orphans in the other direction: every frontend
listener has a matching backend emit, apart from Socket.io's own `connect`,
`disconnect`, `connect_error` and `reconnect_attempt`.

## Global Constraints

- **Branch is `restructure`.** Never commit to `master`. Nothing here deploys:
  the build trigger is master-only.
- **Zero gameplay change.** No event name, payload field, or field value may
  change. This phase changes where declarations live and who type-checks them.
- **`VERSION` is not bumped.** Rick's call, 2026-09-10. The bump happens once, in
  the merge commit.
- **Event name strings are frozen.** See the ruling below.
- Suite baselines entering this phase: backend **607 suites / 6,154 tests**;
  frontend **39 files / 310 tests**. Every task must leave both green. Tasks that
  add or remove tests must state the new expected counts.
- TypeScript is exactly `6.0.3` in every package, including the new one. Never
  7.x while `ts-jest` is present.
- Node is `24`. `engines.node` must be `">=24"` on every package, including the
  new one, and `backend/test/unit/node-runtime-version.spec.ts` asserts it on
  `backend/package.json` and `frontend/package.json`.
- Backend is CommonJS (`"module": "commonjs"`). Frontend is ESM
  (`"type": "module"`, `moduleResolution: "bundler"`). The shared package must
  serve both. ESM conversion is phase 5, not this phase.
- Do not bump `@nestjs/*`, `prisma`, `@prisma/client`, `socket.io`, `react`, or
  `vite`. Phase 5 owns those.
- Do not touch `reference/**` — READ ONLY.
- Every commit message ends with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_015pWKHSJJ3wvC1bwwAHFwtz`

## Two rulings that revise the phase-1 sketch in the spec

**1. Event name strings are NOT unified in this phase.** The spec's phase-1
bullet says "One naming convention for events. Pick dot or colon and convert."
That is withdrawn. Eight of the thirty names use a colon (`command:result`,
`scan:render`, `prompt:ship-name`, `prompt:ship-select`, `auth:logout`,
`sector:ship-left`, `sector:ship-entered`, and inbound `prompt:reply`) while the
rest use a dot. Renaming them buys cosmetic consistency and risks a missed call
site, and a silently dropped event in a real-time game is the hardest class of
bug to notice — nothing errors, a message just never arrives. The value of this
phase is the single typed declaration, which is fully achieved with the strings
left exactly as they are. Unify the **declaration**, freeze the **strings**.
Record the inconsistency as a deliberate deviation.

**2. The five dead events are recorded, not removed.** Deleting an emit is a
behaviour change and this phase forbids those. Removing it might also be wrong:
`beacon` has a spec contract and a payload interface, so the missing listener may
be an unfinished feature rather than dead code. Record all five and let a later
phase decide each on its merits.

## File structure

- **Create** `package.json` at the repo root — workspace declaration only, no
  dependencies, `"private": true`.
- **Create** `packages/wire/` — the shared declaration.
  - `package.json` — dual CJS/ESM `exports`, `engines.node >= 24`.
  - `tsconfig.json`, `tsconfig.cjs.json`, `tsconfig.esm.json` — the dual build.
  - `src/events.ts` — every event name as an `as const` string.
  - `src/payloads.ts` — every payload interface.
  - `src/socket.ts` — `ServerToClientEvents` and `ClientToServerEvents`.
  - `src/index.ts` — the public surface.
- **Modify** `backend/src/gateway/game.gateway.ts` — typed `Server`, imports from
  the package.
- **Modify** `backend/src/auth/ws-auth.guard.ts` — typed emits.
- **Modify** `backend/src/game/commands/command.types.ts` — narrow
  `broadcasts[].event` from `string` to the five-name union.
- **Modify** `frontend/src/types/contracts.ts` — becomes a re-export of the
  package, or is deleted with its importers repointed.
- **Delete** `frontend/test/contracts-parity.spec.ts` — the duplication it
  guarded is gone.

---

### Task 1: The workspace and an importable empty package

**Files:**
- Create: `package.json` (repo root), `packages/wire/package.json`,
  `packages/wire/tsconfig.json`, `packages/wire/tsconfig.cjs.json`,
  `packages/wire/tsconfig.esm.json`, `packages/wire/src/index.ts`
- Test: `backend/test/unit/wire-package-resolves.spec.ts` (create),
  `frontend/test/wire-package-resolves.spec.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: a package importable as `@ge/wire` from BOTH apps. Exports one
  probe symbol, `WIRE_CONTRACT_VERSION`, typed `string`, valued `'1'`. Later
  tasks add the real surface.

**Why this task exists alone:** the CommonJS-to-ESM seam is the single most
likely thing to go wrong in this phase, and it is far cheaper to prove it with
one exported constant than to discover it after moving thirty event names. This
task's entire deliverable is: both apps can import the same symbol and both test
runners agree.

**Context an engineer needs:** the repo has no root `package.json` today; each
app installs independently. The backend compiles to CommonJS and runs the
compiled output from `dist/`, so anything it imports must exist as real
JavaScript at runtime — a source-only package will type-check and then fail to
boot. The frontend is ESM and bundled by Vite, which can consume either. Hence
the dual build: `tsc` twice, and an `exports` map that points `require` at the
CJS output and `import` at the ESM output.

- [ ] **Step 1: Write the two failing tests**

Create `backend/test/unit/wire-package-resolves.spec.ts`:

```ts
import { WIRE_CONTRACT_VERSION } from '@ge/wire';

/**
 * The shared wire package must be importable from the CommonJS backend.
 *
 * The backend compiles to CommonJS and runs `dist/`, so the package has to
 * exist as real JavaScript at runtime — a source-only workspace package
 * type-checks and then fails to boot. The frontend is ESM. One declaration has
 * to serve both, which is why the package ships a dual build and why this
 * assertion exists on both sides rather than once.
 *
 * @see docs/superpowers/plans/2026-09-10-restructure-phase-1-wire-contract.md
 */
describe('@ge/wire from the backend', () => {
  it('resolves and exports the probe symbol', () => {
    expect(WIRE_CONTRACT_VERSION).toBe('1');
  });
});
```

Create `frontend/test/wire-package-resolves.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WIRE_CONTRACT_VERSION } from '@ge/wire';

/**
 * The shared wire package must be importable from the ESM frontend.
 *
 * Counterpart to `backend/test/unit/wire-package-resolves.spec.ts`. Both exist
 * because the package serves a CommonJS consumer and an ESM one, and a dual
 * build that works for one and not the other is the failure this phase most
 * needs to catch early.
 */
describe('@ge/wire from the frontend', () => {
  it('resolves and exports the probe symbol', () => {
    expect(WIRE_CONTRACT_VERSION).toBe('1');
  });
});
```

- [ ] **Step 2: Run both and verify they fail for the right reason**

```bash
cd backend && npx jest test/unit/wire-package-resolves.spec.ts
cd ../frontend && npx vitest run test/wire-package-resolves.spec.ts
```

Expected: both FAIL on module resolution — `Cannot find module '@ge/wire'`. Not a
type error, not an assertion failure. If either fails differently, read the error
before proceeding.

- [ ] **Step 3: Create the root workspace**

Create `package.json` at the repo root:

```json
{
  "name": "galactic-empire-reborn",
  "private": true,
  "workspaces": [
    "packages/*",
    "backend",
    "frontend"
  ],
  "engines": {
    "node": ">=24"
  }
}
```

This declares the workspace and nothing else. It must not gain dependencies or
scripts: each app keeps its own, and a root script would create a second place
to look for how the project builds.

- [ ] **Step 4: Create the package**

`packages/wire/package.json`:

```json
{
  "name": "@ge/wire",
  "version": "0.0.0",
  "private": true,
  "description": "The Socket.io contract between the backend and the browser. One declaration, two consumers.",
  "type": "module",
  "main": "./dist/cjs/index.js",
  "module": "./dist/esm/index.js",
  "types": "./dist/esm/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/esm/index.d.ts",
      "require": "./dist/cjs/index.js",
      "import": "./dist/esm/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "npm run build:cjs && npm run build:esm && node -e \"require('fs').writeFileSync('dist/cjs/package.json', JSON.stringify({type:'commonjs'}))\"",
    "build:cjs": "tsc -p tsconfig.cjs.json",
    "build:esm": "tsc -p tsconfig.esm.json",
    "clean": "node -e \"require('fs').rmSync('dist',{recursive:true,force:true})\""
  },
  "devDependencies": {
    "typescript": "^6.0.3"
  },
  "engines": {
    "node": ">=24"
  }
}
```

The `dist/cjs/package.json` written by the build script is the standard trick
that stops Node treating the CommonJS output as ESM, because the package's own
`"type"` is `"module"`. Without it, `require()` of the CJS build throws
`ERR_REQUIRE_ESM` at runtime — which the backend would hit on boot, not in tests.

`packages/wire/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "rootDir": "src",
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

`packages/wire/tsconfig.cjs.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "ignoreDeprecations": "6.0",
    "outDir": "dist/cjs"
  }
}
```

`packages/wire/tsconfig.esm.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist/esm"
  }
}
```

`ignoreDeprecations` appears in the CJS config for the same reason it appears in
`backend/tsconfig.json`: TypeScript 6 deprecates `moduleResolution: "node"`.
`docs/DECISIONS.md` records that this is also what blocks type-aware linting and
what phase 5 must resolve.

`packages/wire/src/index.ts`:

```ts
/**
 * The Socket.io contract between the NestJS backend and the React frontend.
 *
 * One declaration, two consumers. Before this package existed the contract was
 * declared twice — in `frontend/src/types/contracts.ts` and in
 * `specs/003-ship-commands/contracts/shared-types.ts` — and kept identical by a
 * test, while the backend imported neither and wrote every payload as an inline
 * object literal. So it was enforced between two consumers and unenforced
 * against the producer.
 *
 * @see docs/superpowers/specs/2026-09-10-restructure-design.md
 */

/**
 * Probe symbol proving the package resolves from both a CommonJS and an ESM
 * consumer. Asserted by a spec in each app. Not a semantic version of the
 * contract and not read by any runtime code — if the contract ever needs real
 * versioning, that is a deliberate design change, not a bump of this string.
 */
export const WIRE_CONTRACT_VERSION = '1';
```

- [ ] **Step 5: Install the workspace and build the package**

```bash
cd /home/rick/dev/galactic-empire-reborn
npm install
npm run build --workspace @ge/wire
ls packages/wire/dist/cjs/index.js packages/wire/dist/esm/index.js packages/wire/dist/cjs/package.json
```

Expected: all three files exist. `npm install` at the root now manages all three
workspaces and creates a root `package-lock.json`; the per-app lockfiles may be
rewritten or removed by npm. Report exactly what happened to
`backend/package-lock.json` and `frontend/package-lock.json` — CI runs `npm ci`
in each app directory and that must keep working, which Task 1 Step 8 verifies.

- [ ] **Step 6: Point both apps' TypeScript at the package**

The workspace symlink in `node_modules/@ge/wire` makes runtime resolution work.
Type resolution also needs the backend to see the declarations: add to
`backend/tsconfig.json` `compilerOptions`, only if `npx tsc --noEmit` fails
without it:

```json
    "paths": {
      "@ge/wire": ["../packages/wire/dist/esm/index.d.ts"]
    }
```

The frontend needs Vite to resolve the workspace package during dev and build.
Check whether it works unaided first — Vite follows `node_modules` symlinks — and
only add configuration if it does not.

Prefer the smallest change that works, and say in your report which of these you
needed and which you did not.

- [ ] **Step 7: Run both tests and verify they pass**

```bash
cd backend && npx jest test/unit/wire-package-resolves.spec.ts
cd ../frontend && npx vitest run test/wire-package-resolves.spec.ts
```

Expected: both PASS.

- [ ] **Step 8: Verify nothing else broke, including the CI install path**

```bash
cd /home/rick/dev/galactic-empire-reborn/backend
rm -rf node_modules && npm ci && npx prisma generate && npx tsc --noEmit && npm run lint && npm test 2>&1 | tail -5
```

Expected: `npm ci` succeeds and the suite reports **608 suites / 6,155 tests**
(607/6,154 plus this task's one suite and one test). If `npm ci` fails in the app
directory now that a root lockfile exists, that is a CI-breaking change and it
must be fixed in this task — CI runs `npm ci` from `backend/` and `frontend/`,
not from the root. If the fix requires changing `.github/workflows/ci.yml`,
change it and say so.

```bash
cd ../frontend && rm -rf node_modules && npm ci && npm run lint && npm run build && npm test 2>&1 | tail -5
```

Expected: `npm ci` succeeds, build succeeds, and 40 files / 311 tests.

- [ ] **Step 9: Verify the Docker images still build**

```bash
cd /home/rick/dev/galactic-empire-reborn
docker build -t ge-backend:p1t1 -f backend/Dockerfile backend/ 2>&1 | tail -5
docker build -t ge-frontend:p1t1 -f frontend/Dockerfile frontend/ 2>&1 | tail -5
```

**Expect this to fail, and treat fixing it as part of this task.** Both
Dockerfiles set `WORKDIR /app` and `COPY package*.json ./` from inside their own
directory, so the build context is `backend/` or `frontend/` and cannot see
`packages/wire`. A workspace dependency the image cannot resolve is a container
that fails at `npm ci` or at boot.

There are two shapes of fix, and you should choose and justify one:

- Move each image's build context to the repo root and copy `packages/wire` plus
  the root manifest in. This keeps one declaration everywhere and is honest, at
  the cost of a larger build context and edits to both Dockerfiles and both build
  invocations in `.github/workflows/ci.yml`.
- Have each image build the package as a stage and copy its `dist` in.

Prefer the first unless you find a concrete reason against it. Whichever you
pick, both images must build and `docker run --rm --entrypoint node ge-backend:p1t1 -e "require('./dist/src/main.js')"` must load without a module-resolution error.

If you cannot make both images build, stop and report BLOCKED with the exact
error. Do not proceed to Task 2 with a broken image — every later task inherits
it.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json packages/ backend/ frontend/ .github/
git commit -m "build: npm workspace and an importable @ge/wire package

Phase 1 needs one declaration that both a CommonJS NestJS backend and an ESM
Vite frontend can import. That seam is the likeliest thing to break in this
phase, so it ships alone, proved by one exported constant and a spec on each
side, before any event name moves into it.

The package builds twice — CJS and ESM behind an exports map — and writes
dist/cjs/package.json with type:commonjs so require() of the CJS output does
not throw ERR_REQUIRE_ESM at boot.

No event name or payload moved yet. No behaviour change."
```

---

### Task 2: The contract itself

**Files:**
- Create: `packages/wire/src/events.ts`, `packages/wire/src/payloads.ts`,
  `packages/wire/src/socket.ts`
- Modify: `packages/wire/src/index.ts`
- Test: `packages/wire/test/event-names.spec.ts` (create), plus a backend spec
  asserting the package's names match the backend's existing constants

**Interfaces:**
- Consumes: Task 1's `@ge/wire` package and its dual build.
- Produces: `WIRE_EVENTS` (a frozen object of all 30 server-to-client names plus
  the 2 client-to-server names), every payload interface, and the
  `ServerToClientEvents` / `ClientToServerEvents` types Task 3 applies to the
  gateway. Task 4 consumes the same payload interfaces on the frontend.

**Context an engineer needs:** you are moving declarations, not inventing them.
Every payload interface already exists somewhere — `frontend/src/types/contracts.ts`
has the frontend's view, `backend/src/game/combat/combat-events.ts`,
`cybertron-events.ts`, `droid-events.ts` and `gateway/events/beacon.event.ts`
have payload interfaces beside their name constants, and `GatewayError` is
declared at `backend/src/gateway/game.gateway.ts:128`. Where a payload has no
interface anywhere, derive it from the emit sites and say in your report that you
authored it rather than moved it.

**The event name strings are frozen.** Copy each one exactly. A typo here is a
silently dropped event, which is the worst failure mode this phase can produce.
The authoritative values, gathered by reading the code:

Server to client: `event.log`, `command:result`, `scan:render`, `error`,
`auth:logout`, `prompt:ship-name`, `prompt:ship-select`, `player.snapshot`,
`player.joined`, `player.left`, `player.sector`, `fkeys.snapshot`,
`physics.sector-transition`, `sector:ship-left`, `sector:ship-entered`,
`combat.phaser-fired`, `combat.hit`, `combat.miss`, `combat.decoy-intercept`,
`combat.mine-detonation`, `combat.ship-destroyed`, `cybertron.taunt`,
`cybertron.broke-off`, `droid.annoy`, `droid.spawned`, `droid.killed`, `beacon`,
`command.notice`, `message.send`, `ship.renamed`.

Client to server: `command`, `prompt:reply`.

- [ ] **Step 1: Write the failing name-parity test**

Create `packages/wire/test/event-names.spec.ts`. It must assert, for every name
above, that `WIRE_EVENTS` carries that exact string. Write the expected strings
as literals in the test rather than deriving them from the source under test — a
test that reads its expectation from the thing it is testing asserts nothing.

Also create a backend spec that imports both `@ge/wire` and the backend's own
existing constants (`COMBAT_HIT` and the rest from `combat-events.ts`,
`CYBERTRON_EVENT`, `DroidEvents`, `BEACON_EVENT`) and asserts they are equal.
That is the assertion that actually protects against a typo, because it compares
the new declaration against the strings the running game already uses. Put it at
`backend/test/unit/wire-event-parity.spec.ts`.

Note that `packages/wire` has no test runner yet. Add one — Jest to match the
backend, configured minimally — or, if that pulls in more than it earns, put
both specs in the backend and say why in your report. The backend spec is the
load-bearing one.

- [ ] **Step 2: Run and verify failure**

Expected: failure on missing exports from `@ge/wire`.

- [ ] **Step 3: Write the three source files**

`events.ts` holds the names as one frozen `as const` object with a JSDoc line
per event saying who emits it and who listens. Mark the five with no frontend
listener explicitly — `combat.miss`, `combat.mine-detonation`,
`cybertron.broke-off`, `beacon`, `command.notice` — with a note that this is
recorded, not endorsed, and that a later phase decides each.

`payloads.ts` holds the interfaces, moved from the locations named above.

`socket.ts` holds `ServerToClientEvents` mapping every server-to-client name to
its payload signature, and `ClientToServerEvents` for the two inbound ones.

`index.ts` re-exports all three and keeps `WIRE_CONTRACT_VERSION`.

- [ ] **Step 4: Build and verify both tests pass**

```bash
cd /home/rick/dev/galactic-empire-reborn && npm run build --workspace @ge/wire
cd backend && npx jest test/unit/wire-event-parity.spec.ts
```

- [ ] **Step 5: Full verification and commit**

Run `npx tsc --noEmit`, both linters, and both suites. Report the new counts.
Commit with a message stating that the contract now has one declaration, that no
name or payload changed, and that five events are recorded as having no listener.

---

### Task 3: Make the compiler enforce it on the producer

**Files:**
- Modify: `backend/src/gateway/game.gateway.ts`,
  `backend/src/auth/ws-auth.guard.ts`,
  `backend/src/game/commands/command.types.ts`
- Test: the existing suite, plus a compile-level assertion

**Interfaces:**
- Consumes: Task 2's `ServerToClientEvents` and `ClientToServerEvents`.
- Produces: a gateway whose emits are type-checked. Nothing downstream depends
  on new exports.

**Context an engineer needs:** this is the task that makes the phase worth doing.
Type the gateway's `Server` and `Socket` with the generics from `@ge/wire`, so a
wrong event name or a wrong payload shape is a build error. Socket.io supports
this natively — `Server<ClientToServerEvents, ServerToClientEvents>`.

`command.types.ts:39` types the dynamic broadcast's `event` as `string`. Narrow
it to the five-name union. That is what closes the last hole in the typed map.

**Expect this task to surface real mismatches.** Forty-five `event.log` emit
sites written as free object literals will not all agree. Where a site disagrees
with the declared payload, the payload declaration is probably what is wrong,
because the emit sites are what the game actually sends and the frontend already
consumes them. **Do not change what is sent.** Fix the declaration to match
reality, and list every such correction in your report with file:line. If a site
genuinely sends something the frontend cannot handle, that is a finding to
report, not a thing to fix here.

- [ ] **Step 1: Record the baseline** — `npx tsc --noEmit` clean, suite green.
- [ ] **Step 2: Apply the generics** to `Server` and `Socket` in both files.
- [ ] **Step 3: Run `npx tsc --noEmit`** and work through every error. Each one
      is either a payload declaration to correct or a genuine mismatch to report.
- [ ] **Step 4: Narrow** `broadcasts[].event` in `command.types.ts`.
- [ ] **Step 5: Run `npx tsc --noEmit`** again to clean, then the full suite.
- [ ] **Step 6: Commit** with every declaration correction listed in the message.

---

### Task 4: The frontend consumes the same declaration

**Files:**
- Modify: `frontend/src/types/contracts.ts`, `frontend/src/socket/socketClient.ts`,
  `frontend/src/socket/useSocket.ts`, and any other importer of the local types
- Delete: `frontend/test/contracts-parity.spec.ts`
- Test: the existing frontend suite

**Interfaces:**
- Consumes: Task 2's payload interfaces and `WIRE_EVENTS`.
- Produces: nothing new.

**Context an engineer needs:** `frontend/src/types/contracts.ts` is 172 lines and
its docblock says it duplicates `specs/003-ship-commands/contracts/shared-types.ts`
with parity enforced by `frontend/test/contracts-parity.spec.ts`. Both of those
stop being true once the frontend imports `@ge/wire`.

Two shapes are acceptable: turn `contracts.ts` into a thin re-export so importers
do not move, or delete it and repoint every importer. Prefer deleting it if the
importer count is small — a re-export file that exists only for history is the
kind of thing a hostile reader points at. Count the importers first and say which
you chose and why.

Also type the client socket with the same generics, so the frontend's listeners
are checked too.

`specs/003-ship-commands/contracts/shared-types.ts` lives under `specs/` and is a
historical spec artifact. Leave it in place and add a one-line note at its top
saying it has been superseded by `@ge/wire`. Deleting a spec artifact loses
history that `docs/CLAUDE.md` says to keep.

- [ ] **Step 1** Count and list the importers of `frontend/src/types/contracts.ts`.
- [ ] **Step 2** Repoint them at `@ge/wire`, or make `contracts.ts` a re-export.
- [ ] **Step 3** Type the client socket with the generics.
- [ ] **Step 4** Delete `frontend/test/contracts-parity.spec.ts`. This LOWERS the
      frontend test count — report the exact new numbers.
- [ ] **Step 5** Note the supersession in the `specs/` copy.
- [ ] **Step 6** Run the frontend suite, `npm run build`, and the lint. Commit.

---

### Task 5: Close out the phase

**Files:**
- Modify: `docs/superpowers/specs/2026-09-10-restructure-design.md`,
  `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`

**Context an engineer needs:** read `docs/CLAUDE.md` first. `PROGRESS.md` is
append-only for dated entries with an `<!-- INDEX -->` block to update;
forward-looking sections may be edited in place. `ARCHITECTURE.md` genuinely does
change this phase — there is a new package in the module map.

Record in `DECISIONS.md`:

1. **Event name strings frozen, mixed conventions kept.** Eight colon-separated
   names against twenty-two dot-separated. Renaming risks a silently dropped
   event for cosmetic gain; the typed declaration delivers the phase's value
   without it. Record it as a deliberate deviation so nobody "tidies" it later
   without weighing that.
2. **Five events emitted with no frontend listener**, recorded not removed:
   `combat.miss`, `combat.mine-detonation`, `cybertron.broke-off`, `beacon`,
   `command.notice`. Deleting an emit is a behaviour change. `beacon` has a spec
   contract and a payload interface, so a missing listener may be an unfinished
   feature. **Record this as an open item** in one of the three places
   `docs/CLAUDE.md` designates.
3. **The dual CJS/ESM build in `packages/wire`**, and that phase 5's ESM
   conversion should collapse it to a single build.
4. Whatever Task 1 decided about the Docker build context, and whatever Task 3
   corrected in the payload declarations.

- [ ] **Step 1** Tick phase 1 in the spec, set the status line to `phase 2 next`,
      and add anything execution proved wrong to its blockers section.
- [ ] **Step 2** Write the `DECISIONS.md` entries.
- [ ] **Step 3** Update `ARCHITECTURE.md` with the new package.
- [ ] **Step 4** Append the `PROGRESS.md` entry and update its index block.
- [ ] **Step 5** Run both suites, commit.

---

## Phase exit criteria

- `@ge/wire` is the only place any wire event name or payload shape is declared.
- The backend's `Server` and `Socket` carry the generics, so a wrong payload is a
  build error. `npx tsc --noEmit` clean.
- `frontend/test/contracts-parity.spec.ts` is gone, and no file duplicates the
  contract.
- Every one of the 30 server-to-client names and 2 client-to-server names is
  byte-identical to what it was before this phase. No exceptions.
- Both suites green, both linters exit 0, both Docker images build, and the
  backend image boots.
- `npm ci` still works from inside `backend/` and `frontend/`, because that is
  what CI runs.
