# Restructure spec

**Branch:** `restructure`. **Started:** 2026-09-10. **Status:** phase 2 next.

This is the SPEC for the restructure and the recovery document for a lost session.
Executable per-phase plans live beside it in `docs/superpowers/plans/2026-09-10-restructure-phase-N-*.md`. If a session is lost or
compacted, read this file first — it carries the measurements, the decisions
already made, the blockers already discovered, and the phase we are on.

## Why this exists

The goal Rick set: reach a state where the code can be optimised and
restructured **without changing what the game does**, with tests provably rooted
in canon. The test layer built through 2026-09-10 was the precondition. This is
the work it was built for.

Second goal, stated 2026-09-10: the repository goes public. It must not read as
"AI slop". The structure has to be defensible to a hostile reader.

## Ground rules

- **Zero gameplay change.** Every phase is structural or a dependency bump. If a
  canon value moves, that is a bug in the refactor, not a decision.
- **Nothing reaches production until Rick tests the whole branch on dev.**
- **One commit per coherent step, suite green at each.** All five phases merge
  to master together, so `git bisect` is the only tool that will localise a
  regression. Commit discipline is what keeps it usable.
- **Citations move with the code.** 178 of 270 backend source files carry `@see`
  references to `reference/ge-source/`. That tree does not move, so relocating a
  service does not break traceability. Never drop a citation while moving a file.
- **Feature-first, not layer-first.** See "Target structure" below.
- Standing project rules still apply: `/reference/` is read-only, never
  `prisma db push`, never `prisma migrate reset`.
- **`VERSION` is NOT bumped during the restructure phases.** Rick's explicit
  call, 2026-09-10: no version bumps for restructure work until we are ready to
  merge. The root `CLAUDE.md` rule is "bump `VERSION` in the same commit as any
  change that will be deployed" — and it still holds, because **nothing on this
  branch deploys**. The push trigger is master-only, so no phase-0..5 commit can
  reach ghcr or the watchtower on the Plesk host. The bump belongs in the merge
  commit, once, and it must actually land there: that merge is a real production
  deploy carrying a runtime major and a CSS-engine major together. Do not
  "correct" this against the root rule — the two agree.

## Production safety on this branch

Verified 2026-09-10 by reading `.github/workflows/ci.yml`:

- The push trigger is `branches: [master]`. Pushing `restructure` runs **nothing**.
- The `pull_request` trigger has no branch filter, but the `build` job requires
  `github.event_name == 'push'`. So a PR runs **both test suites and no image build**.
- Working pattern: commit here freely, open a **draft PR** for free CI on every
  push, with no path to ghcr and no path to the watchtower on the Plesk host.

**TRAP.** If this branch is ever added to the push trigger to get CI without a
PR, the `build` job's condition becomes true and it will ship `:latest` straight
to production. That condition needs `github.ref == 'refs/heads/master'` added
first.

## Measurements taken 2026-09-10

Baseline. Re-measure at the end; these are the before numbers.

| | files | lines |
|---|---|---|
| backend src | 270 | 41,826 |
| backend tests | 615 | 95,041 |
| frontend src | 43 | 3,521 |
| C source (reference) | 9 | 16,065 |

Backend suite: 605 suites / 6,141 tests, ~100s local, ~240s on a hosted runner.
Frontend: 39 files / 310 tests, ~15s.

**Post-phase-0 (2026-09-10), measured, not overwriting the baseline above:**
backend 607 suites / 6,154 tests, ~117s local; frontend unchanged at 39 files /
310 tests, ~15s. The backend suite grew by 2 suites / 12 tests across phase 0:
`node-runtime-version.spec.ts` (Task 1, 5 tests) and `lint-gate.spec.ts`
(Task 4, grew from 4 to 7 tests during its fix round).

**Post-phase-1 (2026-09-10/11), measured, not overwriting the baselines above:**
backend 609 suites / 6,161 tests (up 2 suites / 7 tests: `wire-event-parity.spec.ts`
in `packages/wire`'s own Jest run plus the growth of
`gateway-broadcast-branches.spec.ts` and `gateway-event-coverage.spec.ts` during
Task 3's fix rounds), ~118s local. Frontend **dropped** 40 files / 311 tests to
39 files / 299 tests — the only reduction either suite has taken this
restructure, and it is accounted for exactly: `frontend/test/contracts-parity.spec.ts`
(1 file, 12 tests) was deleted because the duplication it guarded no longer
exists. `packages/wire` carries its own small Jest run (1 suite / 3 tests),
outside both app suites' counts, per its own toolchain (Task 2, allowed by the
brief).

