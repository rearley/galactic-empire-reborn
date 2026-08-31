## 2026-08-31 — social/mail/economy playtest: teams, mail lifecycle, planet production

**Completed:**
- **Roster prints the player name, not the synthetic userid.** `ros` selected `userid`, which in
  MajorBBS *was* the handle but here is a `usr_<hex>` surrogate, so every row read
  `usr_a9070dc745a8688f`. Now selects and renders `username`, header column relabelled "Name".
- **`ros` and `tea list` columns line up with their headers.** Both headers were hand-spaced string
  literals that had drifted from the `padStart` widths of the rows beneath them. Both are now built
  from the same width expressions as the rows, with a test per command asserting the right-aligned
  columns share end-columns with the header.
- **TEAMBONU is config-driven and no longer pinned to the top of its range.** C computes
  `teambonus = numopt(TEAMBONU,0,32000)*100L` (GEMAIN.C:478) — a sysop `.cnf` option. The port
  hard-coded 3_200_000n, the maximum. A one-member team therefore scored 3.2M against a strong
  player's five-digit score, so `tea list` ranked by member count rather than skill. Now
  `config/game.config.json` (default 0); the balance-regression test pins the *bounds* and the
  x100 scaling instead of one operator's taste. Verified live: Vanguard's score went 3,220,500 -> 20,500,
  exactly its single member's score.
- **Free-text prompts are fed back to the handler that asked.** `land` on an unowned planet asks
  "What would you like to name this planet?", but the answer went through the command router — so
  naming a world "New Terra" matched the `new` verb under 3-char prefix routing and printed the
  `new ship` usage line, leaving the planet unclaimed and no hint that `land <name>` was the real
  syntax. `CommandResult.expectFollowup` now parks the verb on the socket and the gateway
  re-dispatches the next line as `<verb> <answer>`; one-shot, and an empty answer cancels. This is
  the mechanism specs/005 described but nobody built. `land` also joins its args, so multi-word
  planet names survive.
- **Production-report mail no longer shows a timestamp as its sender.** This port repurposes
  `MAILSTAT.dtime` as the sender's userid (spec 017 R3); the midnight builder was writing
  `now.toISOString()` there, which surfaced verbatim in the `mai` From column. Now empty -> "(system)".
- **~25% of generated planets are inhabited again (GEPLANET.C:617-627).** The generator skipped C's
  starting-population branch entirely, so *every* planet in the galaxy had rate 0 and 0 men: a
  claimed colony produced nothing, forever, and production reports, tax and planet cash were dead
  content. `rollPlanetInventory` now reproduces the roll (all items rate 0..5; men 0..50k at rate
  5..29; food 0..3.2k at rate 15..29). `tools/backfill-planet-inventory.ts` brings an
  already-generated galaxy in line without a reset — it skips sector 0,0, which is the hand-seeded
  S00 hub and not a product of `getsector`'s random branch.
- **`MIDNIGHT_ADMIN_TOKEN` documented and set for dev**, so `POST /admin/midnight/run` works locally
  instead of 503-ing; `.env.example` also gained the now-mandatory `TEST_DATABASE_URL`.

**Tests:** full backend suite 3007/3007 across 313 suites, `tsc` strict clean. New:
`test/game/galaxy/planet-seed.spec.ts` (4), `test/gateway/command-followup.spec.ts` (3), column
alignment tests for `ros`/`tea list`, land multi-word name, prodrpt `dtime` empty.

**Verified live (Playwright, full loop):** team create -> list -> show -> leave -> wrong password ->
case-insensitive rejoin; sell; claim a planet by name; midnight run -> production report arrives ->
`rea 1` renders the full item block -> `del 2` -> `mai` renumbers. Planet production confirmed
ticking on a colonised world (men 20000 -> 20041, food 2000 -> 2095, tax 0 -> 333 over ~4 min).

**Fixed a non-hermetic test:** the admin-endpoint 503 case `delete`d `MIDNIGHT_ADMIN_TOKEN`, but
constructing a `PrismaClient` re-loads `backend/.env` into `process.env` (filling absent keys only),
so the key came back before the fresh guard was built. It now blanks the value instead.

**Known issues / not yet exercised:** `sen` comm channels, spy/beacon planet functions, and the
midnight production report's cash/tax columns on a long-running colony.

---

## 2026-08-30 (final) — cap follow-ups fixed; trade-loop playtest findings

**Completed:**
- **PLANET_LIMIT now reaches the player.** `land` awaits the claim and returns the refusal
  (`LAND_PLANET_LIMIT`). My earlier note claimed this needed "a command-router contract change" —
  that was **wrong**: `CommandHandler` already returns `CommandResult | Promise<CommandResult>` and
  22 handlers were already async. No contract change was involved.
- **MAXDROID default 500 -> 6**, the canonical total (3 droid classes at their canon `Make` of 2,
  reference/wiki/cpu-ships.md). At 500 it never bound, since the per-class cap already held the
  population to 6; at the canonical total it is a real backstop, and raising DROID_MAX_PER_CLASS
  without raising this is now caught.
- **Three "must be landed" messages corrected to "must be in orbit".** BUY1, ADM_NOT_LANDED and
  WTHDR_NOT_LANDED all gate on `where < 10`, which is the ORBIT state
  (`orb` sets `where = 10 + plnum`) — identical to C's `cmd_buy` (GECMDS.C:4212). Orbit is
  sufficient; landing was never required. Confirmed live: `buy 10 foo` from orbit returned
  "10 Food Cases purchased for 2 credits". The wording sent me hunting for a landing step that does
  not exist.

**Trade-loop playtest (Playwright, sector 0,0):** orbit -> `pri` -> `buy` all work. `pri` bare lists
all 14 items with 3-letter codes and prices; `buy <qty> <item>` takes a quantity then an item code.

**NEW FINDING — the neutral-zone trade hub is claimable.** Landing on Zygor-3 prompts for a planet
name, and claiming succeeds: the hub was renamed to "MyZygor" and owned by a player mid-playtest
(restored afterwards). Zygor-3 is where `new ship <N>` purchases and most trade happen, so a single
player owning it distorts the whole early game.

C creates neutral-zone planets ALREADY OWNED — `build_plan_1`/`build_plan_2` both do
`strncpy(planet.userid, s00[idx].owner, UIDSIZ)` (GEPLANET.C:671, 737) — and the claim path only
fires when `plptr->userid[0] == 0` (GECMDS.C:3486). Our `S00Entry` has the same `owner` field but
Zygor-3's is `''`, so the planet is created unowned and therefore claimable.

Not fixed here because the C `s00[]` table itself is not in the reference source, so the intended
owner value is unknown — giving it a synthetic system owner is a design choice. Midnight refreshes
the hub by COORDINATES (`xsect: 0, ysect: 0, plnum: 1`), not by name, so a rename does not break the
nightly restock — the severity is gameplay, not corruption.

**Smaller observations from the same session:**
- `orb <n>` while already in orbit returns "You are already in orbit." — you must fire engines to
  leave first, which then drifts you off the planet and needs a re-approach.
- Buying from a planet you own is far cheaper (10 Food Cases for 2 credits against a 4 cr list
  price) — owner pricing, plausible but unverified against C.

**Tests:** 2990 passing across 311 suites; Playwright 17/17.

---

## 2026-08-30 (later still) — sysop config file + population caps wired

**Completed:**
- **`backend/config/game.config.json`** — all 51 sysop options the original exposed via
  `numopt(NAME, min, max)` (GEMAIN.C:459-524), grouped by domain, resolved as
  default -> file -> environment (environment wins, for Docker/CI). Every value is clamped to the
  C bounds, and out-of-range values are clamped *and warned*; an unknown option name or non-numeric
  value is a hard error so a typo fails loudly. Previously 5 were env-tunable and 46 hardcoded.
- **Population caps wired** — MAXPLRS, MAXPLNTS and MAXDROID were declared but inert:
  - `MAXPLRS` gates ENTRY, not registration. GEMAIN.C:2769 checks `numwar < gemaxplrs` where
    `numwar` is players currently in game, so it caps concurrent SEATS. Enforced in
    `handleConnection`; verified live with `MAXPLRS=1`, which logged
    `game full (1/1) — refusing usr_...` and refused the second pilot.
  - `MAXPLNTS` is **per player**, not galaxy-wide — GECMDS.C:3487 checks the claiming user's own
    `planets` count. Enforced in `PlanetStateService.claim`.
  - `MAXDROID` caps total droids across classes; previously only a per-class cap existed, so the
    real ceiling was classes x per-class. Guard mutation-tested (0 spawns with it, 6 without).
- **`decoyIntercept` converted to the C 1-in-N form.** Since feature 006b (2026-05-03) the port read
  `decodds` as a 0-100 percentage where GEFUNCS.C:1585 rolls `gernd() % decodds == 0`. Same knob,
  different parameterisation — which made it incomparable to the C bounds and initially forced a
  special case in the config loader. The switch is behaviour-preserving: the old DECODDS=50 (50%
  intercept) is exactly decodds=2.

**Tests:** 2989 passing across 311 suites; Playwright 17/17. New: `game-config.spec.ts` (22),
`population-caps.spec.ts` (5), `planet-cap.spec.ts` (3), plus MAXDROID cases in `spawn-cap`.

**Known issues:**
- ~~**PLANET_LIMIT is enforced but not surfaced.**~~ A claim beyond MAXPLNTS is correctly refused — the
  planet is not taken — but the player still sees the optimistic `LAND_CLAIMED` line, because
  `land.handler` is synchronous and the claim is fire-and-forget. Surfacing it requires making the
  handler async, which is a command-router contract change. Documented in the handler.
- `NUMSHIPS` is deliberately left unenforced: in C it only sizes the ship array
  (`nships = nterms + numships`, GEMAIN.C:697), with no runtime gate, so adding one would be an
  invention. 24 of the 51 options now back a live constant; the rest are declared with bounds so the
  gap stays visible.
- MAXDROID's shipped default (500) never binds — the natural ceiling is 3 classes x 2 = 6. The cap
  is correct but currently inert; a test documents this rather than pretending otherwise.

---

## 2026-08-30 (later) — Combat playtest: five defects, and the testing gap that hid them

**Completed:**
- **`numopt` bound violations fixed.** These supply CLAMP bounds, not defaults — a value outside them
  is one the original cannot produce. `TDAMMAX` 200→100 (bound 100), `MDAMMAX` 300→100 (bound 100),
  `JAMTIME` 20→10 (bound 10). All numopt-derived constants were audited; `MINEDAMMAX`, `TORFACT`,
  `MISFACT` checked and correct. `DECODDS` deliberately left alone — C uses a 1-in-N roll where the
  port uses a percentage, so its 50 is not comparable to the 1..20 bound.
- **`PDAMMAX` 200→25** (env-tunable) — a free balance choice inside its 1..200 bound. At 200 every
  phaser type one-shot (ships die at damage >= 100; phasrtype 1 computed 155). Now only heavy
  phasers one-shot at point-blank.
- **Mine blast radius was galaxy-wide.** `MINERANGE` is 10 000 RAW units but `cdistance` returns
  SECTORS; C does `ddist *= 10000` before the comparison and the port did not. The guard never fired,
  so every ship in the galaxy was inside every mine. One mine destroyed all 20 Cybertrons in a single
  tick.
- **Shields granted total immunity on three weapon paths.** All set `hullDamage = 0` when shields
  were up. Only the phaser was correct. Fixed torpedo/missile (damage halved via disjoint roll
  ranges) and mine (damage divided by `gernd()%5 + shieldtype`); both also had the wrong shieldhit
  drain argument. See GAME_MECHANICS.md §Shields for the per-weapon table.
- **`sca` verb + 3-char prefix matching**, **`scan se` out-of-bounds crash**, **event-log whitespace
  collapse** — see the earlier entry.
- **Playtest tooling** (all dev-only, `NODE_ENV !== 'production'`): `/debug/ship/outfit`
  (ordnance, damage, hull class, shields, teleport) and `/debug/droid/spawn` (coordinates,
  stationary). Without these, weapon testing was unreachable — clearing the neutral zone by flying
  takes minutes of warp and a Cybertron destroyed the test ship on three consecutive attempts.
- **Ship destruction is now logged.** It previously happened in complete silence, which made three
  lost ships indistinguishable from a bug across two sessions. The first line after the fix
  identified the killer immediately.

**Tests:** 2919 passing across 305 suites (from 2743 at session start). New: `pdammax.balance`,
`projectile-dammax.balance`, `jamtime.balance`, `shield-projectile-fidelity`, `mine-shield-fidelity`,
`mine-range-units`, `phaser-range-characterisation`, `command-router-prefix`, `scan-verb-alias`,
`scan-se-out-of-bounds`, `database-url`, `health`, `combat-spatial.e2e`.

**The testing gap — why 2743 green tests missed all of this:**

Every defect above was found by PLAYING, not by testing, and in each case the test that should have
caught it mocked or pinned the very thing that was wrong:

| Defect | Why the unit suite could not see it |
|--------|-------------------------------------|
| Mine blast radius | Every mine-sweep test placed ship and mine at IDENTICAL coords (100,100) — distance 0, so the range guard was never exercised |
| `scan se` crash | All 26 specs touching GalaxyService stub it with a mock that never throws |
| Shield immunity | The spec was named "shields fully absorbing" but only asserted no subsystem event fired — it passed while documenting wrong behaviour |
| TDAMMAX/MDAMMAX | `balance-regression` PINNED the out-of-bounds values |
| Event-log whitespace | A CSS-level defect; no test asserted the class |

The lesson is not "write more unit tests" — it is that mocked collaborators and zero-distance
fixtures cannot expose spatial or integration truth. `test/e2e/combat-spatial.e2e.spec.ts` is the
start of the missing layer: it boots the real AppModule with no mocks and asserts behaviour that
depends on actual distances between real entities.

**Testing layers — what catches what:**

| Layer | Catches | Cost |
|-------|---------|------|
| Unit with mocks | Formula correctness in isolation | Fast; blind to integration and to anything the mock papers over |
| Unit with REAL fixtures (non-zero distances, real constants) | Spatial/geometry defects — this is what the mine bug actually needed | Fast; the cheapest fix for the gap |
| No-mock integration (`test/e2e/combat-spatial.e2e.spec.ts`) | Wiring across the real service graph | ~9s for a full AppModule boot — cheap enough for the default suite |
| Browser (Playwright) | Rendering and layout: whitespace collapse, scan-map glyphs, panel sizing | Slowest; the only layer that can see CSS-level defects |

Note the mine and shield defects did NOT need a browser to catch — they needed unit fixtures with
real distances instead of everything at (100,100). Only the event-log whitespace collapse genuinely
required a browser.

**Next:**
- Extend the no-mock layer: projectile flight across real distances, scan projection at sector
  boundaries and outside the grid, neutral-zone gating.
- ~~Add a browser-level (Playwright) smoke test~~ — **done**: `frontend/e2e/gameplay.spec.ts`
  (`npm run test:e2e`, ~4s for 3 tests). Covers register → onboard → command round-trip,
  `sca lo` scan rendering, and a mutation-verified regression guard on the event-log whitespace
  collapse. Requires a live backend; Vite is auto-started.
- Audit remaining combat fixtures for zero-distance setups, the pattern that hid the mine bug.
- Verify Cybertron spawn density (24 at boot) against the original; a class 1 starter dies within
  minutes of leaving Zygor.

**Known issues:**
- No CI, so none of the above runs automatically.
- Missiles/torpedoes verified live; mines verified live; phaser-vs-shields verified by test only
  (the live attempt could not be reproduced before targets drifted).
- randamage >101 ceiling diverges from C in a narrow band — documented and pinned, not changed,
  because `rndm(negative)` behaviour is unknowable from the reference source.

---

## 2026-08-30 — Playtest enablement: /health route + test/dev DB isolation

**Completed:**
- **`GET /health` route** (`backend/src/health/health.controller.ts`) — unauthenticated liveness/readiness
  probe returning `{status, database, uptime}`. Returns 200 when a `SELECT 1` against Postgres succeeds,
  503 when it does not. `docker-compose.yml` already healthchecked the backend with
  `wget -qO- http://localhost:3000/health`, but no such route existed, so the backend container
  would have sat permanently `unhealthy`.
