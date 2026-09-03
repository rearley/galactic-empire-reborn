# Architecture Decisions

Format: decision, Context, Reason, Alternatives rejected.

---

<!-- TOC -->
## Contents

Newest last. Every entry carries context, reasoning and the alternatives that
were rejected — the last of those is usually the part worth reading.

- [2026-08-31 — the galaxy is centred on the origin, superseding the 0-based grid](#2026-08-31-the-galaxy-is-centred-on-the-origin-superseding-the-0-based-grid)
- [2026-08-31 — the autopilot survives a speed order](#2026-08-31-the-autopilot-survives-a-speed-order)
- [2026-08-31 — debug endpoints fail closed, and are never reachable from the web server](#2026-08-31-debug-endpoints-fail-closed-and-are-never-reachable-from-the-web-server)
- [2026-08-31 — `aba` goes back to meaning colony abandonment; scuttling moves to `aba ship`](#2026-08-31-aba-goes-back-to-meaning-colony-abandonment-scuttling-moves-to-aba-ship)
- [2026-08-31 — an open question from a handler owns the next line of input](#2026-08-31-an-open-question-from-a-handler-owns-the-next-line-of-input)
- [2026-08-31 — sysop-tunable values belong in game.config.json, never pinned to a bound](#2026-08-31-sysop-tunable-values-belong-in-gameconfigjson-never-pinned-to-a-bound)
- [2026-08-30 — numopt bounds are a fidelity contract; shield behaviour is per-weapon](#2026-08-30-numopt-bounds-are-a-fidelity-contract-shield-behaviour-is-per-weapon)
- [2026-08-30 — Prisma datasource URL is resolved explicitly, and test runs bind to TEST_DATABASE_URL](#2026-08-30-prisma-datasource-url-is-resolved-explicitly-and-test-runs-bind-to-test_database_url)
- [2026-05-08 — Feature 019: score_f2 = 100 default; Cybertron kill counter decoupled; mutual-kill snapshot](#2026-05-08-feature-019-score_f2-100-default-cybertron-kill-counter-decoupled-mutual-kill-snapshot)
- [2026-05-08 — Team creation: auto-assigned teamcode + single plaintext password](#2026-05-08-team-creation-auto-assigned-teamcode-single-plaintext-password)
- [2026-05-02 — Physics tick uses `max_accel/10` for rotation (not ROTAMT)](#2026-05-02-physics-tick-uses-max_accel10-for-rotation-not-rotamt)
- [2026-05-02 — MOVENGUSE widened to `speed > 0` (with playtest fallback)](#2026-05-02-movenguse-widened-to-speed-0-with-playtest-fallback)
- [2026-05-02 — Ascending-shipKey iteration order in physics tick](#2026-05-02-ascending-shipkey-iteration-order-in-physics-tick)
- [2026-05-02 — Per-ship try/catch over quarantine](#2026-05-02-per-ship-trycatch-over-quarantine)
- [2026-05-01 — BigInt for unbounded accumulator columns](#2026-05-01-bigint-for-unbounded-accumulator-columns)
- [2026-05-01 — Parallel native arrays for fixed-size C struct arrays](#2026-05-01-parallel-native-arrays-for-fixed-size-c-struct-arrays)
- [2026-05-01 — Selective FK enforcement (relaxed for dangling-reference cases)](#2026-05-01-selective-fk-enforcement-relaxed-for-dangling-reference-cases)
- [2026-05-01 — Synthetic autoincrement PK for Mine](#2026-05-01-synthetic-autoincrement-pk-for-mine)
- [2026-05-01 — MailStat as a separate model from Mail](#2026-05-01-mailstat-as-a-separate-model-from-mail)
- [2026-05-01 — raw setInterval over @nestjs/schedule for heartbeats](#2026-05-01-raw-setinterval-over-nestjsschedule-for-heartbeats)
- [2026-05-01 — Single-process tick engine (no distributed lock)](#2026-05-01-single-process-tick-engine-no-distributed-lock)
- [2026-05-01 — Hand-rolled subscriber registry (Map<TickKind, Set<TickHandler>>)](#2026-05-01-hand-rolled-subscriber-registry-maptickkind-settickhandler)
- [2026-05-01 — Handshake active-ship resolution (no BOARD command)](#2026-05-01-handshake-active-ship-resolution-no-board-command)
- [2026-05-01 — Synchronous command handlers via pre-cached ShipClass data](#2026-05-01-synchronous-command-handlers-via-pre-cached-shipclass-data)
- [2026-05-01 — Galaxy generator deviations from GEPLANET.C](#2026-05-01-galaxy-generator-deviations-from-geplanetc)
- [2026-05-02 — Planet system decisions (feature 005)](#2026-05-02-planet-system-decisions-feature-005)
- [2026-05-03 — Combat tick subscribes after physics tick (CombatModule imports PhysicsModule)](#2026-05-03-combat-tick-subscribes-after-physics-tick-combatmodule-imports-physicsmodule)
- [2026-05-03 — Injectable Random port (RANDOM token + Mulberry32Adapter for tests)](#2026-05-03-injectable-random-port-random-token-mulberry32adapter-for-tests)
- [2026-05-03 — Mine damage applied to all ships including deployer (no owner exclusion)](#2026-05-03-mine-damage-applied-to-all-ships-including-deployer-no-owner-exclusion)
- [2026-05-03 — Friendly fire enabled in phaser lineOfFire](#2026-05-03-friendly-fire-enabled-in-phaser-lineoffire)
- [2026-05-03 — COMBAT_SHIP_DESTROYED broadcast galaxy-wide](#2026-05-03-combat_ship_destroyed-broadcast-galaxy-wide)
- [2026-05-01 — CommandsModule explicitly imports PrismaModule](#2026-05-01-commandsmodule-explicitly-imports-prismamodule)
- [2026-05-03 — 007-cybertron-ai: R-1 through R-11 (Cybertron AI architecture)](#2026-05-03-007-cybertron-ai-r-1-through-r-11-cybertron-ai-architecture)
- [2026-05-05 — Postgres advisory lock for midnight job concurrency (D2)](#2026-05-05-postgres-advisory-lock-for-midnight-job-concurrency-d2)
- [2026-05-05 — MidnightRun ledger table for idempotency (D1)](#2026-05-05-midnightrun-ledger-table-for-idempotency-d1)
- [2026-05-05 — N+1 elimination in processOwnedPlanets (D7/SC-005)](#2026-05-05-n1-elimination-in-processownedplanets-d7sc-005)
- [2026-05-05 — ChgLoser cash penalty injected via DI token (D8)](#2026-05-05-chgloser-cash-penalty-injected-via-di-token-d8)
- [2026-05-05 — AdminTokenGuard constant-time comparison (D9)](#2026-05-05-admintokenguard-constant-time-comparison-d9)
- [2026-05-05 — Last-write-wins single-socket-per-ship enforcement](#2026-05-05-last-write-wins-single-socket-per-ship-enforcement)
- [2026-05-05 — Batched per-tick physics.sector-transition event](#2026-05-05-batched-per-tick-physicssector-transition-event)
- [2026-05-06 — bcrypt cost 12 for password hashing (011-onboarding)](#2026-05-06-bcrypt-cost-12-for-password-hashing-011-onboarding)
- [2026-05-06 — JWT 30-day expiry and no refresh tokens (011-onboarding)](#2026-05-06-jwt-30-day-expiry-and-no-refresh-tokens-011-onboarding)
- [2026-05-06 — Dev-DB password-hash backfill policy (NULL passwordHash)](#2026-05-06-dev-db-password-hash-backfill-policy-null-passwordhash)
- [2026-05-06 — `broadcasts` field in CommandResult decouples handlers from Socket.io (011-onboarding)](#2026-05-06-broadcasts-field-in-commandresult-decouples-handlers-from-socketio-011-onboarding)
- [2026-05-06 — Arg casing preserved in CommandRouterService (011-onboarding)](#2026-05-06-arg-casing-preserved-in-commandrouterservice-011-onboarding)
- [2026-05-06 — `who` and `dat` reinterpreted as in-world player-facing commands (D1)](#2026-05-06-who-and-dat-reinterpreted-as-in-world-player-facing-commands-d1)
- [2026-05-06 — `tea` implements join/leave/show subset of `cmd_team` only (D2)](#2026-05-06-tea-implements-joinleaveshow-subset-of-cmd_team-only-d2)
- [2026-05-06 — RosHandlerService reads `process.env` directly instead of ConfigService](#2026-05-06-roshandlerservice-reads-processenv-directly-instead-of-configservice)
- [2026-05-05 — No Redux / new state layer for player list](#2026-05-05-no-redux-new-state-layer-for-player-list)
- [2026-05-07 — 013-ship-management: four deviations from canonical C source](#2026-05-07-013-ship-management-four-deviations-from-canonical-c-source)
- [2026-05-07 — 014-planet-attack: four key decisions](#2026-05-07-014-planet-attack-four-key-decisions)
- [2026-05-07 — 015-scan-modes: D1-D7 deviations from C source](#2026-05-07-015-scan-modes-d1-d7-deviations-from-c-source)
- [2026-05-07 — D1: holdcourse boolean reuse for player autopilot (feature 016)](#2026-05-07-d1-holdcourse-boolean-reuse-for-player-autopilot-feature-016)
- [2026-05-07 — D3: spy intel revealed at scan render time (feature 016)](#2026-05-07-d3-spy-intel-revealed-at-scan-render-time-feature-016)
- [2026-05-07 — D4: cls uses clearLog directive on CommandResult (feature 016)](#2026-05-07-d4-cls-uses-clearlog-directive-on-commandresult-feature-016)
- [2026-05-08 — `mai` keyword dispatcher pattern (feature 017)](#2026-05-08-mai-keyword-dispatcher-pattern-feature-017)
- [2026-06-25 — Cybertron cyb_attack evaluates gebemean once](#2026-06-25-cybertron-cyb_attack-evaluates-gebemean-once)
- [2026-06-25 — randamage split into pure roll / mutator / emit-helper (feature 026)](#2026-06-25-randamage-split-into-pure-roll-mutator-emit-helper-feature-026)
- [2026-08-31 — `who` lists players, not the whole galaxy](#2026-08-31-who-lists-players-not-the-whole-galaxy)
- [2026-08-31 — Ship channels: this port's `usrnum`](#2026-08-31-ship-channels-this-ports-usrnum)
- [2026-08-31 — `sca pl` reads live planet state, not the boot-time read model](#2026-08-31-sca-pl-reads-live-planet-state-not-the-boot-time-read-model)
- [2026-09-01 — Droids stay out of the neutral zone](#2026-09-01-droids-stay-out-of-the-neutral-zone)
- [2026-09-01 — PLTVCASH and PLTVDIV are chosen sysop values](#2026-09-01-pltvcash-and-pltvdiv-are-chosen-sysop-values)
- [2026-09-01 — Fix the original's bugs rather than reproduce them](#2026-09-01-fix-the-originals-bugs-rather-than-reproduce-them)
- [2026-09-01 — Confirm before abandoning a colony or a hull](#2026-09-01-confirm-before-abandoning-a-colony-or-a-hull)
- [2026-09-01 — A purchased hull is not a bare hull](#2026-09-01-a-purchased-hull-is-not-a-bare-hull)
- [2026-09-02 — Claiming belongs to `adm`; `land` is removed](#2026-09-02-claiming-belongs-to-adm-land-is-removed)
- [2026-09-02 — Tuning the new-player curve through C's own sysop options](#2026-09-02-tuning-the-new-player-curve-through-cs-own-sysop-options)
- [2026-09-02 — Canon is the source of truth; sysop options re-baselined from MBMGEMSG.MSG](#2026-09-02-canon-is-the-source-of-truth-sysop-options-re-baselined-from-mbmgemsgmsg)
- [2026-09-02 — UNIVMAX deploys at 100, against a canon default of 300](#2026-09-02-univmax-deploys-at-100-against-a-canon-default-of-300)
- [2026-09-02 — PLANTOCK deploys at 120 minutes, against a canon default of 360](#2026-09-02-plantock-deploys-at-120-minutes-against-a-canon-default-of-360)
- [2026-09-02 — UNIVWRAP implemented, defaulting to canon NO](#2026-09-02-univwrap-implemented-defaulting-to-canon-no)
- [2026-09-02 — Colonists will eat (fixing an inherited original bug)](#2026-09-02-colonists-will-eat-fixing-an-inherited-original-bug)
- [2026-09-02 — Gold base price set to 1000, on wiki evidence only](#2026-09-02-gold-base-price-set-to-1000-on-wiki-evidence-only)

<!-- /TOC -->

## 2026-08-31 — the galaxy is centred on the origin, superseding the 0-based grid

**Context**: C's universe is a square spanning `-univmax..+univmax` on both axes with the neutral
zone at `NEUTRAL_X = NEUTRAL_Y = 0` (GEMAIN.H:70-71) — the origin is its CENTRE. Coordinates are
seeded as `rndm(univmax*2) - univmax` (GEMAIN.C:2204) and wrapped by subtracting or adding
`univmax*2` at the edges (GEFUNCS.C:653-700). Feature 004 instead pre-generated sectors
`0..MAXX-1 x 0..MAXY-1` and wrapped on those bounds, which put the hub in a **corner**.

The consequences only became visible by playing. Half of all spawn headings walked a new pilot
straight off an edge and round to the far side of the galaxy — test pilots ended up in sectors
(29,0) and (0,14) within a minute of their first command. The hub's neighbourhood was a quadrant
rather than a disc, so the nearest inhabited planet was eight sectors away through patrolled space,
and there was no early trade partner at all. `MAXX`/`MAXY` were also doing double duty as both the
galaxy extent and the ASCII scan grid, which is what made the mistake easy to miss: they are the
**display** grid (`xfactor = (univmax*2)/(MAXX-1)`, GECMDS.C:2746), never the universe.

**Decision**: The galaxy spans `-UNIVMAX..+UNIVMAX` on both axes — `(2*UNIVMAX+1)^2` sectors with
(0,0) at the centre. Ship coordinates wrap via `wrapUniverse` in C's form. `MAXX`/`MAXY` keep their
one real job: the 30x15 scan projection. `UNIVMAX` defaults to 10 (441 sectors, close to the 450 the
AI population was tuned against); raising it makes a larger, emptier galaxy.

**Reason**: It is what the original does, and the early game depends on it. A new pilot now sees
planets in every direction on their first `sca lo`, the nearest inhabited world is one sector out
instead of eight, and no heading strands them. Nothing about the pre-generation approach had to
change — only its extent.

**Alternatives rejected**: Keeping the 0-based grid and moving the spawn to its middle — the hub
would be central but the wrap seams would still sit at (0,0), so a pilot crossing them would jump
across the galaxy for no reason a player could understand. Generating sectors lazily as C does
(`getsector`) — a much larger change to no benefit here, since a fixed world is easier to reason
about and to test.

**Affected requirements**: supersedes the fixed 30x15 grid from feature 004. Scan sector-bounds
guards, the beacon's flat sector id, `sector:join` validation and the physics wrap all move to
universe bounds.

---

## 2026-08-31 — the autopilot survives a speed order

**Context**: `nav <x> <y>` sets a course and holds it (`holdcourse`), and the physics tick re-aims
the ship at the target each tick. It sets no speed — C's `cmd_navigate` is a pure calculator, so
steering at all is already this port's addition. Meanwhile spec 016 §manual-cancel had `rot`, `imp`
and `war` all cancel the autopilot on entry. Since the pilot MUST set a speed to travel, and doing so
cancelled the autopilot, the feature could never fly anyone anywhere. Found by using it: `nav 1 0`
then `war 4`, and the ship coasted off on its initial heading.

**Decision**: A speed order is not a steering order. `war <n>` and `imp <pct>` leave the autopilot
engaged; `imp <pct> <course>` and `rot <deg>` take the helm back, as does arrival.

**Reason**: It makes the two commands coherent — nav points, the pilot throttles, the autopilot
steers, and any explicit steering wins. The alternative (nav sets its own speed) is a bigger
behavioural change and further from C, which does not steer at all.

**Alternatives rejected**: Having `nav` engage a speed itself — a true autopilot, but it takes the
throttle away from the pilot and diverges further from `cmd_navigate`. Leaving it as it was and
documenting the interaction — the feature would stay dead.

**Affected requirements**: supersedes specs/016-navigation-spy/contracts/nav-command.md
§manual-cancel; `test/game/tick/nav-cancel.integration.spec.ts` now encodes the narrower rule.

---

## 2026-08-31 — debug endpoints fail closed, and are never reachable from the web server

**Context**: The `/debug/*` routes (`ship/outfit`, `ship/credits`, `droid/spawn`,
`cybertron-stats`, `tick-stats`) are cheat endpoints with no authentication of any kind, and they
address a ship by *name* — so anyone able to reach them can teleport another player's ship, swap its
hull class, zero its damage, hand themselves ordnance, rewrite any captain's credit balance, or
spawn droids. Two things made that worse than it looked: the gate was
`NODE_ENV !== 'production'`, which fails OPEN on any host that does not set NODE_ENV (a bare
`node dist/src/main`, a systemd unit, most PaaS defaults); `/debug/tick-stats` was not gated at all;
and `frontend/nginx.conf` explicitly proxied `/debug/` to the backend, so the public web server was
routing straight at them. `docker-compose.yml` does set `NODE_ENV: production`, which means one
environment variable was the entire defence.

**Decision**: The endpoints mount only when `GE_DEBUG_ENDPOINTS` is explicitly affirmative AND
`NODE_ENV` is not `production` — one shared `debugEndpointsEnabled()` used by every registration
site. The production web server no longer proxies `/debug/` at all. Boot prints a loud warning
whenever they are mounted. `npm run start:dev` sets the flag; `npm start` does not.

**Reason**: Defence in depth for something whose failure mode is "any player rewrites the game
state". Fail-closed means a forgotten variable disables the endpoints rather than publishing them;
the production check means a stray variable cannot switch them on where it matters; and removing the
proxy means even a misconfigured backend is not reachable from the public port. Any one of the three
is enough on its own, which is the point.

**Alternatives rejected**: Keeping `NODE_ENV !== 'production'` and simply documenting it — the
failure is silent and total. Putting a shared-secret token on them like `/admin/midnight` — that
protects the endpoint but leaves it mounted and reachable, and adds friction to every helper call in
the browser suite; the three-layer gate is stronger and costs dev nothing.

---

## 2026-08-31 — `aba` goes back to meaning colony abandonment; scuttling moves to `aba ship`

**Context**: In the original, `aba` abandons the *planet you are orbiting* (GECMDS.C:3420 —
`where < 10` gate, owner comparison, clear `plptr->userid`, decrement the owner's planet counter).
Feature 013 research D2 reinterpreted the keyword as abandon-*ship* and deferred colony abandonment
to "the planet system feature (005), where it belongs alongside other colony-management verbs" — it
was never picked up there. The result: a player could claim planets but never give one up, and a
mistyped `abo` (abort self-destruct) scuttled their hull instead.

**Decision**: Bare `aba` is the canonical planet command. The port's ship-scuttle path keeps all of
its behaviour (FR-701..FR-704) behind the explicit `aba ship`.

**Reason**: The canonical keyword should do the canonical thing — that is the project's fidelity
rule, and the missing verb was a real hole in colony play. Making the destructive, non-canonical
action require a second word also removes the one-keystroke gap to `abo`. `mai` already sets the
precedent in this codebase: bare is one command, with an argument it is another.

**Alternatives rejected**: Leaving `aba` on the ship and adding a new verb for planets — puts the
non-canonical meaning on the canonical keyword permanently. Making bare `aba` context-sensitive
(planet when orbiting one you own, ship otherwise) — the same word would scuttle a hull or release a
colony depending on state the player may have misread.

**Affected requirements**: supersedes research D2 in specs/013-ship-management; FR-701..FR-704 now
describe `aba ship`.

---

## 2026-08-31 — an open question from a handler owns the next line of input

**Context**: A handler that asks the player a free-text question ("What would you like to name this
planet?") had no way to receive the answer. The next line went to the command router like any other
input, so answering "New Terra" matched the `new` verb under 3-char prefix routing. specs/005
described a gateway re-dispatch for exactly this and it was never built; the ship-select and
onboarding flows solved the same problem separately, each with its own `client.data` field and its
own `prompt:reply` branch.

**Decision**: `CommandResult.expectFollowup?: string` carries the verb that asked. The gateway parks
it on the socket and re-dispatches the player's next line as `<verb> <answer>` through the normal
router path, then clears it. One-shot; an empty answer cancels with "Never mind."

**Reason**: The state lives on the socket, where the conversation lives, so handlers stay pure
request/response and need no session object. Routing the redispatch back through the router (rather
than calling the handler directly) means the answer still gets ordinary argument parsing, and the
handler re-validates its preconditions — the player may have been shot out of orbit while typing.

**Alternatives rejected**: A dedicated `prompt:*` socket event per question, like ship-select and
onboarding use — that needs a matching frontend branch for every new prompt, whereas this reuses the
existing command input the player is already typing into. Handler-owned session state — spreads
conversation state across services and leaks on disconnect.

## 2026-08-31 — sysop-tunable values belong in game.config.json, never pinned to a bound

**Context**: `TEAMBONU` was hard-coded at `3_200_000n`. C computes it as
`numopt(TEAMBONU,0,32000)*100L` (GEMAIN.C:478), so 3.2M is the *maximum* an operator could pick. The
effect was visible in play: a one-member team scored 3.2M against a strong player's five-digit
score, so `tea list` ranked teams by member count.

**Decision**: Sysop `.cnf` options back live constants through `config/game.config.json` and default
to the option's own default, not to either end of its range. Balance-regression tests for such
options pin the *bounds* and any scaling factor, not the chosen value.

**Reason**: Same reasoning as the 2026-08-30 numopt decision, applied to the value rather than the
clamp. Pinning a constant to a bound and then writing a regression test against that literal makes
the test defend the accident.

**Alternatives rejected**: Leaving it hard-coded and simply lowering the number — that reintroduces
the same class of defect the moment someone wants to tune it.

---

## 2026-08-30 — numopt bounds are a fidelity contract; shield behaviour is per-weapon

**Context**: Playtesting combat surfaced a cluster of defects that unit tests could not see, because
the tests encoded the same wrong assumptions as the code. Three distinct classes emerged.

**Decision 1 — treat `numopt(NAME, lo, hi)` bounds as a fidelity contract.** These are CLAMP bounds,
not defaults; the value lived in a sysop `.cnf` absent from the reference source. Where the port
exceeded a bound it produced values the original cannot generate, which is a defect rather than a
balance preference: `TDAMMAX` 200 (bound 100), `MDAMMAX` 300 (bound 100), `JAMTIME` 20 (bound 10).
All are now clamped and env-overridable. Where bounds are wide the value stays a free choice —
`PDAMMAX` was set to 25 out of 1..200 so combat has an arc instead of every phaser one-shotting.
Every numopt-derived constant was audited against its bound; `MINEDAMMAX`, `TORFACT` and `MISFACT`
were checked and are correct.

**Decision 2 — shields are modelled per weapon, not uniformly.** All three damage paths originally
set `hullDamage = 0` when shields were up. Only the phaser was right. In C the `damage +=`
assignment sits OUTSIDE the shield if/else for torpedoes, missiles and mines, so hull damage always
lands; shields reduce it (halved roll for projectiles, divided by the shield Mark for mines) and
cost charge. Applying one uniform "fix" would have broken the phaser path, which genuinely does
deflect outright.

**Decision 3 — leave `DECODDS` and the randamage >101 ceiling alone.** `DECODDS` looks out of bounds
(50 vs 1..20) but is not comparable: C uses a 1-in-N roll, the port a percentage, and 50% sits inside
C's achievable range. The randamage ceiling diverges because C's `(int)` truncates toward zero while
JS `Math.floor` rounds toward -Infinity, but `rndm()`'s behaviour for a negative argument is not
knowable from the reference source, and the region is unreachable in practice (ships die at damage
>= 100). Both are documented and pinned rather than changed.

**Reason**: A bound violation is objectively wrong and can be fixed without judgement. A value inside
the bounds is a design choice that belongs to the project owner. A divergence that depends on
unavailable source is a guess, and guessing is worse than documenting.

**Alternatives rejected**:
- *Clamp every constant that looks out of range* — would have "fixed" DECODDS, which is correctly
  parameterised differently.
- *Apply one shield model to all weapons* — would have broken the phaser deflect path.
- *Match C's randamage truncation* — depends on undefined `rndm(negative)` behaviour.

---

## 2026-08-30 — Prisma datasource URL is resolved explicitly, and test runs bind to TEST_DATABASE_URL

**Context**: `PrismaService` extended `PrismaClient` with no datasource override, so Prisma read
`DATABASE_URL` from the environment — the development database `ge`. Around 20 spec files build a Nest
testing module around `PrismaModule` and then call `deleteMany()` or `TRUNCATE`. Only the separate
`test/prisma-schema/helpers/prisma-test-client.ts` helper pointed at `TEST_DATABASE_URL`. The result was
that running `npm test` truncated the *development* database. This surfaced as an unplayable world: the
`Planet` table was empty while `GalaxyMeta` survived, and because the galaxy generator treats the presence
of `GalaxyMeta` as its "already generated" signal, the galaxy could never regenerate — orbiting,
colonization and the Zygor-3 ship purchase were all dead, and the midnight job crashed on boot.

**Decision**: Resolve the connection string explicitly in `src/prisma/database-url.ts`. Under Jest
(`JEST_WORKER_ID` present, or `NODE_ENV=test`) `PrismaService` binds to `TEST_DATABASE_URL`; otherwise it
uses `DATABASE_URL`. When running under test with `TEST_DATABASE_URL` unset it throws rather than
connecting to the dev database.

**Reason**: The failure was silent and destructive, and destroyed exactly the state a developer needs in
order to playtest. Detection belongs at the single place every consumer goes through, not in each spec.
Throwing rather than falling back is deliberate: the silent fallback is what caused the data loss.

**History**: This was never previously fixed, despite appearing to be. `src/prisma/prisma.service.ts` has
one commit in its entire history (`36a1d33`, feature 002); no commit on any branch has added a
`datasources` override under `backend/src/`, and `jest.config.ts` never had `setupFiles`. The bug dates
from feature 002. Commit `109e27a` (2026-06-26) addressed only the symptom — it added
`neutral-zone.fixture.ts` and seeded Zygor/Nexus Prime after `truncateAll()` in 9 midnight specs, making
those specs green again while the truncation of the dev database continued. That removed the last visible
signal. Treating the failing test rather than the data loss is the trap to avoid repeating here.

**Alternatives rejected**:
- *Fix the ~20 offending specs to use the test client* — leaves the trap armed for every future spec.
- *Re-seed dev data after each destructive spec (what `109e27a` effectively did)* — hides the loss instead
  of preventing it, and silences the only signal that the isolation is broken.
- *Point `DATABASE_URL` at `ge_test` in a Jest setup file* — mutating a process-wide variable that the dev
  server also reads is fragile, and offers no protection when a spec constructs its own client.
- *Make the guard a lint rule* — cannot catch a testing module assembled at runtime.

---

## 2026-05-08 — Feature 019: score_f2 = 100 default; Cybertron kill counter decoupled; mutual-kill snapshot

**Context**: Three decisions made during feature 019 implementation.

**Decision 1 — `score_f2 = 100` default**: `SCORE_F2` env var, range `[0, 32700]`, default 100 (matching GEMAIN.C:603 `numopt(SCRFACT, 0, 32700)` with the original default). Balance regression test in `constants.spec.ts` pins this. Out-of-range throws at module init.

**Decision 2 — Cybertron kill counter via event emission**: `PlayerScoreService` emits `CYBERTRON_SCORED_KILL` instead of calling `CybertronRepository.incrementKills` directly. This breaks the `PlayerScoreModule → CybertronModule → CombatModule → PlayerScoreModule` circular dependency that would cause NestJS DI timing failures (providers instantiated before dependencies resolved with nested `forwardRef`). `CybertronTickService` consumes the event.

**Decision 3 — Mutual-kill attacker snapshot**: In `CombatTickService.runKillResolution`, each victim's `attackerUserid` is captured from a pre-removal snapshot BEFORE any `removeFromGame()` runs. This ensures a Cybertron that kills and is killed on the same tick still has its kill attributed correctly.

**Alternatives rejected**: `forwardRef` on all legs of the `PlayerScoreModule → CybertronModule` cycle — this initially appeared to work but caused `CybertronRepository.this.prisma` to be `undefined` in `onApplicationBootstrap` due to NestJS DI instantiation ordering with deeply nested `forwardRef`. EventEmitter decoupling is the correct pattern for breaking score → AI cycles.

---

## 2026-05-08 — Team creation: auto-assigned teamcode + single plaintext password

**Context**: GECMDS.C:5277 `cmd_team` in the original required the player to supply a 5-digit
`teamcode` manually, and maintained two passwords: `secret` (founder-only) and `password`
(for joining members). Players also had to know a team's code to join it.

**Decision**: Auto-assign `teamcode = MAX(teamcode) + 1`. Use a single `password` column for
both creation and join. Remove the `secret`/founder distinction. Password limit reduced from
10 to 8 characters (FR-011a). A `LOWER(teamname)` unique partial index enforces case-insensitive
name uniqueness at the DB level with retry-on-race in the service layer (research D1).

**Reason**: Modern UX — players should not need to coordinate 5-digit codes out of band.
Single password simplifies the join flow. `MAXTEAMS=50` (GEMAIN.H:240) is retained as the
hard cap; display cap of 20 is a spec deviation (research D2).

**Alternatives rejected**: Keeping manual teamcode entry (friction, coordination burden).
Storing passwords hashed (original stores plaintext; spec explicitly keeps plaintext for
faithful recreation). Using `teamcount` as the live member counter in `tea list` (FR-023
mandates live `GROUP BY` on `User.teamcode` to avoid stale counts from the midnight job).

---

## 2026-05-02 — Physics tick uses `max_accel/10` for rotation (not ROTAMT)

**Context**: GEMAIN.H defines `ROTAMT=20` but it is never referenced in any `.C`
file (verified by grep). `GEFUNCS.C:441 rotship` uses
`rotamt = (double)(shipclass[ptr->shpclass].max_accel/10.0)`.

**Decision**: 006a's `rotationStep` uses `maxAccel / 10` per tick.

**Reason**: Faithful to the only formula the original actually executes; using
ROTAMT would erase per-class differentiation.

**Alternatives rejected**: Use ROTAMT (would make heavy and light ships pivot
identically, breaking class balance).

---

## 2026-05-02 — MOVENGUSE widened to `speed > 0` (with playtest fallback)

**Context**: `GEFUNCS.C:733-792 moveship` only debits MOVENGUSE when
`speed > 1000.0 && status == GESTAT_USER`. The 006a spec (FR-006) widens this to
`speed > 0` so impulse ships also pay maintenance.

**Decision**: 006a debits `MOVENGUSE = 10` whenever `speed > 0` and the ship is
a player (`status === 1`). AI ships skip the debit entirely (matches original).

**Reason**: Every spec reviewer asked "why doesn't impulse cost energy?". The
deliberate departure answers that with no new constant — same `MOVENGUSE` rate,
just a wider gate. Tracked here so a future revert is cheap.

**Alternatives rejected**: Match strict `speed > 1000.0` original gate
(reserved as the playtest fallback if impulse-only ships starve). Debit AI
ships too (rejected — original does not, spec clarification forbids).

---

## 2026-05-02 — Ascending-shipKey iteration order in physics tick

**Context**: `findAllShips()` returns the in-memory Map's value iterator;
insertion order under hydration race is implementation-dependent.

**Decision**: `PhysicsTickService` sorts `findAllShips()` lexicographically by
`${userid}:${shipno}` before iterating. O(n log n) at n≈200 is well under the
50 ms SC-004 budget.

**Reason**: Tests and bug reproductions need deterministic batch order
(FR-019); insertion order is brittle.

**Alternatives rejected**: Numeric `shipno` only (collisions across `userid`).
Insertion order (non-deterministic).

---

## 2026-05-02 — Per-ship try/catch over quarantine

**Context**: Original `RTKICK` does not crash on per-ship exceptions because C
runtime does not throw; we need an explicit isolation primitive in TS.

**Decision**: `PhysicsTickService.advanceAll` wraps each ship in `try { ... }
catch`, logs `{ shipId, tickAt, stack }`, increments an instance fault
counter, and continues. Faulted ship is re-tried next tick (no quarantine).

**Reason**: Mirrors the existing `TickService.dispatch` "one bad subscriber
must not stop siblings" pattern. Quarantine adds state and hides bugs; metrics
+ log is the correct first response.

**Alternatives rejected**: Quarantine after N consecutive faults (deferred —
revisit if telemetry shows the same ship faulting repeatedly).

---

## 2026-05-01 — BigInt for unbounded accumulator columns

**Context**: The original C source uses `unsigned long` (32-bit on DOS/MajorBBS)
for player cash, debt, score, and planet/kill score fields. In a 24/7 game these
accumulate without bound over days or months.

**Decision**: Store `score`, `cash`, `debt`, `plscore`, `klscore`, `population`
on User, `cash`/`debt`/`tax` on Planet, `teamscore` on Team, and per-item
`qty`/`sold2a` on Planet as Prisma `BigInt` (Postgres `bigint` = 64-bit signed).

**Reason**: A 32-bit signed value wraps at ~2.1 billion — reachable in a busy
game session. The 64-bit signed range (9.2 × 10^18) is effectively unbounded at
any realistic gameplay rate.

**Alternatives rejected**:
- Postgres `integer` (32-bit signed): clips original values; unacceptable for
  a fidelity-first project.
- Postgres `numeric`/`decimal`: arbitrary precision but slower and overkill;
  no game balance reason to exceed 64-bit range.

---

## 2026-05-01 — Parallel native arrays for fixed-size C struct arrays

**Context**: `WARSHP` has `items[14]`, `ltorps[3]` (each with `channel` +
`distance`), `lmissl[3]` (channel + distance + energy), `decout[10]`, `freq[3]`,
and `options[30]`. `GALPLNT` has `ITEM items[14]` (6 sub-fields each).
`MAILSTAT` has `itemqty[14]`.

**Decision**: Persist each as Postgres native array columns via Prisma scalar
lists (e.g. `items BigInt[]`). For sub-field structs (TORPEDO, MISSILE, ITEM)
use parallel arrays — one column per sub-field (e.g. `ltorpsChannel Int[]`,
`ltorpsDistance Int[]`). No JSON columns. No child tables.

**Reason**: Preserves the "slot N is meaningful" indexing semantics of the
original C arrays. Native arrays are first-class in Postgres and Prisma;
no join overhead; simpler migration path. Length is enforced in tests, not
at the DB level (acceptable per spec FR-034 — Postgres arrays don't enforce
fixed cardinality anyway).

**Alternatives rejected**:
- JSON column: violates FR-034; opaque to SQL queries and Prisma types.
- Child tables (e.g. `LockedTorpedo { shipId, slotIndex, channel, distance }`):
  adds ordering ambiguity, requires joins, and obscures the fixed-slot semantics.
- Prisma composite types: require raw-SQL Postgres composite types; complex
  migration story; parallel scalars are simpler and fully Prisma-native.

---

## 2026-05-01 — Selective FK enforcement (relaxed for dangling-reference cases)

**Context**: The original game tolerates dangling references in several places
(teamcode on User pointing to a deleted team; planet `lastattack` userid
pointing to a deleted player; planet `userid` ownership flipping without
strict referential integrity). Other relationships (Ship→User, Mail→User)
are always dereferenced and would represent corruption if the parent was missing.

**Decision**: Enforce FK for Ship→User, Mail→User, MailStat→User. Store
`User.teamcode`, `Planet.userid`, `Planet.lastattack`, `Planet.spyowner`,
`Planet.teamcode`, `Mine.deployedBy` as plain scalar fields with no Prisma
relation or Postgres FK constraint.

**Reason**: Faithfully reproduces original game behavior. The three enforced
FKs catch genuine data corruption early at no behavioral cost. The relaxed
fields match the original's tolerance for soft references.

**Alternatives rejected**:
- All FKs strict: would prevent reproducing original teamcode/lastattack behavior.
- All FKs relaxed: loses a free correctness guard on Ship and Mail.

---

## 2026-05-01 — Synthetic autoincrement PK for Mine

**Context**: The original `MINE` struct (`GEMAIN.H:267`) has no natural
composite key — mines were indexed by linear scan in volatile in-memory state.
Two mines can occupy the same coordinates simultaneously.

**Decision**: Use `id Int @id @default(autoincrement())` as a synthetic PK.

**Reason**: There is no natural candidate key. The autoincrement ID is the
simplest solution and matches the original's model of mines as unnamed,
unkeyed world objects.

**Alternatives rejected**:
- Composite `(channel, xcoord, ycoord)`: not unique (multiple mines at same
  point are valid per the original game).
- UUID: overkill for a small in-world entity table.

---

## 2026-05-01 — MailStat as a separate model from Mail

**Context**: The original C uses two distinct structs (`MAIL` and `MAILSTAT`)
sharing a single Btrieve file via union semantics. `MAILSTAT` has entirely
different fields (item-quantity array, structured cash/debt/tax) vs. `MAIL`'s
free-text payload.

**Decision**: Separate Prisma models `Mail` and `MailStat`, both with the same
composite key `(userid, class, msgno)`. Application code chooses which table
to query based on the `class` value.

**Reason**: Separate tables with typed columns are cleaner in Postgres than
a single polymorphic table with many nullable columns. Prisma types for each
are precise; no need for runtime type narrowing or a discriminator column.

**Alternatives rejected**:
- Single `Mail` table with union of all fields: sparse, many NULLs, harder to
  query and type.
- Prisma `@@map` trick to alias both to the same table: defeats the typing benefit.

---

## 2026-05-01 — raw setInterval over @nestjs/schedule for heartbeats

**Context**: Feature 002 introduces two game heartbeats (1s SHIP_UPDATE, 6s PHYSICS). NestJS ships `@nestjs/schedule` with `@Interval` decorators, which is the most common NestJS pattern.

**Decision**: Use raw `setInterval` in `TickService.onModuleInit()` / `onModuleDestroy()`. `@nestjs/schedule` is intentionally deferred to feature 009's midnight `@Cron` job.

**Reason**: The constraint is the exact cadence and no-drift behavior, not the specific scheduling primitive. `setInterval` fires relative to the start of the previous interval, not the end of the callback — this satisfies the no-drift requirement (FR-012). Adding `@nestjs/schedule` before its sole legitimate use (the midnight cron) would introduce a dependency prematurely. Jest's `jest.useFakeTimers()` patches `setInterval` directly, making cadence and subscriber tests reliable without wall-clock waits.

**Alternatives rejected**: `@nestjs/schedule @Interval` (premature dep), chained `setTimeout` (drifts under load), `node-cron` (coarse-grained), `bull`/Redis (violates no-Redis principle).

---

## 2026-05-01 — Single-process tick engine (no distributed lock)

**Context**: `setInterval` only fires in one Node.js process. If the deployment ever runs >1 backend node, two instances would each run the heartbeats, double-firing every subscriber.

**Decision**: Accept the single-process constraint for now. No distributed-lock infrastructure.

**Reason**: Deployment is single-process (Hetzner CPX32, one container). Adding `pg_try_advisory_lock` or Redis leader election today is premature and violates the no-Redis principle. The risk only materialises when a second backend node is added; the mitigation at that time is a Postgres advisory lock so exactly one node runs the tick loop.

**Alternatives rejected**: Postgres advisory lock now (premature, adds test complexity), Redis leader election (violates Principle III).

---

## 2026-05-01 — Hand-rolled subscriber registry (Map<TickKind, Set<TickHandler>>)

**Context**: Feature 003+ systems (combat, AI, ship state) need to react to each tick without coupling to `TickService` internals.

**Decision**: Expose `tickService.subscribe(kind, handler): Unsubscribe`. Backed by `Map<TickKind, Set<TickHandler>>`. Error isolation via `try/catch` per handler; async handlers are fire-and-forget with `.catch` for logging.

**Reason**: Two heartbeats × a small handler set — a `Set` is sufficient and trivially testable. A returned unsubscribe closure is idiomatic and idempotent (Set#delete returns false safely). Error isolation keeps one bad subscriber from stopping siblings or the next tick (FR-011).

**Alternatives rejected**: `@nestjs/event-emitter` (extra dep, weaker types), RxJS Subject (subscriber must learn RxJS, error semantics harder).

---

## 2026-05-01 — Handshake active-ship resolution (no BOARD command)

**Context**: Players may own more than one ship. The original GECMDS.C command table has no BOARD or SELECT_SHIP command — the active ship is determined at login time. FR-030 requires the active ship to be resolved on handshake.

**Decision**: On `handleConnection`, call `shipStateService.findByUserid(userid)`. Zero ships → NO_SHIP disconnect. One ship → bind it. Two or more → bind the lowest `shipno` and log a warning.

**Reason**: Faithfully reproduces original game behavior. The lowest-shipno tie-break is deterministic and produces a stable binding across reconnects. The warning log allows operators to investigate multi-ship anomalies.

**Alternatives rejected**:
- Require the client to specify a shipno at handshake time: not in the original protocol; adds client complexity.
- Pick a random ship: non-deterministic; bad for debugging.

---

## 2026-05-01 — Synchronous command handlers via pre-cached ShipClass data

**Context**: `Command.handler` has a synchronous signature `(ship, args, ctx) => CommandResult`. The `scan` and `report` handlers need ShipClass data (scanRange, typeName, hasCloak) to produce correct output, and that data lives in Postgres.

**Decision**: Make `ScanHandlerService` and `ReportHandlerService` `@Injectable()` services that implement `OnModuleInit`. In `onModuleInit()` they call `prisma.shipClass.findMany()` once and cache the results in a `Map`. Handlers remain synchronous and read from the cache.

**Reason**: Keeps the `Command` type synchronous — no `Promise` in the hot path. ShipClass data is static reference data (18 rows, never mutated during gameplay) so a one-time cache is correct and safe. The `@Injectable()` + `OnModuleInit` pattern is idiomatic NestJS.

**Alternatives rejected**:
- Async `Command.handler` signature: propagates `Promise` through CommandRouterService and GameGateway; complicates error handling; not worth it for static reference data.
- Pass ShipClass data as part of CommandContext: requires gateway to load it on every command dispatch; defeats the caching purpose.

---

## 2026-05-01 — Galaxy generator deviations from GEPLANET.C

**Context**: The procedural galaxy generator (feature 004) reimplements the sector
population logic from `GEPLANET.C:455-650 (xgetsector)`. Three areas required
deliberate deviations from the original due to missing assets or web-game constraints.

**Decision 1 — Wormhole destinations bounded to 30×15 grid** (research.md Decision 5):
Wormhole destination coordinates are clamped to `destX ∈ 0..29`, `destY ∈ 0..14`.
The original C code allowed destinations in `[-univmax..+univmax]`, which produced
out-of-bounds sectors unreachable in normal play.

**Reason**: The web port has a fixed 30×15 grid; sectors outside this range cannot
exist. Destinations pointing off-grid would produce dead wormholes. Bounding to the
valid grid ensures every wormhole leads somewhere playable.

**Alternatives rejected**: Allow out-of-bounds destinations and clamp at runtime —
adds a class of degenerate state; easier to fix at generation time.

**Decision 2 — `scan pl <name>` resolves by galaxy-wide planet name** (research.md Decision 8):
`scan pl <name>` looks up the planet by name across the entire galaxy via
`GalaxyService.findPlanetByName`. The original `cmd_scan` resolved by numeric `plnum`
within the current sector only.

**Reason**: Player-typed names are more usable than numeric IDs for a text-command
interface. Galaxy-wide lookup matches the original intent (players refer to planets
by name, not slot index). The original's local-sector `plnum` approach was a
Btrieve file-offset artefact, not a gameplay decision.

**Alternatives rejected**: Keep local-sector numeric lookup — poor UX for a web game
where players discover planet names from `scan lo` output, not from memory of slot numbers.

**Decision 3 — Neutral-zone `s00` table authored in code** (research.md Decision 4):
The `(0,0)` sector fixture (neutral zone with fixed planets/wormholes) is hardcoded
as a TypeScript constant array in `GalaxyService`. The original loaded this data from
an `.MSG` message file that is not recoverable from the available reference source.

**Reason**: The `.MSG` binary asset is not present in `/reference/ge-source/`. The
neutral-zone layout is well-documented in the wiki and broadly known from the original
game; hardcoding it in source is auditable and testable. A future operator could
override via config if needed.

**Alternatives rejected**: Derive neutral-zone content from procedural seed — would
produce a different layout each seed, breaking the canonical neutral-zone experience.
Load from a config file — adds an external asset dependency with no benefit over a
typed constant.

---

## 2026-05-02 — Planet system decisions (feature 005)

Ten decisions made during the feature 005 research session. Full rationale in `specs/005-planet-system/research.md`.

**Decision 1 — Per-mutation Postgres flush, not the dirty-flag pattern**  
`PlanetStateService` writes to Postgres synchronously inside the same async critical section that mutates in-memory state. No dirty flag. Reason: planet mutations are sparse (player actions + economy tick); per-mutation I/O is acceptable and crash-safe. The original's `gesdb(GEUPDATE,...)` calls in `cmd_buy`/`cmd_sell`/`cmd_admin`/`multiply()` each executed synchronously. Ships use a dirty flag because the 1 Hz tick batch-flushes many ships; planets do not have that property.

**Decision 2 — Per-planet async mutex via promise chain (`runSerialized`)**  
Every public write on `PlanetStateService` serializes through a per-planet promise chain. Reason: single-process backend makes in-process serialization sufficient; the pattern is < 20 lines, has no external dep, and directly satisfies SC-005 (no double-spend). Rejected: Postgres advisory lock (round-trip per acquire), `async-mutex` npm dep, per-planet worker queue.

**Decision 3 — Cadence: `max(4, floor(1800 / N))` one-planet-per-firing**  
`PlanetTickService` processes exactly one planet per `PLANET_UPDATE` firing; interval is derived from the planet count. Reason: matches the original's per-planet cadence intent (`GEMAIN.C:656`), produces a more even cadence than the original's bursty `MAXTIC=20` approach, and is directly unit-testable. Rejected: hardcoded 1 Hz with N planets per firing; recompute cadence after every claim.

**Decision 4 — Sell only at neutral-zone plnum=1**  
`cmd_sell` refuses unless the pilot is on `plnum=1` at sector `(0,0)`. Reason: strict fidelity — the galactic-market sink is a single fixed planet (`GECMDS.C:4127`). Rejected: allow sell at any owned planet (economic deviation from original).

**Decision 5 — Production-report mail deferred to feature 009**  
`multiply()` clamps items at `maxpl[i]` but does not emit `MAIL_CLASS_PRODRPT` rows. Reason: the mail service does not yet exist; spec FR-016/SC-006 only require the production formula to match, not the mail side-effect. Deferred cleanly to feature 009.

**Decision 6 — Revolt and `check_spy` deferred to feature 006**  
`applyEconomyTick` ports `GEPLANET.C:195–340` only (through end of tax accrual). Lines 341+ (revolt, spy check) require combat resolution. Deferred to feature 006.

**Decision 7 — Trade password literal `"team"` preserved as-is**  
When `planet.password == "team"` and the planet has a non-zero `teamcode`, buy/sell access gates on matching `teamcode`. Reason: strict fidelity to `GECMDS.C:4232-4248`; breaking this breaks team economies.

**Decision 8 — `report cargo` zero-suppresses per-item lines**  
`report cargo` emits one line per non-zero cargo slot plus a total-tonnage line; zero-quantity slots are omitted. Reason: matches the terse style of the original in-game report display. Full 14-slot table coverage is in `balance-planet.spec.ts`, not the display path.

**Decision 9 — Item canonical arrays hardcoded, not env-configurable**  
`ITEM_NAMES`, `BASEPRICE`, `MANHOURS`, `MAXPL`, `ITEM_TONS` are frozen constants in source. Reason: balance is a project-level decision; env override would silently defeat the FR-028 balance regression tests. Rebalancing still has a clean path: edit the constant and the regression test in the same commit.

**Decision 10 — Beacon visibility through existing `scan` projection**  
Non-empty `planet.beacon` surfaces as a `beacon: string` field on the projected `ScanCell`. Reason: cheapest faithful path — `scan` already projects sector contents on demand; no new socket channel needed. Test: `scan.spec.ts` beacon case.

---

## 2026-05-03 — Combat tick subscribes after physics tick (CombatModule imports PhysicsModule)

**Context**: `CombatTickService` reads ship coordinates during each tick pass. If combat fires before
physics has moved ships, projectile positions and hit geometry are based on stale coordinates.

**Decision**: `CombatModule` lists `PhysicsModule` in its `imports` array. NestJS resolves module
dependencies before calling `onModuleInit`, so `PhysicsTickService.onModuleInit` (which subscribes
to `TickKind.PHYSICS`) runs before `CombatTickService.onModuleInit`. Both subscribe to the same tick
event but the subscription order enforced by module init order guarantees combat always reads
post-physics coordinates.

**Reason**: Tick subscriber order is the only ordering guarantee available inside a single Node.js
process and a shared `TickService` registry. Module import dependency is the least-invasive way to
enforce it without introducing a separate event or a secondary tick kind.

**Alternatives rejected**: Separate `COMBAT_TICK` event fired by PhysicsTickService after its own
pass (adds coupling between modules in the opposite direction); explicit subscriber priority field on
`TickHandler` (overengineered for a two-subscriber case).

---

## 2026-05-03 — Injectable Random port (RANDOM token + Mulberry32Adapter for tests)

**Context**: Several combat math functions require a PRNG. Using `Math.random()` inline makes
deterministic unit tests impossible — seeded reproducibility is required for SC-004 and SC-007.

**Decision**: Define a `Random` interface (`next(): number`) and a `RANDOM` NestJS injection token.
Production code binds `MathRandomAdapter` (delegates to `Math.random()`). Tests inject
`Mulberry32Adapter` (seeded, deterministic, pure 32-bit Mulberry32 PRNG).

**Reason**: Keeps all combat math and tick service code free of direct `Math.random()` calls.
The token is DI-injected so every test module can supply the seeded adapter without monkey-patching.
`PlanetModule` binds its own local `{ provide: RANDOM, useClass: MathRandomAdapter }` to avoid a
circular dependency through `CombatModule → PhysicsModule → ShipModule`.

**Alternatives rejected**: Pass `rng` as a plain function parameter to every combat-math call (no
DI, awkward for services); global seeded PRNG singleton (not testable in isolation).

---

## 2026-05-03 — Mine damage applied to all ships including deployer (no owner exclusion)

**Context**: The mine-sweep pass applies cubic-falloff damage to every ship within `MINERANGE`.
A question arose whether the mine deployer should be excluded from their own blast.

**Decision**: No owner exclusion. The deployer can be hit by their own mine.

**Reason**: Faithful reproduction of `GEFUNCS.C:minesweep` — the original C code has no owner
check; the for-loop iterates all ships unconditionally. Excluding the owner would be a gameplay
deviation without a fidelity justification.

**Alternatives rejected**: Skip deployer (rejected — not in original); warn deployer but skip
damage (rejected — original has no such gate).

---

## 2026-05-03 — Friendly fire enabled in phaser lineOfFire

**Context**: `lineOfFire` iterates all ships in scan range when resolving phaser hits.

**Decision**: No team filter applied. Friendly fire is allowed.

**Reason**: `GECMDS.C:cmd_phasor` iterates all ships with no team check. The original game design
treats weapon arc geometry as the sole inclusion criterion; team membership is irrelevant to phaser
resolution. A team filter would be a gameplay deviation.

**Alternatives rejected**: Skip teammates (rejected — not in original, changes balance).

---

## 2026-05-03 — COMBAT_SHIP_DESTROYED broadcast galaxy-wide

**Context**: On ship death, connected clients need to see the kill announcement regardless of which
sector they occupy. Other combat events are sector-scoped.

**Decision**: `GameGateway` handles `COMBAT_SHIP_DESTROYED` via `server.emit(...)` (broadcasts to
all connected clients). All other combat events use `server.to(sectorRoom).emit(...)`.

**Reason**: Kill announcements are a global game event ("Bob destroyed Alice" scrolls on every
terminal). Sector-scoping death events would hide kills from players not currently in either
combatant's sector, breaking the shared game world feel that is core to the original experience.
@see GECMDS.C:killem broadcast behavior.

**Alternatives rejected**: Sector-scope death event (breaks shared narrative); dedicated
"galaxy-news" room (extra room management with no benefit over `server.emit` at current scale).

---

## 2026-05-01 — CommandsModule explicitly imports PrismaModule

**Context**: `PrismaModule` is `@Global()`, making `PrismaService` available in the full app without explicit imports. However, in integration tests that mount `CommandsModule` or `GatewayModule` in isolation (without `AppModule`), the global registration never happens, so `ScanHandlerService` and `ReportHandlerService` cannot resolve `PrismaService`.

**Decision**: Add `PrismaModule` to `CommandsModule`'s `imports` array.

**Reason**: Makes `CommandsModule` self-contained and testable in isolation. In the full app, NestJS deduplicates module instances, so the double-import has no runtime cost.

**Alternatives rejected**:
- Override `PrismaService` in every test: brittle, requires each new test file to know this detail.
- Remove `@Global()` from PrismaModule: breaks the established pattern for TickModule and would require every module to import PrismaModule explicitly.

---

## 2026-05-03 — 007-cybertron-ai: R-1 through R-11 (Cybertron AI architecture)

### R-1: CybertronModule imports CombatModule — tick ordering guarantee

**Context**: `CybertronTickService` must fire AFTER `CombatTickService` on each PHYSICS tick
so that kill resolution and shield damage happen before the AI reads victim state.

**Decision**: `CybertronModule` imports `CombatModule` (which in turn imports `PhysicsModule`).
NestJS runs `onModuleInit` in import-dependency order, guaranteeing subscription registration
order: Physics → Combat → Cybertron.

**Alternatives rejected**: Manual ordering via injection tokens — fragile and not idiomatic NestJS.

---

### R-2: Spawn cadence — modulo-30 physics-tick counter

**Context**: `GEMAIN.C` outer loop runs the Cybertron spawn slot roughly once every 30 ticks.

**Decision**: `CybertronTickService.spawnTickCounter` increments each PHYSICS tick; `createSpawn`
is called when `counter % 30 === 0`. Each call picks one under-populated class at random.

**Alternatives rejected**: Separate `@Interval` timer — adds scheduling complexity; using the
existing PHYSICS tick subscription keeps Cybertron behavior deterministic under the seeded PRNG.

---

### R-3: Per-ship AI tick, not per-class batch

**Context**: The original C loop iterates individual Cybertron records, not ship-class buckets.
Each ship has its own `tick` countdown field.

**Decision**: `cybLives` is called per-ship when `ship.tick` reaches 0. Max `CYBMAXPERTICK=2`
activations per physics tick to prevent one slow Cybertron wave from monopolizing the tick budget.

**Alternatives rejected**: Per-class batch activation — diverges from C source and loses
per-ship `cybskill` variance.

---

### R-4: Gold transfer via `combat.ship-destroyed` event

**Context**: When a Cybertron is killed, its `User.cash` must be transferred to the killer atomically.
The kill is already signalled by `CombatTickService` via `combat.ship-destroyed`.

**Decision**: `CybertronTickService` listens for `combat.ship-destroyed`. If `victimUserid` starts
with `Cybrg-` it calls `repository.transferGold(victimUserid, attackerUserid)` which runs a
Prisma `$transaction` (zero victim cash, increment attacker cash).

**Alternatives rejected**: Poll DB on next tick — non-atomic, adds latency, misses kills during downtime.

---

### R-5: Random port reuse from 006b

**Context**: The same `Random` interface and `RANDOM` injection token introduced in 006b
for seeded PRNG determinism applies to Cybertron decisions.

**Decision**: `CybertronTickService` injects `@Inject(RANDOM) random: Random`; tests use
`Mulberry32Adapter` for deterministic replay. No `Math.random()` calls anywhere in the AI.

**Alternatives rejected**: Separate RANDOM token for AI — unnecessary duplication; same token
lets the whole tick be replayed from a single seed.

---

### R-6: Constants split between `constants.ts` and `cybertron.config.ts`

**Context**: Some Cybertron tuning values (tot_to_create, tooclose, hyperdist) are per-class;
others (CYB_BE_NICE, CYBSLO) are global balance constants from GEMAIN.H.

**Decision**: Global balance constants go in `game/constants.ts` (balance-tested in
`balance-regression.spec.ts`). Per-class values go in `cybertron.config.ts` with env override
support. Balance-regression tests pin all global constants.

**Alternatives rejected**: All in `cybertron.config.ts` — blurs the distinction between
balance-critical constants and per-deployment tuning knobs.

---

### R-7: Single `Cybrg-` userid prefix for all AI combatives (Cybertrons + Sarterns)

**Context**: `GECYBS.C:104-105` constructs all CPU combative userids as `Cybrg-<N>` regardless
of ship class. There is no separate Sartern prefix in the original source.

**Decision**: `createSpawn`, `hydrateAll`, and the gold-transfer regex all use the single
`Cybrg-` prefix. Sarterns (classes 24, 25) share this prefix and ride the same code path.

**Alternatives rejected**: Separate `Sartn-` prefix — diverges from C source; breaks the gold-transfer
filter and hydrate query.

---

### R-8: Sarterns use the Cybertron code path (no fork)

**Context**: Sarterns are `CLASSTYPE_CYBORG` ships with different class stats but the same AI behavior.

**Decision**: No branching on class number in `cybLives`, `cybCheckLockon`, or `runEngagementScan`.
Sarterns get `CybertronClassConfig` entries (24, 25) in `CYBERTRON_CLASS_DEFAULTS`; the code
reads per-class config at runtime.

**Alternatives rejected**: Separate SarternTickService — duplicate state machine, harder to maintain.

---

### R-9: Hyperwarp shield drop faithful to C source

**Context**: `GECYBS.C` sets `shieldstat=0` when a Cybertron enters hyperwarp and restores
`shieldstat` to `maxShields` on exit. This is a deliberate gameplay vulnerability window.

**Decision**: `cybCheckLockon` sets `shield=0, shieldstat=0` on hyperwarp entry and
`shield=maxShields, shieldstat=maxShields` on exit per `ShipClassCacheService.get(shpclass).maxShields`.

**Alternatives rejected**: Keep shields up — diverges from original; removes a key tactical counterplay.

---

### R-10: Taunt broadcast via existing `GameGateway` @OnEvent handler

**Context**: `CybertronTickService` must not import Socket.io (architecture constraint). Taunts
need to reach the target player's sector room.

**Decision**: `CybertronTickService` emits `cybertron.taunt` on the shared `EventEmitter2`.
`GameGateway` has an `@OnEvent(CYBERTRON_EVENT.TAUNT)` handler that looks up the target's sector
via `ShipStateService.get` and emits to `sector:${x}:${y}`.

**Alternatives rejected**: Inject Socket.io server into CybertronTickService — violates separation
of concerns; AI service would depend on transport layer.

---

### R-11: Immediate flush after cybCheckDamage defensive response

**Context**: When a Cybertron deploys a mine or jammer in response to damage, the inventory
change should be durable before the next tick to avoid double-deploys on crash.

**Decision**: `cybCheckDamage` calls `repository.flushShipsImmediate([shipKey])` when any
inventory was decremented. This is the same pattern used for target-acquisition persistence.

**Alternatives rejected**: Rely on the 30s dirty flush — acceptable for most state but a
mine/jammer deploy is a significant action worth persisting immediately.

---

### R-12: Ephemerality via in-memory `isEphemeral` flag rather than a separate Prisma model

**Context**: Droid ships (classes 31/32/33) must never be written to the database. They exist
only for the duration of a server session and must not clutter the `Ship` or `User` tables.

**Decision**: Add an optional `isEphemeral?: boolean` field to the in-memory `ShipState` type.
`ShipStateService.flush()` skips any state where `isEphemeral === true` (early continue).
`removeFromGame` likewise skips any Prisma delete for ephemeral states. No new Prisma model,
no migration, no schema change.

**Alternatives rejected**: Separate `DroidState` type — would require duplicating the entire
ShipState interface and forking every service that touches ship state. A Prisma `isDroid` column
was also considered but adds DB rows for something that should never be persisted.

---

### R-13: Single 30-tick counter drives both spawn and per-Droid action evaluation

**Context**: `GEDROIDS.C` uses a per-Droid `tick` countdown for individual action timing, but
the spawn evaluation fires on a fixed cadence. The implementation needs one coherent clock.

**Decision**: `DroidTickService` maintains a single `spawnTickCounter` incremented on every
physics tick. On the 30th rollover it runs spawn evaluation (fill population to cap) and
per-Droid action evaluation for all live Droids. Each Droid's `tick` field is initialized to
`CYBTICKTIME + rnd % CYBTICKTIME` at spawn for staggered first-action timing per `GEDROIDS.C:170`.

**Alternatives rejected**: Per-Droid separate timers — too fine-grained; the C source evaluates
Droids in a batch loop per game tick (`GEMAIN.C:2325`), not on individual schedules.

---

### R-14: Droid class numbers 31/32/33 (not 10/11/12 as originally planned)

**Context**: The original spec/tasks.md referenced class numbers 10/11/12 following the
`droid_act_class_10/11/12` function names in `GEDROIDS.C`. However, the DB seed already
populated `ShipClass` rows with `classNumber IN (31, 32, 33)` under `CLASSTYPE_DROID` (category 3)
before this feature was designed, using the MajorBBS typename convention.

**Decision**: Use 31/32/33 throughout the implementation (`DROID_CLASS_SCOW=31`,
`DROID_CLASS_TRANSPORT=32`, `DROID_CLASS_VAKORY=33`). The C source dispatches by typename string
comparison (`sameas`), not by class number, so both numbering schemes are valid at the C level.

**Alternatives rejected**: Renumber seed rows to 10/11/12 — would require a migration and would
diverge from the existing seed without benefit; 31/32/33 is already live in `ge_dev`.

---

## 2026-05-05 — Postgres advisory lock for midnight job concurrency (D2)

**Context**: The midnight job must never run concurrently with itself — double execution would produce double MailStat rows and corrupt team scores. The cron trigger and admin POST endpoint are two independent entry points.

**Decision**: `MidnightService.run()` calls `pg_try_advisory_lock(ADVISORY_LOCK_KEY)` before opening the transaction. If it returns false, throw `MidnightLockHeldError` (code `MIDNIGHT_LOCK_HELD`). The lock is always released in a `finally` block via `pg_advisory_unlock`.

**Reason**: Session-level advisory locks are the lightest Postgres primitive for this pattern — no extra table, no TTL concern. The lock is automatically released if the connection is dropped, so no zombie lock risk.

**Alternatives rejected**: Application-level flag (not crash-safe), a dedicated DB lock table (heavier, requires manual cleanup), Redis-based lock (violates no-Redis principle).

---

## 2026-05-05 — MidnightRun ledger table for idempotency (D1)

**Context**: The cron fires at midnight, but the job may also be triggered manually via the admin endpoint, and must self-heal on restart if midnight was missed. A pure lock does not prevent a same-day re-run from doing duplicate work.

**Decision**: Record each completed run in a `MidnightRun` table with `runDate DateTime @id @db.Date`. On startup (`onApplicationBootstrap`) and at the start of every admin trigger, probe the ledger — skip if today's row already exists. `recordRun` uses upsert so a same-day re-run updates counters without failing.

**Reason**: Date-keyed idempotency is the simplest correct primitive. `@db.Date` stores only the calendar date, so the probe is timezone-independent (server timezone anchors the "today" concept, consistent with the `@Cron('0 0 * * *')` wall-clock trigger).

**Alternatives rejected**: Skip ledger, rely on lock alone (does not prevent same-day re-runs), event-sourcing approach (over-engineered for a once-per-day job).

---

## 2026-05-05 — N+1 elimination in processOwnedPlanets (D7/SC-005)

**Context**: The naive phase-2 implementation issued one User lookup per planet (N+1), producing ~6,000 queries for a 2,000-planet fixture — 7,788 ms, well over the 5,000 ms SC-005 budget.

**Decision**: Load all owned planets in one query. Load all valid user IDs in one batch query. Accumulate per-owner deltas (planets, population, plscore) in-memory. Execute all user updates via `Promise.all` in parallel. Insert MailStat rows in chunks of 50 via `createMany`. Final result: 1,656 ms for 1,000 users / 2,000 planets.

**Reason**: The bulk-load + in-memory accumulation pattern is the canonical fix for N+1 in batch jobs. `Promise.all` parallelizes independent user updates; chunked `createMany` avoids Postgres parameter limits.

**Alternatives rejected**: Prisma `$executeRaw` bulk upsert (complex, brittle), per-planet `upsert` (still N+1), Redis pipeline (violates no-Redis principle).

---

## 2026-05-05 — ChgLoser cash penalty injected via DI token (D8)

**Context**: `PlayerScoreService` needs the `chgLoserPercent` value from `MIDNIGHT_CHGLOSER` env at runtime. Reading `process.env` directly inside a service breaks testability and violates the DI boundary.

**Decision**: `PlayerScoreModule` provides a `CHGLOSER_PERCENT` injection token via a factory provider (`useFactory: () => loadMidnightConfig(process.env).chgLoserPercent`). `PlayerScoreService` injects it as a constructor parameter.

**Reason**: Standard NestJS pattern — factory providers read env at module init time; the value is then stable and mockable in tests.

**Alternatives rejected**: Read `process.env` directly in service (untestable), ConfigService (adds a dep not used elsewhere in this module).

---

## 2026-05-05 — AdminTokenGuard constant-time comparison (D9)

**Context**: Naive string equality (`===`) on a secret token is vulnerable to timing attacks — an attacker can determine correct prefix bytes by measuring response time.

**Decision**: `AdminTokenGuard` uses `crypto.timingSafeEqual` on `Buffer.from` representations of the provided and expected tokens. Returns 503 if env token is unset, 401 otherwise.

**Reason**: Constant-time comparison is the industry-standard mitigation for secret-comparison timing oracles. The overhead is negligible for a single admin endpoint.

**Alternatives rejected**: Plain `===` comparison (timing-vulnerable), bcrypt (overkill for a static API token).

---

## 2026-05-05 — Last-write-wins single-socket-per-ship enforcement

**Context**: feature 010 (React frontend) needs a multiplayer-aware player list. When a player reconnects or opens a second tab, the server could end up with two sockets for the same ship. (research.md R4)

**Decision**: `ConnectedShipsRegistry.upsert(shipId, socketId)` follows last-write-wins: it returns the prior socketId so `handleConnection` can disconnect the old socket before emitting snapshot/joined. `handleDisconnect` calls `registry.remove(socketId)`; because `upsert` already cleared the prior mapping, `remove` returns `undefined` for the displaced socket, preventing a duplicate `player.left` emission.

**Reason**: Single-socket-per-ship is required so the player list never shows duplicate entries. Last-write-wins is the simplest policy that handles both reconnects and multi-tab scenarios without session state.

**Alternatives rejected**: Per-ship session tokens (extra complexity, no benefit for a single-server game); refusing second connections (worse UX — player would have to manually close the first tab).

---

## 2026-05-05 — Batched per-tick physics.sector-transition event

**Context**: The frontend ScanMap and PlayerListPanel need to know when ships cross sector boundaries, but emitting one event per-ship per-tick at 6 s cadence would flood the client. (research.md R5)

**Decision**: `SectorTransitionSubscriber` accumulates all integer-cell changes within a single physics tick and emits a single batched `physics.sector-transition` event via EventEmitter2, which `GameGateway` forwards to all clients as one Socket.io emission. Newly-spawned and despawned ships are excluded (clients learn of them via `player.joined`/`player.left`).

**Reason**: One batched event per tick is the minimum necessary for the frontend to stay in sync. Individual events per ship would multiply traffic by the number of moving ships with no benefit.

**Alternatives rejected**: Streaming one event per ship (O(n) emissions per tick); polling the player list on a timer (breaks real-time feel).

---

## 2026-05-06 — bcrypt cost 12 for password hashing (011-onboarding)

**Context**: `AuthService.register()` must hash the player password before storage.
bcrypt cost is the primary tuneable controlling hash time vs. CPU cost on the server.

**Decision**: Use bcrypt cost factor 12.

**Reason**: Cost 12 produces ~200-400 ms per hash on a modern server — acceptable for a
login endpoint (not in a hot path) and well above the 2026-era brute-force threshold on
commodity hardware. Cost 10 (the library default) is widely considered too low for new
projects; cost 14 would be ~4× slower with no meaningful security gain at current scale.

**Alternatives rejected**: Cost 10 (too weak for 2026 baseline), cost 14 (unnecessary
latency), Argon2 (no existing dep, bcrypt is sufficient for this threat model).

---

## 2026-05-06 — JWT 30-day expiry and no refresh tokens (011-onboarding)

**Context**: After successful register/login, the server issues a JWT. The client stores it
in localStorage and sends it via `socket.handshake.auth.token`. Token lifetime must be chosen.

**Decision**: Sign with `expiresIn: '30d'`. No refresh-token flow.

**Reason**: This is a persistent 24/7 game where players reconnect daily. A 30-day
window means they re-authenticate roughly monthly — low friction. The original MajorBBS
game had no login timeout concept. A refresh-token infrastructure would add significant
complexity for negligible security benefit at current scale (single-server, non-financial).

**Alternatives rejected**: 24h (too frequent re-auth for a casual game), 90d+ (tokens
stay alive too long after account deletion), refresh tokens (complexity not justified).

---

## 2026-05-06 — Dev-DB password-hash backfill policy (NULL passwordHash)

**Context**: Migration `011_onboarding_auth` adds `username` and `passwordHash` columns.
Existing `User` rows (from test/dev seeds) have no `passwordHash`. The migration backfills
`username = userid` but leaves `passwordHash = NULL` — there is no source for real hashes.

**Decision**: `AuthService.login()` rejects users with `NULL passwordHash` as
`INVALID_CREDENTIALS`. No attempt is made to auto-migrate these accounts.

**Reason**: No production data exists yet. Dev databases are wiped freely.
Pre-existing rows are Cybertron/Droid AI accounts (`Cybrg-*`, `@Droid-*`) that
never log in via the HTTP auth endpoint. Human-readable policy: "old rows can't log in
until they register through the new auth flow". This is acceptable and documented here.

**Alternatives rejected**: Backfill a random passwordHash (creates accounts players can't
log into), prompt on first login (adds runtime complexity), block old rows at the DB level
(would require a separate user type flag).

---

## 2026-05-06 — `broadcasts` field in CommandResult decouples handlers from Socket.io (011-onboarding)

**Context**: `RenameHandlerService` needs to emit `ship.renamed` to the sector room and
trigger a global `player.snapshot` after a successful rename. Handlers must not import
Socket.io server directly (separation of concerns).

**Decision**: Add `broadcasts?: { room: string; event: string; payload: unknown }[]` to
`CommandResult`. `GameGateway.processBroadcasts()` iterates the array after emitting
`command:result`. The sentinel room `'__player_snapshot__'` triggers
`server.emit('player.snapshot', registry.list())` (global refresh).

**Reason**: Keeps handlers independent of transport. Any handler can now queue broadcast
side-effects without knowledge of Socket.io room topology. The sentinel avoids injecting
`ConnectedShipsRegistry` into every handler.

**Alternatives rejected**: Inject Socket.io server into RenameHandlerService (violates
separation); EventEmitter2 event per rename (indirection with no benefit over direct
return); add a `postCommand` hook (overengineered for the one handler that needs it).

---

## 2026-05-06 — Arg casing preserved in CommandRouterService (011-onboarding)

**Context**: Ship rename requires mixed-case names. The old `CommandRouterService` lowercased
all tokens in the input, which would force rename targets to lowercase regardless of intent.

**Decision**: Only the first token (the keyword) is lowercased. `args = tokens.slice(1)` are
returned verbatim, preserving original casing.

**Reason**: Ship names are case-sensitive in the original game. Forcing args to lowercase
would break rename and any future command that accepts mixed-case input (planet names, etc.).
The keyword must still be lowercased for alias matching.

**Alternatives rejected**: Case-insensitive arg matching (would require caller to re-upcase,
awkward), separate lowercase/original versions of each arg (unnecessary complexity).

---

## 2026-05-06 — `who` and `dat` reinterpreted as in-world player-facing commands (D1)

**Context**: `GECMDS.C:5162 cmd_who` prints the caller's BBS session info; `GECMDS.C:5829
cmd_data` is gated behind a hard-coded `qazwsx` password and dumps raw wire-format ship
state for the BBS renderer. Neither is a player-facing galaxy listing.

**Decision**: `who` lists all active non-cloaked ships; `dat <fragment>` returns a full
stat block on the named ship. These are the in-world semantics documented in the GE wiki and
expected by every player.

**Reason**: The literal C-source forms are unreachable through the modern command pipeline.
Feature 010 already exposes the underlying data. Implementing the literal forms would deliver
zero player value.

**Alternatives rejected**: Implement literal C forms — rejected (no consumer); implement
both under different keywords — rejected (YAGNI).

---

## 2026-05-06 — `tea` implements join/leave/show subset of `cmd_team` only (D2)

**Context**: `GECMDS.C:5277 cmd_team` supports nine sub-verbs: `join`, `start`, `score`,
`unjoin`, `members`, `kick`, `newpass`, `newname`. Most are administrative.

**Decision**: Feature 012 implements only `tea` (show), `tea <name>` (join by exact
case-insensitive name), and `tea leave` (clear). Uses name-based join rather than the
original five-digit teamcode + password flow. Team creation deferred to a future feature.

**Reason**: Spec is explicit about the three behaviours. The existing `Team` Prisma model
from feature 001 is sufficient. Name-based join is a deliberate modernisation already
accepted by the wiki-era community.

**Alternatives rejected**: Port all nine sub-verbs — out of scope; teamcode-based join —
spec mandates name-based (clarification accepted).

---

## 2026-05-06 — RosHandlerService reads `process.env` directly instead of ConfigService

**Context**: Integration tests import `CommandsModule` without `ConfigModule`, which causes
NestJS DI to fail to resolve `ConfigService` and leaves the test `app` as `undefined`.

**Decision**: `RosHandlerService` reads `process.env['ROSTER_MAX']` directly in `execute()`,
defaulting to 20 if absent.

**Reason**: Avoids DI complexity for a single env value; integration tests do not need
`ConfigModule`; the value is only read at command time, not injected at construction.

**Alternatives rejected**: Add `ConfigModule.forRoot()` to the test harness — adds
unnecessary boilerplate and couples test setup to module composition.

---

## 2026-05-05 — No Redux / new state layer for player list

**Context**: The player list panel needs reactive state that stays in sync across multiple socket events. (research.md R1)

**Decision**: `usePlayerList` uses `useReducer` with an internal `Map<shipId, ConnectedPlayer>`. The reducer handles `SNAPSHOT`, `JOIN`, `LEFT`, and `TRANSITION` actions. No Redux, Zustand, or other external state library is introduced; the state is local to the component tree that mounts `PlayerListPanel`.

**Reason**: The player list is a single, well-scoped piece of state. A `useReducer` hook is sufficient and avoids adding a new dependency. The list is already hydrated by well-defined socket events with clear semantics for each action type.

**Alternatives rejected**: Redux Toolkit (overkill for a single list); Zustand (unnecessary dependency); Context API with a global store (heavier than needed for one panel).

## 2026-05-07 — 013-ship-management: four deviations from canonical C source

> **STALE — these deviations were later reverted to canon.** Verified 2026-09-02:
> D1 `transfer` is canon `tra up|down` against the orbited planet, gated on
> `where >= 10` (`transfer.handler.ts`, GECMDS.C:3300/3354); D2 bare `aba` is
> canon planet-abandon with the ship-scuttle moved behind an explicit
> `aba ship` (`abandon.handler.ts`, GECMDS.C:3420); D3's maint password gate is
> implemented (`MaintenanceService`); D4's `set` carries `scannames` and
> `filter` (`set-options.catalog.ts`) alongside the port's auto-shield and
> auto-repair options. Kept for the reasoning, not as a description of the code.


**Context**: Eight commands ported from GECMDS.C have semantics that cannot be mapped 1:1 to the web architecture.

**D1 — `transfer` moves cargo between ships (not ship→planet)**

Original `cmd_transfer` (GECMDS.C:3271) moves items from ship hold to an orbiting planet. This port moves items between two online ships in the same sector.

**Reason**: Planet-based cargo transfer is already handled by `buy`/`sell` (feature 005). A ship-to-ship transfer is more useful for cooperative multiplayer.

---

**D2 — `abandon` marks ship status=3 (not planet-colony abandon)**

Original `cmd_abandon` (GECMDS.C:3420) abandons a planet colony. This port detaches the captain from their ship and routes them to the feature-011 onboarding flow (FR-704).

**Reason**: The web game needs a way for players to switch ships or recover from a stuck state. Planet-colony abandon belongs in feature 005.

---

**D3 — maint password gate (FR-210) deferred**

Original `cmd_maint` (GECMDS.C:4452) checks planet password. This port omits FR-210.

**Reason**: Planet passwords are not yet implemented (feature 005). Deferred.

---

**D4 — `set` manages auto-shield/auto-repair (not scannames/filter)**

Original `cmd_set` (GECMDS.C:5190) manages `User.options[]` flags for scan display. This port manages `autoShield`/`autoRepair` flags on `ShipState`.

**Reason**: Scan display customization is low priority; auto-shield/auto-repair are immediately useful for the physics tick. The `options[]` array can be used later when needed.

---

**CLOAK_ENERGY_USE as sysop-tunable env var (not GEMAIN.H constant)**

`CLOAK_ENERGY_USE` is injected via DI token and loaded from `process.env.CLOAK_ENERGY_USE` at startup (default 50, min 1, max 32000). Pattern follows `midnight.config.ts`.

**Reason**: Energy drain rate is an operational balance knob, not a protocol constant. Sysop should be able to tune it without recompiling.

---

## 2026-05-07 — 014-planet-attack: four key decisions

**Context**: Feature 014 adds `att` (troop/fighter attack), `pln` (list owned planets), `pri` (price quote), and the deferred `mai` password gate from feature 013.

**D1 — Per-planet mutex re-validation**

`AttackHandlerService` runs a pre-lock cargo check (static gate) then acquires `PlanetStateService.withPlanetLock`. Inside the lock, it re-validates self-attack (planet may have been captured) and cargo (concurrent transfer may have depleted it) before deducting.

**Reason**: Prevents both TOCTOU data races and over-deduction when two attackers race on the same planet. The pre-lock check is a fast-fail for the common case; the re-check inside the lock is the authoritative check.

**Alternatives rejected**: Single lock at handler entry (holds lock too long); optimistic check only (TOCTOU vulnerability).

---

**D2 — PLATTR* as DI tokens with env-var overrides**

All six combat coefficients (PLATTRT1, PLATTRT2, PLATTRF1, PLATTRF2, PLATTRF3, FIRETICKS) are injected as DI tokens with defaults from GEMAIN.C/GEMAIN.H and env-var overrides.

**Reason**: Follows the CLOAK_ENERGY_USE pattern established in feature 013. Sysop can tune balance without recompiling; balance-regression tests can inject known values without env mutation.

**Alternatives rejected**: Hard-coded constants (no sysop override); ConfigModule (unnecessary complexity for simple numeric values).

---

**D3 — attack_fig() ratio bug preserved (FR-014-019, SC-008)**

`attackFighter` computes `ratio = left2 > 0 ? (left1/left2)*100 : 0`. When `left2 == 0` initially, `ratio = 0` — skipping ground-fire, return-fire, counter-kill, and item destruction. This matches the C source exactly.

**Reason**: Fidelity to the original game. The original C code contains this bug; preserving it means players who learned the original behavior will find consistent mechanics. A dedicated bug-preservation test (T024) documents and enforces this.

**Alternatives rejected**: Zero-guard fix — would change game balance and break fidelity.

---

**D4 (013 carried-forward) — maint password gate ordering (D10 in research.md)**

The `mai` password gate (FR-014-060/061/062) is inserted between FR-209 (neutral zone) and FR-204 (no damage), matching the original GECMDS.C:4471 source order.

**Reason**: Canonical source order is the spec. Changing the order would mean a NZ-non-Zygor player sees a password prompt instead of the NZ error — incorrect behavior.

---

## 2026-05-07 — 015-scan-modes: D1-D7 deviations from C source

**Context**: Feature 015 ports `scan_ra`, `scan_se`, and `scan_lo full` from GECMDS.C, and
adds `SCANNAMES`/`SCANHOME` display options from GEMAIN.H `options[]`. Seven deliberate
deviations from the C source were made for web-architecture or usability reasons.

**D1 — `sca lo` plot chars → scantab letters (was `+`/`=`)**

**Context**: `GECMDS.C:scan_lo` renders ships as `+` (auto-pilot) or `=` (normal) glyphs.

**Decision**: Replace the `+`/`=` glyphs with scantab letter assignments (A-Z, nearest-first).

**Reason**: Scantab letters are stable across `scan lo`, `scan ra`, and `scan se` — players
can reference "ship B" in any mode. The original glyphs provide no targeting reference.

**Alternatives rejected**: Keep `+`/`=` for `scan lo` and use letters only for `scan ra`/`scan se`
(two different schemes would confuse players); numbered slots (A-Z is more readable).

---

**D2 — NOSCANTAB widened from 15 to 26 (full alphabet)**

**Context**: The C source limits letter assignment to 15 ships (A-O). The full alphabet has 26.

**Decision**: Use all 26 letters A-Z for scantab assignment.

**Reason**: Modern servers can support more players; a 15-ship cap is an MajorBBS/8088 constraint
with no gameplay justification. Widening to 26 is trivially safe and adds no complexity.

**Alternatives rejected**: Keep 15-ship cap (artificial limit with no balance justification).

---

**D3 — SCANHOME uses typed socket event field (not ANSI escape codes)**

**Context**: The original `SCANHOME` option emitted ANSI cursor-home sequences (`\033[H`) to
overwrite the terminal display in place.

**Decision**: `scan:render` wire payload carries `overwrite: boolean`. When `true`, the frontend
`ScanPanel` replaces the previous card; when `false` it appends. No ANSI codes emitted.

**Reason**: The web frontend is a React component, not a raw terminal emulator. ANSI escape codes
are meaningless in the browser. The boolean field provides equivalent UX semantics cleanly.

**Alternatives rejected**: Emit ANSI codes as part of line content (would appear as literal escape
sequences in the UI); skip SCANHOME entirely (loses the overwrite-mode UX that some players prefer).

---

**D4 — Player options stored in `User.options Int[]` (no new DB column)**

**Context**: `GEMAIN.H WARSUSR.options[30]` is a 30-byte array of player flags. The Prisma schema
already stores this as `User.options Int[]`. SCANNAMES is at index 0; SCANHOME is at index 1.

**Decision**: Persist SCANNAMES at `User.options[0]` and SCANHOME at `User.options[1]` using the
existing `options` column. No new Prisma column or migration needed.

**Reason**: The `options` array was designed for exactly this purpose in feature 001. Using it
avoids a migration. The index assignments match the original C constants order.

**Alternatives rejected**: New `scanNames`/`scanHome` Boolean columns (migration cost, redundant
with the existing `options` column); `Ship.options` (display prefs are user-level, not ship-level).

---

**D5 — Scantab lifecycle: lazy init, clear on disconnect/death/dock**

**Context**: The original C `NOSCANTAB` array was process-global, reset each time `scan_lo` was
called. The NestJS port is per-socket and must handle disconnects, kills, and docking.

**Decision**: Scantab is lazily initialized on first scan command per socket. It is cleared on:
socket disconnect (`handleDisconnect`), ship death (`COMBAT_SHIP_DESTROYED` for that socket's
ship), and when the ship docks (`ship.where >= 10`, checked at scan time).

**Reason**: Lazy init avoids work for players who never scan. Death/dock clears ensure stale
letter assignments do not persist across respawns or orbital transitions. The per-socket
approach aligns with the web game's one-socket-per-ship constraint.

**Alternatives rejected**: Scantab per-ship key (would survive disconnects, introducing
stale entries); never-cleared scantab (stale assignments after respawn confuse players).

---

**D6 — Colour encoding uses semantic strings, not numeric channel codes**

**Context**: The C source distinguishes ships by `GESTAT_USER` vs. CPU status flags (numeric).

**Decision**: `ScanCell.colour` (and `ScanRenderEvent.grid[n].colour`) uses one of four string
values: `'self'`, `'human'`, `'ai'`, `'planet'`. No numeric codes on the wire.

**Reason**: Semantic string values are self-documenting, directly map to CSS class names in the
frontend, and decouple the wire format from internal C status codes. The frontend needs to know
"how to colour this cell," not the internal player-vs-AI distinction mechanism.

**Alternatives rejected**: Numeric status codes (require frontend lookup table, fragile); single
boolean `isAi` (loses the self/planet distinction needed for 4-channel `scan se`).

---

**D7 — `sca lo full` side-panel column layout matches `scan_sh` style**

**Context**: The original `GECMDS.C:scan_lo` with SCANCOLS enabled output letter, distance,
bearing, heading, speed in a fixed column format. Ship names were on a separate line when
SCANNAMES was set.

**Decision**: Side-panel rows are formatted as: letter (1 char), distance (right-justified 6-char),
bearing (right-justified 4-char), heading (right-justified 4-char), speed (right-justified 5-char),
optional name column when SCANNAMES=on. Column layout matches the `scan_sh` output style.

**Reason**: Preserves the original display aesthetics for players who know the game. The `scan_sh`
column widths are well-tested and familiar.

**Alternatives rejected**: Arbitrary new column widths (non-fidelity); JSON-only side panel with
no formatting (pushes all formatting to frontend, harder to keep in sync with original).

---

## 2026-05-07 — D1: holdcourse boolean reuse for player autopilot (feature 016)

**Context**: `cmd_navigate` in the original GE was a one-shot bearing-report command. We needed a way to persist autopilot state between physics ticks without adding a new DB column.

**Decision**: Reuse the existing `holdcourse Int` field as a boolean flag for player ships (0 = off, >0 = on). AI ships already use `holdcourse` as a per-tick countdown — this secondary semantic coexists without conflict since AI ships are never issued `nav` commands.

**Reason**: No new DB column needed; the existing semantics on the AI side are unchanged.

**Alternatives rejected**: Adding a separate `autopilotActive Bool` column was rejected — more migration surface, `holdcourse` is already present and zero-initialized for all ships.

---

## 2026-05-07 — D3: spy intel revealed at scan render time (feature 016)

**Context**: When a player has planted a spy on a planet, they should see the planet's item inventory on `scan pl`.

**Decision**: The reveal is computed at scan-render time in `scanPl` by comparing `planet.spyowner` to the viewer's `ship.userid` (case-insensitive). No separate event or cache.

**Reason**: Simple, stateless, and consistent with how planet-owner intel is revealed elsewhere.

**Alternatives rejected**: A separate `spy:intel` socket event was rejected — more complexity, no benefit.

---

## 2026-05-07 — D4: cls uses clearLog directive on CommandResult (feature 016)

**Context**: The `cls` command should clear the player's event log without affecting other players.

**Decision**: Return `{ lines: [], clearLog: true }` from the handler. The frontend `command-result-handlers.ts` checks this field and calls `clearLines()`. The backend emits no special event; the `clearLog` field travels over the existing `command:result` unicast channel.

**Reason**: Zero new backend events, zero new frontend listeners, fully testable in isolation.

**Alternatives rejected**: A separate `log:clear` socket event was rejected — more coupling, more test surface.

---

## 2026-05-08 — `mai` keyword dispatcher pattern (feature 017)

**Context**: The `mai` keyword was previously an alias on `MaintHandlerService` (feature 014). Feature 017 adds inbox listing to `mai` (no-arg form), requiring the keyword to do different things depending on whether args are present.

**Decision**: Remove `mai` from `MaintHandlerService.aliases` and create a new `MaiHandlerService` that owns the `mai` keyword. Its `handle()` method routes no-arg → inbox listing, any-arg → `this.maint.command.handler(ship, args, ctx)`.

**Reason**: Threading inbox logic into `MaintHandlerService` would conflate two concerns (maintenance gate + inbox) in one class. A dedicated dispatcher is testable in isolation — the inbox path and maintenance delegation each have their own mocks. SC-005 (maintenance regression) is satisfied because the maintenance gate is called with the original args, not re-implemented.

**Alternatives rejected**: Modifying `MaintHandlerService` to accept an injected inbox service and branch internally — rejected because it would grow a class that already has a well-defined single responsibility. Also rejected: registering two separate handlers for the same keyword — the CommandRouterService registry is keyed by keyword/alias, so only one handler can own `mai`.

---

## 2026-06-25 — Cybertron cyb_attack evaluates gebemean once

**Context**: Original C `cyb_attack` (GECYBS.C:514 and :527) makes two INDEPENDENT `gebemean` (`gernd()%CYBSLO`) draws — one gating phaser fire, one suppressing the torpedo volley. A non-quad cyb facing a low-kill player could fire one weapon but not the other on a lucky roll.

**Decision**: The TS port evaluates `gebemean` once per `cyb_attack` invocation and reuses it for both the phaser gate and the torpedo-count roll.

**Reason**: Simpler and deterministic PRNG consumption — the pre-existing TS code already rolled it once. The divergence is confined to the 1-in-CYBSLO random branch against players with `kills < CYB_BE_NICE` (when quad or `kills ≥ CYB_BE_NICE` both C draws are deterministically equal anyway). The original author of the TS port flagged that region as possibly-dead code, and playtest will surface any cadence issues immediately.

---

## 2026-06-25 — randamage split into pure roll / mutator / emit-helper (feature 026)

**Context**: `randamage` (GEFUNCS.C:1956) needed to be wired into 7 hit sites across 4 combat services (phaser, torpedo/missile/mine in `CombatTickService`, Cybertron, two droid classes). Each site follows the same pattern: roll the subsystem selection, mutate state, emit an event. The question was whether to inline that triple at every site, or extract helpers.

**Decision**: Three-layer split:
- `rollRandamage(damage, rng): RandamageRoll` — pure function, no side effects. Returns `{ subsystem, value, outcome: 'damaged'|'skipped'|'none' }`. Fully unit-testable with any seed.
- `applyRandamage(ship, roll): void` — state mutator only. Applies the roll result to the in-memory `ShipState`. No I/O.
- `applyRandamageAndEmit(victim, rng, emit): void` — composes the two above and calls the emit callback. This is the function called from all 7 hit sites; they pass the sector-scoped emit closure from their tick context.

**`'skipped'` vs `'none'` discriminator**: `shieldtype=20` (Zygor class) bypasses the subsystem roll entirely. The outcome is `'skipped'` (not `'none'`), so callers can distinguish "immunity" from "roll produced no damage" in logs and tests.

**Reason**: The pure/mutate/emit split follows the existing `rollHullDamage` → `applyHullDamage` pattern in the codebase. It keeps the logic testable in isolation and avoids duplicating the emit-and-mutate boilerplate at 7 call sites. The `'skipped'` discriminator was added after the first test pass revealed that class-immunity was silently swallowed in golden-vector tests.

**Alternatives rejected**: Inline the triple at every hit site (7× duplication, hard to test); a single `randamageAndEmit` function taking every field as args (long signature, harder to mock the emit); making `rollRandamage` stateful by accepting `ShipState` directly (breaks purity, prevents golden-vector tests).

**Alternatives rejected**: Two independent draws for strict C fidelity — deferred; revisit if Cybertron fire cadence feels off in playtest.

## 2026-08-31 — `who` lists players, not the whole galaxy

**Context:** Flying a fresh pilot, a bare `who` printed every live ship —
including all 24 Cybertrons and the droids — with each one's exact sector. That
is a free galaxy-wide threat map: a pilot could route around every hostile
without ever running a scan, and could find the Murdonian Transport (the
designed new-player PvE target) without hunting for it. Scanning is the mechanic
that is supposed to cost you something.

**Decision:** `who` lists ships whose `status !== GESTAT_AUTO` — human pilots
only. AI positions are what `sca` is for. Cloak gating moved from "any non-zero
`cloak`" to C's `cloak < 10`.

**Reason:** C's `cmd_who` (GECMDS.C:5162) only echoes the caller's own BBS id:
`prf("ID:%s,%s,%s\r", usaptr->userid, usaptr->usrnam, "NULL")`. There is no
canon roster, so spec 012 D1 reinterpreted the verb as a player-facing listing
built on `ConnectedShipsRegistry` — "show me who else is online". Enumerating
the AI fleet is drift from that spec's own rationale, not fidelity to anything.

On cloak, C gates every ship listing on `cloak < 10` (GECMDS.C:1371, 1511,
2824). Cloak is not a boolean there: it spins up 1 → 2 → 10
(GEFUNCS.C:1717-1724) and counts back up from a negative value while recovering
(GEFUNCS.C:1388-1391). Only the fully-engaged state hides you, and even then it
leaks — a cloaked ship moving fast broadcasts a bearing to nearby ships,
deliberately slopped by ±10 degrees (GECMDS.C:525-543). So the canon answer to
"does a cloaked player show as online?" is no: full cloak erases you from
listings entirely, and the game gives you a fuzzed bearing instead, not a
name-without-a-position. `ScanHandler` already used `>= 10`; `who` did not, so a
ship that had merely *started* cloaking vanished a tick early.

**Alternatives rejected:** Listing cloaked players as online with the position
blanked — invents a disclosure C never makes, and hands out the one bit
(someone is cloaked and hunting) that cloaking is bought to conceal. Restricting
`who` to the caller's own sector — that is `sca sh`'s job, and it would leave no
way to see who is on at all.

## 2026-08-31 — Ship channels: this port's `usrnum`

**Context:** During a playtest the event log announced `FireBtgn8398 has been
destroyed by Kestrel!` — Kestrel being my ship, two sectors away, zero kills,
never having fired. The kill, the loot and the score all went to a bystander.

**Decision:** Every ship in the world is assigned a unique integer `channel` on
entry to the in-memory map and gives it up on exit (`ShipChannelRegistry`).
`lastfired` and the torpedo, missile and mine records store a channel, and all
attribution resolves by channel. Numbering starts at 1 so a stored `lastfired`
of 0 keeps meaning "nobody".

**Reason:** `lastfired` is documented in GEMAIN.H:340 as the *usernumber* of the
last user to fire on you, and C resolves it by indexing the terminal table —
`warshpoff(ptr->lastfired)` (GEDROIDS.C:343). A usernumber names exactly one
ship. This port stored `shipno` instead, which is a PER-USER index: it is 1 for
every player's first ship and for every droid. The reverse lookup was a scan for
`s.shipno === channel`, which returned whichever ship happened to sit first in
the state map. Consequences, all live: kill credit, loot and score to a
bystander; the gateway's disconnect-kill path naming the wrong killer; and
droid classes 11 and 12 fighting back against a player who never shot them.

Channels are session-scoped and recycled, exactly as C's terminal slots are.
Releasing one therefore scrubs it from every ship still naming it, which is what
C does when a user drops (GEFUNCS.C:1224-1225).

**Alternatives rejected:** A `*Key` twin for each numeric field (the shape used
earlier for `lock`/`lockKey`) — five more fields, two migrations, and the
ambiguity survives anywhere a `*Key` is missed. Making the channel a composite
`userid:shipno` string — a wider change to Torpedo/Mine columns for no gain over
a unique int, which is what C uses.

**Known follow-up:** `lock`/`lockKey` still carries the older twin-field shape.
It is correct, but it should collapse onto `channel` for one convention.

## 2026-08-31 — `sca pl` reads live planet state, not the boot-time read model

**Context:** A browser test scanned a sector, picked a planet the scan reported
as unowned and unnamed, flew to it, and had the landing refused because the
planet was in fact owned. Scan and claim disagreed about the same planet.

**Decision:** `sca pl` (listing, number lookup and name lookup) resolves planets
through `PlanetStateService`, the live in-memory map. `GalaxyService` keeps its
read model for static geometry — sector contents, wormholes, generation — but is
no longer the source of ownership or names.

**Reason:** `GalaxyService.hydrate()` runs once in `onModuleInit` and is never
refreshed. `claim`, `abandonPlanet` and renames all mutate `PlanetStateService`,
so from the first claim after boot the two diverged. Every planet claimed during
the current uptime still scanned as "(unnamed)" with no owner — so a player
could not see their own colony on a scan, and could not tell which planets were
still free. The only feedback was the landing refusal after flying there.

**Alternatives rejected:** Having `PlanetStateService` push updates into
`GalaxyService`'s cache on every mutation — keeps two copies of the same mutable
state and one more place to forget. Re-reading Postgres per scan — the in-memory
map is already the source of truth for exactly this data.

**Note:** planet `password` survives abandonment, so a planet released while
closed stays unlandable. That matches C: `cmd_abandon` clears only
`plptr->userid[0]` and the planet counter (GECMDS.C:3420-3445). Left as-is.

## 2026-09-01 — Droids stay out of the neutral zone
**Context:** The fidelity audit found that C has no neutral-zone filter for
droids anywhere — `grep -n neutral GEDROIDS.C` returns nothing, all three scan
loops gate only on `ingegame && status == GESTAT_USER` (GEDROIDS.C:268-272,
318-322, 426-430), and `droid_init` (:131-140) places them anywhere in the
galaxy. The port excludes them, and the existing A-004 record covered only
Cybertrons.
**Decision:** Keep the exclusion, and extend it to droids explicitly.
**Reason:** The neutral zone is where a new player spawns, docks, buys their
first ship and learns the command set. A Murdonian Transport wandering into
Zygor and opening fire on someone who has not yet worked out `shi up` is a
worse first ten minutes than the original delivered on a BBS where a sysop was
usually watching. This is the same reasoning already recorded for Cybertrons.
**Alternatives rejected:** Matching C exactly — rejected on the grounds above.
Spawning droids anywhere but making them passive inside the zone — more moving
parts for the same outcome.

## 2026-09-01 — PLTVCASH and PLTVDIV are chosen sysop values
**Context:** Both were pinned to 201,228,378, which is the `lngopt` MAX BOUND
shared by seven sysop options (GEMAIN.C:557-596), not a value. C's own
expression proves it: `(cash+tax)/(1000000L/pltvcash)` divides by zero at that
magnitude. As values they made PLTVCASH a ~201x multiplier on banked cash and
PLTVDIV large enough to truncate every stockpile to zero.
**Decision:** PLTVCASH = 1000 (one point per 1000 credits banked), PLTVDIV =
10000. Both env-overridable and clamped to 1..1,000,000, the range where C's
expressions remain divisions.
**Reason:** The original's shipped values are not in the source — they came
from the sysop's option file, which we do not have. These keep a developed
planet worth a few hundred to a few thousand points, the same order as the
750-10000 a kill pays, so `score = plscore + klscore` reflects both halves of
the game. The old values made planet cash the only thing that counted.
**Alternatives rejected:** Leaving them and documenting the distortion —
scoring is the game's only long-run objective. Picking 1 for both — cash would
have become invisible instead of dominant.

## 2026-09-01 — Fix the original's bugs rather than reproduce them

**Context:** A playtest raid put 300 fighters against a colony holding 20,948
troops and no fighters of its own. Nothing happened: no attacker losses, no
defender losses, no damage to the planet, no alert to its owner. Reading
`attack_fig()` (GECMDS.C) showed two separate defects in the original, one of
which C's own source marks `/* there is a bug here */`.

1. `ratio = (left1/left2)*100` guards only the divide, so a planet with **no**
   fighters yields `ratio = 0` — the one case where the raid meets no air
   defence at all. Item destruction (`ratio > 5`), the owner alert (`> 1`) and
   distress mail (`> 2`) all hang off that number, so an unopposed raid of any
   size did nothing and told nobody.
2. Ground anti-air is computed from the planet's TROOPS and announced with
   `ATTACKF8`, but the caps and both subtractions sit inside `if (left2 > 0L)`.
   With no defending wing, `left1 -= kill1` never runs: C narrates a defence
   and then declines to apply it.

**Decision:** Fix both. `ratio` is maximal when the attack is unopposed, and
ground fire is applied whether or not the planet has fighters. `spec.md`
FR-014-019 and acceptance scenario 5, which had mandated preserving both, are
marked superseded rather than deleted.

**Reason:** The project rule is fidelity to the original's *design* — its
formulas, constants and cadences. It was never meant to include reproducing
mistakes the original's own author flagged in a comment. Both defects make the
game strictly worse and neither has a reading in which it is intended: ground
fire keyed to troops that only lands when fighters are present is not a
mechanic, and an unopposed raid scoring zero inverts what the ratio means.

**Alternatives rejected:**
- *Keep both, as the spec required.* Rejected on the owner's instruction, and
  because the previous framing ("intentional behavior preservation") had
  hardened into a test asserting `expect(true).toBe(true)` — a placeholder
  standing in for a defect nobody could state a purpose for.
- *Fix the ratio only.* The two defects share a cause; fixing one leaves
  fighters still unable to be shot down over a garrisoned world.

**Precedent:** Where the original's behaviour is merely surprising but coherent
(the planet counter drifting until midnight recounts it, `PLTVDIV` truncating a
young colony's score to zero, re-claiming a planet overwriting its name) it
stays. This decision covers defects, not quirks.

## 2026-09-01 — Confirm before abandoning a colony or a hull

**Context:** `aba` releases the planet you are orbiting the instant you press
Enter. During a playtest a batched command was swallowed as the answer to an
unrelated prompt and a colony was renamed; the same three keystrokes would have
given it away outright. `abo` (abort self-destruct) sits one letter away in the
same command set, and the port's own `aba ship` scuttles the hull.

**Decision:** Both forms now confirm. `aba` names the planet it is about to
release and waits for YES; `aba ship` names the hull and does the same. An
unrecognised answer is treated as a refusal, never as consent.

**Reason:** This one is NOT a defect in the original — `cmd_abandon`
(GECMDS.C:3420) deliberately releases the colony on the spot, and the previous
entry in this file draws the line at defects rather than quirks. It is being
changed anyway because the action is irreversible, the colony may represent
days of play, and the port already has a confirmation mechanism (`land` asks
for a planet name through `expectFollowup`) so the interaction is one players
have already met. Naming the planet in the prompt is the actual safeguard: it
is how a captain sees which colony they are about to lose.

**Alternatives rejected:**
- *Leave it, as C has it.* MajorBBS play was a paid, deliberate session on a
  dial-up terminal; a browser tab invites the fat-fingered Enter this guards.
- *Confirm only the planet form.* Scuttling a hull is equally irreversible and
  shares the keyword; guarding one and not the other is the more surprising
  outcome.

## 2026-09-01 — A purchased hull is not a bare hull

**Context:** A Heavy Freighter bought at Zygor came out with `phasrtype` and
`shieldtype` 0. `rep wpns` reported "type 0", and the upgrade screens priced
from 0 with no trade-in, so this read as an intentional "buy the hull, fit it
yourself" design — right up until `shi up` in a fight answered "You have no
shields installed."

**Decision:** Purchased hulls are created with `phasrtype = 1` and
`shieldtype = 1`, shields down.

**Reason:** Not a design choice, a missed line. C's `new ship` path calls the
same `initshp` as a first-time pilot's ship (GECMDS.C:4572), and initshp sets
`shieldtype = 1; phasrtype = 1` (GEFUNCS.C:233-234). The port's onboarding path
copied those lines; the purchase path did not — the same omission that left
`topspeed` at 0 and made every bought ship unable to warp.

## 2026-09-02 — Claiming belongs to `adm`; `land` is removed

**Context:** The port shipped a `land` command doing three jobs: claim an
unowned planet and name it, "dock" at your own, and "dock" at someone else's
behind a password. The owner asked why it exists, given the original has no
such command.

It does not. The complete table at GECMDS.C:122 is 47 entries —
`aba abo adm att buy clo cls dat dec des flu fre hel imp jam jet loc mai min
mis nav new orb pha pla pri ren rep ros rot sca sel sen set shi spy sys tea
tor tra war who zip` — and claiming happens through `adm`: orbit an unclaimed
world, `adm` offers it (mnu_admenu1, "do you wish to claim this planet"), then
mnu_admenu1a takes the name (GEMAIN.C:2899-2981). There is no docking concept
at all; you orbit, and orbit is what every planet command gates on.

**Decision:** Implement C's claim flow in `adm`, then delete `land`.

**Reason:** Fidelity, and a concrete cost already paid. `land` was not a
harmless convenience — it grew two defects of its own. Its team-lock branch
admitted any stranger who typed nothing (`arg === 'team' || arg === ''`, never
comparing the visitor's team to the planet's), justified by a comment claiming
"ship carries no explicit teamcode field" when `ShipState.teamcode` exists. And
it invented a closed-by-default docking rule inconsistent with trading: a
colony with no password refused visitors while happily selling to them.

Both are instances of the pattern that produced most of this playtest round's
bugs — two implementations of one rule drifting apart. The neutral zone (AI
copy correct, player copy wrong), the buy gates (`buy` correct, `pri` wrong),
and planet access (`buy` correct, `land` wrong) were all the same shape. An
invented command that shadows a real one is a standing invitation to it.

**Alternatives rejected:**
- *Keep `land` as an alias for `adm`.* Preserves the same hazard in miniature
  and keeps teaching players a verb the original does not have.
- *Keep `land`, fix its bugs.* Already done twice. The third fix is deletion.
- *Delete `land` first.* Not possible: `adm` refused every planet the caller did
  not already own, so `land` was the only way to claim anything. The claim path
  had to exist in `adm` before `land` could go.

**Sequencing note:** the two halves shipped as separate commits because a
playtest was in flight whose land-rush persona was using `land`; removing it
mid-run would have invalidated that agent's mission and produced a phantom bug
report.

## 2026-09-02 — Tuning the new-player curve through C's own sysop options

**Context:** Three pilots played the fixed build for ~2.5 hours between them and
landed ZERO kills across 19 deaths. Verification refuted all 42 findings as
faithful ports, so nothing was broken — the difficulty was.

The survivability probe made the cause unambiguous. Every one of its seven
deaths was a class-25 Sartern Obliterator, from 3.4 to 5.4 sectors away. The
single run it survived was the one where the nearest Obliterator was 8.1
sectors off. Median survival outside the hub was under 60 seconds; the two
newcomers never fired a profitable shot.

Damage to a 100-hull starter Interceptor, by class, at PFIRDST=1:

    class                n   1sec   2sec   3sec   5sec
    21 Scout            10     18      8      0      0
    22 Cyberquad         5     26     14      2      0
    23 Base Star         1    140    121    102     65
    24 Attack Drone      6     11      3      0      0
    25 Obliterator       2    140    121    102     65

21 of the 24 Cybertrons are survivable. Three are not, and they kill from
eleven times an Interceptor's scanner range, so the victim never sees them.

**Decision:** Change only values C exposes through `numopt`, in
`config/game.config.json`. No `#define` is touched — `CYBSLO`, the 1-in-3
new-player mercy roll, stays exactly as the original has it.

- `PFIRDST` 1 -> 3 (`numopt(PFIRDST,1,20)`, GEMAIN.C:493). This is the phaser
  falloff EXPONENT in `pdamage`: `dp = pow(dd, pfirdist)`. We had it at 1, the
  gentlest value in its range, making damage decay linearly. At 3 an
  Obliterator's shot goes 121 -> 70 at two sectors and 65 -> 11 at five, while
  point-blank barely moves (158 -> 157). Close combat stays lethal; sniping
  from beyond sensor range stops being an execution. It applies symmetrically
  to players.
- `SE100DAM` 101 -> 40 (`numopt(SE100DAM,1,101)`, GEMAIN.C:463). Firing inside
  the neutral zone zaps you for this. At 101 against a 100-point hull it is
  certain death with no confirmation; one pilot lost two ships to it in a row,
  the second because his queued command after respawning was `pha`. At 40 it is
  a severe lesson rather than a wipe.

**Reason:** These are the knobs the original shipped for exactly this purpose,
and the numbers we had were provisional — both sat at an endpoint of C's range
rather than at a considered value. Changing them alters no code and no formula.

**Alternatives rejected:**
- *Raise CYBSLO.* It is a `#define` in GEMAIN.H, not a sysop option, so
  changing it would be a deviation from the original rather than a use of it.
- *Set `tot_to_create` to 0 for classes 23 and 25.* Held in reserve. It is
  per-class sysop config and would remove the problem outright, but it also
  removes the top of the reward curve — those three ships carry 200,000 and
  500,000 gold. Try the damage curve first; this remains the next lever if
  measurement still shows newcomers cannot leave the hub.
- *Lower PDAMMAX.* Blunter: it scales every phaser in the game down uniformly,
  including the player's, without addressing the range problem specifically.

**Test consequence:** two balance-regression tests pinned the deployed values
and failed. That was the pin being wrong, not the change: these are options the
sysop is meant to set, so freezing a deployment's choice defeats the config
system. They now assert each value stays inside C's `numopt` range — which
still catches a typo'd config — and the phaser formula test derives its
expectation from the configured exponent instead of assuming the linear case.

## 2026-09-02 — Canon is the source of truth; sysop options re-baselined from MBMGEMSG.MSG

**Context:** The original distribution was obtained in full (github.com/bsimser/ge,
vendored read-only at `reference/ge-upstream/`). Our nine C files proved
byte-identical to it, but the *data* files had never been available: the port had
reconstructed ship classes and sysop options from wiki tables and from bounds.

`game-config.ts` had stated that option values "are not part of the reference
source, so there is nothing to recover" and therefore that "any value inside the
bounds is legitimate". This is false — `MBMGEMSG.MSG` carries the shipped default
in the braces of every option block. Working from that premise, 44 of 51 defaults
were wrong and 20 sat exactly ON a clamp bound, in both directions (HPDAMMAX at
the ceiling of 200 against a shipped 50; PFIRDST at the floor of 1 against 7).
A 15-agent adversarial audit traced ~35 of its 98 findings to that one comment.

**Decision:** The classic game is the source of truth. Precedence: C source, then
the `.MSG` data files, then the wiki. In-game help text states intent and is never
authoritative for a number. Canon values are GENERATED and pinned by tests that
re-read the original files — never hand-transcribed.

`config/game.config.json` now contains DEVIATIONS ONLY. Restating a value you did
not choose is how the drift hid: the file looked authoritative and silently
overrode every correction made to the defaults.

**Reason:** Both drifts found this week (ship scanRange, and the option defaults)
shared one shape — a plausible comment asserting canon was unavailable, which then
licensed a guess that no test could contradict, because the tests were written
from the same premise.

**Alternatives rejected:** Keeping the tuned values and documenting them wholesale
— rejected because they were not tuning decisions, they were bound-picking; there
was nothing to preserve. Hand-correcting the 44 values — rejected as the same
failure mode that produced them.

---

## 2026-09-02 — UNIVMAX deploys at 100, against a canon default of 300

**Context:** Canon ships UNIVMAX=300, a 601x601 galaxy. Scan ranges are ABSOLUTE,
so galaxy size and scanner reach are a ratio and must be chosen together: canon's
Interceptor sees 10 sectors, which is 1.7% of canon's galaxy width but would be
32% of the 31x31 galaxy the port was running.

**Decision:** `default: 300` in `SYSOP_OPTIONS` (canon), deployed at **100**
(201x201) in `config/game.config.json`.

**Reason:** Canon's galaxy assumed a busy BBS. With a handful of concurrent
players, 361,201 sectors means they never meet. At 100 the Interceptor's canon
scan is 5% of galaxy width — roughly 3x canon's relative reach, which suits a
smaller player base — while the Dreadnought's 50-sector reach stays just under a
quarter of the width, guarded by a test that reads the DEPLOYED config.

**Alternatives rejected:** UNIVMAX 300 (players never meet); UNIVMAX 15 with
compressed scan ranges (the status quo — it fought the projection code, which had
already been corrected to expect canon values).

---

## 2026-09-02 — PLANTOCK deploys at 120 minutes, against a canon default of 360

**Context:** Canon's planet production tick is 360 minutes; the port hard-coded
1800 seconds (30 minutes) while its JSDoc claimed 30 was canonical. Colony
economies therefore ran 12x faster than the original, inflating planet-derived
score against combat-derived score — the exact ratio 3.2c retuned.

**Decision:** Add PLANTOCK to `SYSOP_OPTIONS` with canon default 360; deploy 120.

**Reason:** 4x slower than today and 3x faster than canon. Six-hour production
ticks suit a BBS people dialled into for hours, not a web game with daily logins;
120 keeps a daily visit meaningful without letting planet income dominate scoring.

**Alternatives rejected:** 360 (world feels static between logins); 30 (keeps the
scoring imbalance the original explicitly retuned).

---

## 2026-09-02 — UNIVWRAP implemented, defaulting to canon NO

**Context:** Canon ships UNIVWRAP=NO: `GEFUNCS.C:651-705` pins a ship at
+/-(univmax-2), calls `telezip()`, which zeroes speed and speed2b and adds
TELEDAM (17). The port always wrapped instead, teleporting the ship across the
galaxy at full speed for free. `TELEDAM = 17` was defined in `constants.ts` and
balance-tested but read by no runtime code.

**Decision:** Implement the mechanic and the sysop option; default to canon NO.

**Reason:** Running for the edge should be a dead end, not a free jump. The free
jump currently benefits Cybertrons chasing a player as much as the player fleeing,
so removing it is not simply harder on newcomers.

**Alternatives rejected:** Implementing it but defaulting to wrap (kinder to a
fleeing new player, but preserves the same free escape for pursuers); leaving it
unimplemented (TELEDAM stays dead code pinned by a test that guards nothing).

---

## 2026-09-02 — Colonists will eat (fixing an inherited original bug)

**Context:** `GEPLANET.C:221-230` debits food only for troops, then starves men
against that same stock. A colony with no garrison consumes zero food forever —
and food is what the user's guide sends new players to Tahanian Station to buy.

**Decision:** Fix it: debit `floor(men/100)` before the starvation test. Sequenced
AFTER the PLANTOCK decision and paired with a food-production retune.

**Reason:** Standing project rule — fidelity means the original's design, not its
defects. This one makes an entire documented supply chain inert and devalues one
of the two goods the starting hub exists to sell.

**Alternatives rejected:** Preserving it as a faithful reproduction — contradicts
the standing rule. Fixing it immediately and independently — production rate and
consumption multiply, so they must be retuned together.

## 2026-09-02 — Gold base price set to 1000, on wiki evidence only

**Context:** `baseprice[i] = numopt(ITMPR01+i,...)` is read at `GEMAIN.C:569`, but
the shipped `MBMGEMSG.MSG` contains **no ITMPR blocks at all** — that option family
was added to the code after the message file we have. So unlike MAXPL, ITEM_TONS,
ITEM_VALUE and MANHOURS, the base-price table cannot be recovered from canon.

Gold is the one entry that matters: it is the cash-to-gold rate at the Zygor bank
and therefore the whole reason to carry gold. The wiki disagrees with itself —
`sysop-options.md` (a direct option-block transcription from a later `.MSG`) and
`colonizing-planets.md` both say **1000**; `items.md` says **100**.

**Decision:** 1000.

**Reason:** Two independent sources against one, and the dissenting source is the
same `items.md` summary row that gives gold's cargo weight as 0.5 where canon says
2 — it is demonstrably unreliable on exactly this item. At 100, gold converts to
planetary cash at a tenth of the intended rate and the Zygor markup collapses with
it, removing most of the trade loop a new player uses to fund a first real ship.

**Alternatives rejected:** Keeping 100 (rests on the one source proven wrong here).
Leaving BASEPRICE out of the canon conformance test silently — instead the test
asserts positively that `MBMGEMSG.MSG` has no ITMPR blocks, so if a fuller message
file ever turns up, it fails and tells us to move BASEPRICE onto canon.

## 2026-09-03 — Message text comes from the shipped catalogue, not paraphrase

**Context:** A playtest found the port paraphrasing `.MSG` strings throughout.
Mechanics were correct in every case, but three paraphrases lost information a
player needs: `ZAPHIM1` names the **Enforcer Planet**, which is the only in-game
explanation of why the neutral zone is enforced; `NUMOOR` rendered a negative
bound as "(-180-180)", reading as one negative number; `ORBIT1` carries the
plnum *and* the name, and the number is what you type into `sca pl <n>`.

**Decision:** Use the shipped text verbatim where one exists. Invent wording only
where the port adds a feature canon does not have.

**Reason:** The `.MSG` file is canon at the same level as the C. Paraphrasing is
a silent deviation with no record, and it had already cost three pieces of
information nobody noticed losing.

**Alternatives rejected:** Rewriting for clarity — the playtest proposed rewording
`GRAVITY1` to teach orbit range in situ. That is an invention, and canon's
`ORBIT2` deliberately gives no distance; the gravity bands are how the range is
learned. Rejected as a deviation dressed as a fix.

---

## 2026-09-03 — Striking the galactic perimeter no longer strands you in hyperspace

**Context:** `telezip` (GEFUNCS.C:819-833) zeroes `speed` and `speed2b` and adds
TELEDAM, but never calls `hyperspace(ptr,usrn,0)`. The only exit transition
(GEFUNCS.C:537-539) requires `speed/1000 >= 1`, which a dead stop makes
impossible. A ship that hits the perimeter at warp is therefore flagged as being
in hyperspace, at zero speed, permanently — and every `where === 1` gate in the
game continues to treat it as warping.

**Decision:** Drop the ship out of hyperspace when telezip fires.

**Reason:** This is an oversight in the original, not a design. The escape in
canon is to `war 1` and then `war 0` again, which no player would deduce, and
the state is otherwise permanent. Standing rule: the original's defects are
fixed, not reproduced.

**Alternatives rejected:** Reproducing it faithfully and hinting at the escape in
the message — that documents a bug rather than fixing it.