### What the analysis found

**The backend is NOT a 1-1 transliteration of the C.** It is citation-traced and
domain-sliced. 178 of 270 files cite C by file and line (373 citations to
`GECMDS.C` alone). The C *domain* boundaries survive as directories — cybertron,
droid, planet — but `GECMDS.C`'s 6,165 lines became 55 handler files. **No part
of the current layout is load-bearing for canon.** Files may move freely.

**The tests are a genuine behaviour net, not a structure net.**

| signal | count |
|---|---|
| total assertions | 8,385 |
| assertions on mock calls | 546 (6.5%) |
| specs reaching into private members | 7 sites |
| specs with no infrastructure at all | 259 |
| specs asserting player-visible output | 204 |
| specs constructing a service with positional `new X(...)` | 307 |
| `as never` / `as unknown as` casts | 1,862 across 338 files |
| specs defining their own ship factory inline | 248 |
| specs importing a shared helper | 23 |

Read: the suite will shout if we change *what the game does*. It will stay
silent if we change *what the code is*, and it charges a mechanical edit tax on
every constructor signature change. `PresenceService` is constructed in 56
specs, `GameGateway` in 51, `PlanetStateService` in 48.

**The structural problems, in priority order.**

1. `src/gateway/game.gateway.ts` — 2,681 lines, 11 injected dependencies, only 2
   `@SubscribeMessage` handlers. A second application layer wearing a transport
   layer's name.
2. No persistence boundary. 40 files outside `src/prisma/` inject `PrismaService`
   directly. 197 specs reference prisma.
3. The wire contract is **unenforced on the producing side**. It exists twice, at
   `frontend/src/types/contracts.ts` and
   `specs/003-ship-commands/contracts/shared-types.ts`, kept in sync by
   `frontend/test/contracts-parity.spec.ts`. **The backend imports neither and
   declares neither.** Every payload is an untyped object literal at the emit
   site — 45 for `event.log` alone.
4. Two event-naming conventions side by side: `event.log` / `player.snapshot`
   versus `command:result` / `sector:ship-left`. Some names are inline literals,
   some are exported constants (`BEACON_EVENT`, `DroidEvents`, `CYBERTRON_EVENT`).
5. Seven `forwardRef` calls — real module cycles.
6. No ESLint/oxlint config in the backend. (Strict TS is holding: only 4 `any`.)
7. `scan.handler.ts` at 1,258 lines is the only oversized handler.

## Target structure

Researched 2026-09-10, and it **corrected an earlier draft of this plan**. The
first draft proposed four global layers (domain / application / persistence /
transport). Prevailing guidance says the opposite for non-trivial apps: structure
**by feature**, layer **within** the feature. Global `services/` `controllers/`
`repositories/` folders are the pattern that stops scaling.

**We are already feature-first** — `game/combat`, `game/cybertron`, `game/planet`,
`game/physics` are the recommended shape and they match the C boundaries. Only
two things deviate: the gateway (a global transport god-object) and Prisma
(injected everywhere instead of owned per feature). Those are phases 2 and 3.

Explicitly **not** doing: DDD ceremony, entities/value-objects/aggregates, CQRS,
hexagonal ports-and-adapters as a formal structure. The templates offering those
solve for teams and bounded contexts we do not have, and adopting them would
itself read as cargo cult.

Also: **keep the 55 handler files flat.** Flat is greppable and the router
already indexes them. Split only `scan.handler.ts`.

Sources: <https://encore.dev/articles/nestjs-project-structure-best-practices>,
<https://docs.nestjs.com/modules>, <https://socket.io/docs/v4/typescript/>.

## Version research, 2026-09-10

We were two majors behind on nearly everything.

| | was | latest |
|---|---|---|
| Node | 20 (**EOL 2026-04-30**) | 24 LTS |
| NestJS core | 10.4 | 12.0 |
| Prisma | 5.22 | 7.10 |
| TypeScript | 5.7 | 7.0 |
| Jest | 29 | 30 |
| React | 18.3 | 19.3 |
| Vite | 5.4 | 8.3 |
| Vitest | 2.1 | 5.0 |
| Tailwind | 3.4 | 4.3 |
| Socket.IO | 4.8.1 | 4.8.3 (current) |

GitHub reports **30 open Dependabot alerts**: 1 critical (vitest, fixed 3.2.6),
13 high, 13 medium, 3 low. Runtime-path ones: `socket.io-parser`, `ws`, `multer`,
`form-data`, `body-parser`. Most are resolved by the bumps already planned.
**Rick's call 2026-09-10: address Dependabot for production LATER; the branch
focus is the restructure.**