- **Test runs no longer destroy the dev database** — `PrismaService` took no datasource override, so it
  resolved `DATABASE_URL` (the dev DB `ge`). ~20 specs build a Nest testing module around `PrismaModule`
  and then call `deleteMany()`/`TRUNCATE`, so `npm test` silently wiped dev game state. Root-caused from
  an observed symptom: `Planet` emptied while `GalaxyMeta` survived, leaving a galaxy that could never
  regenerate (the generator skips when `GalaxyMeta` exists) — every planet-dependent mechanic dead and
  the midnight job crashing on Zygor-3. Fixed with `src/prisma/database-url.ts`: under Jest, bind to
  `TEST_DATABASE_URL` and throw if unset rather than fall back to the dev DB.
- **`npm run db:reset` was broken** — passed four statements in a single `psql -c`, which psql wraps in a
  transaction, so it always failed with `DROP DATABASE cannot run inside a transaction block`. Split into
  separate `-c` flags.
- **Frontend build unblocked** — `tsc --noEmit` failed with 37 errors (all in `test/`), so `npm run build`
  (`tsc && vite build`) failed locally and in CI. The Docker image built only because its Dockerfile copies
  `src` and not `test`. Now clean.
- **Stale frontend tests repaired (13 failures)** — all were tests lagging behind intentional source
  changes, not product bugs: `physics.sector-transition` moved from a batched `{transitions: [...]}` shape
  to one flat event per transition (backend and frontend contracts already agree; only the tests and the
  `contracts-parity` guard still asserted the old shape), `AuthScreen` now opens in login mode so the
  `/register/i` button the tests clicked was the mode switch, `ScanPanel` renders newest-scan-first per
  commit `6ae0f32`, and two `socketClient` mocks omitted the later-added `onSocketAuthFailed` export.

**Tests:** Backend 2827/2827 across 293 suites, exit 0. Frontend 135/135. `tsc --noEmit` clean both sides;
`npm run build` green both sides. New specs: `test/integration/health/health.spec.ts` (3 cases: 200 ok,
503 on DB down, no auth required) and `test/unit/prisma/database-url.spec.ts` (5 cases, including a live
assertion that the running suite resolves to `ge_test` and not `ge`). Dev-DB integrity verified directly:
223 planets before a full `npm test`, 223 after.

**Decisions made:**
- The `contracts-parity` guard is compile-time only and Vitest does not typecheck, so it silently passed
  while asserting a contract that no longer existed. It is only a real guard as long as `tsc` runs in CI.
- `PrismaService` fails loudly when `TEST_DATABASE_URL` is missing under test rather than defaulting —
  a silent fallback is what caused the data loss.
- `test/useSectorRoster.spec.tsx` used Node's `events` module; the frontend has no `@types/node`, so it
  now uses a small local emitter instead of adding a Node dependency to a browser-only package.

**Next:**
- Playtest at http://localhost:5175 (backend :3000, Vite on 5175 because 5173 is taken by another project).
- Ensure CI runs `tsc --noEmit` on the frontend, otherwise the parity guard stays inert.

**Audit — additional gotchas found:**
- **(fixed) 20 balance constants had zero test coverage**, violating the CLAUDE.md rule that every
  gameplay-affecting `GEMAIN.H` constant must have a test that fails if it changes: `DESTRUCTRANGE`,
  `ENGRECHG`, `ENGYMIN`, `HYSCANRANGE`, `MAXPLANETS`, `MINE_TIMER_MAX`, `MINE_TIMER_MIN`, `NUM_MINES`,
  `PENGUSE`, `PMINENG`, `QUADMAXPERTICK`, `ROTAMT`, `SCANADJ`, `SECTYPE_NORMAL`, `SHENGUSE`, `SHMAXCHG`,
  `SHMINPWR`, `TELEDAM`, `TOPPHASOR`, `TOPSHIELD`. All 20 values were verified correct against the C
  source; the gap was detection, not correctness. Pinned in
  `test/balance/unpinned-constants.balance.spec.ts` (21 cases), and the guard was mutation-tested
  (ROTAMT 20->21 fails the suite, then reverted).
- **No CI exists at all** — no `.github/workflows`, no GitLab/Circle/Travis config anywhere in the repo.
  CLAUDE.md states "No feature ships without passing CI" and relies on CI running `prisma migrate deploy`.
  Nothing runs the suites or `tsc` automatically, which is why the frontend build could stay broken and
  the compile-time `contracts-parity` guard could stay inert without anyone noticing.
- **The migration history is never exercised by tests.** `globalSetup` builds the test DB with
  `prisma db push --force-reset` straight from `schema.prisma`, so the files in `prisma/migrations/` are
  never applied during `npm test`. A broken or missing migration would first surface in production at
  `prisma migrate deploy`. Checked for current drift with
  `prisma migrate diff --from-migrations --to-schema-datamodel` against a scratch shadow DB: **no
  difference detected**, so this is latent risk rather than present breakage.
- **(fixed) `npm run prisma:push` was a footgun** — `prisma db push --skip-generate` with no datasource
  override applied schema changes straight to the dev database, bypassing migrations. CLAUDE.md explicitly
  forbids this ("Never use `prisma db push` ... without creating a migration file first"). Script removed
  from `backend/package.json`; it was invoked by nothing (`globalSetup` calls `npx prisma db push`
  directly for the test DB, and the only other references are historical notes in `specs/001`/`002`).
- Two specs (`test/e2e/boot.e2e.spec.ts`, `test/game/combat/mine-persistence.spec.ts`) already worked
  around this class of bug locally by reassigning `process.env.DATABASE_URL = TEST_DATABASE_URL` at the top
  of the file — ad-hoc patches in 2 files for a problem that needed a central fix. Verified safe (no
  `boot-e2e-user` row exists in `ge`). Now redundant but harmless.
- `npm run test:manual` still targets the **dev** DB by design (bare `new PrismaClient()`); its deletes are
  scoped to their own fixture userids. Verified unaffected by the `PrismaService` change: 14/14 passing.

**Known issues:**
- (resolved) `frontend/tests/onboarding/ClassPickerPrompt.spec.tsx` was stale — spec 021 removed the class
  picker and deleted `src/onboarding/ClassPickerPrompt.tsx`, leaving a spec that failed to collect. The
  component was referenced by nothing but that spec, so the file was deleted; the frontend suite is now
  fully green (18/18 files).
- `frontend/tests/` (plural) is not in `tsconfig.json`'s `include`, so those specs are never typechecked.
- No CI, and the migration history is unexercised by tests (see audit above). Deferred deliberately.
- `src/game/commands/command.types.ts:9` uses `client?: any`, against the CLAUDE.md "no `any`" rule.
- (resolved) The origin of the planet loss is confirmed. `src/prisma/prisma.service.ts` has a single
  commit in its history (`36a1d33`, feature 002) and no commit across all 219 commits/branches ever added
  a `datasources` override under `backend/src/`; `jest.config.ts` never had `setupFiles`. The bug has
  existed since feature 002. Commit `109e27a` (2026-06-26) treated the *symptom*: it added
  `neutral-zone.fixture.ts` and called `seedNeutralZonePlanets(prisma)` in 9 midnight specs — the same
  specs that call `truncateAll(prisma)` on a `PrismaService` resolved from `PrismaModule`, i.e. the dev
  database. That made the midnight tests pass while leaving the truncation of `ge` in place, removing the
  only signal that anything was wrong. `GalaxyMeta.generatedAt` was `2026-06-26 21:08:21`, ~7 hours after
  that commit — the galaxy was regenerated by hand rather than root-caused.

---

## 2026-06-26 — 030-multi-ship

**Completed:**
- **Fleet model (P-007/P-008/P-009)** — Ship is now many-per-user. The `@@unique([userid])` constraint was dropped; the composite PK `@@id([userid, shipno])` is the sole uniqueness guarantee. `User.noships` and `User.topshipno` are now live: incremented atomically on ship purchase, decremented on death (never reused, so ship numbers are monotonic). Data backfill migration sets `noships`/`topshipno` correctly for any existing one-ship users.
- **Login ship-selection (`prompt:ship-select`)** — `handleConnection` now mirrors C `lookupshp`'s count-branch: 0 ships → onboarding free-starter; 1 ship → auto-board (unchanged); >1 ships → emit `prompt:ship-select { step, ships: [{ index, shipno, className, shipname, sector }] }`. Player replies via existing `prompt:reply { value }` (1-based index); invalid index re-emits the menu; valid index boards the chosen ship. @see GEFUNCS.C:319-384 selectship.
- **Dormancy — DB-only idle ships** — `ShipStateService.onModuleInit` now loads **AI ships only** (`status=GESTAT_AUTO`) at boot; player ships are dormant until their owner connects. `board(state)` loads a ship into the live map + sets `status=GESTAT_USER`; `unboard(userid,shipno)` sets `status=GESTAT_AVAIL` + flushes + evicts. Non-active player ships are invisible, uninverted, and unticked. @see GEMAIN.C:warhupa; GEMAIN.H:209-210 GESTAT_AVAIL/USER.
- **Buy cap + dormant create** — `new ship <class>` at Zygor now enforces `MAXSHIPS=10` fleet cap (env-tunable 1–50), allocates `shipno = topshipno+1` (monotonic, never reuses after deletion), creates the new hull with `status=GESTAT_AVAIL` (dormant — buyer keeps flying the active ship), and updates `noships`/`topshipno`/`cash` in a single transaction. Message updated: removes stale `boa <n>` reference. @see GECMDS.C:4558-4583.
- **Death-delete (P-007/P-013/P-014)** — `handleCombatShipDestroyed` now deletes the killed hull row (`deleteMany` — safe no-op if already gone) and decrements `User.noships` atomically (no-op when count=0 to prevent underflow). `removeFromGame` evicts from the live map. Other owned ships are untouched. This path covers both the combat-tick kill and the P-001 client-disconnect combat-kill (both funnel via `COMBAT_SHIP_DESTROYED`). @see GEFUNCS.C:1087 killem gepdb(GEDELETE).
- **42P10 fix** — removed `--skip-generate` from the global test setup so the Prisma client regenerates after each schema migration reset in the test DB, preventing P1001/P2021 errors on the new migration.

**Closes:** P-007, P-008, P-009. **Advances:** P-013, P-014 (death path now correctly deletes + decrements; remaining deferred items in those findings are separate concerns).

**Tests:** New suites: `test/gateway/combat-death-delete.spec.ts` (T5 delete/decrement contract), `test/integration/onboarding/ship-select.spec.ts` (T7-A/B/C/D ship-select socket tests), `test/integration/multi-ship-lifecycle.spec.ts` (T8 full-lifecycle: T8-A 2-ship → select #2 → dormancy; T8-B survivor auto-board; T8-C zero-fleet onboarding; T8-D death-delete service+DB). Full Jest suite green (0 failing). `tsc --noEmit` clean.

**Decisions made:**
- `MAXSHIPS=10` default (env-tunable 1–50, matching original `GEMAIN.C:462 numopt(MAXSHIPS,1,50)`).
- Dormancy is DB-only: idle ships have no in-memory representation; live map = active world.
- Login-only switching (no in-game `boa`) — faithful to C `CHOOSESH` running only at entry.
- Free-starter when fleet empty: reuses onboarding.finalize() grant on 0-ship reconnect.
- 42P10 fix: removed `--skip-generate` from global test setup so Prisma client regenerates after each DB reset in CI.

**Known issues / deferred minors:**
- Counter TOCTOU: `noships`/`topshipno` increments use per-column `{ increment: 1 }` (PK-mitigated — composite PK prevents true duplicate creation, so the counter drift window is brief and bounded).
- `unboard` does two DB round-trips (updateMany for status + update inside flushAndUnload); could be merged in a future cleanup.
- Session-replacement edge: a second socket connecting before the first fully boards may transiently see a stale registry entry. Existing "latest-wins" logic handles it but the window is narrow.
- BigInt buy price parsed as string only (value string-only parse) — already established pattern.

**Next:** Remaining deferred fidelity findings (S-009, C-002, P-004/P-005, etc.) or frontend work (010-react-frontend).

---

## 2026-06-25 — 026-subsystem-damage (Plan 4 of 4)

**Completed:**
- **C-010 — subsystem (random) damage wired up**: `rollRandamage` (pure random roll) + `applyRandamage` (state mutator) + `applyRandamageAndEmit` helper now fire on every weapon hit — phaser, hyperphaser, torpedo, missile, mine, Cybertron, and droid. On a hit that pushes victim `damage > 20%`, a `gernd()%6` roll selects one subsystem to damage (class-gated): shields (`shield` set negative + `shieldstat=SHIELDDM=3`), phasers (`phasr` set negative), fire control (`firecntl` set to random 0–19), cloak (set negative), tactical (set negative), helm (set negative). `shieldtype=20` is immune (discriminator `'skipped'`). Emits `COMBAT_SUBSYSTEM_DAMAGED`. @see GEFUNCS.C:1956
- **Subsystem effects + repair (C-010/S-007)**: scan is now gated — `TABROKE` when `tactical != 0`, `JAMMER4` when `jammer > 0` (S-007); heading change refused (`HLBROKE`) when `helm != 0`. Existing gates cover negative `phasr` (can't fire) and `firecntl > 0` (lock refused with `FCBROKE`). A 1s-tick subsystem-repair recovers negatives toward 0 (+1/tick for tactical/helm/cloak; `firecntl` -1/tick; damaged shield recovers and resets `shieldstat` to down so recharge can resume). Negative `phasr` recovers via the existing phaser reload. Only negative cloak is repaired — active (positive) cloak is untouched. Repair runs regardless of `cantexit` (temporary disruptions).
- **P-016 — midnight teamcode staleness**: midnight now emits `MIDNIGHT_COMPLETED` after a successful transaction commit. `ShipStateService.refreshTeamcodes()` is wired via `@OnEvent(MIDNIGHT_COMPLETED)` and re-reads `User.teamcode` for every in-memory ship, so a player connected across midnight no longer carries a stale teamcode. Handler is guarded against unhandled rejection.

**Tests:** New suites: `test/unit/randamage.spec.ts` (pure roll), randamage wiring tests across phaser/hyperphaser/torpedo/missile/mine/cybertron/droid combat suites, `test/game/ship/ship-tick.subsystem-repair.spec.ts`, scan/rotate gate tests for TABROKE/JAMMER4/HLBROKE/FCBROKE, midnight MIDNIGHT_COMPLETED emit tests and teamcode-refresh `@OnEvent` tests. `tsc` clean. Full Jest suite restored to the 66-fail baseline; zero new combat/ship failures.

**Decisions made:**
- `rollRandamage` is pure; `applyRandamage` is the mutator; `applyRandamageAndEmit` dedupes 7 hit sites.
- `'skipped'` vs `'none'` discriminator for `shieldtype=20` immunity (clear intent at every call site).
- Subsystem repair +1/tick recovers regardless of `cantexit` (temporary disruptions, not permanent damage).
- Only negative cloak repaired — positive (active) cloak is managed by the cloak tick, not subsystem repair.
- `HLBROKE` reused as the canonical helm-broken message; no new duplicate.
- Midnight emits `MIDNIGHT_COMPLETED` post-commit (not inside the transaction).
- `@OnEvent` teamcode refresh guarded against unhandled rejection.
- `EventEmitterModule.forRoot` lives in `PhysicsModule` (project convention for shared event bus).

**Next:** All four fidelity plans (combat-feel, AI-presence, combat-depth/persistence, subsystem-damage) are complete and merged. Remaining work is the two non-combat cleanup tracks: (a) the pre-existing ~66-test stale baseline (midnight DB / scan-* / onboarding / handlers), and (b) the missing Docker setup (no Dockerfiles/compose). Then live playtest + balance tuning.

**Known issues:**
- Pre-existing ~66-test stale baseline in midnight/scan/onboarding/handlers suites — separate cleanup track, unrelated to combat/ship.
- No Dockerfiles or `docker-compose.yml` exist despite `CLAUDE.md` mandating them for dev+prod. Recommend creating a separate task before any production deploy.

---

## 2026-06-25 — 025-combat-depth-persistence (Plan 3 of 3)

**Completed:**
- **C-004 — mine-laying validations + timer**: `min [timer]` now validates ship-class `hasMine`, refuses while cloaked, refuses in the neutral zone (plain refusal, no self-zap — matches C `cmd_mine`), parses an optional timer arg (1–50, default 30), enforces a per-player live-mine cap (`USERMINES=200` via `MineRegistry.countByDeployer`), and sets `cantexit=FIRETICKS`. @see GECMDS.C:1722
- **C-008 — phaser fire drops shields**: firing phasers sets the firer `shieldstat=0` for the FIRETICKS battle-lock window (vulnerable while firing); firing is not blocked by shield state. @see GECMDS.C:930-933
- **C-009 — true hyperphaser separation**: a firer at warp now uses the real `firehp` path — requires flux `energy >= HPMINFIR(6000)` (else HP_NOPOW), debits `HPFIRAMT(5000)` (not phasr charge), only hits victims that are ALSO at warp, fixed `HPBEAMW(5°)` arc, hard scanRange cap, neutral-zone self-zap, damage via the C `pdamage` warp-branch (`dd=1-dist/40000`, `HPDAMMAX=200`/`HPFIRDST=1`) scaled by `phasrtype/(1+victim.maxTons/TONFACT)`. New `hyperPhaserDamage` + a `withinArc` helper underlying `lineOfFire`. Droid hyper-phaser call sites now use `hyperPhaserDamage` too. @see GECMDS.C:1020-1094, GEFUNCS.C:2069-2077
- **P-001 — combat-disconnect kill**: a combat-locked ship (`cantexit > 0`) that disconnects via a client-side reason (transport close/error, ping timeout, client namespace disconnect) is now killed (anti-rage-quit), awarding kill credit to its `lastfired` attacker and broadcasting via `COMBAT_SHIP_DESTROYED`. Server-side reasons (hot-reload) and non-combat-locked disconnects are unaffected. @see GEMAIN.C:1397 warhupa

**Tests:** New suites: `test/game/commands/handlers/mine.handler.spec.ts`, `test/unit/hyper-phaser-damage.spec.ts`, `test/integration/combat-disconnect.spec.ts`; extended `test/unit/phaser.spec.ts` and `test/unit/line-of-fire.spec.ts`; `withinArc` refactor keeps `lineOfFire` byte-identical. `tsc` clean. Full Jest suite at the 66-fail baseline; zero new combat/gateway failures.

**Decisions made:**
- `USERMINES=200`, `HPDAMMAX=200`, `HPFIRDST=1` added as tunable defaults to `constants.ts`.
- Neutral-zone mining = plain refusal (no self-zap) — matches C `cmd_mine` which simply prints a reject message and returns, unlike `cmd_phas`/`cmd_torp`/`cmd_missl` which call `zaphim`.
- P-001 gated on client-side disconnect reason (transport close, error, ping timeout, client namespace disconnect) — no `NODE_ENV` gate needed because hot-reload fires a server-side reason.
- Disconnect-kill reuses `COMBAT_SHIP_DESTROYED` so kill credit and broadcast are identical to the normal death path.
- Hyperphaser single-floor rounding consistent with the normal phaser path.

**Next:** Plan 4 — subsystem damage (C-010: wire `randamage` + per-subsystem state fields + effects/repair) and midnight team staleness (P-016).

**Known issues:**
- Pre-existing ~66-test stale baseline in midnight/scan/onboarding/handlers suites — separate cleanup track, unrelated to combat/gateway.
- No Dockerfiles or `docker-compose.yml` exist despite `CLAUDE.md` mandating them for dev+prod. Recommend creating a separate task before any production deploy.
- No emit→@OnEvent integration test for `COMBAT_SHIP_DESTROYED` (pre-existing test-architecture pattern — applies to the normal death path too, not specific to this branch).

---

## 2026-06-25 — 024-ai-presence (Plan 2 of 3)

**Completed:**
- **C-005 — per-class damage scaling**: replaced the wrong tonnage-based `tonFact` with `damageScale(damageFactor) = 100 / victim.damageFactor` (the authentic C `ton_fact`; the `ShipClass.damageFactor` field already existed and is seeded — Interceptor 90, Heavy Freighter 200, Cybertron Base Star 2000, Sarten Attack Drone 30). Higher damageFactor = tougher (takes less damage). Wired the victim's damageFactor into projectile-hit and mine-sweep damage in combat-tick; added `ShipClassCacheService.getDamageFactor`. @see GEFUNCS.C:2661
- **A-003 — Cybertron phaser fire now gated on `gebemean`** (was only `!cybwhoops`), matching GECYBS.C:514; `gebemean` evaluated once per `cyb_attack` and reused for the torp-count roll (PRNG-correct).
- **Boot-seed**: the galaxy now fills the Cybertron population to per-class `tot_to_create` (24 total) at startup via `onModuleInit` (was ~70 minutes to populate one-per-slot). Controlled by `CYBERTRON_BOOT_SEED` env (default true). Extracted `spawnOne`; one-per-slot runtime spawn unchanged.

**Tests:** New suites: `test/unit/damage-scale.spec.ts`, `test/game/cybertron/cyb-attack-gebemean.spec.ts`, `test/game/cybertron/boot-seed.spec.ts`; regenerated `rollHullDamage` golden vectors for the new formula; service-level victim-damageFactor test. `tsc` clean. Full Jest suite at 66-fail baseline; zero combat/AI failures.

**Decisions made:**
- Boot-seed default-on; set `CYBERTRON_BOOT_SEED=false` to disable.
- `gebemean` evaluated once per `cyb_attack` call and shared with the torpedo-count roll (PRNG-correct, matches C source).
- `ShipClass.damageFactor` field already existed and was seeded — no schema migration required.

**Next:** Plan 3 — subsystem damage (C-010), hyperphaser separation (C-009), mines (C-004), shield-drop-to-fire (C-008), combat-disconnect kill (P-001), midnight team staleness (P-016).

**Known issues:**
- Pre-existing ~66-test stale baseline in midnight/scan/onboarding/handlers suites — separate cleanup track, unrelated to combat/AI.
- No Dockerfiles or `docker-compose.yml` exist despite `CLAUDE.md` mandating them for dev+prod. Recommend creating a separate task before any production deploy.

---

## 2026-06-25 — 023-combat-feel (Plan 1 of 3)

**Completed:**
- Phaser command restored to faithful original semantics: `pha <degree -180..180> [focus 0-5]` (focus defaults to 1 when omitted). Beam half-angle = `focus + PHABIAS` (effective cone 4–14°, was a ~77–204° cone that matched nothing in the C source). Always full discharge. Fixes the playtest-reported "phasers hit everything except my target" root cause — the handler was treating the second arg as a percent/width rather than a focus value. @see GECMDS.C:829-912, GECMDS.C:954.
- Phaser damage now uses the C `pdamage` distance falloff: `disfact = 20000 + phasrtype*4000`; `dd = max(0, 1 - dist/disfact)`; `fd = 1 - focus/11`; `dp = dd^PFIRDST * fd² * (phasr/100)`; `damage = PDAMMAX * dp`. Damage drops to zero beyond ~2–2.4 sectors for a type-1 phaser. Fixes "shoot something multiple sectors away." @see GEFUNCS.C:2060-2093.
- Torpedo and missile now require a lock-quality gate (`lockFact > 0.7`): `lockFact = (1.2 - speed/5000) * (5 - dist) / TORFACT` for torpedoes, `(5 - dist) / MISFACT` for missiles. Lock fails beyond ~4.9 sectors, against warping targets, against fully-cloaked targets, and against neutral-zone targets. @see GECMDS.C:1339-1430.
- Firing any weapon (phaser, torpedo, missile) inside the neutral zone now self-zaps the firer: `damage += SE100DAM (101)` — instant kill. @see GECMDS.C:937, zaphim.
- Cloak-fire gates: phaser and missile now refuse to fire while cloaked (torpedo already had the gate). Matches GECMDS.C:923-927, 1234-1238.
- New tunable balance constants added to `constants.ts`: `PDAMMAX=200`, `PFIRDST=1`, `TORFACT=0.1`, `MISFACT=0.1`, `SE100DAM=101`, `PHATOWRP=0`. All pinned with balance-regression tests.
- AI fire call sites (Cybertron, droid-class-11, droid-class-12) adapted to the new `pha`/`firePhaser` signatures (focus=0).

**Tests:** Three new test suites — `test/unit/line-of-fire.spec.ts` (beam cone geometry), `test/unit/phaser-damage.spec.ts` (pdamage falloff, zero-at-disfact, focus factor), `test/unit/lock-fact.spec.ts` (lockFact gate at various distances/speeds). Adapted handler and combat suites. `tsc` clean. Full Jest suite runs at the pre-existing 66-fail baseline with zero combat failures.

**Decisions made:**
- `PDAMMAX=200` is a tunable default pending playtest — it may be too high or low; adjust via env before going live.
- AI fire paths use `focus=0` (widest safe arc) to avoid breaking existing AI engagement behavior; full AI fire realism deferred to Plan 2 (AI presence).
- Hyperphaser separation (C-009), `damfact`/`ton_fact` (C-005), mine handler validations (C-004), and subsystem damage (C-010) are explicitly out of scope — deferred to Plans 2 and 3.
- `gebemean` gate on Cybertron phaser fire (A-003) remains deferred to Plan 2.

**Next:** Plan 2 — AI presence: Cybertron boot-seeding, `gebemean` gate on `cyb_attack`, `damfact` schema field and `tonFact` rewrite, subsystem damage wiring.

**Known issues:**
- Pre-existing ~66-test stale baseline in midnight/scan/onboarding/handlers suites — separate cleanup track, unrelated to combat.
- `CombatPhaserFiredEvent` payload fields `bearing`/`percent` now carry degree/focus respectively; frontend `App.tsx` reads `percent`. The field name is misleading but harmless until the event interface is next touched — recommend renaming `percent` → `focus` when that interface is revised.
- No Dockerfiles or `docker-compose.yml` exist despite `CLAUDE.md` mandating them for dev+prod. Recommend creating a separate task for this before any production deploy.

---

## 2026-05-12 — second scanRange compression (final calibration)

**Completed:** Tightened every `ShipClass.scanRange` further — the prior "compression" still left Interceptor's `sca lo` covering the whole 30×15 galaxy (20-sector projection radius × 2 → entire universe visible from any position). Verified that the C galaxy is also 30×15 (`MAXX=30, MAXY=15` in `GEMAIN.H`), so the wiki's 100k+ values never matched any actual C-canonical galaxy size — the original C `shipclass[]` from the `.cnf` file (unrecoverable) must have used smaller values. Recalibrated for our actual world:

- Phaser/lock gate (scanRange / 10000): 0.5 sec (Lydorian Scow) → 4 sec (Death Star)
- sca-lo overview (scanRange / 1000): 5 sec (Lydorian) → 40 sec (Death Star)
- **Only Dreadnought-plus** reveals the full galaxy on `sca lo`
- **Interceptor** = 10,000 (1-sector combat, 10-sector overview — meaningful for a starter ship in a 30-wide galaxy)

C-canonical 10× formula in `scan.handler.ts` preserved — the change is purely seed values, which are TS-canonical anyway (the C `.cnf` source is gone).

## 2026-05-12 — rescale scanRange seeds for the 30×15 galaxy (first pass — superseded)

**Completed:** Compressed every `ShipClass.scanRange` seed so the values fit the TS port's 30×15 sector galaxy. Wiki-faithful values inherited from the original (much larger) game produced sca-lo projections that covered the whole galaxy from the starter Interceptor and weapon gates that let mid-class ships hit anything on the map. New curve: Interceptor 20_000 (2-sector phaser gate, 20-sector sca-lo overview — most but NOT all of the galaxy), Battle Cruiser 50_000 (first tier whose sca-lo covers the full galaxy diagonal), Dreadnought 75_000, Death Star 120_000. Cybertron Battle Cruiser jumps from the wiki-typo 1_000 (effectively blind) to 45_000. Murdonian Transport — the AI ship that motivated the original "shot from across the map" complaint — drops from 25_000 to 30_000 (≈3-sector phaser gate).

**Tests:** `test/unit/ship-class-scanrange-pin.spec.ts` rewritten with the new pinned values plus a new assertion that the Interceptor's sca-lo radius is < 30 sectors (cannot cover the full galaxy). All scan, AI-targeting, droid range-gate, and invariant suites (90 tests) green.

**Decisions made:**
- Wiki was the **only** authority for the prior values; the original C `shipclass[]` lives in a runtime `.cnf` not part of the published source, so there is no "C-canonical" override to honor. Rescaling for map size is therefore a free design choice.
- Battle Cruiser-tier is the first ship whose sca-lo covers the entire galaxy diagonal (~33 sectors). Below that, sca-lo is a meaningful tactical overview rather than a free map.
- Phaser/lock gate (`scanRange / 10000` sectors) now ranges from ~2 sectors (small ships) to 12 sectors (Death Star) — meaningful within a 30-wide galaxy.
- Seed file is the source of truth; `npx prisma db seed` was re-run against `ge` to apply the change to the live dev DB.

**Next:** Live playtest to confirm the new values feel right. If Interceptor combat radius (2 sectors) is too tight, easiest dial is class 1's seed value.

**Known issues:** None new.

---

## 2026-05-12 — 022 fidelity audit v2

**Completed:** Four-subsystem C↔TS walk (persistence, combat ranges, AI targeting, scanners & visibility) across `reference/ge-source/` and the matching `backend/src` modules. 60+ findings filed in `specs/022-fidelity-audit-v2/findings.md` (P-001..P-021, C-001..C-016, A-001..A-011, S-001..S-014). 10+ HIGH findings fixed inline — most notably the AI fire-range gate (A-001/A-002) that resolved the across-the-map shot symptom motivating the audit, plus the player phaser range gate (C-001), the `scan lo` 10× projection fix (S-001), the `scan ra` sector-unit projection fix (S-003), `scan sh` cloak gate (S-004), beacon-on-move regression (S-005, F-005 regressed by `d75d337`), the Vakory scanRange seed pin (S-006), and the `maxTons`/`scanFull`/`msgFilter` reconnect hydration fix (P-002/P-003). A new `backend/src/game/invariants/` module hosts a runtime harness with 6 seed invariants (`weaponFireRangeRespected`, `aiCannotFireAcrossMap`, `aiRespectsNeutralZone`, `scanRangeMatchesScanType`, `inMemoryShipMatchesDb`, `noOrphanShipState`) wired into `TickService` via a snapshot-provider pattern behind `INVARIANTS_RUNTIME=1`.

**Tests:** New specs under `backend/test/invariants/` (6 invariants × ≥2 cases each, plus harness aggregation + throw-isolation tests). Per-fix unit tests: `phaser.range.spec.ts`, `droid-act-class-11.spec.ts` + `droid-act-class-12.spec.ts` range-gate describes, `scan-lo-range.spec.ts`, `scan-ra-unit-fix.spec.ts`, `scan-sh-cloak.spec.ts`, `ship-class-scanrange-pin.spec.ts`, `ship-state.mappers.spec.ts`, and an updated `beacon.spec.ts`. `tsc` clean on touched files; pre-existing failures in `test/gateway/*` and `test/integration/scan-*.spec.ts` remain (constructor arity drift unrelated to this audit) and are tracked separately.

**Decisions made:**
- Runtime invariants gated behind `INVARIANTS_RUNTIME=1` (off in prod by default); Jest specs are the authoritative coverage and runtime is a defense-in-depth tripwire.
- `dbShips` DB load deferred (P-021) — needs an async tick-dispatch branch before the `inMemoryShipMatchesDb` / `noOrphanShipState` runtime checks can `await` the Prisma fetch. The two invariants tolerate `dbShips=undefined` and early-return `[]`.
- Cybertron Battle Cruiser `scanRange=1000` (class 22) left as wiki-faithful (S-006 note); 0.1-sector scan is suspect but no authority to override the wiki — flagged for design call.

**Next:** User-driven dev playtest (T9) with `INVARIANTS_RUNTIME=1` to surface any runtime invariant violations during a 15-minute session. Several deferred HIGH findings remain — each deserves its own follow-up spec: C-002 (phaser damage formula rewrite), C-003 (lockon `fact > 0.7` gate), C-004 (mine handler validations + timer arg), C-005 (`ton_fact` direction + `damfact` schema field), C-009 (hyperphaser end-to-end), C-010 (`randamage` wiring + subsystem-damage flags), P-001 (kill-on-disconnect prod/dev gating), P-016 (midnight ↔ in-memory teamcode refresh), A-003 (`cyb_attack` `gebemean` gate).

**Known issues:**
- P-001 (kill-on-disconnect during combat) still deferred — needs a prod/dev gating design before the C-canonical anti-rage-quit mechanic can be re-enabled.

---

## 2026-05-08 — 021-onboarding-ship-purchase

**Completed:** Restored original game onboarding progression (US1): new players receive a class 1 Interceptor with 5,000 credits and 3 flux pods automatically — no class picker shown. `OnboardingService.finalize(userid, shipname)` signature updated (removed `classNumber` param); always creates ship with `shpclass=START_CLASS` (1), `items[I_FLUX=4]=3n`, `energy=ENGYMAX`, `User.cash=START_CASH` (5000n). `GameGateway` `AWAITING_CLASS` state removed; new players go directly to `prompt:ship-name`. Added `new ship <N>` command (US2): `NewShipHandlerService` handles purchase at Zygor-3 (sector 0,0), validates orbit/sector/class/credits, creates Ship with same default loadout, decrements `User.cash`. Constants centralised in `backend/src/game/constants/onboarding.ts`. Frontend `ClassPickerPrompt.tsx` deleted; `App.tsx` and `useSocket.ts` cleaned of `class-list` branch.

**Tests:** Balance regression tests pin `START_CASH=5000n`, `START_FLUX_PODS=3`, `START_CLASS=1`. Integration test verifies `finalize()` creates correct `shpclass`, `items`, and `User.cash`. Unit tests cover all 6 rejection paths + success for `new ship <N>`. Total: 20 new tests across 3 new suites; 256 existing suites continue to pass (1 pre-existing failure in `pln.handler.spec.ts` unrelated to this feature).

**Decisions made:** `buildClassListPayload` and `validateClassReply` left on `OnboardingService` for possible future use (not called from gateway). New ship purchased via `new ship <N>` is loaded into `ShipStateService` but player must use `boa <N>` to board (FR-013 compliant). `new shield` returns a stub per contract.

**Next:** Feature 022 or remaining commands.

**Known issues:** None.

---

## 2026-05-08 — 020-source-fidelity-audit

**Completed:** Eight fidelity findings triaged and resolved. F-001: TS `randamage()` renamed to `rollHullDamage()` (was a hull-damage roll, not the C subsystem-damage routine); real `randamage()` added per `GEFUNCS.C:1956`. F-002: Phaser reload fixed from `+PRELOAD` to `phasrtype * PRELOAD` via new `phaserReloadAmount()` function. F-003: `GalaxyWormholeView` interface added with `visible: boolean`; `getSectorWormholes` returns this type; all scan.handler.ts checks changed to `!wormhole.visible`. F-004: N/A — `scan lo full` ordering is a deliberate TS enhancement. F-005: Beacon event added to `handleSectorTransition` in `GameGateway` with observer-check + `gernd()%10===0` gate. F-006: `scanfull` and `filter` options added to `SetHandlerService`; `ShipState` gains `scanFull` and `msgFilter`; `SET_OPTIONS_CATALOG` committed. F-007: `ENGYMAX` corrected 50000→65000; 25+ missing constants added; `GEMAIN_GAMEPLAY_PINS` bidirectional pin map added. F-008: Manual smoke tests created.

New files: `backend/src/gateway/events/beacon.event.ts`, `backend/src/game/commands/handlers/set-options.catalog.ts`; tests: `test/unit/gemain-pins.spec.ts`, `test/unit/roll-hull-damage.spec.ts`, `test/unit/interceptor-preload.spec.ts`, `test/unit/set-options-coverage.spec.ts`, `test/integration/wormhole-visibility.spec.ts`, `test/integration/beacon.spec.ts`, `test/fixtures/randamage.golden.json`, `test/manual/T053.manual.spec.ts`, `test/manual/T043.manual.spec.ts`, `test/manual/T077.manual.spec.ts`.

**Tests:** +50 tests across 9 new suites. All findings covered by regression tests. Manual suite confirmed working.

**Decisions made:** Interceptor double-reload bonus intentionally absent (commented out in shipped C source). `scan lo full` ordering not changed (deliberate enhancement). Beacon gate uses `gernd()%10===0` preserving the C-source 1-in-10 probability.

**Next:** Feature 021 or remaining endgame commands.

**Known issues:** None.

---

## 2026-05-08 — 019-physics-polish

**Completed:** Six user stories shipping as one branch — (US1) universe boundary wrap (`wrapCoord` modulo `MAXX`/`MAXY` called after position integration; `PHYSICS_BOUNDARY_WRAPPED` event); (US2) overspeed engine damage (faithful port of `GEFUNCS.C:733-792` — `decideOverspeed` pure function, `warncntr` escalation, `WARPBRK`/`WARPSPD` events); (US3) auto-repair tick consumer (`MaintenanceService` extracted from `MaintHandlerService`, `ShipTickService.processShip` calls it when `autoRepair=true`); (US4) auto-shield tick consumer (`decideAutoShield` port-original QoL feature — raises shields on warp-exit or self-torp trigger when `autoShield=true` and ship not in combat lock); (US5) AI kill scoring (`score_f2 = 100` default, PvP formula `floor((scr/100)*score_f2)`, AI 1/10 branch, Cybertron kill counter via `CYBERTRON_SCORED_KILL` EventEmitter decoupling); (US6) droid presence bridged to players (`DROID_SPAWNED`/`DROID_KILLED` events in `GameGateway`, `useSectorRoster` hook in frontend, persistence invariant confirmed).

New files: `backend/src/game/ship/ship-tick.service.ts`, `maintenance.service.ts`, `ship-overspeed.ts`, `auto-shield.ts`; `backend/src/game/player/score.config.ts`; `frontend/src/features/sector-roster/useSectorRoster.ts`. No Prisma migrations added.

**Tests:** 248 backend suites / 2421 tests; 8 new frontend Vitest tests for `useSectorRoster`. New suites: `ship-tick.service`, `ship-tick.overspeed`, `ship-tick.auto-repair`, `ship-tick.auto-shield`, `maintenance.service`, `ship-overspeed`, `auto-shield`, `physics-tick.wrap` (in existing `physics-tick.service.spec.ts`), `player-score.service.ai`, `score.config`, `cybertron-increment-kills`, `droid-events`, `game.gateway.droid-bridge`, `droid-roster.invariant`, `useSectorRoster`.

**Decisions made:** See DECISIONS.md. Key: `score_f2 = 100` default; Cybertron kill counter decoupled via event emission to break `PlayerScoreModule → CybertronModule → CombatModule` cycle; 3-way `ShipModule ↔ PlanetModule ↔ TickModule` circular dependency resolved with `forwardRef` on all three legs; `passwordArg?: string` param pattern distinguishes command vs tick callers of `MaintenanceService.runMaintenance`.

**Next:** Feature 020 or remaining endgame commands.

**Known issues:** T041 frontend spec is a hook unit test only; no E2E validation against a running server. T052 quickstart smoke test is a manual step for the PR description.

---

## 2026-05-08 — 018-team-management

**Completed:** Full `tea` command set on top of feature 012's show/join/leave. Four capabilities added: (1) `tea create <name…> <password>` — atomic team creation with auto-assigned teamcode, case-insensitive uniqueness via LOWER(teamname) unique index + P2002 retry; (2) `tea <name…> <password>` — password-gated join (case-insensitive name, case-sensitive password); (3) `tea list` — live-counted leaderboard (two Prisma queries, no N+1), sorted teamscore DESC/teamcode ASC, capped 20; (4) `ros` team column — fixed 12-char column with ellipsis truncation and `---` placeholder, batched with one `findTeamsByCodes` call.

New module `backend/src/game/team/` with `TeamService`, `TeamRepository`, `team-render.ts`, `team-name.ts`, `team.types.ts`. One Prisma migration (`20260508003817_team_name_unique_lower`) adds `CREATE UNIQUE INDEX "Team_teamname_lower_key" ON "Team" (LOWER("teamname"))`.

**Tests:** 63 new tests across 4 suites in `test/team/`. Unit: `team-name.spec.ts` (parser/validator), `team.service.spec.ts` (create/joinByPassword/list + balance regression constants), `tea.handler.spec.ts` (all create/join/list output paths), `ros.handler.spec.ts` (team column, query budget). Existing `test/unit/commands/tea.handler.spec.ts` updated to reflect FR-016a change (single-token form now routes to show-current-team, not join attempt). All 2296 tests pass.

**Decisions made:** See DECISIONS.md "2026-05-08 — Team creation: auto-assigned teamcode". `tea <name>` single-token form is NOT a join attempt (FR-016a) — it shows current team. This breaks feature-012's old single-token join behavior; existing tests updated and the change noted here.

**Next:** Feature 019 or remaining endgame commands.

**Known issues:** `team.integration.spec.ts` (T032) is deferred — concurrent-create race test requires a live Postgres DB and `Promise.all` race harness; unit tests cover the retry logic via mocks. Quickstart Scenarios A–F (T037) require a running game server and are a manual validation step.

---

## 2026-05-08 — 017-mail-inbox

**Completed:** Three player commands — `mai` (list inbox or delegate to maintenance), `rea <index>` (read message detail), `del <index>` (hard-delete message). New `MailModule` with `MailInboxRepository`, `MailInboxService`, and `mail-render.ts`. `mai` alias dropped from `MaintHandlerService`; new `MaiHandlerService` dispatches no-arg → inbox, with-arg → maintenance. No schema change — reads/deletes existing `MailStat` rows. SC-001..SC-006 all satisfied.

**Tests:** 100 new tests across 7 suites. Unit: mail-render (classLabel/formatListLine/formatDetail), mail-inbox.service (list/resolveIndex/deleteByIndex), mai.handler, rea.handler, del.handler, mail-schema-drift (FR-014/SC-003 guard). Integration: mail-inbox.integration (list, rea detail, del with double-delete, perf budget < 50ms for 50 rows). Regression: maint.handler.spec and command-router.dispatch.spec updated to reflect mai alias removal.

**Decisions made:** `mai` gets its own `MaiHandlerService` dispatcher rather than threading inbox logic into `MaintHandlerService` — keeps the maintenance gate isolated. Sender resolution (R3) uses two-tier fallback: ShipStateService.findByUserid → raw dtime → "(system)". Indices re-resolved on every command invocation (R5) — no cross-command session state.

**Next:** Feature 018 or endgame commands.

**Known issues:** None.

---

## 2026-05-07 — 016-navigation-spy

**Completed:** Four player commands — `nav <x> <y>` (autopilot), `spy` (plant spy on planet), `hel`/`?` (in-game help), `cls` (clear screen). Two new Ship DB columns (`navTargetX`, `navTargetY`) + Prisma migration. Autopilot tick branch in `PhysicsTickService`. Spy-owner reveal in `scan pl`. `clearLog` directive added to `CommandResult` and honoured in frontend `command-result-handlers.ts`.

**Tests:** Unit tests for all four handlers; integration tests for autopilot tick (fake-clock arrival), cancel preambles, scan spy-reveal. Balance regression for `UNIVMAX=15` and `I_SPY=13`. Frontend Vitest for `clearLog` directive. Help snapshot tests pin topic wording.

**Decisions made:** Autopilot uses `holdcourse` boolean semantics (existing field, see research D1). `cls` uses a frontend-only `clearLog` directive rather than a separate socket event (D4). Spy reveal added at scan render time — no new event (D3).

**Known issues:** A1 — FR-013 spy removal mechanic not implemented; `spyowner` cleared only by overwrite or ownership change. Needs explicit resolution before feature 014 (planet attack) ships.

**Next:** Feature 017 or endgame commands (planet attack follow-up, mail, teams).

---

## 2026-05-07 — 015-scan-modes: range radar / sector scan / lo-full / display options

**Completed**:

- **`sca ra <1-9>`**: Range radar scan with zoom levels 1-9. Formula: `effectiveRange = scanRange / (10-level)^2`. Shared scantab gives stable letter assignments A-Z (nearest-first). 3-colour channel: self shown as `*` at (15,7), human ships A-Z, ai ships A-Z.

- **`sca se`**: Sector close-up scan bounded to the player's current 1×1 sector. 4-colour channel adds planet digits (plnum). Ships, mines, and planets all projected. Shares scantab with `sca ra`.

- **`sca lo` (updated)**: Ship glyphs upgraded from `+`/`=` to scantab letters (A-Z) — deliberate D1 deviation from original `+`/`-` glyphs.

- **`sca lo full`**: Extended local scan with right-side panel: letter/distance/bearing/heading/speed/name per detected ship. SCANNAMES flag controls name visibility.

- **`set scannames on|off`**: Show ship names in `sca lo full` side panel. Persists to `User.options[0]` via Prisma + in-memory ShipState.

- **`set scanhome on|off`**: Overwrite vs append mode for scan panel on the frontend. Persists to `User.options[1]`. `set ?` now lists all 4 options (auto-shield, auto-repair, scannames, scanhome).

- **Gateway `emitCommandResult()` split**: header-only scan results emit as `command:result` (unicast); full grid payload emits as `scan:render` (unicast, typed Socket.io event).

- **Frontend `useScanRender` hook**: subscribes to `scan:render`; maintains ScanCard array; overwrite/append driven by SCANHOME flag.

- **Frontend `ScanPanel` component**: renders 30×15 monospace grid with colour-coding; optional side panel for `lo-full` mode. Mounted adjacent to ScanMap in App.tsx.

**Tests**: 10 new test files, ~200 new tests. All pre-existing 003/004 `sca lo` fixtures updated for scantab letters.

**Decisions made**:
- D1: `sca lo` plot chars → scantab letters (was `+`/`=`) — enables consistent A-Z cross-scan targeting
- D2: NOSCANTAB widened 15→26 to support the full alphabet
- D3: SCANHOME uses typed Socket.io `scan:render.overwrite` field (not ANSI escape codes)
- D4: Player options stored in `User.options Int[]` at indices 0 (SCANNAMES) and 1 (SCANHOME) — no new DB column
- D5: Scantab lifecycle — lazy init, cleared on disconnect/death/dock
- D6: Colour encoding uses semantic strings ('self'/'human'/'ai'/'planet') not numeric channel codes
- D7: `sca lo full` side-panel formatting matches original scan_sh column style

**Next**: 016-navigation-autopilot (nav autopilot, spy, hel, cls) or 019-physics-polish

**Known issues**:
- T053 manual quickstart not run (requires live ge_test DB with seeded galaxy)

---

## 2026-05-07 — 013-ship-management: cloak / maint / transfer / jettison / set / destruct / abort / abandon

**Completed**:

- **US1 `cloak`**: `CloakHandlerService` (on/off sub-forms); cloak ramp 1→2→10 across two PHYSICS ticks; energy drain (`CLOAK_ENERGY_USE_DEFAULT=50`, sysop-configurable via env); auto-decloak on energy starvation; `cloak-collapsed` event to per-captain socket; `CLOAK_ENERGY_USE` DI token following midnight.config.ts pattern.

- **US2 `maint`**: `MaintHandlerService`; cost 200 cr (normal) / 2500 cr (Zygor NZ); repair formula `floor(damage/3)+1` queued via `ship.repair`; FR-206–FR-210 gates.

- **US3 `transfer`**: `TransferHandlerService`; ship-to-ship atomic transfer (cargo + gold); sector co-location gate; target broadcast via `user:${target.userid}` Socket.io room; conservation invariant: zero items created/destroyed across 100 randomized transfers.

- **US4 `jettison`**: `JettisonHandlerService`; numeric amount + ALL keyword; items permanently discarded (no recovery path FR-403).

- **US5 `set`**: `SetHandlerService`; `auto-shield`/`auto-repair` flags; `set ?` listing; flags persisted via Prisma round-trip (`autoShield`/`autoRepair` columns, migration `ship_auto_flags`).

- **US6 `destruct`/`abort`**: `DestructHandlerService` sets `ship.destruct=COUNTDOWN(20)`; `ShipManagementTickService.destructTick` decrements each PHYSICS tick, emits sector warnings (special at 10/5/2), `COMBAT_SHIP_DESTROYED` + `removeFromGame` at 0; `AbortHandlerService` clears countdown, sector broadcast only if `destruct<10` (SELFD4A).

- **US7 `abandon`**: `AbandonHandlerService` sets `status=SHIP_STATUS_ABANDONED(3)`, clears destruct, detaches `ctx.client.data.activeShipNo`; FR-803 gate in `CommandRouterService` blocks all subsequent commands with `SHIP_ABANDONED` message.

- **Tick service**: `ShipManagementTickService` subscribes to `TickKind.PHYSICS`; drives both `cloakTick` and `destructTick`; fault-isolated per ship; gateway listens on `ship-management.cloak-collapsed`, `ship-management.destruct-tick`, `ship-management.destruct-boom`.

- **Schema**: added `autoShield Boolean @default(false)` and `autoRepair Boolean @default(false)` to Ship model; migration `20260506235607_ship_auto_flags` committed.

- **Gateway**: clients join `user:${userid}` room on connect for per-captain broadcasts.

**Tests**: ~220 new tests in 17 new spec files across handlers, tick integration, balance regression, and router dispatch. All 171 pre-existing suites continue to pass.

**Test files added**:
- `test/game/commands/handlers/cloak.handler.spec.ts` (T011)
- `test/game/tick/cloak-ramp.integration.spec.ts` (T012)
- `test/game/tick/cloak-drain.integration.spec.ts` (T013)
- `test/game/commands/handlers/cloak-reachability.spec.ts` (T014)
- `test/balance/cloak.balance.spec.ts` (T015)
- `test/game/commands/handlers/maint.handler.spec.ts` (T019)
- `test/balance/maint.balance.spec.ts` (T020)
- `test/game/commands/handlers/transfer.handler.spec.ts` (T023)
- `test/game/commands/handlers/transfer.conservation.spec.ts` (T024)
- `test/game/commands/handlers/jettison.handler.spec.ts` (T028)
- `test/game/commands/handlers/set.handler.spec.ts` (T031)
- `test/integration/commands/set-persistence.spec.ts` (T032)
- `test/game/commands/handlers/destruct.handler.spec.ts` (T035)
- `test/game/commands/handlers/abort.handler.spec.ts` (T036)
- `test/game/tick/destruct-countdown.integration.spec.ts` (T037)
- `test/game/tick/destruct-abort.integration.spec.ts` (T038)
- `test/balance/destruct.balance.spec.ts` (T039)
- `test/game/commands/handlers/abandon.handler.spec.ts` (T044)
- `test/game/commands/handlers/abandon.onboarding.integration.spec.ts` (T045)
- `test/game/commands/handlers/abandon.destruct-precedence.spec.ts` (T046)
- `test/game/commands/command-router.dispatch.spec.ts` (T050)

**Decisions made**:
- D1: `transfer` moves cargo between ships (not ship→planet) — see research.md D1
- D2: `abandon` marks ship status=3, routes captain to onboarding — see research.md D2
- D3: maint password gate (FR-210) deferred to feature 005
- D4: `set` manages auto-shield/auto-repair (not scannames/scanhome) — see research.md D4
- autoShield/autoRepair declared optional in ShipState to avoid breaking 72 existing makeShip() factories
- Per-captain cloak-collapsed broadcast implemented via `user:${userid}` Socket.io room (clients join on connect)

**Next**: 009-midnight-job (if not yet done) or T053 quickstart validation

**Known issues**:
- T053 manual quickstart validation not run
- `set auto-repair` flag consumed by repair sub-system is deferred (flag persists, repair-tick integration pending)

---

## 2026-05-06 — 012-social-commands: who / dat / ros / sen / fre / tea

**Completed**:

- **US1 `who`**: `WhoHandlerService` lists all active non-cloaked ships sorted by
  shipname case-insensitive; class, sector, kills per row; AI ships (Cybrg-/\@Droid-)
  appear if present.

- **US2 `dat`**: `DatHandlerService` case-insensitive substring match → full stat block
  (class, sector, heading, speed, energy, damage, 14-slot cargo, kills, team name);
  cloaked ships return `Ship not found.`; team name resolved via `Prisma.team.findFirst`.

- **US3 `ros`**: `RosHandlerService` — top-N human players ordered by score DESC/kills
  DESC/userid ASC; Cybrg-* and \@Droid-* excluded; default cap `ROSTER_MAX` (env, def 20);
  `ros all` cap 200; reads `process.env['ROSTER_MAX']` directly (no ConfigService).

- **US4 `sen`**: `SenHandlerService` — `sen <A|B|C> <msg>` reads `ship.freq[channelIndex]`;
  FREQ_HAIL=0 → `room:'hail'` (cloaked excluded), 1–19999 → `room:'sector:{x}:{y}'`,
  ≥20000 → `room:'galaxy'`; 200-char cap; returns single `system` confirmation line.

- **US5 `fre`**: `FreHandlerService` — `fre <A|B|C> <number|hail>`; validates channel (a/b/c),
  rejects ≤0/negative/non-integer; `hail` keyword sets 0; sets `ship.dirty = true`.

- **US6 `tea`**: `TeaHandlerService` — `tea` (show current team), `tea <name>` (exact
  case-insensitive join: writes `User.teamcode` via Prisma + `ShipState.teamcode` in memory,
  sets dirty, emits `player.snapshot` broadcast), `tea leave` (clears both).

- **Foundational**:
  - `ShipState.teamcode?: bigint` field added; hydrated from `User.teamcode` on boot/connect.
  - `isAiUserid(userid)` helper extracted to `commands/helpers/ai-userid.ts`; callers updated.
  - `_freq-thresholds.ts` balance-regression-tested constants.
  - Gateway `processBroadcasts()` extended for `hail` and `galaxy` sentinel rooms.

**Tests**: 171 suites / 1551 tests passing. New suites: ai-userid (9), freq-thresholds (4),
who.handler (7), dat.handler (9), ros.handler (10), sen.handler (12), fre.handler (14),
tea.handler (15) — unit; who.dispatch (3), dat.dispatch (4), ros.dispatch (3), fre.dispatch (6)
— integration; social-commands E2E (11) — end-to-end through `GameGateway`.
Combat test suite updated to use canonical `@Droid-` userid prefix.

**Decisions made**:
- `who`/`dat` reinterpreted as in-world player-facing commands (not BBS debug echoes) — see D1.
- `tea` ships only join/leave/show subset of `cmd_team`; creation deferred — see D2.
- `RosHandlerService` reads `process.env['ROSTER_MAX']` directly to avoid ConfigService DI
  complexity in integration tests.
- Gateway try-catch wraps teamcode hydration on connect so failure is non-fatal.

**Next**: 013 (ship management commands) per planned feature sequence.

**Known issues / deferred**:
- T007 gateway broadcast unit test (`test/unit/gateway/game.gateway.broadcast.spec.ts`) was
  not created; the gateway behaviour is covered by the E2E suite instead.

---

## 2026-05-06 — 011-onboarding: JWT Auth + New-Player Flow + Ship Rename

**Completed**:

- **US1 — JWT authentication**: HTTP endpoints `POST /auth/register` (bcrypt cost-12 + JWT) and
  `POST /auth/login`; `WsAuthGuard` validates `socket.handshake.auth.token` on every WebSocket
  connection; `SESSION_REPLACED` error on duplicate connection (same userid); `AUTH_REQUIRED` on
  invalid/absent token; `clearToken()` on SESSION_REPLACED/AUTH_REQUIRED client-side.

- **US2 — New-player onboarding (cmd_new)**: `OnboardingService` multi-step state machine
  (`AWAITING_CLASS → AWAITING_NAME → finalized`); emits `prompt:class-list` (18 ship classes)
  and `prompt:ship-name`; creates `User` + `Ship` rows on completion; returning players get a
  welcome `command:result` instead of prompts; `loadIfAbsent()` added to `ShipStateService`.

- **US3 — Ship rename (cmd_rename)**: `RenameService` validates format (1-19 printable,
  no spaces), case-insensitive uniqueness check, DB + memory atomic update; case-identical
  = no-op; `RenameHandlerService` uses `broadcasts` in `CommandResult` to emit `ship.renamed`
  to sector room + global `player.snapshot` refresh; arg casing preserved in `CommandRouterService`.

- **Frontend**: `AuthScreen` (register form), `ClassPickerPrompt`, `ShipNamePrompt` with
  name-taken error; `tokenStore` (localStorage JWT); `socketClient` updated to JWT auth callback
  (`autoConnect: false`, `auth: (cb) => cb({ token: getToken() })`); `useSocket` subscribes to
  `prompt:class-list`, `prompt:ship-name`, `ship.renamed`; `usePlayerList` gains `RENAMED` action.

- **DB migration**: `011_onboarding_auth` adds `username NOT NULL`, `passwordHash` nullable,
  `createdAt`; backfills `username = userid`; adds LOWER() unique indexes on both `User.username`
  and `Ship.shipname`.

**Tests**: 16 frontend Vitest (109 tests) + backend Jest — all passing.
New backend suites: handshake-auth, returning-player, session-replaced, rename.service (11 unit),
rename.handler (unit), cmd-rename (6 integration), loadIfAbsent (3 unit).
New frontend suites: AuthScreen.returning, tokenStore, ClassPickerPrompt, ShipNamePrompt, ship-renamed (5 unit).

**Decisions made**: bcrypt cost 12, JWT 30-day expiry, NULL-passwordHash backfill policy,
`broadcasts` decoupling in CommandResult, arg casing fix in CommandRouterService — all in DECISIONS.md.

**Next**: 012 (TBD) per the planned feature sequence.

**Known issues / deferred**: None.

---

## 2026-05-06 — 010-react-frontend: React Terminal UI
<!-- Note: implemented on branch 010-react-frontend; logically this feature is
     014 in the planned feature sequence (onboarding, social, ship-mgmt come first),
     but was prioritised and built first. The roadmap section below reflects the
     correct intended sequence: 010=react-frontend, 011=onboarding … 015=navigation. -->

**Completed**:
- US1 (P1) — Command input with 20-entry ↑/↓ history (CommandInput.tsx); sticky-bottom EventLog with 500-entry cap and category colour-coding; tailwind `accent` colour token (#4ade80 / green-400)
- US2 (P1) — ScanMap 30×15 ASCII grid with symbol mapping (`+` self, `@` ship, `O` planet, `W` wormhole, `*` mine, `.` empty); overlap priority `self > ship > planet > wormhole > mine`; clears on `physics.sector-transition` when local shipId appears in transitions
- US3 (P2) — Player list panel (PlayerListPanel.tsx, usePlayerList hook); alphabetically sorted; incremental sync via `player.snapshot / player.joined / player.left / physics.sector-transition`; backend: ConnectedShipsRegistry, SectorTransitionSubscriber, GameGateway extensions; single-socket-per-ship enforcement with correct event ordering (left → snapshot → joined)
- US4 (P2) — ConnectionBanner renders for `connecting / disconnected / reconnecting`, hidden for `connected`; Socket.io exponential backoff tuned to max 30 s ±50% jitter (FR-020)
- Wire contracts in `frontend/src/types/contracts.ts` for all four new Socket.io events; `contracts-parity.spec.ts` verifies backend ↔ frontend type alignment

**Tests**: 83 Vitest (frontend) + 1355 Jest (backend) — all green. New suites: player-snapshot, player-join-leave, single-socket-per-ship, sector-transition (backend); usePlayerList, PlayerListPanel, ConnectionBanner, socketClient extensions (frontend)

**Decisions made**: last-write-wins single-socket (ConnectedShipsRegistry), batched physics.sector-transition (SectorTransitionSubscriber), useReducer over Redux for player list — all in DECISIONS.md

**Next**: 011-onboarding (`cmd_new`, `cmd_rename`) — note: react-frontend was built as 010 but is logically 014 in the planned sequence; onboarding, social, and ship-mgmt features will precede it in the backend delivery order

**Known issues / deferred**:
- `droid.spawned` / `droid.killed` events not bridged to the client player list (assumed not needed for initial v1 per spec)
- `LOCAL_USERID` is hardcoded to `'DEV'` in socketClient.ts; auth integration deferred to 011-onboarding

---

## 2026-05-05 — 009-midnight-job: Midnight Maintenance Job

**Completed**:
- `MidnightRun` Prisma model + migration (runDate @id @db.Date, PhaseCounters, durationMs)
- `MidnightService` with `@Cron('0 0 * * *')` + `onApplicationBootstrap` self-heal + manual `run()` entry point
- Postgres advisory lock (`pg_try_advisory_lock`) for concurrent invocation protection; `MidnightLockHeldError` exported for 409 mapping
- Full 4-phase midnight pass wrapped in a single `prisma.$transaction()`:
  - Phase 1: `resetUserAccumulators` — planets/score/plscore/population → 0
  - Phase 2: `processOwnedPlanets` — bulk-load + in-memory accumulation + batch writes (SC-005: 1,656 ms / 2,000 planets)
  - Phase 3: `purgeMail` — delete by age + delete `*`-prefixed recipients
  - Phase 4: score = plscore + klscore (raw SQL), team reconciliation, roster ranking (ROW_NUMBER window fn)
- `valuePlanet()` pure BigInt scorer (GEPLANET.C formula, avoids zero-divisor with rearranged arithmetic)
- `buildProductionMailStat()` for phase-2 MailStat rows (class=3/MAIL_CLASS_PRODRPT)
- `rankRoster()` pure fn for rospos assignment
- `AdminMidnightController` — POST /admin/midnight/run → 202/401/409/503
- `AdminTokenGuard` — constant-time `timingSafeEqual` comparison; 503 if env unset
- `PlayerScoreService` + `PlayerScoreRepository` — ChgLoser cash penalty on PvP kill (FR-025/026)
- `PlayerScoreModule` with `CHGLOSER_PERCENT` DI token factory provider; wired into `CombatModule`
- `ScheduleModule.forRoot()` and `MidnightModule` added to `AppModule`

**Tests**: 16 new test files, 94 new tests (balance-regression, value-pl, rank-roster, mailstat-builder,
midnight.service, mail-purge, team-reconciliation, idempotency, advisory-lock, transaction-rollback,
self-heal, admin-endpoint, perf-budget, seven-day-soak, chgloser-pvp, droid-kill-scoring).
1332 tests total, all passing.

**Decisions made**:
- D1: MidnightRun ledger for idempotency (date-keyed upsert)
- D2: pg_try_advisory_lock for concurrency protection
- D7: N+1 elimination in processOwnedPlanets (bulk-load + in-memory + batch writes)
- D8: CHGLOSER_PERCENT injected via NestJS factory provider
- D9: timingSafeEqual in AdminTokenGuard

**Next**: feature 010-react-frontend — Terminal UI, ASCII map, command input, event log

**Known issues**: None. All 1332 tests green.

---

## 2026-05-04 — 006b-combat bugfix: score transfer on kill

**Completed**:
- Added `scoreAwarded: number` to `CombatShipDestroyedEvent`; computed in `runKillResolution`
  from `ShipClassCacheService.getPoints(victim.shpclass)` (falls back to 0 if class not cached).
- `ShipClassCacheService`: added `points` field to `ShipClassEntry`, hydrated from Prisma
  `ShipClass.points`, exposed via `getPoints(classNumber)`.
- Created `PlayerScoreRepository.transferKillScore` — awards `scr` to attacker score/klscore,
  deducts from victim score/klscore (floor at 0), skips victim deduction for AI ships
  (`Cybrg-*` / `Droid-*`). Runs as a single Prisma transaction.
- Created `PlayerScoreService` — listens to `COMBAT_SHIP_DESTROYED`, skips if `scoreAwarded=0`
  or no attacker, detects AI victim via `/^(?:Cybrg-|Droid-)/` regex.
- Updated 5 existing test fixtures to include `scoreAwarded: 0`.

**Tests**: 9 new tests in `score-transfer.spec.ts` — service listener behaviour (5) and
repository floor logic (4). 1027 tests total, all passing.

---

## 2026-05-04 — 006b-combat bugfix: cargo transfer on kill

**Completed**:
- Implemented cargo transfer in `CombatTickService.runKillResolution()` per GEFUNCS.C:killem (1122-1136):
  loop items index 1–13, skip `I_TROOPS`, pick divisor 1–5 via seeded Random port, transfer if
  the amount fits in the attacker's remaining cargo capacity.
- Added `loot: Array<{ itemIndex: number; amount: bigint }>` field to `CombatShipDestroyedEvent`
  so the gateway can broadcast what was looted.
- Updated 8 existing test fixtures to include `loot: []`.

**Tests**: 6 new tests in `cargo-transfer.spec.ts` — full transfer, near-capacity partial transfer,
zero transfer when full, men/troops excluded, loot in event, empty loot with no attacker.
1018 tests total, all passing.

---

## 2026-05-04 — 007-cybertron-ai bugfix: createSpawn in-memory visibility

**Completed**:
- Fixed `CybertronRepository.createSpawn`: after `prisma.ship.create()` inside the transaction,
  now fetches the persisted row and calls `ShipStateService.loadShip()` so spawned ships are
  immediately visible to all game logic without a server restart.
- Added test to `persistence.spec.ts`: verifies `loadShip` is called and the ship is
  retrievable via `get(userid, shipno)` immediately after `createSpawn`.

**Tests**: 1 new test in `persistence.spec.ts` (5 total in suite), all passing.

---

## 2026-05-03 — 007-cybertron-ai (complete: US1–US6 + Polish)

**Completed**:
- Full Cybertron AI: spawn-fill, target acquisition, hyperwarp pursuit, engagement (phaser+torp+decoy),
  breakoff, zipper, damage response (mine+jammer), jammed evasion, gold transfer on kill,
  persistence (hydrateAll + clampCybertronCash at all boundaries), Sarterns via shared code path
- `CybertronDebugController` — `GET /debug/cybertron-stats` (dev-only)
- `CombatShipDestroyedEvent` extended with victimUserid/attackerUserid/victimShipKey/attackerShipKey
- `ShipClassCacheService` extended with maxShields, hasJammer, hasMine, hasZipper, noClaim, tough, cybLowestClassAttacks, cybCanAttack
- `GameGateway` extended with @OnEvent handlers for cybertron.taunt + cybertron.broke-off

**Tests**: 1004+ total, 100+ suites, all passing. Net new cybertron test files:
- `cyb-decisions.spec.ts` — 21 unit tests (pure decision functions)
- `cybertron-tick.service.spec.ts` — 25+ integration tests (spawn, acquisition, hyperwarp, engagement, Sarterns)
- `neutral-zone.spec.ts`, `noclaim.spec.ts` — 4 safety-constraint tests
- `acquisition-rate.spec.ts`, `hyperwarp-arrival.spec.ts`, `spawn-fill-timing.spec.ts` — 7 SC statistical tests
- `difficulty-curve.spec.ts` — 8 tests (gebemean rate, torpedo volley sizing)
- `gold-transfer.spec.ts` — 4 tests
- `persistence.spec.ts` — 4 integration tests (hydrateAll, clampCybertronCash, createSpawn)
- `balance-regression.spec.ts` — 12 constant-pin tests (T068)
- `fault-isolation.spec.ts` — 1 test (bad-class ship doesn't block healthy ships)
- `integration/cybertron-end-to-end.spec.ts` — 8 tests (quickstart recipe as test)

**Decisions made**: See DECISIONS.md R-1 through R-11.

**Next**: `008-droid-ai` — ephemeral Droid + Murdonian Transport behavior

**Known issues / deferred**:
- T058 (spawn-fill integration: drive ticks until missing Cybertrons are created) — partial
  coverage in persistence.spec.ts; full recipe in quickstart.md
- AI scoring (kills → player rank boost) — deferred to 009-midnight-job
- T077 (manual quickstart verification) — deferred to post-merge

---

## 2026-05-03 — 007-cybertron-ai (Phase 1–3, US1)

**Completed**:
- `backend/src/game/cybertron/cybertron.module.ts` — CybertronModule (imports CombatModule, PhysicsModule, ShipModule, TickModule)
- `backend/src/game/cybertron/cybertron.config.ts` — `CybertronClassConfig` interface, `CYBERTRON_CLASS_DEFAULTS` for classes 21-25 (Sarterns 24/25 included), env override support
- `backend/src/game/cybertron/cybertron-events.ts` — `CYBERTRON_EVENT` const map + payload interfaces
- `backend/src/game/cybertron/taunt-pool.ts` — 13 in-character taunt strings, `pickTaunt(rand)`
- `backend/src/game/cybertron/cyb-decisions.ts` — pure AI decision functions: `cybwhoops`, `gebemean`, `rollTorpedoCount`, `pickPursuitBand`, `pickSpawnClass`, `randomInitLoadout`, `randomCybSkill`
- `backend/src/game/cybertron/cybertron.repository.ts` — `hydrateAll`, `createSpawn`, `flushShipsImmediate`, `flushUsersImmediate`, `clampCybertronCash`
- `backend/src/game/cybertron/cybertron-tick.service.ts` — US1 complete: `cybLives`, `cybCheckLockon`, `cybCheckDamage`, `cybUpdateDb`, NZ exclusion, `noClaim` cap, hyperwarp/brake/close/combat pursuit bands, shield restore on hyperwarp exit, `cybertron.target-acquired` event emission with immediate flush
- Extended `CombatShipDestroyedEvent` with `victimShipKey`, `attackerShipKey`, `victimUserid`, `attackerUserid` (T012a/T012b)
- Extended `ShipClassCacheService` with `maxShields`, `hasJammer`, `hasMine`, `hasZipper`, `noClaim`, `tough`, `cybLowestClassAttacks`; added `get()` method
- Added `ShipStateService.loadShip()` for boot-time hydration
- Added 14 Cybertron constants to `constants.ts`

**Tests**: 966 total, 95 suites, all passing. Net new cybertron test files:
- `cyb-decisions.spec.ts` — 21 unit tests (pickSpawnClass, pickPursuitBand, gebemean, rollTorpedoCount, randomCybSkill, randomInitLoadout)
- `cybertron-tick.service.spec.ts` — 9 integration tests (spawn cadence, target acquisition, hyperwarp entry/exit, Sartern class 24)
- `neutral-zone.spec.ts` — 2 tests (NZ exclusion verified)
- `noclaim.spec.ts` — 2 tests (noClaim cap enforced)
- `acquisition-rate.spec.ts` — 1 SC-002 statistical test (≥95/100 trials acquire target)
- `hyperwarp-arrival.spec.ts` — 3 SC-003 travel-time tests (hyperwarp < half baseline ticks)
- `spawn-fill-timing.spec.ts` — 3 SC-001 tests (all classes fill within 900 ticks)

**Decisions made**:
- US1 cybLives uses `cybmine === playerShipno` (not user-index like C source — shipno is unique for active players)
- `isInNeutralZone` = `Math.floor(xcoord) === 0 && Math.floor(ycoord) === 0` (faithful to GEPLANET.C:neutral)
- Cybertrons at `(0,y)` or `(x,0)` with fractional coordinate may be in NZ — Cybertron must be outside NZ to scan
- `topSpeed` in cybLives = `ship.topspeed * 1000.0` (matches C source `d_topspeed = topspeed*1000.0`)

**Next**: US2 (engagement: phaser + torpedo + decoy + breakoff) — T040-T047

**Known issues**: US2-US6 stubs in place; T016 test exercises real T029 impl; T020a now enforces ≥95% constraint.

---

## 2026-05-03 — 006b-combat

**Completed**:
- `backend/src/game/combat/random.port.ts` — `Random` interface, `RANDOM` injection token,
  `MathRandomAdapter` (production), `Mulberry32Adapter` (seeded, for tests)
- `backend/src/game/combat/combat-events.ts` — 6 event-name constants + payload interfaces:
  `COMBAT_PHASER_FIRED`, `COMBAT_HIT`, `COMBAT_MISS`, `COMBAT_DECOY_INTERCEPT`,
  `COMBAT_MINE_DETONATION`, `COMBAT_SHIP_DESTROYED`
- `backend/src/game/combat/combat-math.ts` — pure side-effect-free functions (all via injected
  `Random`): `cdistance`, `lineOfFire`, `phaserDamage`, `tonFact`, `shieldhit`, `randamage`,
  `mineFalloff`, `decoyIntercept`, `jammerCounter`, `damstr`
- `backend/src/game/combat/mine.registry.ts` — in-memory `Map<mineId, MineState>` with
  `hydrate/add/remove/tickAll/sweepCandidates`
- `backend/src/game/combat/mine.repository.ts` — Prisma wrapper: `findAllActive/create/delete`
- `backend/src/game/combat/combat-tick.service.ts` — per-physics-tick combat: phaser reload,
  cantexit decrement, decoy/jammer expiry, torpedo travel, missile travel, mine sweep,
  kill resolution; per-ship try/catch
- `backend/src/game/combat/combat.module.ts` — NestJS module (imports PhysicsModule)
- `backend/src/game/planet/planet-economy.service.ts` — planet revolt logic (taxrate-based
  per GEPLANET.C:341-380)
- `backend/src/game/commands/helpers/find-ship.ts` — resolves `@` to lock target, name to shipno
- Command handlers: `phaser.handler.ts`, `torpedo.handler.ts`, `missile.handler.ts`,
  `mine.handler.ts`, `zipper.handler.ts`, `decoy.handler.ts`, `jammer.handler.ts`,
  `sys.handler.ts` (`sys unjam`), `lock.handler.ts`, `shield.handler.ts`, `flux.handler.ts`
- Modified: `backend/src/game/constants.ts` (+20 combat constants), `ship-class-cache.service.ts`
  (+maxPhaser/scanRange/maxTons/hasTorpedo/hasMissile), `ship-state.service.ts`
  (+removeFromGame), `game.gateway.ts` (@OnEvent for all 6 combat events), `app.module.ts`
  (+CombatModule), `planet.module.ts` (local RANDOM binding), `planet-state.service.ts`
  (wired PlanetEconomyService)

**Tests**: 918 total, 87 suites, all passing. Net new combat test files:
- `combat-math.spec.ts`, `mine.registry.spec.ts`, `mine-persistence.spec.ts`,
  `balance-regression.spec.ts`, `tick-subscription-order.spec.ts`,
  `combat-tick.service.spec.ts`, `kill-attribution.spec.ts`, `in-flight-cleanup.spec.ts`,
  `death-broadcast.spec.ts`, `combat-broadcast.spec.ts`
- Handler specs: `phaser.spec.ts`, `torpedo.spec.ts`, `missile.spec.ts`, `mine.spec.ts`,
  `zipper.spec.ts`, `decoy.spec.ts`, `jammer.spec.ts`, `sys-unjam.spec.ts`, `lock.spec.ts`,
  `shield.spec.ts`, `flux.spec.ts`
- Planet: `revolt.spec.ts`

**Decisions made**:
- R-1: CombatModule imports PhysicsModule to enforce tick subscription ordering (combat fires
  post-physics movement)
- R-2: Injectable `RANDOM` port (Mulberry32Adapter for tests) — no inline `Math.random()`
- R-3: No mine owner exclusion — faithful to GEFUNCS.C:minesweep (deployer can hit themselves)
- R-4: `findShip` lazy lock clear — stale lock (`!ingegame` or out-of-range) cleared on use
- R-5: Jammer area-effect includes carrier itself — no self-exclusion (GECMDS.C:1593)
- R-6: Friendly fire allowed in `lineOfFire` — no team filter, faithful to GECMDS.C:cmd_phasor
- R-7: `COMBAT_SHIP_DESTROYED` broadcast galaxy-wide (`server.emit`); all other combat events
  sector-scoped; `channel = shipno` used as the unique per-player channel identifier
- PlanetModule binds local RANDOM to avoid circular dep (PlanetModule → CombatModule → PhysicsModule)

**Next**: `007-cybertron-ai` — persistent Cybertron behavior (escalating difficulty, gold
accumulation, neutral-zone respect, per GECYBS.C)

**Known issues**: None.

---

## 2026-05-02 — 006a-physics-tick

**Completed**:
- `backend/src/game/physics/` module: `physics-math.ts` (pure: rotationStep,
  accelerationStep, positionIntegration, tryEnergyDebit, sectorOf,
  normalizeHeading), `ship-class-cache.service.ts` (boot-hydrated maxAcceleration
  / maxWarp lookup), `physics-tick.service.ts` (orchestrator subscribed to
  `TickKind.PHYSICS`), `physics-events.ts` (typed event names + payloads).
- `EventEmitter2` integration via `@nestjs/event-emitter` (new dep) for the two
  typed signals: `physics.sector-transition` and `physics.hyperspace`.
- `WarpHandlerService` (replaces the static `warpCommand` const) — full FR-012
  five-gate sequence using `ShipClassCacheService.getMaxWarp` for WARP01 vs.
  WARPSPD2 distinction.
- Constants added to `game/constants.ts`: `ACCENGAMT=120`, `MOVENGUSE=10`,
  `MOVENGMIN=3000`, `ROTENGUSE=30`, `WARP_THRESHOLD=1000`, `COORD_SCALE=65000`.
- Jest config picks up new `test/game/` root.

**Tests** (754 total, 64 suites — all green; 67 net new):
- Unit (physics-math): 35 tests covering accel/decel/snap, ACCENGAMT gate,
  hyperspace boundary, position integration on cardinal/diagonal headings,
  energy floor refusal, sector-of, rotation step short-way + normalization.
- Unit (ShipClassCacheService): 4 tests for hydration, sync lookup, throw on
  unknown class, test seam.
- Integration (PhysicsTickService): 11 tests — warp-1 advance + MOVENGUSE +
  hyperspace=enter, sector-transition emission, AI maintenance exclusion,
  orbit/dock skip, MOVENGMIN floor cutoff, per-ship fault isolation, US2
  short-way rotation, US3 hypha/cantexit decrement, FR-019 ordering.
- Warp gate (warp-gate.spec.ts + revised warp.spec.ts): all six FR-012 gate
  paths validated through the cache-injected handler.
- Balance regression: 12 assertions pinning every consumed constant + the
  sum-of-classes for `maxAcceleration` (72050) and `maxWarp` (522).
- Performance bench: 100 ships through one `advanceAll()` < 50 ms (SC-004).

**Decisions made**: rotation step uses `max_accel/10` (not unused ROTAMT);
MOVENGUSE widened to `speed > 0` (playtest fallback documented); deterministic
ascending-shipKey iteration; per-ship try/catch (no quarantine). All recorded
in `docs/DECISIONS.md`.

**Next**: `006b-combat` — phasors first, then torpedoes/missiles/mines on the
same physics tick.

**Known issues**: None. Out-of-scope (deferred to 006b or galaxy work):
universe wrap, telezip, gravity, overspeed-engine-blow, weapon/shield/cloak
state, gateway consumption of the new typed events, manual quickstart §1–§8
(blocked on a real Postgres seed run; verified at the unit/integration level).

---

## 2026-05-01 — 001-prisma-schema

**Completed**:
- `backend/prisma/schema.prisma` with 10 models: User, Ship, Sector, Planet, Wormhole, Team, Mail, MailStat, ShipClass, Mine
- `backend/prisma/seed/ship-classes.ts` — 18 static ShipClass rows (10 player, 5 CPU combative, 3 CPU droid)
- `docker-compose.yml` (repo root) — `postgres:16-alpine` service with `ge` and `ge_test` databases
- `docker/postgres/init.sql` — creates `ge_test` on first container start
- `.env.example` with `DATABASE_URL` and `TEST_DATABASE_URL`
- `backend/package.json` with `db:up`, `db:down`, `db:reset`, `test`, `prisma:generate`, `prisma:push` scripts
- Full Jest integration test suite under `backend/test/prisma-schema/`

**Tests**: 250 tests across 14 suites, all green. Test categories:
- Round-trip fidelity per entity (10 spec files)
- BigInt overflow: every `BigInt`/`BigInt[]` column accepts values > 2^31 (bigint-overflow.spec.ts)
- Balance regression: 9 GEMAIN.H constants pinned (balance-constants.spec.ts)
- Schema fidelity audit: every GEMAIN.H field asserted via Prisma DMMF (fidelity-audit.spec.ts)
- Seed coverage: all 18 ShipClass rows with spot-checked columns (ship-class.spec.ts)
- Uniqueness: duplicate composite keys rejected for Sector, Planet, Wormhole, Team, Mail, MailStat, Ship, ShipClass
- Array lengths: MAXTORPS=3, MAXMISSL=3, MAXDECOY=10, NUMITEMS=14 enforced in tests

**Decisions made**:
- `unsigned long` accumulators → `BigInt`; bounded `unsigned` → `Int` (research.md R-1)
- Fixed C arrays persisted as native Postgres array columns (parallel arrays for TORPEDO/MISSILE/ITEM sub-structs) — no JSON, no child tables (FR-034/FR-035)
- FK enforced for Ship→User, Mail→User, MailStat→User; relaxed for `teamcode`, `userid` on Planet, `lastattack`, `spyowner` (matches original game tolerance, R-3)
- Mine uses a synthetic `id @default(autoincrement())` because the original MINE struct has no natural composite key
- `MailStat` is a separate model from `Mail` (cleaner than polymorphic discriminator in Postgres)

**Next**: `002-tick-engine` — NestJS application bootstrap, PrismaService, GameGateway skeleton, TickService with 1s and 6s intervals

**Known issues**: None

## 2026-05-01 — 002-tick-engine

**Completed**:
- `backend/src/main.ts` — NestJS bootstrap with IoAdapter (Socket.io), enableShutdownHooks(), ephemeral port support, fail-fast on DB connect error
- `backend/src/app.module.ts` — Root module wiring PrismaModule, TickModule, GatewayModule, DebugController
- `backend/src/prisma/prisma.{module,service}.ts` — @Global PrismaModule; PrismaService extends PrismaClient with $connect/$disconnect lifecycle
- `backend/src/game/constants.ts` — MAXX=30, MAXY=15, TICKTIME=6, TICKTIME2=1 from GEMAIN.H
- `backend/src/game/tick/tick.{types,module,service}.ts` — TickKind enum, TickContext interface, TickHandler/Unsubscribe types; TickService with raw setInterval(1000)+setInterval(6000), subscriber registry, error isolation, getStats()
- `backend/src/gateway/{gateway.module,game.gateway}.ts` — @WebSocketGateway with sector:join/sector:leave/disconnect lifecycle, OUT_OF_BOUNDS + INVALID_PAYLOAD error contracts
- `backend/src/debug/debug.controller.ts` — GET /debug/tick-stats for operator soak verification

**Tests**: 38 new tests, all green. Categories:
- Unit (fake timers): tick cadence × 6 cases, subscriber registry × 9 cases (including G4 async/slow handler isolation), constants regression × 5 cases
- Integration: PrismaService connect/disconnect/fail-fast (G3 bogus URL) × 3 cases; GameGateway join/leave/bounds/payload/disconnect-cleanup/100-cycle-leak × 14 cases
- E2E: Full AppModule boot (<5s, G1), clean shutdown (<3s, G2), socket client connects, no leaked connections × 3 cases

**Decisions made**:
- Raw `setInterval` over `@nestjs/schedule` (deferred for feature 009's midnight @Cron)
- Single-process tick engine accepted; Postgres advisory lock deferred until multi-node deployment
- Hand-rolled `Map<TickKind, Set<TickHandler>>` subscriber registry over @nestjs/event-emitter
- G5: TICKTIME/TICKTIME2 not in feature 001 balance-constants.spec.ts — added `test/unit/constants.spec.ts`
- T031 (10-minute manual soak) skipped; procedure documented in `specs/002-tick-engine/quickstart.md`

**Next**: `003-ship-commands` — CommandService + basic commands (scan, report, rotate, impulse, warp)

**Known issues**: 16 pre-existing prisma-schema test failures (existed before feature 002; caused by DB state interaction between concurrent test suites in feature 001). Not caused by this feature; tsconfig decorator fixes actually allow one additional suite to compile and pass.

## 2026-05-01 — 003-ship-commands

**Completed**:
- `ShipState` interface (47 fields + `dirty: boolean`) + mappers (`prismaShipToState`, `stateToPrismaUpdate`)
- `ShipStateService` — in-memory `Map<string, ShipState>`; hydrates from Prisma on init; subscribes `SHIP_UPDATE` tick → async dirty flush (per-entry try/catch); `get`/`mutate`/`findByUserid`/`findAllShips`/`findByName`
- `CommandRouterService` — alias-keyed registry; tokenise→lowercase→dispatch; minArgs guard; empty→silent drop; unknown→`UNKNOWN_CMD`
- `MessageId` enum (38 IDs) + `formatMessage()` with printf-style placeholder substitution
- `validators.ts` — `valdegree(-180..180)`, `valpcnt(0..99)` with typed ok/error returns
- Handlers: `rotate` (rot), `impulse` (imp), `warp` (war) — plain Command objects; `scan` (sc), `report` (rep) — `@Injectable()` services that cache ShipClass data on init
- `scan` — 30×15 range-scan projection (`projectRangeCell` from GECMDS.C:2640); returns `scanGrid` payload; TODO(004) planet/wormhole projection
- `report nav/sys/cargo/wpns` — multi-line read-outs; TODO(005)/TODO(006) for cargo and weapon gates
- `GameGateway` — handshake resolves active ship (lowest shipno), emits welcome; `command` event → router → `command:result`; try/catch error path
- React frontend: `socketClient.ts` singleton, `useSocket` hook, `ConnectionIndicator`, `EventLog`, `CommandInput`, `ScanMap` (30×15 grid), `App.tsx` 3-region terminal UI
- `CommandsModule` imports `PrismaModule` so `ScanHandlerService` + `ReportHandlerService` can inject `PrismaService` in isolated test contexts

**Tests**: 410 backend (30 suites, all green) + 33 frontend (7 suites, all green). New in this feature:
- Unit: `command-router.spec.ts` (17), `ship-state.service.spec.ts` (13), `validators.spec.ts` (16), `handlers/rotate.spec.ts` (10), `impulse.spec.ts` (11), `warp.spec.ts` (13), `scan.spec.ts` (11), `report.spec.ts` (15), `constants.spec.ts` additions
- Integration: `command-roundtrip.spec.ts` (11 — US1 flight + US2 inspection + T040 error path), `handshake-resolution.spec.ts` (4)
- Frontend: `ConnectionIndicator`, `EventLog`, `CommandInput`, `ScanMap`, `socketClient`, `App`, `contracts-parity` specs

**Decisions made**:
- Scan/report handlers are `@Injectable()` services (not plain Command objects) because they need Prisma on init to cache ShipClass data; handlers stay synchronous via cache
- Handshake binds the active ship (lowest shipno); no BOARD command per original GECMDS.C command table
- WARP04 (speed > topspeed) is warn-and-apply per GECMDS.C:614-619; warp is not rejected
- `CommandsModule` explicitly imports `PrismaModule` so isolated test modules resolve `PrismaService` without depending on `@Global()` being loaded via AppModule
- `SCAN_GRID_WIDTH=30`, `SCAN_GRID_HEIGHT=15` declared in `constants.ts` with JSDoc anchors; frontend copies to `contracts.ts` (shared-types path is outside tsconfig rootDir)

**Next**: `004-galaxy-generator` — Procedural 30×15 galaxy + sector types + wormholes

**Known issues**:
- `report cargo` and `report wpns` are placeholder stubs — deferred to feature 005 (planet items) and feature 006 (combat)
- `scan pl` (planet scan) deferred to feature 004
- `scan ra` / `scan se` return `SCANFMT` — deferred to feature 006
- Ship topspeed used as proxy for ShipClass.maxWarp in warp handler — WARP01/WARPSPD2 distinction deferred to feature 006

## 2026-05-01 — 004-galaxy-generator

**Completed**:
- Procedural 30×15 galaxy generator (Mulberry32 PRNG, row-major iteration, `s00` neutral-zone fixture)
- `GalaxyMeta` singleton written inside a single Postgres transaction on first boot; idempotency probe on `onModuleInit`
- In-memory read model: `planetsBySector`, `wormholesBySector`, `planetsByName` maps populated from DB after generation
- `scan lo` planet (`'O'`) and wormhole (`'W'`) projection onto the tactical grid
- `scan pl <name>` galaxy-wide named planet lookup via `GalaxyService.findPlanetByName`
- Operator reseed support via `GALAXY_SEED`, `GALAXY_PLODDS`, `GALAXY_WORMODDS`, `GALAXY_MAXPLANETS` env config

**Tests**: 35+ new backend tests:
- Unit: RNG determinism (5), config validation (38), service read methods (11)
- Integration: bootstrap (9), determinism (3), idempotency (10), balance (8), config divergence (5)
- Unit scan handler: 8 new planet/wormhole projection and named lookup tests
- Integration scan roundtrip: 1 end-to-end roundtrip test

**Decisions made**: Three documented deviations from GEPLANET.C (see DECISIONS.md):
wormhole destinations bounded to 30×15; `scan pl` resolves by galaxy-wide name not local plnum;
neutral-zone `s00` table authored in code. G5 rollback test required intercepting `$transaction`
to patch the tx client.

**Next**: `005-planet-system` — colonization, buy/sell, orbit

**Known issues**: None

## 2026-05-02 — 005-planet-system

**Completed**:
- `NUMITEMS=14` item constants: names, base prices, manhours, max capacities, tonnage weights
- `PLANTOCK_SECONDS=1800`, `PLANTIME_MIN_SECONDS=4` economy-tick cadence constants
- `TickKind.PLANET_UPDATE` + `TickService.startPlanetUpdateTimer(intervalMs)` — third heartbeat, idempotent start
- `PlanetState` interface + `PlanetItem` sub-type; `planetKey(xsect,ysect,plnum)` → string
- `prismaPlanetToState` / `stateToPrismaUpdate` mappers (parallel-array ↔ `PlanetItem[]`)
- `PlanetStateService` — in-memory `Map<planetKey, PlanetState>`; hydrates from Postgres; per-planet `runSerialized` async mutex; `get/all/size/claim/buy/sell/applyAdminChange/withdrawTax/runEconomicTickFor`; per-mutation Postgres flush (no dirty-flag)
- `planet-trade.ts` — pure `computeBuyOutcome` / `computeSellOutcome` (no I/O)
- `planet-economy.ts` — pure `applyEconomyTick` (ports GEPLANET.C:multiply lines 195–340)
- `PlanetTickService` — round-robin one-planet-per-PLANET_UPDATE; cadence = floor(1800/N) clamped ≥ 4s
- `PlanetModule` — imports PrismaModule, GalaxyModule, ShipModule, TickModule; exports PlanetStateService
- Command handlers: `orbit` (orb), `land` (lan), `buy`, `sell`, `admin` (adm), `withdraw` (with)
- `report cargo` fully implemented (per-item lines, tonnage total, class capacity)
- `scan pl <name>` beacon visibility line (research Decision 10)
- `CommandHandler` type extended to `CommandResult | Promise<CommandResult>`; `GameGateway.handleCommand` awaits async results
- `formatMessage` regex updated to handle `%6d` width specifiers

**Tests**: 687 backend tests, 58 suites, zero failures. Net new in this feature:
- Unit: `balance-planet.spec.ts` (7), `tick-planet-update.spec.ts` (5), `planet-state.spec.ts` (22), `planet-economy.spec.ts` (8), `planet-tick-cadence.spec.ts` (7), `planet-trade.spec.ts` (15)
- Unit handlers: `orbit.spec.ts` (7), `land.spec.ts` (9), `buy.spec.ts` (9), `sell.spec.ts` (6), `admin.spec.ts` (18), `withdraw.spec.ts` (7), `report-cargo.spec.ts` (8), scan.spec.ts beacon extension (3)
- Integration: `planet-bootstrap.spec.ts` (2), `planet-claim.spec.ts` (6), `planet-trade-persistence.spec.ts` (11), `planet-trade-concurrent.spec.ts` (2), `planet-tick-roundrobin.spec.ts` (4), `planet-tick-zeropop.spec.ts` (3), `command-roundtrip-planet.spec.ts` (4)

**Decisions made**: See research.md Decisions 1–10 now captured in DECISIONS.md. Key:
- Per-mutation Postgres flush (no dirty flag) for planet state (Decision 1)
- Per-planet `runSerialized` promise-chain mutex — no external locking (Decision 2)
- Round-robin PlanetTickService, one planet per PLANET_UPDATE firing (Decision 3)
- Owner pays baseprice; non-owner pays markup2a (Decision 4)
- Neutral-zone buy: planet inventory NOT decremented (Decision 5)
- Revolt deferred to feature 006 (Decision 6)

**Next**: `006-combat` — phasors, torpedoes, missiles, mines

**Known issues**: None


---

## Roadmap to v1 — Planned Features

Features 001–009 are complete. Feature 010 (react-frontend) was implemented out
of order — the backend-first sequence would have put it at position 014, but it
was prioritised to unblock end-to-end testing. The numbering below reflects the
intended delivery sequence for the remaining work.

All command names reference the `gecmds[]` table in `reference/ge-source/GECMDS.C`.

### 010 — React frontend terminal UI ✓ DONE (implemented out of order; logically 014)

Full terminal UI: text command input with history, scrolling event log, ASCII sector map,
player list panel, connection banner. Connects to `GameGateway` via Socket.io. Renders in
monospace font with an ANSI/ASCII aesthetic. Desktop-first; not mobile-optimized.

See feature log entry 2026-05-06 — 010-react-frontend above.

### 011 — Player onboarding ✓ DONE

`cmd_new` — multi-step onboarding state machine (class selection → ship name → finalize);
`cmd_rename` — rename ship (uniqueness check, DB + memory atomic update). JWT auth added.

See feature log entry 2026-05-06 — 011-onboarding above.

### 012 — Social / information commands ✓ DONE

`who`, `dat`, `ros`, `sen`, `fre`, `tea` — ship listing, full stats, roster, send on
frequency, set frequency, team join/leave. Per-captain `user:${userid}` socket room added.

See feature log entry 2026-05-06 — 012-social-commands above.

### 013 — Ship management commands ✓ DONE

`cloak`, `maint`, `transfer`, `jettison`, `set`, `destruct`, `abort`, `abandon` — full
implementations with tick integration (cloak ramp, self-destruct countdown), energy drain,
sysop-configurable `CLOAK_ENERGY_USE` DI token, `autoShield`/`autoRepair` DB columns.

See feature log entry 2026-05-07 — 013-ship-management above.

### 014 — Planet attack & planet commands (planned)

`att` — planetary assault: land troops and fighters to capture a planet; combat formula
uses `PlanetState.men`, `.troops`, `.fighters`, `.ionc` from `GEPLANET.C`. Outcome
depends on attacker vs defender population math — the primary endgame loop.
`pln` — list all planets the player owns (name, sector, population, cash, defense).
`pri` — display current buy/sell prices for every item at the orbited planet.

Also closes: maint password gate (`FR-210`, `GECMDS.C:4463`) — `mai [password]` verifies
`Planet.password` before charging; currently deferred from feature 013.

No test coverage yet. No spec exists.

### 015 — Scan modes & display options ✓ DONE

`sca ra <1-9>`, `sca se`, `sca lo full`, `set scannames`, `set scanhome`.
Shared scantab (A-Z letter assignments), 3/4-colour channel, frontend ScanPanel + useScanRender.
All 7 D1-D7 deviations documented. ~200 new tests.

See feature log entry 2026-05-07 — 015-scan-modes above.

### 016 — Navigation autopilot & spy (planned)

`nav [x] [y]` — set an automatic course; `ship.holdcourse` is already a `ShipState`
field (mapped but unused). Needs per-tick waypoint logic in `PhysicsTickService`:
compute bearing to target sector, set `head2b`, clear on arrival or when player issues
`rot`/`imp`/`war`. Source: `GECMDS.C:cmd_navigate`, `GEFUNCS.C:moveship`.
`spy` — consume one spy item from cargo, attach to target planet (`Planet.spyowner`);
returns intel (population, items, defenses) on the next scan. Source: `GECMDS.C:cmd_spy`.
`hel` / `?` — in-game help text (topic-keyed lookup).
`cls` — clear the client's event log (frontend-only; no backend handler needed).

No test coverage yet. No spec exists.

### 017 — Mail inbox (planned)

`MailStat` rows are already written by the midnight job (production reports) and by PvP
kill (distress signals) but players have no way to read them. `sen` (012) handles
real-time broadcasts. This feature adds the persistent inbox:
- list unread mail (count + sender)
- read a message by index
- delete a message

No test coverage yet. No spec exists.

### 018 — Team management (planned)

`tea join/leave` is implemented (012) but teams must be manually seeded in the DB --
no player can create one. Needs:
- `tea create <name>` — creates a `Team` row; creator becomes implicit leader
- `tea list` — all teams with member counts and scores
- Team score column on `ros` roster output

No test coverage yet. No spec exists.

### 019 — Physics & mechanics polish (planned)

Consolidates all deferred mechanical gaps from features 006a-013:

**Physics (GEFUNCS.C)**
- **Universe boundary wrap** — ships crossing `MAXX=30` / `MAXY=15` should wrap;
  `moveship()` does this in C but `PhysicsTickService` has no boundary enforcement.
- **Overspeed engine damage** — ships exceeding 150% rated warp take hull damage
  (`GEFUNCS.C:736`); `warncntr` field exists but damage logic is warn-only.
- **Wormhole gravity** — `gravity()` (`GEFUNCS.C:836`) pulls ships within 250 parsecs
  of a wormhole toward its mouth; currently wormholes are instant-teleport via `zip` only.

**Tick wiring**
- **`set auto-repair` tick consumer** — `ship.autoRepair` persists (013) but the
  SHIP_UPDATE tick doesn't act on it; needs wiring in the repair sub-tick.
- **`set auto-shield` tick consumer** — same: `autoShield` persists but shields aren't
  auto-raised on warp exit or after torpedo fire per `GEFUNCS.C:shieldstat`.
- **AI kill scoring hookup** — Cybertron/Droid kills don't affect player `klscore`/rank;
  `PlayerScoreService` (009) exists but the event path from AI kills was never wired.

**Frontend events**
- **`droid.spawned` / `droid.killed`** — emitted by `DroidTickService` (008) but never
  bridged to the client player list (deferred from 008/010).

No test coverage yet. No spec exists.

### 020 — Source fidelity audit (planned)

A systematic pass through every C source file comparing each function against the
TypeScript implementation. Goal: close any remaining behavioral differences a player
would notice. Reference: `GECMDS.C` (all cmd_* bodies), `GEFUNCS.C` (helpers),
`GEPLANET.C` (planet combat/economy), `GEMAIN.C` (tick loop), `GEMAIN.H` (constants
and struct fields).

Known specific items to verify and close:
- `randamage()` logic differences (`GEFUNCS.C` vs `combat-math.ts`)
- Phaser reload preload bonus for Interceptor class (`GEFUNCS.C:checkdam`)
- `GALWORM.visible` flag — wormhole visibility per-sector (not yet mapped in ShipState)
- `scan lo full` side-panel ordering matches original C terminal output
- Beacon display on movement (`GEFUNCS.C:808`) — not yet emitted as an event
- `User.options[]` 30-byte array full mapping vs TS `set` command coverage
- All `GEMAIN.H` balance constants have a pinning balance regression test
- Live end-to-end validation on real DB: manual quickstart recipes T053, T043, T077

No test coverage yet. No spec exists.

---

### PLAYTEST MILESTONE — after 015

The game is ready for playtesting when feature 015 ships:
- Create ship → navigate → fight ships → colonize planet → attack planets → midnight scoring
- All 44 `gecmds[]` commands implemented; all scan modes working
- Cybertrons and Murdonian Transport provide PvE targets
- Real-time multiplayer via Socket.io with sector event log and tactical radar
- ASCII scan map, range/sector radar, ship roster, frequency-based comms

Features 016-020 add depth (mail, teams, autopilot, fidelity polish); they follow based
on playtest feedback.

---

### Open deferred items — accounted for above

All items from feature "Known issues / deferred" sections map to a planned feature:

| Deferred item | Source feature | Closes in |
|---|---|---|
| `scan ra` / `scan se` placeholder | 003 | 015 ✓ |
| `scan lo full` panel | 003 | 015 ✓ |
| `set` display options (SCANNAMES/SCANHOME) | 003/013 | 015 ✓ |
| Maint password gate (FR-210) | 013 | 014 |
| `set auto-repair` / `auto-shield` tick wiring | 013 | 019 |
| AI kill scoring hookup | 007/008 | 019 |
| Universe boundary wrap | 006a | 019 |
| Overspeed engine damage | 006a | 019 |
| Wormhole gravity pull | 006a | 019 |
| `droid.spawned`/`droid.killed` on client | 008/010 | 019 |
| Nav autopilot (`holdcourse`) | 003 | 016 |
| Spy deployment | -- | 016 |
| Mail inbox | 009 | 017 |
| Team creation | 012 | 018 |
| Source fidelity gaps (randamage, preload, etc.) | multiple | 020 |
| Manual quickstart validations (T053/T043/T077) | 007/008/013 | 020 |

---

## 2026-05-05 — 008-droid-ai

**Completed**:
- `isEphemeral` flag on `ShipState`; `flush()` skips ephemeral states (FR-002)
- `DroidSpawner` — builds ephemeral `ShipState` with `@Droid-<n>` userid, isEphemeral=true,
  per-class loadout (heavy Murdonian / sparse Scow+Vakory), class-specific topspeed/phaser/shields
- `DroidTickService` — subscribes after CybertronTickService; 30-tick cadence; spawn-cap=2/class;
  player-online gate; per-class dispatch to droidActClass10/11/12; fault isolation per Droid;
  `combat.ship-destroyed` listener (handleDroidDied + handleDroidWon); emits droid.annoy/spawned/killed
- Pure decision modules: `droid-decisions.ts`, `droid-act-class-10.ts`, `droid-act-class-11.ts`,
  `droid-act-class-12.ts` — faithfully porting `GEDROIDS.C:droid_act_class_*` decision trees
- Message pool `droid-message-pool.ts` — typed catalog for all three classes × passive/help variants
- `GameGateway` bridge for `droid.annoy` → target socket + sector room
- Dev-only `POST /debug/droid/spawn?class=31` endpoint
- `DroidModule` registered in `AppModule`

**Tests**: 1238 total (up from 1027 before this feature); 19 new test files covering spawn-cap,
spawn-cadence, spawn-placement, loadout, Murdonian cargo-transfer-on-kill, annoy event integration,
per-class decision matrices (class 10/11/12), decision pure functions, message pool, balance
regression, annoy rate statistics, fault isolation, cold-boot fill, ephemerality invariants,
jammed invariants, and Cybertron spawn-visibility regression (T038 backfill).

**Decisions made**:
- Class numbers 31/32/33 used (not 10/11/12 from spec) — seed already populated; C source
  dispatches by typename not number (R-14)
- `isEphemeral` flag approach — no new Prisma model, no migration (R-12)
- Single 30-tick counter drives both spawn evaluation and per-Droid actions (R-13)

**Next**: 009-midnight-job — nightly score recalculation, planet production reports, mail purge

**Known issues**:
- Droid kill-score impact (whether kills count toward player score/rank) deferred to 009
- T043 manual quickstart validation not run (requires live `ge_test` DB)
- `droid.spawned` and `droid.killed` events not yet bridged to Socket.io client

---

## 2026-05-07 — feature 014-planet-attack

**Completed**:
- `attack.config.ts` — six DI tokens (PLATTRT1, PLATTRT2, PLATTRF1, PLATTRF2, PLATTRF3, FIRETICKS) with env-var overrides, following CLOAK_ENERGY_USE pattern
- `_attack-constants.ts` — ITEM_DESTRUCTION_RANGE=15, AttackKind enum
- `planet-attack.types.ts` — AttackOutcome interface
- `planet-attack.service.ts` — attackTroop (10 steps) + attackFighter (11 steps, ratio bug preserved), callForHelp (owner alert + spy-mail roll), insertDistressMail
- `attack.handler.ts` — `att` command with per-planet mutex, pre-lock + in-lock validation, FIRETICKS injection
- `pln.handler.ts` — `pln` command: read-only planet list ordered by plnum
- `price.handler.ts` — `pri` command: bare listing + quoted BUY precondition ladder
- `maint.handler.ts` — FR-014-060/061/062 password gate inserted between FR-209 and FR-204
- `planet.module.ts` + `commands.module.ts` — all new providers and DI tokens wired
- `game.gateway.ts` — ATTACK_OWNER_ALERT_EVENT handler → user:${ownerUserid} Socket.io room
- `ship-class-cache.service.ts` — canAttackPlanet added to ShipClassEntry interface

**Tests**: 1836 total (up from 1712 before this feature); 10 new test files; 116 new tests:
- attack.handler.spec.ts — all preconditions (FR-014-001..007), troop + fighter dispatch, flush count
- attack-concurrent.spec.ts — mutex serialization, self-attack re-validation, no deduction on rejection
- attack-troop-math.spec.ts — standoff, dominance win, retreat, full-wipe, item destruction, determinism
- attack-fighter-math.spec.ts — AA fire, return-fire, counter-kill gate, high-ratio destruction, win condition
- attack-fighter-math.spec.ts — ratio bug preservation (FR-014-019, SC-008)
- call-for-help.spec.ts — owner alert emission, no alert when outnumbered/unowned, spy-mail gating
- attack-mail.spec.ts — MESG02/03 (troop), MESG04/05 (fighter), no mail below ratio threshold
- planet-attack-balance.spec.ts — all six DI token defaults pinned
- pln.handler.spec.ts — listing, empty case, read-only, row format, performance < 200ms
- maint-password.spec.ts — four password states, gate ordering (FR-209 before password before FR-204)
- price.handler.spec.ts — six-precondition ladder, owner vs foreign pricing, bare listing, read-only

**Decisions made**:
- Per-planet mutex with in-lock re-validation (D1) — TOCTOU safety without over-locking
- attack_fig() ratio bug preserved (D3 / FR-014-019 / SC-008) — exact C source fidelity
- maint password gate ordering matches GECMDS.C:4471 canonical order (D4 / research.md D10)
- PLATTR* as DI tokens (D2) — sysop-tunable, test-injectable, follows 013 CLOAK_ENERGY_USE pattern

**Next**: 015-scan-modes — scan display customization (User.options[])

**Known issues**:
- T053 manual quickstart not run (requires live ge_test DB with seeded galaxy)
- canAttackPlanet not yet populated by seed data — all ship classes default false in existing tests

## 2026-05-26 — range coherence + AI engagement fix

**Completed**:
- New helper `inScanRange(a, b, scanRange)` in `combat/combat-math.ts` — collapses the duplicated `cdistance(a,b) * 10_000 > scanRange` pattern into one place. Used in scan handler, phaser handler, find-ship helper, droid acts/tick, cybertron tick.
- Recalibrated per-class `scanRange` seeds in `prisma/seed/ship-classes.ts` and `droid/droid.config.ts` for the 30×15 galaxy (round 2). Previous compression made Cybertron Scout's effective vision 1.0 sector — players were drifting through it untouched. New values: Interceptor 1.5 sectors, Dreadnought 4.0, Cybertron Scout 2.5, Cybertron Base Star 4.0, Lydorian Scow 1.0, Murdonian 2.5, Vakory 3.0. No ship sees more than 15% of the map diagonal.
- New integration test `test/integration/range-and-ai.spec.ts` (33 tests, all green): scan-matrix per class, neutral-zone immunity, end-to-end Cybertron lock acquisition + pursuit (head2b + speed2b) + phaser fire.
- Updated `test/unit/ship-class-scanrange-pin.spec.ts` and `test/game/droid/balance-regression.spec.ts` to the new pinned values.

**Tests**: +33 new tests in `test/integration/range-and-ai.spec.ts`; 2 existing scanRange pin suites updated.

**Decisions made**:
- Did NOT do a full sector-unit migration. Torpedoes/missiles persist locked distances on `ShipState.ltorpsDistance` in raw units; `TORPSPED`/`MISLSPED` are also raw; nav-display also raw. The hygiene win (one helper) without the migration blast radius was the right trade.
- Cybertron AI was already complete (cybCheckLockon + pickPursuitBand sets head2b/speed2b; gebemean + cybwhoops apply CYB_BE_NICE / CYB_BE_EASY skill curves; cybAttack fires phasers + torps). The playtest "AI did not even try" was a scanRange compression bug, not missing pursuit logic. No new pursuit code added.
- Droid 11/12 reactive fightback (only when ship.cantexit > 0 + lastfired set) preserved as-is — matches the original C, Murdonians are not aggressive predators.

**Next**: monitor next playtest. If droids feel inert despite engaged-Cybertrons, revisit droid aggression separately.

**Known issues**:
- Pre-existing unrelated test crashes in scan-spy-reveal, scan-ra-gateway, scan-render-event, combat-tick.service, annoy-event, kill-attribution, murdonian-cargo-transfer — present on master before this work.

---

## 2026-06-26 — 029-scan-sh-detail (and broader cleanup session)

**Completed:**
- **S-008 — scan-sh intel block**: `scan sh <name>` now reveals Damage/Shields/Kills when neither player ship nor target ship is at warp, matching C canonical behavior (GECMDS.C:2244-2256). Abbreviated bearing/distance/speed/hull-size shown when either is warping. Full detail field set: typename, username, teamname, bearing, heading, range, sector, speed, length/width, damage, shieldstat, kills. Optional scanned-back feedback (SCAN1/2/3) remains deferred (minor).
- **C-011 — cloak lock gate verification**: Target-cloak lock gate (`target.cloak >= 10` → LOCK_FAIL) already implemented in Plan 1 (branch 023) in both `torpedo.handler.ts:126` and `missile.handler.ts:137`. Disposition flipped from deferred to fixed; optional LOCK1/LOCK3 lockwarn feedback remains unported (minor).
- **Full test baseline cleanup**: Greened 2743/2743 Jest suite (the 66 pre-existing stale failures fixed: midnight fixtures, harness mocks, stale assertions, scan-while-docked regression per spec 015). `tsc` clean.
- **Docker Compose stack**: Added working `postgres+backend+frontend` stack (verified). Environment config in `.env.local`. Players can now test live gameplay against a containerized stack.
- **Player-like Socket.io testing**: Demonstrated socket-level test patterns (fixtures, mocks, room subscriptions) against both unit-mocked and live-stack endpoints.

**Tests:** Full suite 2743/2743 passing; zero open test failures. `tsc` strict mode clean.

**Decisions made:**
- **S-009 deferred**: A small mine-data-wiring feature (needs `MineRegistry` injected into `ScanHandlerService` + new `ScanCell.type: 'mine'` + `scan se` wiring). Not trivial polish; own task.
- **P-007 family deferred**: Multi-ship-per-user model + dependent persistence findings (P-004/005/008/009/013/014) blocked by schema `@@unique([userid])` constraint — cannot honor C-canonical death/respawn without redesign. Flagged as architecture decision (NOT to be steamrolled). Deserves own spec once other features stabilize.

**Next:**
- Push master to origin (50 commits ahead, local only).
- Live playtest + balance tuning (PDAMMAX, weapon ranges, Interceptor combat radius).
- Optionally pursue P-007 multi-ship redesign (own spec) and S-009 scan-mines feature.

**Known issues:**
- P-007 multi-ship family deferred (architecture decision).
- S-009 scan-mines deferred (small feature, requires DI wiring).
- Optional C-011 lockwarn feedback (LOCK1/LOCK3 messages) unported (minor).
- Optional S-008 scanned-back feedback (SCAN1/2/3 messages) unported (minor).
- No other combat/AI fidelity gaps open.