### Blockers and constraints discovered

- **`ts-jest` peers on `typescript: ">=4.3 <7"`.** TypeScript 7 is unavailable to
  the backend while we use ts-jest. NestJS 12's toolchain replaces Jest with
  Vitest, which is what unblocks it. **Decision: phase 0 takes TypeScript 6.0.3
  across both apps; TypeScript 7 moves to phase 5.**
- **Prisma 7 requires ESM** (`"type": "module"`) and mandatory driver adapters.
  Backend is CommonJS (`"module": "commonjs"`). Frontend is already ESM
  (`"type": "module"`, `moduleResolution: bundler`). So ESM + Prisma 7 + Nest 12
  are **one arc**, not three independent bumps. ~1,060 relative imports in
  `backend/src` alone would need extensions.
- **oxlint's type-aware linting went stable July 2026**, covers 59 of
  typescript-eslint's 61 type-aware rules, tracks TypeScript 7.0.2, and runs
  20-40x faster. It is also where NestJS 12's own toolchain is heading. **Chose
  oxlint over ESLint.** (An earlier draft wrongly claimed TS 7 blocked type-aware
  linting entirely.)
- **Standard Schema validation** (Zod/Valibot in `@Body`/`@Query`/`@Param`) is a
  Nest 12 feature. Our entire validation surface is **3 DTO files** in
  `src/auth/dto/`. Not worth sequencing around.
- Node 24 chosen over 22: Active LTS to 2028-04-30, and it is what Nest 12
  targets. Node 22 is Maintenance only, ending 2027-04-30.
- **The deprecated `moduleResolution: "node"` in `backend/tsconfig.json` is a
  phase 5 blocker, not just a TypeScript 6 deprecation warning.** TypeScript 6
  requires `"ignoreDeprecations": "6.0"` to keep using it (phase 0, Task 2), and
  it is the *same* setting that stopped backend type-aware oxlint from running
  at all in phase 0, Task 4: `oxlint-tsgolint` is built on typescript-go
  tracking TypeScript 7, and TS7 removed the option outright (it was the legacy
  `node10` algorithm under an alias), so tsgolint refuses the tsconfig before
  it can analyse anything. The frontend has no such problem — it already uses
  `moduleResolution: "bundler"` and runs `--type-aware` oxlint cleanly. Phase 5
  (ESM + Prisma 7 + NestJS 12 + TypeScript 7) is what finally forces backend
  off `"node"`, and that same move is what will let backend oxlint go
  type-aware. One underlying fact, two separate phase-0 findings — worth
  knowing as one thing, not two coincidences.

## The phases

Split by **whether an upgrade can change runtime behaviour**, not by calendar.

### Phase 0 — security and toolchain (behaviour-neutral)

- [x] Node 20 → 24 in `backend/Dockerfile`, `frontend/Dockerfile`,
      `.github/workflows/ci.yml` (both jobs). **Verified: both images build; the
      backend image runs `node v24.21.0` and `dist/src/main.js` loads.**
- [x] Add `engines.node` to both `package.json` files. Pinned by
      `backend/test/unit/node-runtime-version.spec.ts` (`66e53b1`).
- [x] Backend: TypeScript 6.0.3, Jest 30, ts-jest latest (`84ccc49`).
- [x] Frontend: React 19, Vite 8, Vitest 5, Tailwind 4 (config rewrite),
      TypeScript 6.0.3. One batch — it is only 3,521 isolated lines (`0e3d4d0`).
- [x] oxlint with type-aware rules, both apps, wired into CI. Frontend runs
      `--type-aware`; backend runs syntax-only (see the `moduleResolution`
      blocker above). (`1050298`, fix round `30f9975`.)

### Phase 1 — one typed wire contract — COMPLETE 2026-09-10

- [x] Root npm workspace (`packages/*`, `backend`, `frontend`), single root
      `package-lock.json`, `@ge/wire` symlinked in. (Task 1, `84da4b3`.)
- [x] `packages/wire` — dual CJS/ESM build, `WIRE_EVENTS` (30 server-to-client +
      2 client-to-server names, `as const`), the payload interfaces, and the
      Socket.io `ServerToClientEvents`/`ClientToServerEvents` generic maps.
      Proven to resolve from both a CommonJS and an ESM consumer. (Task 2,
      `64495c2`.)
- [x] Backend's `Server`/`Socket` typed with those generics throughout
      `game.gateway.ts` and `ws-auth.guard.ts`; `CommandBroadcast` made a real
      discriminated union so the broadcast-dispatch path narrows without a
      cast; zero `as`/`any`/non-null assertions anywhere in the diff. (Task 3,
      `9e1812d`.)
- [x] Frontend repointed at the same declaration: `contracts.ts` and
      `frontend/test/contracts-parity.spec.ts` deleted, 14 importers
      repointed, `specs/003-ship-commands/contracts/shared-types.ts` kept with
      a SUPERSEDED note rather than deleted. (Task 4, `f6121d0`.)

**Blocker execution proved wrong:** the plan's "pick dot or colon and
convert" bullet was withdrawn before execution (see the ruling in the
phase-1 ledger and the frozen-names decision in `docs/DECISIONS.md`
2026-09-11), not discovered wrong mid-task.

**Open gap against this phase's own exit criteria, found verifying this
close-out and NOT fixed here (documentation-only session):** neither Docker
image builds on this branch. `backend/package.json` and
`frontend/package.json` both depend on `@ge/wire` via `file:../packages/wire`
(added `84da4b3`), but neither Dockerfile's build context was moved to the
repo root and neither builds `packages/wire` as its own stage — the fix
Task 1's own brief anticipated and named two shapes for, Step 9 of that
brief. `docker build -f backend/Dockerfile backend/` and the frontend
equivalent both fail at `npm ci`. See `docs/DECISIONS.md` 2026-09-11 for the
full reproduction and `docs/PROGRESS.md` 2026-09-11 for the tracked known
issue. **Phase 2 (or a fix commit ahead of it) must resolve this before any
Docker image is rebuilt from this branch** — it is not a phase-1-in-progress
state, it is phase 1 shipping without one of its own exit criteria met.

**RESOLVED 2026-09-11, `540f65f`** — before phase 2 started, as this entry
required. Both Dockerfiles now take the repo root as build context
(`docker build -f backend/Dockerfile .`), build `packages/wire` as its own
stage, and `@ge/wire` was verified resolvable inside the running backend
image. CI's `context:`/`file:` pair was updated to match. Phase 1's exit
criteria are met as of this commit; the gap above is kept as the record of
how it was missed.

The five defects the typing surfaced and the one accepted behaviour change
are recorded in `docs/DECISIONS.md` 2026-09-11, not here.

After this the frontend and backend are genuinely independent and phases 2-4 can
run in any order or in parallel.

### Phase 2 — split the gateway

- [ ] Break `game.gateway.ts` into per-concern collaborators. Transport only:
      parse in, dispatch, serialise out. No game logic, no Prisma.
- [ ] Split `scan.handler.ts` (1,258 lines).

Medium risk, mostly moving code behind unchanged entry points.

### Phase 3 — persistence boundary

- [ ] Per-feature repositories. `PrismaService` appears in one place per feature,
      not in 40 files.
- [ ] Retire the 7 `forwardRef` calls by fixing the cycles they mask.
- [ ] Narrow interfaces at the injection seams.

**This phase doubles as the test-fixture fix.** Typed seams turn the 1,862
`as never` casts from a liability into compile-checked coverage, and a shared
typed ship factory retires the 248 inline copies. Same work, two payoffs. It is
also what makes phase 5's Prisma upgrade touch ~4 files instead of 40.

Highest value, highest test churn.

### Phase 4 — frontend restructure

- [ ] 3,521 lines across 43 files. `App.tsx` at 388 is the largest.

Runs in parallel with 2 and 3, any time after phase 1.

### Phase 5 — ESM, Prisma 7, NestJS 12 (behaviour-risky)

- [ ] Backend CommonJS → ESM.
- [ ] Prisma 5 → 7 (Rust-free client, driver adapters, client generated into the
      source tree). Requires ESM.
- [ ] NestJS 10 → 12 via `nest upgrade`. Requires Node 20.19+/22.12+.
- [ ] Jest → Vitest on the backend (Nest 12's toolchain; also unblocks TS 7).
- [ ] TypeScript 6 → 7 once ts-jest is gone. 8-12x faster builds on 137k lines.

Last because it is the **only** phase that can change runtime behaviour, and it
needs the test suite as an unambiguous oracle. 197 specs touch Prisma.

## Pause condition

Rick, 2026-09-10: pause the restructure if a bug shows up on production that
affects gameplay. Production runs master, which this branch does not touch.

## Open questions

- Whether `specs/` and `docs/audits/` ship with the public repo. 55 source files
  cite those paths.
- `backend/src/game/config/game-config.ts` cites `docs/CANON_AUDIT_2026-09.md`,
  which does not exist.
- The public guide has no `GUIDE_DEVIATIONS` entry for `tra`, so it never
  mentions ship-to-ship transfer.
