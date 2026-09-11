# Architecture Decisions

Format: decision, Context, Reason, Alternatives rejected.

**This log is append-only.** Entries are never rewritten. When a decision stops
being true, it gains a quoted marker directly under its heading rather than an
edit to its body:

- **SUPERSEDED** / **NO LONGER IN FORCE** — the code has moved on.
- **RESOLVED** — a declared deviation has since been closed.
- **CORRECTION** — the entry asserted something about CANON that was never true.
  These are worth reading twice: a wrong belief about the original is what tends
  to steer the code wrong in the first place.

---

<!-- TOC -->
## Contents

Newest last. Every entry carries context, reasoning and the alternatives that
were rejected — the last of those is usually the part worth reading.

- [2026-08-31 — the galaxy is centred on the origin, superseding the 0-based grid](#2026-08-31-the-galaxy-is-centred-on-the-origin-superseding-the-0-based-grid)
- [2026-09-08 — A destroyed hull logs its full manifest, and why it died](#2026-09-08--a-destroyed-hull-logs-its-full-manifest-and-why-it-died)
- [2026-09-08 — WebSocket only; no long-polling fallback](#2026-09-08--websocket-only-no-long-polling-fallback)
- [2026-09-08 — `pln`'s heading is ours; its data row stays canon's](#2026-09-08--plns-heading-is-ours-its-data-row-stays-canons)
- [2026-09-08 — AI population scales with UNIVMAX; HYPDST1/HYPDST2 wired](#2026-09-08--ai-population-scales-with-univmax-hypdst1hypdst2-wired)
- [2026-09-08 — Eight surviving hand-written lines go back to canon, even where ours said more](#2026-09-08--eight-surviving-hand-written-lines-go-back-to-canon-even-where-ours-said-more)
- [2026-09-05 — Invented text is replaced with canon; a branch canon lacks is deleted, not reworded](#2026-09-05--invented-text-is-replaced-with-canon-a-branch-canon-lacks-is-deleted-not-reworded)
- [2026-09-05 — Midnight maintenance runs on a named game timezone, not the host's](#2026-09-05--midnight-maintenance-runs-on-a-named-game-timezone-not-the-hosts)
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
- [2026-09-05 — PLANTOCK restored to canon's 360](#2026-09-05--plantock-restored-to-canons-360-supersedes-the-120-decision)
- [2026-09-04 — PLTVCASH restored to canon](#2026-09-04--pltvcash-restored-to-canon-supersedes-the-entry-below)
- [2026-09-04 — The wormhole 'W' on the sector scan is ours](#2026-09-04--the-wormhole-w-on-the-sector-scan-is-ours)
- [2026-09-04 — Planet precedence on `sca se` follows canon, planets last](#2026-09-04--planet-precedence-on-sca-se-follows-canon-planets-last)
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
- [2026-09-07 — Email as the login credential, with a partial lower() unique index](#2026-09-07-email-as-the-login-credential-with-a-partial-lower-unique-index)
- [2026-09-07 — Two-step registration and the nullable username guarded by WsAuthGuard](#2026-09-07-two-step-registration-and-the-nullable-username-guarded-by-wsauthguard)
- [2026-09-07 — Logout is site chrome, not a game command](#2026-09-07-logout-is-site-chrome-not-a-game-command)
- [2026-09-07 — The roster query is extracted from `ros`, not from `rank-roster.ts`](#2026-09-07-the-roster-query-is-extracted-from-ros-not-from-rank-rosterts)
- [2026-09-07 — The 10-day abandoned-signup sweep is PORT-ORIGINAL](#2026-09-07-the-10-day-abandoned-signup-sweep-is-port-original)
- [2026-09-07 — `SCRFACT` is wired and kept at 100, a declared deviation from canon 35](#2026-09-07-scrfact-is-wired-and-kept-at-100-a-declared-deviation-from-canon-35)
- [2026-09-08 — `SCRFACT` returns to canon 35 (AMENDS 2026-09-07)](#2026-09-08-scrfact-returns-to-canon-35-amends-2026-09-07)
- [2026-09-07 — The container never shipped the sysop tuning file](#2026-09-07-the-container-never-shipped-the-sysop-tuning-file)

<!-- /TOC -->

## 2026-08-31 — the galaxy is centred on the origin, superseding the 0-based grid

> **SUPERSEDED 2026-09-05 (value only).** The Decision below fixes `UNIVMAX` at 10
> (441 sectors). The deployed value is **100** — 201x201 = 40,401 sectors
> (`backend/config/game.config.json`). The origin-centred shape this entry
> establishes still stands; only the size moved.

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

> **REVERSED 2026-09-05** along with the autopilot itself. See D1 below.

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

> **CORRECTION 2026-09-05.** The parenthetical below calls 100 "the original
> default" for `SCRFACT`. The bounds are right (GEMAIN.C:603) but the shipped
> default is **35** (`GE/REL/MBMGEMSG.MSG`). 100 was our choice, not canon's.

**Context**: Three decisions made during feature 019 implementation.

**Decision 1 — `score_f2 = 100` default**: `SCORE_F2` env var, range `[0, 32700]`, default 100 (matching GEMAIN.C:603 `numopt(SCRFACT, 0, 32700)` with the original default). Balance regression test in `constants.spec.ts` pins this. Out-of-range throws at module init.

**Decision 2 — Cybertron kill counter via event emission**: `PlayerScoreService` emits `CYBERTRON_SCORED_KILL` instead of calling `CybertronRepository.incrementKills` directly. This breaks the `PlayerScoreModule → CybertronModule → CombatModule → PlayerScoreModule` circular dependency that would cause NestJS DI timing failures (providers instantiated before dependencies resolved with nested `forwardRef`). `CybertronTickService` consumes the event.

**Decision 3 — Mutual-kill attacker snapshot**: In `CombatTickService.runKillResolution`, each victim's `attackerUserid` is captured from a pre-removal snapshot BEFORE any `removeFromGame()` runs. This ensures a Cybertron that kills and is killed on the same tick still has its kill attributed correctly.

**Alternatives rejected**: `forwardRef` on all legs of the `PlayerScoreModule → CybertronModule` cycle — this initially appeared to work but caused `CybertronRepository.this.prisma` to be `undefined` in `onApplicationBootstrap` due to NestJS DI instantiation ordering with deeply nested `forwardRef`. EventEmitter decoupling is the correct pattern for breaking score → AI cycles.

---

## 2026-05-08 — Team creation: auto-assigned teamcode + single plaintext password

> **NO LONGER IN FORCE 2026-09-05.** Both halves were reverted. The founder
> `secret` is back (`schema.prisma:327`, `team.service.ts:80`), so the
> secret/password distinction stands; and the password limit is **10**, not 8
> (`team.types.ts:32`), which is what canon does (GECMDS.C:5702).

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

> **PARTLY SUPERSEDED 2026-09-05.** Only the one-ship branch survives. Zero ships
> no longer disconnects with NO_SHIP — it enters onboarding and prompts for a
> ship name (`game.gateway.ts:444`); two or more no longer binds the lowest
> shipno — it emits `prompt:ship-select` and waits.

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

> **BOTH DEVIATIONS RESOLVED 2026-09-05.** Wormhole destinations are no longer
> clamped to a 0..29 / 0..14 box — they are drawn across the whole origin-centred
> square, as C does (`galaxy.service.ts:324`). And the `s00` fixture is no longer
> hand-authored: the canon data IS in the reference source (`S00PLNUM` and the
> `S00P1..S00P6` blocks of `MBMGEMSG.MSG`) and is now generated from it by
> `tools/extract-s00.mjs`.

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

> **SUPERSEDED 2026-09-05.** `PlanetTickService` no longer processes exactly one
> planet per firing; it sweeps up to `MAXTIC` per `PLANTIME`, so each planet is
> updated once per `PLANTOCK` (canon 360 minutes). See `planet-tick.service.ts:38`.

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

> **CORRECTION 2026-09-05.** The guard does not use `crypto.timingSafeEqual` —
> there is no such call under `backend/src`. It defines its own
> `constantTimeEqual` (`admin-token.guard.ts:44`). The property the entry argues
> for holds; the mechanism named does not exist.

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

> **NO LONGER IN FORCE 2026-09-05.** `ROSTER_MAX` is gone. The roster cap is the
> canon `MAXLIST` sysop option (default 10), imported from `constants.ts`
> (`ros.handler.ts:37`), so the env-var-versus-ConfigService question is moot.

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

> **CORRECTION 2026-09-05.** The DI/env/bounds description of `CLOAK_ENERGY_USE`
> still holds, but its default is **7500** — canon's `CLENGUSE` — not 50
> (`cloak.config.ts:25`).

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

> **AMENDED 2026-09-05.** Two corrections, and an owner ruling.
>
> It is no longer *instead of* — it is *as well as*. `tra up`/`tra down` move
> cargo between the ship and the planet it orbits, exactly as canon does, and
> carry canon's own text (TRANSFR1/2/5, TRANSUP1/5). Ship-to-ship is an
> ADDITION on top of that.
>
> The Reason below is also wrong: `buy`/`sell` trade with a planet's SHOP at its
> prices, which is not the same act as moving your own cargo down to a colony
> you own. It never covered the planet path.
>
> **Ship-to-ship is not canon in any form** — not the strings, the feature.
> Three independent confirmations: the command table has only `tra`
> (GECMDS.C:120-171); `cmd_transfer` branches on `"up"`/`"down"` alone
> (GECMDS.C:3283-3295); and HLPTRA reads "from your ship to a newly established
> planet, or from a planet to your ship".
>
> **Owner ruling 2026-09-05: keep it.** It is therefore a deliberate,
> recorded deviation rather than an undocumented one, which is what CLAUDE.md
> requires. Its own strings stay too, since canon has no words for a feature it
> does not have. Behaviour is pinned by
> `test/game/commands/handlers/transfer-qty-capacity.spec.ts` — quantity,
> receiving-hold capacity, and the guarantee that it is player-to-player only
> (AI hulls are GESTAT_AUTO and never resolve as a target).
>
> **Known gap, parked as low priority:** `hel transfer` serves canon's HLPTRA,
> which describes the planet legs only, so the help contradicts a feature we
> ship. Ship-to-ship is documented under `hel trade`.

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

> **REVERSED 2026-09-05.** The autopilot is gone and so are both columns
> (migration `20260905134143_drop_autopilot_nav_target`). The premise below —
> "without adding a new DB column" — was not met: it added two. And reusing
> `holdcourse` was the wrong field to borrow: it is a DROID timer in canon,
> set by GEDROIDS.C and GECYBS.C for wander and evade, and no player path
> touches it. `nav` is now what `cmd_navigate` is, a bearing report.
> The entry is kept because the log is append-only. See also the 2026-08-31
> entry above, which patched this feature and is reversed with it.

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

## 2026-05-08 — `mai` keyword dispatcher pattern (feature 017) — SUPERSEDED 2026-09-03

> **Superseded.** `mai` is the maintenance command and nothing else; the mailbox
> moved to `rea`. See "2026-09-03 — `mai` is maintenance, `rea` is the mailbox"
> at the end of this file. The reasoning below stands as a record of why the
> split existed, not as current behaviour.


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

> **CORRECTION 2026-09-05.** The Context calls the Murdonian Transport "the
> designed new-player PvE target". It is not, and this is a claim about the
> original rather than about our code, so it was never true. The Murdonian is
> 30,000 tons and carries a Mark-2 shield; a stock Interceptor cannot scratch
> it. The starter target is the **Vakory Survey Drone** (class 33, 100 tons).
> See the droid section of CLAUDE.md, which records this error twice over.

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

## 2026-09-05 — PLANTOCK restored to canon's 360 (supersedes the 120 decision)
**Context:** PLANTOCK was deployed at 120 minutes against canon's 360, argued as
"six-hour ticks suit a BBS people dialled into for hours, not a web game with
daily logins". The owner then ran the first real colony operation and produced
the data that argument lacked: two stocked worlds at 1.75x, ~250,000 credits
invested and a handful of small fights, yielding roughly 320,000 credits a DAY.
**Decision:** PLANTOCK = 360, canon. Removed from config/game.config.json
entirely rather than pinned to the canon value — that file holds deviations, and
an entry equal to canon is noise that makes it look authoritative over numbers
nobody chose.
**Reason:** The 120-minute case assumes a short game. This is a persistent 24/7
world, which is the owner's own framing: "the only reason to make planets faster
would be if the game was over a short period of time... but I want long running
games". Wealth that compounds in real days trivialises the mid game, and the
compounding is real — production is linear in men and men produce men, so a
colony grows ~1.46% per tick forever.
**Consequence:** Colony output drops 3x. Combined with PLTVCASH returning to
canon earlier the same day, planet-derived SCORE is now negligible against
combat: a Cybertron Scout pays 1,000 points in about ninety seconds, two mature
colonies pay roughly 3 points a day. That is canon's balance, and it is now
visible rather than assumed.
**Alternatives rejected:** Keeping 120 as a quality-of-life deviation — it is
the last economic knob off canon, and the owner asked for canon. Slowing
PLTVCASH instead — already at canon, and it is not what makes colonies
attractive or otherwise.

## 2026-09-04 — PLTVCASH restored to canon (supersedes the entry below)
**Context:** The 2026-09-01 entry chose PLTVCASH = 1000 because "the original's
shipped values are not in the source — they came from the sysop's option file,
which we do not have". That was true when written. It stopped being true on
2026-09-02, when the full 3.2e distribution was vendored: `GE/REL/MBMGEMSG.MSG`
IS that option file, and it says
`PLTVCASH {The point value of each 1,000,000 : 10}` (line 1831).
**Decision:** PLTVCASH = **10**, canon. PLTVDIV stays 10000, which the same
file confirms was already right.
**Reason:** The project rule allows deviations only when justified by something
other than "we could not find the canonical value". Ours was justified by
exactly that, so it expired the moment the value was found. At 1000 we paid one
point per 1,000 credits banked; canon pays one per 100,000 — we were awarding a
hundred times canon for the same planet.
**Consequence:** Planet scores earned under the old constant are not comparable
with new ones. Applied ahead of a world reset for that reason.
**Alternatives rejected:** Keeping 1000 as a deliberate deviation — the round-6
report argued the colony route is under-rewarded and this looks like support for
that, but we were already paying 100x and it still read as thin, so the score
multiplier is not what makes colonies unattractive. Changing it would have been
tuning the wrong number, and away from canon.

## 2026-09-01 — PLTVCASH and PLTVDIV are chosen sysop values (SUPERSEDED 2026-09-04)
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

> **CORRECTION 2026-09-05.** The count below says 20 options sat exactly on a
> clamp bound. Whatever the tally, one example given is wrong: `PFIRDST`'s
> shipped value is **5** (`MBMGEMSG.MSG:417`), and the port's old 1 was the clamp
> FLOOR. The entry's argument is unaffected — that is one more option that had
> been pinned to a bound rather than to canon.

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

> **CORRECTION 2026-09-05.** The entry dismisses `reference/wiki/items.md` partly
> because it "gives gold's cargo weight as 0.5". That figure is RIGHT:
> `ITMWT13 {Weight of 100 Gold: 50}` (`MBMGEMSG.MSG:1188`) is per hundred, so 0.5
> per unit. The forbidden `GE/MSG/` copy is the one that says 200. The wiki row
> agreeing with canon is not evidence against the wiki.

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

## 2026-09-03 — Ship-loss mail, and the autopilot answers stop

> **CORRECTION 2026-09-05.** "our own documentation pointed new players at the
> Murdonian when the tonnage arithmetic says Scow" — the arithmetic says neither.
> A stock Interceptor strips 12 against the Scow's 18 regen and can never get
> through it either. The only target it can kill is the **Vakory Survey Drone**.

Three questions the playtest raised that canon could not settle directly. Each
was decided from what the surrounding code shows the original INTENDED, not
from preference.

### Ship-loss mail — implemented

**Context:** A ship destroyed while its captain is logged off leaves no trace
they can ever see. There is no canon to violate: `warhupa` sets
`status = GESTAT_AVAIL` on hangup (GEMAIN.C:1398-1440), so a hung-up ship is not
in the universe and cannot be shot. Our 24/7 persistent world creates the event.
Every shipped mail type (MESG02-MESG20, MESG30) is a planet event; there is no
ship-loss message because canon never needs one.

**Decision:** Mail the victim, following the established distress-mail shape.
Type 40, numbered outside canon's range so it can never collide.

**Reason:** Canon does not say what to do about ship loss, but it says clearly
what mail is FOR. Every distress message has the same form — *"Distress message
from %s in Sector %d %d, <what happened>"* — covering a planet attacked
(MESG02), starving (MESG06/07) or in revolt (MESG30). All report something that
happened to your property on the server's clock rather than yours. A ship lost
while you were away is exactly that shape, so this applies an existing mechanism
rather than inventing one.

**Alternatives rejected:** Removing logged-off ships from the universe per
`warhupa` — faithful, but it contradicts the persistent world, which is a
deliberate and documented deviation. Doing nothing — the event is invisible, and
a player who returns to a missing ship has no way to learn what happened.

### Droids near the neutral zone — no change

**Context:** A playtest colonist lost four hulls in 75 minutes to droids while
shuttling near the neutral zone, raising the question of whether the starter
zone should be protected.

**Decision:** Change nothing.

**Reason:** Canon places them there deliberately. Droid spawn placement is
clamped in a large galaxy — `xcoord = rndm(39.9) - 19.8` (GEDROIDS.C:131-140) —
so at our UNIVMAX of 100 droids appear only within about twenty sectors of the
origin. Cybertrons get no such clamp (`rndm(univmax*2) - univmax`,
GECYBS.C:158) and scatter galaxy-wide. That is a designed split: droids are the
accessible PvE content, placed where the players are, and Cybertrons are the
roaming threat. Droids in the starter zone are the intended prey.

The deaths had two other causes, both since fixed: the pilot could not read the
fight (shield charge and drop were silent), and our own documentation pointed
new players at the Murdonian when the tonnage arithmetic says Scow.

**Alternatives rejected:** Keeping droids out of sectors adjacent to the
neutral zone, or having them ignore zero-kill class-1 hulls — both would delete
the new-player content canon went out of its way to position.

### Autopilot stops on arrival — changed

**Context:** `nav` reached its target, disengaged the helm and left the throttle
open, so the ship sailed through its destination.

**Decision:** Cut the engines on arrival (`speed2b = 0`).

**Reason:** No canon precedent exists — `nav` in the original is a read-only
bearing report (GECMDS.C:5109-5157), and `holdcourse`, whose field we borrowed,
is AI-only and means "hold this heading for N ticks, then re-decide"
(GECYBS.C:318, GEDROIDS.C:328). The deciding evidence was our own arrival
message: *"Cut speed with war 0 / imp 0"* — whoever wrote it knew the ship kept
flying and pushed the problem onto the pilot. At warp 9 a sector takes 43
seconds to cross, so reading the notice and then reacting means overshooting. An
autopilot exists to remove exactly that work.

**Alternatives rejected:** Leaving it, on the argument that arriving under power
is closer to flying manually. That is sophistry: the feature already removes the
steering, and stopping is the part that matters at speed.

## 2026-09-03 — Autopilot arrival is a final-leg test, not a fixed shell

**Context:** Round-3 playtest split three ways on whether `nav` could arrive at
all. Two personas reported clean warp-9 arrivals; one reported the ship
ping-ponging across the target forever, flipping 180 degrees every tick while
`rep nav` kept claiming warp 5. Both were true.

**Decision:** Arrival fires when the ship is inside the 250-unit shell **or**
when this tick's travel reaches the target, and in that second case the final
leg is truncated to the remaining distance rather than a whole tick.

**Reason:** A tick moves `speed * 10000 / COORD_SCALE` raw units — 154 at warp 1,
769 at warp 5, 1385 at warp 9 — against a 250-unit shell. Whenever the remaining
distance fell in `(250, travel - 250)` the ship stepped clean over the shell,
re-pointed at the target it had just passed, and repeated. Warp 1 is the one
speed slow enough that every step lands inside, which is why the same trip
arrived first try at `war 1` and the bug read as "autopilot only works at warp 1".
Whether it worked at warp 9 was pure luck of phase — hence three personas, three
different answers. Truncating the last step never moves the ship further than
the physics already would, and it is the only way to end up inside orbit range
of the place you asked to be taken to rather than up to 1385 units past it.

**Alternatives rejected:** Scaling the shell to `travel * 0.6` — still leaves the
ship stopped most of a tick short at high warp, i.e. outside orbit range of its
own destination. Detecting overshoot by dot product — same outcome, one tick later.

## 2026-09-03 — `rep nav` keeps canon's terse orbit branch

**Context:** Three round-3 personas independently filed the same complaint: `rot`
works in orbit and answers "Now turning to 173 degrees", but the `rep nav` that
follows prints neither Heading nor Speed, so the pilot cannot see the rotation
land. One noted that `pha <deg>` is aimed relative to heading
(GECMDS.C:940 `normal(ptr->heading + ptr->degrees)`) and that `cmd_phas` has no
`where` gate — so you can fire from orbit, aiming off a number the report hides.

**Decision:** No change. Our report already matches canon exactly.

**Reason:** `cmd_report`'s nav branch is three explicit cases with three
deliberately different field lists (GECMDS.C:1965-1990): hyperspace prints
REP02/REP03/REP04 (sector, speed, heading), free flight prints REP05/REP06/REP07,
and orbit prints REP08 alone — planet number and sector — before all three fall
through to REP32's position line. `heading` is computed at the top of the
function and is available to the orbit branch; the author chose not to print it.
That is a design choice, not an oversight, and nothing computes wrong. Under the
project's precedence rule the classic game wins unless it is malfunctioning.

**Alternatives rejected:** Adding Heading to the orbit branch on usability
grounds. The gap the personas actually hit — "did my rotation take?" — is already
answered by `rot`'s own reply, which is itself canon.

## 2026-09-03 — Droid "unprovoked" fire is canon crossfire; no change

**Context:** The round-3 hunter persona was hit twice for ~50% hull by Trans-Gal
Murdonians on a hull that had never fired a shot, and wrote it up as an
unprovoked-aggression defect — then could not reproduce it: a fresh class-32
spawned 2,000 units away and left alone for 60 seconds never fired.

**Decision:** No change. Both the AI gate and the beam sweep are already faithful.

**Reason:** The fight-back gate is canon and correctly ported —
GEDROIDS.C:340 `if (ptr->cantexit > 0 && ptr->lastfired >= 0)`, mirrored at
`droid-act-class-11.ts:99`. What the persona was standing in was someone else's
beam: canon's `firep` damages EVERY ship inside the arc, not an intended target
(GECMDS.C:944-960 loops `for (othusn=0; othusn < nships; othusn++)` and hits
anything within `smallest(heading,deg) < ptr->percent+PHABIAS`), and
`phaser.handler.ts:219-245` sweeps `allShips` the same way. Their own logs show
another player being destroyed by Trans-Gal #2193 in the same sector seconds
before the shot that hit them.

**Alternatives rejected:** Telling the bystander whose fight they walked into.
Canon prints PHITYOU and nothing more, and the attacker's name — which PHITYOU
already carries — is the whole of what canon offers. Adding an explanation line
would be a port invention on a case canon deliberately leaves bare.


## 2026-09-03 — `mai` is maintenance, `rea` is the mailbox

**Context:** Round-3 playtest. A pilot in orbit at Zygor with a hull at 98%
damage and shields destroyed typed `mai` and got a mail listing; nothing
repaired. Adding ANY argument routed to maintenance instead — `mai 1`, `mai
none` and `mai repair` all worked, because the argument was never parsed, only
counted. `hel` listed neither command and `hel mai` answered "Unknown help
topic". They found repair by reading the C source.

**Decision:** `mai` always performs maintenance, taking an optional planet
PASSWORD. The mailbox listing moves to bare `rea`; `rea <n>` still reads one
message.

**Reason:** Canon is not ambiguous. `GECMDS.C:144` is `{"mai", cmd_maint, 1}`,
and `cmd_maint`'s only optional `argv[1]` is the planet password
(GECMDS.C:4477-4479). There is no mail command anywhere in canon's table,
because MajorBBS mail lived outside the game — so the mailbox is port-original
and has no claim on a canon keyword. `rea` is likewise not a canon keyword and
was already half the mailbox, which makes it the honest home for the other half.

**Alternatives rejected:** Keeping the arg-count split and documenting it. The
split is what produced the bug: the discriminator was an argument the command
also legitimately takes, so `mai <password>` — the canon invocation — was the
one form guaranteed to do the wrong thing.

## 2026-09-03 — Three port-original lines the canon does not have

**Context:** Three small pieces of narration added during the round-3 fix pass
have no canon equivalent, and CLAUDE.md requires deliberate deviations to be
written down rather than left as code comments.

**Decision:** Keep all three; record them here.

1. **The maintenance receipt.** Canon prints MAINT5 with the repair queue length
   and never says what it charged (GECMDS.C:4516-4518), so three accidental
   `mai` calls cost a playtester 7,500 credits with no indication. We add one
   line naming the charge.
2. **The nav helm line.** Canon's `cmd_navigate` emits exactly one message,
   NAV01 (GECMDS.C:5154). Ours adds that the helm is coming onto course,
   because our `nav` — unlike canon's — engages an autopilot that turns the
   ship, which is why an identical second `nav` from a standstill answered with
   a different bearing.
3. **The ship-loss notice on re-entry.** Canon cannot reach this state at all:
   `warhupa` sets GESTAT_AVAIL on hangup (GEMAIN.C:1434), so an offline ship is
   not in the universe and cannot be killed. Our world keeps flying, so a pilot
   can be destroyed between sessions and needs telling.

**Reason:** Each covers a gap our own deviations created, or an omission that
cost a real playtester real credits. None changes a number.

**Alternatives rejected:** Adding a shield percentage to the deflection line —
a fourth invention, on a case canon deliberately leaves bare. `sca sh` already
reports shield state and is now named in `hel combat`.

## 2026-09-03 — Scrubbing `lastfired` on logout is ours, not canon's

**Context:** `ShipStateService.leave` clears every `lastfired` pointing at a
freed channel, citing GEFUNCS.C:1224-1225 as canon doing the same. It is not:
those lines are inside `killem` and clear references to a ship that just DIED,
so a corpse cannot award points. `warhupa` scrubs nothing on a clean disconnect
(GEMAIN.C:1410-1432).

**Decision:** Keep the scrub. Correct the citation and record the cost.

**Reason:** Our channel recycling is denser than canon's, so a stale `lastfired`
pointing at a freed channel would hand an old grudge — and its kill credit — to
whoever came in next. Canon lives with that; under "we fix bugs, not just go
with the flow", we do not.

**Cost, stated plainly:** a killer who logs off in the same tick as their
victim's death becomes unattributable, and the ship-loss mail falls back to "an
unknown assailant". Closing that properly means carrying the attacker's NAME on
the victim's state at the moment damage lands, rather than re-resolving a
channel later. Not done; it is a narrow window and the rest of the attribution
path was rewritten this session.

## 2026-09-03 — NUMMINES is a galaxy-wide mine table, enforced in MineRegistry

> **DEVIATION RESOLVED 2026-09-05.** The declared deviation — the table-full case
> surfacing as the gateway's generic "Internal error" — no longer applies:
> `mine.handler.ts:102` catches `MineTableFullError` and answers with canon's
> own message.

**Context:** `NUMMINES` (canon default 12) was declared in `SYSOP_OPTIONS` but
read by nothing. The port enforced only the per-user `USRMINES` cap (3), so
five captains could field fifteen live mines where the original allows twelve
in the entire universe. The original allocates ONE mine table for the whole
game — `nummines = numopt(NUMMINES,1,200)` (GEMAIN.C:501), `mines =
(MINE *)alcmem(n=nummines*sizeof(MINE))` (GEMAIN.C:754) — and every mine
operation walks `i<nummines` over it.

**Decision:** `MineRegistry` now carries a fixed `capacity` read from the
resolved config at module load, exposes `isFull()`, and `add()` returns
`false` without inserting when every slot is taken. `MineRepository.create()`
consults the registry and rejects with `MineTableFullError` *before* writing
the row. `hydrate()` is deliberately exempt: a sysop who lowers NUMMINES
between boots must not silently lose mines already on the board — the table
simply refuses new ones until it drains.

**Reason:** `laymine()` (GECMDS.C:1785-1819) checks the per-user cap first and
then scans for a free slot, returning 0 on either failure. The load-bearing
half of that contract is what does NOT happen on failure: `--ptr->items[I_MINE]`
and `cantexit = FIRETICKS` both live inside the success branch
(GECMDS.C:1809-1814). Refusing at the persistence boundary, before the row
exists, preserves exactly that — the caller's post-create side effects never
run.

**Deviation declared:** the failure MESSAGE is not yet canon. The original
prints MINE2, "The mine launcher is temporarly jammed, Sir!"
(GECMDS.C:1779, GE/REL/MBMGEMSG.MSG:5814), for both the per-user cap and the
table-full case. Our per-user cap already returns `MIN_FULL`; the table-full
case surfaces as the gateway's generic "Internal error processing command."
line, because rendering `MIN_FULL` requires a `catch` in
`src/game/commands/handlers/mine.handler.ts`, which was outside this session's
ownership. The mechanic is correct and side-effect-free; only the wording is
wrong.

**Alternatives rejected:** enforcing inside `MineRegistry.add()` alone — the
handler creates the DB row *before* calling `add()`, so a silent refusal there
would leave an orphaned row and a spent mine. Enforcing in the handler — the
correct home for the message, but the file was not ours to edit, and putting
the budget only there would leave the droid and Cybertron mine-laying paths
unbounded.

## 2026-09-03 — The `implemented` flag is verified against the source tree

**Context:** `SYSOP_OPTIONS.implemented` is load-bearing: it is how a later
session decides whether a mechanic exists. It was guarded only by
`expect(wired.length).toBe(29)` in `test/unit/config/game-config.spec.ts`. An
audit found 14 of the 24 options marked `false` were in fact fully wired, and
the count test could not have caught any of it — flipping a flag in one
direction and forgetting another leaves the total unchanged, and a stale
`false` never moves it at all.

**Decision:** the count assertion is replaced by (a) an explicit NAMED list of
the nine unwired options, (b) a requirement that every unwired option carry a
`note` explaining what reads it in C and why nothing reads it here, and (c) a
structural test that walks `src/**/*.ts`, strips block and line comments, and
requires a real word-boundary reference to each option's constant — present for
every option marked implemented, absent for every option marked not. Options
whose constant is renamed on the way out of `constants.ts` now declare it
(`REPAIRRT → REPAIRRATE`) so the scan can find them.

**Reason:** a hand-maintained number is not a test of the property it claims to
protect. Stripping comments matters: `SCRFACT` and `S00PLNUM` are both named in
prose next to the hard-coded values that displaced them, and an un-stripped
scan would have called them wired.

**Alternatives rejected:** deleting the flag — it is the only record of which
canon knobs are inert, and the audit's value came from having it. A ts-morph or
TypeScript-compiler reference graph — more precise, but a much heavier
dependency for a check a regex over stripped source already performs
correctly; the test was verified to fail when a flag is flipped either way.

## 2026-09-03 — `lastfiredBy`: the killer's name is recorded when the damage lands

**Context:** two known gaps recorded earlier today, both now closed.

The first: a killer who logged off in the same tick as the kill went unnamed,
and the ship-loss mail read "destroyed by an unknown assailant" — a visible lie
in a message a player reads. `ShipStateService.leave()` scrubs every `lastfired`
pointing at a channel it is recycling. That scrub is port-original and right on
its own terms: our channels are recycled far more densely than canon's `usrnum`,
and a stale pointer hands an old grudge and its kill credit to the next
occupant. Canon scrubs only on DEATH (`GEFUNCS.C:1224-1225`, inside `killem`);
`warhupa` scrubs nothing on a clean disconnect (`GEMAIN.C:1410-1432`) and simply
lives with the mis-attribution. But the scrub also destroyed the only evidence
kill resolution had, because attribution re-resolved a channel at kill time.

The second: KILLEDBY was broadcast to every connected client. Canon sends it
with `outwar(FILTER, usrn, 0)` (`GEFUNCS.C:1117`), and FILTER is not decoration
— `outwar` hands it to `outprfge`, which drops the message for any recipient
with the option set: `if (class == FILTER && (warusroff(shpno)->options
[MSG_FILTER] == TRUE)) { clrprf(); return; }` (`GEMAIN.C:2562-2567`). Compare
`ALWAYS` at `GEMAIN.C:2557-2561`, which bypasses the check — the class YOURDEAD
and CHGLSR go out with. `MSG_FILTER` is option index 3 (`GEMAIN.H:236`).

**Decision:** every weapon that writes `lastfired` now also writes
`lastfiredBy = { channel, name }` on the victim, at the moment the damage lands.
The field is in-memory only and never persisted — it exists to survive a channel
scrub within a session, not a restart. `leave()` keeps scrubbing `lastfired` and
deliberately leaves `lastfiredBy` alone. A single reader,
`attackerNameFromLastFired` (`kill-resolution.ts`), decides when the recorded
name may be used: when the recorded channel still IS `lastfired`, or when
`lastfired` is NO_CHANNEL and nobody holds the recorded channel any more. Both
kill paths — the combat tick and the gateway's disconnect kill — fall back to it.

Separately, the KILLEDBY emit now excludes `user:<id>` rooms for every ship in
the map whose `msgFilter` is set, alongside the victim's own room. That is a
restoration of canon, not a deviation.

**Reason:** carrying the name forward is the only way to keep both properties.
Re-resolving the channel later cannot work once the channel is gone, and
dropping the scrub to make it work would restore the mis-attribution bug the
scrub exists to prevent.

**Alternatives rejected:** deferring the scrub by a tick — it makes correctness
depend on tick ordering, and a channel reissued inside that window still points
somewhere wrong. Persisting `lastfiredBy` — the whole grudge is session-scoped;
after a restart no channel means anything and the field would be a stale name
with no way to invalidate it. Trusting the recorded name whenever `lastfired` is
NO_CHANNEL — that mis-names a live pilot for a colony's kill, because `fireion`
sets `ptr->lastfired = -1` (`GEFUNCS.C:1797`) while the ship that last shot you
is still flying; the occupancy check is what separates the two cases.

---

## 2026-09-03 — The neutral zone is generated from the shipped `S00P*` blocks

**Context:** Feature 004's "Decision 3 — Neutral-zone `s00` table authored in code"
(above, dated 2026-05-02) rested on the premise that "the `.MSG` binary asset is not
present in `/reference/ge-source/`" and that the layout was therefore only recoverable
from the wiki. That premise is now false: `reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG`
is the shipped sysop option database, and it carries the whole table — `S00PLNUM` plus
`S00P1DEF..S00P9RES`, eight options per planet, read by GEMAIN.C:909-930 (`#define NPL 8`
at GEMAIN.C:905).

The hand-authored fixture was wrong in every field. It held five invented planets
(Zygor-3, Nexus Prime, Caldor IV, Minera, Draconis) at invented coordinates against six
shipped ones (Zygor, Tahanian Station, Enforcer Planet, Kayriez Portal, Lydorian Portal,
Tryklon Portal); it declared `S00_PLNUM = 5` against a shipped `S00PLNUM` of 6
(MBMGEMSG.MSG:550); it contained no wormhole portals at all, though three of the six
shipped entries are `type: 3`, which GEPLANET.C:517-520 dispatches to `build_worm`; and
it carried an invented environment legend — "0=Earth-like, 1=Arid, 2=Toxic, 3=Frozen" —
that ran backwards. `env` is a quality grade, not a biome: GECMDS.C:2337-2348 prints the
same four messages for `enviorn` and for `resource`, and MBMGEMSG.MSG:3570-3585 makes
them Poor / Marginal / Good / Very Good. GEPLANET.C:280 confirms the direction —
production scales with `(enviorn + resource + 2) * .25`, so 3 is the best grade, not the
worst. Under the old legend Zygor, the starter hub the original ships at env 3 / res 3,
was recorded as env 0 "Inferno-like".

**Decision:** `backend/src/game/galaxy/s00.ts` is now GENERATED by
`tools/extract-s00.mjs` from `GE/REL/MBMGEMSG.MSG` and pinned field by field by
`backend/test/balance/s00-canon.balance.spec.ts`, which re-parses the original itself
rather than importing the generator. `GalaxyService.generateOrigin` dispatches on each
entry's `type` exactly as GEPLANET.C:503-528 does — 1 → the Zygor weapons hub, 2 → the
Tahanian Station troops/men/food hub, 3 → a `Wormhole` row, anything else → a bare
planet — instead of the array-index dispatch it used before. This supersedes feature
004's Decision 3.

**Reason:** Hand-transcription is what produced the scanRange drift and the sysop-option
re-baseline, and it produced this too. The canon is on disk; generating from it and
pinning with a test that re-reads it is the only form that cannot rot.

**Deviations retained, both pre-existing:**
- **Owner.** The shipped `S00P*OWN` is `*EMPIRE*` on all six. The fixture stores
  `NEUTRAL_ZONE_OWNER` (`**neutral**`) instead, because this port resolves `userid`
  through a real `User` table where C only ever printed the string; the sentinel cannot
  collide with a `usr_<hex>` id. The balance test asserts BOTH sides of that mapping, so
  a change to either is caught.
- **Portal destinations.** GEPLANET.C:823-824 draws `rndm(univmax*2)-univmax`, which may
  land on the origin sector itself. The three neutral-zone portals use the same
  grid-bounded, self-loop-free draw as every other wormhole in the port
  (specs/004-galaxy-generator/research.md Decision 5), so a portal cannot dump a pilot
  back where they started.

**Alternatives rejected:** Correcting the six entries by hand in `s00.ts` — faster, and
exactly the method that produced the five wrong ones. Making `S00PLNUM` a live sysop
option so an operator can vary the count — the option is still `implemented: false` in
`game-config.ts` because the fixture is fixed; now that the fixture matches the shipped
default of 6 the flag is at least honest, and wiring it up is a separate change in
another owner's file.

## 2026-09-03 — AI annoyance messages come from canon, generated not transcribed

**Context:** `cyb_annoy` and `droid_annoy` were both partially ported. The plumbing
existed — a taunt event, a gateway listener that correctly addresses the taunted pilot,
a 1-in-N gate for droids — but the message TEXT on both sides was invented by an earlier
session (`taunt-pool.ts` had thirteen made-up lines; `droid-message-pool.ts` had twenty).
Worse, `cyb_annoy` was wired to only two of its five call sites, at one fixed rate, with
no notion of the per-class message families that release 3.2e introduced.

The reason this went unnoticed is a source-precedence trap. `GE/MSG/MBMGEMSG.MSG` is a
pre-3.2d snapshot carrying only a generic `CYBMSG1..19` set; the shipped 3.2e release is
`GE/REL/MBMGEMSG.MSG`, and only that copy has the `CYBBASEM..CYBLASTM` block of thirteen
16-message families plus `DRDMSG*`/`DRDHLP*`. Reading the stale copy makes the feature
look like it does not exist.

**Decision:**
1. `tools/extract-ai-taunts.mjs` parses `GE/REL/MBMGEMSG.MSG` and emits two generated
   modules — `backend/src/game/cybertron/cyb-taunt-catalog.generated.ts` (208 messages,
   keyed by class 21..33) and `backend/src/game/droid/droid-annoy-catalog.generated.ts`
   (25 messages, keyed by mnemonic). `backend/test/balance/ai-taunt-canon.balance.spec.ts`
   re-parses the original independently and compares character for character.
2. `cyb_annoy` now fires from all five canon call sites with their own odds and message
   bands: 1-in-60 over M1..M4 approaching (GECYBS.C:769), 1-in-30 over M5..M8 braking
   (GECYBS.C:782, 801), 1-in-20 over M9..M12 declining (GECYBS.C:300), 1-in-20 over
   M13..M16 attacking (GECYBS.C:295). The hyperwarp band is silent, as in canon.
3. Each Cybertron draws from its own class family via C's flat stride of 16. The <NONE>
   slots 26..30 still own a message block, which is exactly why the stride is flat.

**Reason:** The project rule is that canon is generated and pinned, never hand-typed —
hand-transcription is what produced the scanRange drift. Two hundred and eight strings is
well past the point where a human diff is trustworthy.

**Index basis, stated because this repo has had index-basis bugs:** C computes
`base = CYBBASEM + (shpclass - cyb_class) * 16` on a 0-based `shpclass` where `cyb_class`
is the 0-based index of the first CYBORG slot. Our `classNumber` is 1-based and the first
CYBORG slot is 21 (MBMGESHP.MSG `S21TYPE {..CYBORG}`). The DIFFERENCE is identical in both
bases, so there is no off-by-one correction — the arithmetic transfers unchanged.

**Deviations from canon, deliberate:**
- The taunt payload carries a `band` field (`APPROACH`/`BRAKE`/`DECLINE`/`ATTACK`) that
  canon has no equivalent of. It is observability only; the gateway forwards the payload
  wholesale and nothing branches on it.
- `DRDMSG7..DRDMSG10` exist in the message file but no `droid_annoy` call site references
  them. They are generated into the catalogue but not exposed in any droid pool, matching
  the shipped game's behaviour rather than the file's contents.
- Message bodies are stored with the literal `***` banner and interior newlines kept, and
  trailing whitespace and surrounding blank lines dropped — the same normalisation
  `src/game/commands/messages.ts` already applies to canon strings (see `NEW7`, `NEW10`).

**Alternatives rejected:** Keeping the invented text and only fixing the call sites — the
invented lines are generic, and the whole point of the 3.2e change was that a Cybertron
Base Star does not talk like a Sarten Attack Drone. Hand-transcribing the 208 messages —
see above.

## 2026-09-03 — MISSHRT reproduces C's `energy + MOVENGMIN` verbatim, overdraft and all

**Context:** `cmd_missl` gates the shot on the neutron flux pile:

```c
eng_flu = energy/misengfc;                                    /* GECMDS.C:1278 */
if (eng_flu > 0 && eng_flu >= (warsptr->energy+MOVENGMIN))    /* GECMDS.C:1280 */
    { prfmsg(MISSHRT); ... return; }
```

The port had no such gate. Implementing it forces a call on the `+`: the obvious
reading of the intent ("keep MOVENGMIN in reserve for the engines") is `-`, and
the shipped source says `+`, which does the opposite — it lets the shot leave the
pile up to `MOVENGMIN-1` in the red, and `warsptr->energy -= eng_flu`
(GECMDS.C:1312) duly takes it there.

**Decision:** Reproduce the `+` exactly. `missileFluxShort()` in
`backend/src/game/combat/combat-math.ts` returns
`fluxCost > 0 && fluxCost >= energy + MOVENGMIN`.

**Reason:** It is a design leniency, not a defect. `WARSHP.energy` is a `double`
(GEMAIN.H:334), so nothing wraps or overflows at negative values; the passive
recharge (GEFUNCS.C:1290-1300) climbs the pile back out; and the failure mode of
`ptr->energy < MOVENGMIN` is only that the ship stops accelerating (GEFUNCS.C:786,
MOVE4). Flipping the sign would make missiles strictly harder to fire than the
original permits — a balance change with no canon support. The related
`eng_flu > 0` short-circuit is kept for the same reason: with the shipped
`misengfc` of 100 (GE/REL/MBMGEMSG.MSG:349) any charge of 1..99 truncates to zero
flux and is never refused, however empty the pile.

**Alternatives rejected:** Reading `+` as a typo for `-` — that is exactly the
"our version is better balanced" case CLAUDE.md forbids. Clamping `energy` at 0
after the debit — invents a floor the C does not have and would silently change
how long a drained ship takes to recover.

**Not implemented, and out of this change's file ownership:** the canon rule at
GEFUNCS.C:504-521, where a ship crossing a warp band at or above `4 + gernd()%4`
zeroes every `lmissl[i].distance` tracking it and prints MISSL2
(GE/REL/MBMGEMSG.MSG:2630). That belongs to the acceleration step
(`physics-tick.service.ts` / `physics-math.ts`), not to any weapon command — the
ship that escapes is the missile's TARGET, and it escapes by accelerating rather
than by firing. The canon roll is available as `missileShakeWarp(rand)` in
`combat-math.ts`, tested, and deliberately not called from anywhere yet.

## 2026-09-03 — CLOK3 ion trail: canon logic implemented, delivery left behind a seam

> **BOTH RESOLVED 2026-09-05.** The seam is wired — `commands.module.ts:199` calls
> `setIonTrailObserverSource(...)`, so a cloaked ship opening the throttle does
> leak CLOK3. And the invented `'%s has decloaked.'` string is gone: the sector
> notice is canon's `CLOK2`.

**Context:** `cmd_impulse` has two canon behaviours the port never had. The
first, IMPULSE1 (GECMDS.C:495-500, GE/REL/MBMGEMSG.MSG:2900), is a pure gate and
is now implemented. The second, CLOK3 (GECMDS.C:524-546,
GE/REL/MBMGEMSG.MSG:2390-2392), is a cloaked ship leaking its bearing to every
captain in the game who is inside HALF of their own class's `scanrange` and is
not running a jammer. That audience is neither the sector nor the acting
captain, so it cannot be expressed as one `broadcasts` room, and computing it
needs the live ship list plus the ship-class `scanrange` table. `impulseCommand`
is a plain `Command` const with no injected services, and turning it into a
provider means editing `commands.module.ts` — outside this change's ownership.

**Decision:** Implement the trigger, audience and bearing exactly, as the
exported pure function `cloakIonTrailReports()` in `impulse.handler.ts`, and
have the handler call it through a module-level registration seam,
`setIonTrailObserverSource()`. With no source installed the handler emits
nothing, which is what the port did before. Wiring is one call in
`commands.module.ts` once a `scanrange`-bearing observer list is available.

**Reason:** Getting the audience wrong is worse than not shipping it. CLOK3 is
a survival mechanic on both sides — sending it to the sector would leak a
cloaked ship to captains canon leaves blind, and sending it to the mover would
tell them they had been detected, which canon never does. The logic is the part
that is easy to get wrong and easy to pin with tests; the delivery is
mechanical. Declaring the gap beats shipping a plausible-looking wrong audience.

**Deviation declared:** until the seam is wired, a cloaked player opening the
throttle leaks nothing. This is a known, deliberate absence, not a claim of
fidelity.

**Alternatives rejected:** Broadcasting CLOK3 to the sector room — wrong
audience in both directions, and cheap to mistake for correct. Adding an
observer-list field to `CommandContext` — `command.types.ts` is shared and
under concurrent edit this run. Reproducing the comment's "+- 10" slop instead
of the code's `gernd()%20 - 10` (which is -10..+9) — the comment is not canon,
the code is, and the asymmetry has no gameplay consequence.

**Also left unfixed, and outside this change's reach:** CLOK2, the de-cloak
warning, is delivered by `outrange(FILTER,&coord)` (GEMAIN.C:2621-2642) — every
player-class ship with `1 < distance*10000 < scanrange`, full range, no jammer
check. `cloak.handler.ts` still broadcasts it to the sector room with the
invented string `'%s has decloaked.'` rather than CLOK2's
"Sensors indicate a ship de-cloaking nearby Sir!" (GE/REL/MBMGEMSG.MSG:2385).
Fixing it needs the same class-`scanrange` lookup as CLOK3.

**Canon strings declared locally rather than in `messages.ts`:** `IMPULSE1` and
`CLOK3` in `impulse.handler.ts`, `CLOK1` in `cloak.handler.ts`. `messages.ts`
was frozen for this run; its `IMPULSE1` entry ("You cannot use impulse engines
in hyperspace.") and `CLOAK_HYPERSPACE` entry ("Cannot cloak while in
hyperspace.") are paraphrases and should be replaced with the shipped wording
when that file is next opened, at which point these locals fold back in.

## 2026-09-03 — Production-cap notice (MESG08+i) fires on the crossing only

**Context:** GEPLANET.C:313-326 mails the planet owner when a stock reaches its
ceiling: `if (plptr->items[i].qty <= max && temp >= max)` → `mail.class =
MAIL_CLASS_PRODRPT; mail.type = MESG08+i; mail.long1 = max`. `max` is
`(long)(maxpl[i]*fact)` (GEPLANET.C:295-297), and the very next statement clamps
the stock to it (GEPLANET.C:328-331). The port clamped silently and mailed
nothing, so a colony's factories shut down with no notice to the owner.

The notice belongs to `multiply()`, which runs from `plarti` — one planet per
kick, the whole galaxy in `PLANTOCK` (GEMAIN.C:2135, GEMAIN.C:656; PLANTOCK
default 360 minutes, GE/REL/MBMGEMSG.MSG:215). It is *not* a midnight event.
Our `PlanetTickService` already paces the economy the same way, so the notice is
sent from `PlanetEconomyService.applyTick` alongside the MESG06/MESG07
starvation mails.

**Decision:** Implement MESG08+i with canon's class, item mapping, recipient,
`long1` and cadence, but test the left-hand side with `<` where C has `<=`.

**Reason:** With `<=`, the test is true again on every subsequent pass, because
the stock was clamped to exactly `max`. A colony parked at its ceiling therefore
re-mails the identical notice once per PLANTOCK sweep, per capped slot — up to
14 messages every pass, against a 3-day retention window (MAILDAYS, GEMAIN.C:497).
The condition's own shape — a lower bound on the old value and an upper bound on
the new one — says the author meant "was below, now at or over"; `<=` is a
defect in an edge-trigger, not a design choice, since nothing about the game is
served by repeating a notice the player cannot act on. `<` is that edge trigger:
one notice per crossing, and a fresh one if the ceiling rises (it moves with
`fact`) and is reached again.

**Alternatives rejected:**
- *Reproduce `<=` faithfully.* Makes the inbox unusable, which is the one thing
  `mai`/`rea` exist for. Project rule: we do not reproduce defects.
- *Suppress with a per-planet "already warned" flag.* Needs new persistent
  state, and gets the "ceiling rose, then was reached again" case wrong.
- *Move the notice to the midnight job.* Quieter, but wrong: it would decouple
  the message from the clamp that causes it and from canon's `plarti` cadence.

## 2026-09-03 — MailStat.type numbers for MESG19A and MESG19B

**Context:** `MESG08+i` spans fourteen ids: MESG08..MESG19 for item slots 0-11,
then MESG19A (gold) and MESG19B (spies) — GE/REL/MBMGEMSG.MSG:4079-4176. Canon's
message compiler numbers them consecutively, so MESG19A/MESG19B occupy the two
slots immediately before MESG20. This port instead uses each message's *label*
number as `MailStat.type` (MESG06→6, MESG07→7, MESG30→30, MESG20→20), and
MESG19A/MESG19B have no numeric label to take.

**Decision:** Slots 0-11 take 8..19. Gold and spies take 190 and 191, declared
in `backend/src/game/mail/production-cap.ts`.

**Reason:** Continuing the run would put gold at 20, colliding with MESG20, the
nightly production report, which shares the same `MAIL_CLASS_PRODRPT` and is
already written to disk. `type` is a local discriminator with no wire or save
compatibility to the original, so the collision matters and the exact integers
do not.

**Alternatives rejected:**
- *Renumber MESG20 to 22, the canon-consistent value.* Orphans every production
  report already in the database.
- *Give cap notices their own mail class.* Contradicts GEPLANET.C:317, which
  explicitly sets `MAIL_CLASS_PRODRPT`.

---

## 2026-09-03 — `tea` gains members/kick/newpass/newname; founder password is generated, not chosen

**Context**: `GECMDS.C:5277 cmd_team` accepts nine sub-verbs. The port shipped only
`create` / `list` / `leave` / bare-join (see the 2026-05-06 entry). The four founder-gated
administration verbs — `members` (GECMDS.C:5565), `kick` (GECMDS.C:5614), `newpass`
(GECMDS.C:5682) and `newname` (GECMDS.C:5724) — were missing outright, and all three of
kick/newpass/newname authenticate against `teamtab[i].secret`, the founder password. The
2026-05-08 entry had removed the `secret`/`password` distinction, so there was nothing left
to authenticate against.

**Decision**:
1. Implement `members`, `kick`, `newpass`, `newname` with the canon `MBMGEMSG.MSG` strings
   (transcribed into `backend/src/game/team/team-messages.ts` with per-line citations).
2. Re-introduce the founder password, but **generated** at `tea create` rather than chosen:
   8 characters from an unambiguous alphabet, stored in the existing `Team.secret` column
   and displayed once using canon's TEAMCRT wording, including its "write this down, you
   will not be able to display it again" warning (GE/REL/MBMGEMSG.MSG:5866).
3. Add canon's verb spellings as aliases of the port's: `start`→`create`, `score`→`list`,
   `unjoin`→`leave`, and an explicit `join` keyword alongside the bare `tea <name> <pw>`.
4. `newname` also enforces name uniqueness, which canon's `newname` does not.
5. `dumpitout` (GECMDS.C:5766) is **not** implemented.

**Reason**:
- (2) is the minimum that makes the founder-gated verbs meaningful without a schema change:
  `Team.secret` already exists and is already written (as `''`). Generating it removes the
  original's out-of-band coordination burden, which is the same reasoning the 2026-05-08
  entry used to auto-assign the teamcode. Canon itself treats the founder password as
  write-once and undisplayable, so a generated one loses nothing.
- (4) is a bug fix, not a deviation from a design choice: `start` explicitly refuses a
  duplicate team name (GECMDS.C:5536) and `newname` writes the same field without
  re-checking. Two verbs disagreeing about the same invariant is an oversight, and this
  port's `LOWER(teamname)` unique index would have thrown a raw P2002 at the player anyway.
- (5) `dumpitout` prints every team's join password *and* founder secret to any player who
  types it, with no sysop gate — it is leftover debug scaffolding (it also falls through to
  `badfmt(TEAMFMT)` afterwards, so it was never a finished verb). Reproducing it would
  hand every player every team's credentials. Defect, not design.

**Deviations introduced (declared)**:
- Founder password is server-generated, not player-chosen (canon: `team start` takes it as
  an argument, GECMDS.C:5517).
- TEAMBPSS is rendered as "8 characters or less" rather than canon's "10", because this
  port caps team passwords at 8 (2026-05-08 entry, FR-011a). Its shipped typo "loo long"
  is also corrected to "too long" (GE/REL/MBMGEMSG.MSG:5936).
- The kick notification carries canon's topic ("Team Membership Revoked", GECMDS.C:5652)
  but not TEAMKYOU's body text, because the inbox renderer has no payload shape for it and
  `mail.types.ts` / `mail-render.ts` are outside this change's scope.
- Canon never sets `mail.class` on the kick path, so the port picks `MAIL_CLASS_MAXOUT` (2,
  GEMAIN.H:221) — the one canon class with no other producer here, so the notice is not
  mis-rendered as a distress signal or a production report.
- Teams created before this change have `secret = ''`; the founder gate treats an empty
  secret as unmatched, so their founders cannot use kick/newpass/newname.

**Alternatives rejected**: Asking the player for the founder password at `create` time
(ambiguous to parse — team names may contain spaces, and canon dodges this only by putting
the name last after a fixed-arity prefix). Authenticating on founder *userid* instead of a
password (needs a new `Team.founder` column and therefore a migration). Reusing
`MAIL_CLASS_DISTRESS` for the kick notice (renders as an attack, naming the kicker as an
attacking ship).

## 2026-09-03 — Team password cap returns to canon's 10

**Context:** `MAX_TEAM_PASSWORD_LENGTH` was 8, pinned by a balance test labelled
"FR-011a — documented deviation from original 10". The entry it pointed at
(2026-05-08, `mai` keyword era) justifies auto-assigned teamcodes and collapsing
`secret`/`password` into one column, and says nothing whatever about length.

**Decision:** 10, matching canon. `create` truncates; `newpass` refuses.

**Reason:** Written down is not the same as argued for. The project rule allows a
deviation that is deliberate, recorded AND justified by something other than "we
could not find the canonical value" — this one had a record with no argument in
it, and the effect was that a password a 1994 player could set was an error here.
Canon is `char password[11]` (GEMAIN.H:650) filled by
`strncpy(tmp.password, margv[4], 10)` (GECMDS.C:5518).

**Canon is inconsistent between the two paths, and that is reproduced rather
than smoothed over:** team CREATE truncates via `strncpy` and never complains,
while `newpass` explicitly checks `strlen(margv[3]) > 10` and answers TEAMBPSS
(GECMDS.C:5702-5706). Names truncate on both paths (`strncpy(..., 30)`,
GECMDS.C:5521, :5750) and are never refused for length.

**Alternatives rejected:** Keeping 8 and writing a real justification for it. No
justification exists — nothing about a web client makes a 9-character password
harder than an 8-character one.

## 2026-09-03 — Two AI-narration routing bugs, and a guard for the class

**Context:** Fixing the Cybertron taunts surfaced two delivery defects that
every existing test missed, because they all assert what is emitted and none
assert where.

**Decision:** One chained emit for the taunt; `user:<userid>` for the droid
annoy; a test that compares room-name namespaces built against namespaces joined.

**Reason:** Socket.io de-duplicates across rooms within a single `.emit()` but
not across two calls, so `to(user).emit()` followed by `to(sector).emit()` sent
every taunt twice to a target standing in the taunter's own sector — which is
where a Cybertron does its taunting, so it was the ordinary case. Separately,
`handleDroidAnnoy` addressed `to:<userid>:<shipno>`, a namespace nothing has
ever joined; it survived only because a droid is usually in its victim's sector
and the sector copy carried it.

The guard scans every `` `prefix:${...}` `` template in the gateway, not only
the ones written inline in a `.to(...)` — its first version did the latter and
missed the very bug it was written for, because the dead room was assigned to a
`const` first. Verified by planting the old name and watching it fail.

**Alternatives rejected:** Asserting exact room strings per handler. That pins
the current addressing rather than the invariant, and would not have caught a
namespace nobody joins.

## 2026-09-04 — Midnight no longer re-mails production reports

**Context:** `specs/009-midnight-job` FR-003 required the midnight pass to be
idempotent, then carved out an exception: *"the only legitimate difference is
duplicate production-report mail rows from the second run"*. The message number
was `Date.now() + loopIndex`, so every run inserted a fresh set.

Round 5 fired five nights through the real admin endpoint. One player finished
holding **36 copies of the same production report**, with their genuine
distress mail buried underneath it.

**Decision:** Derive the message number from the run date and the planet's own
identity, and insert with `skipDuplicates`. A same-day re-run now collides on
the primary key and inserts nothing. FR-003's carve-out is struck.

**Reason:** The carve-out had no justification attached — it recorded the
behaviour rather than arguing for it — and it contradicted CLAUDE.md, which
requires flatly that running the midnight job twice produce identical results.
Where a spec and CLAUDE.md disagree and the spec gives no reason, CLAUDE.md
wins. The observed cost settles it: mail is how the original told you your
empire was working, and a mailbox that buries a distress signal under 36 copies
of the same report is worse than one that sends nothing.

Canon cannot arbitrate. `gemidnighta` runs once per calendar day, so a second
same-day pass is a situation the original cannot reach.

**Note on the key.** The loop index was not usable as identity — the phase-2
planet query carries no `orderBy`, so row order is not stable between runs. The
key is `dayOrdinal * stride + planetKey`, with the x offset MULTIPLIED by the
span rather than added so that (3,-7) and (-7,3) stay distinct, and the stride
larger than any planetKey so message numbers keep increasing across days. The
mailbox lists by msgno DESC, so yesterday's last planet must not outrank
today's first.

**Alternatives rejected:** Blocking a same-day re-run outright at the admin
endpoint. That would have removed the ability to simulate multiple days in a
playtest, which is the thing that found this.

## 2026-09-04 — The autopilot is withdrawn

**Context:** `nav` in this port engaged an autopilot: it stored a target, the
physics tick steered `head2b` onto it every tick, and arrival cut the engines.
Canon's `cmd_navigate` is argument validation, `cdistance`, `cbearing`,
`prfmsg(NAV01)`, return (GECMDS.C:5109-5156). It never steers, never moves,
never holds a course.

**Decision:** Remove it. `nav` is a read-only bearing report, and NAV01 carries
the shipped text — *"Sector %d %d is bearing %d, distance %s."* — instead of the
invented *"Course set for… Set speed with war/imp."*

**Reason:** It was the most defect-prone thing in the codebase. Six fixes in its
short life: an arrival test on sector membership that broke onboarding, a fixed
250-unit arrival shell that made arrival impossible above warp 1, undocking a
captain who only asked for a bearing, a bare speed order cancelling a turn in
progress, `war`/`imp` misreporting the course, and finally plotting courses
straight through planets — which killed two round-5 players three times between
them, each obeying the instruction the game had just given them.

The recorded justification was *"An autopilot exists to remove exactly that
work"*. That is a UX preference, not a defence against the classic, and the
project's rule is that port-original behaviour must be defensible against the
classic or go.

Nothing is lost. `warp <speed> [course]` already takes a relative course, so the
canon loop is intact and is one command longer: `nav 5 5` reports the bearing,
`war 9 <bearing>` flies it, the pilot watches and stops. Steering is gameplay,
and a planet you fly into is then your own error — which is exactly the
relationship canon has with its own lethal gravity.

`holdcourse` stays on ShipState. It is canon's field, meaning "hold this heading
for N ticks, then re-decide", and it belongs to the AI (GECYBS.C:318,
GEDROIDS.C:328).

**Alternatives rejected:** Teaching the autopilot to route around planets. That
is more invented behaviour layered on invented behaviour, and every previous
layer has cost us a defect.

## 2026-09-04 — Gravity is gated on normal space and player ships

**Context:** Round 5, two players flew into planets at warp — three deaths — and
the owner's recollection of the original was that planets were never a hazard at
warp. They were right.

**Decision:** Call `gravity()` only when `where === 0 && status === GESTAT_USER`.

**Reason:** That is canon, exactly:

    /* Cybertrons ignore gravity */
    if (ptr->where == 0 && ptr->status == GESTAT_USER)
        gravity(ptr,usrn);

(GEFUNCS.C:794-795.) `where == 1` is hyperspace, i.e. at warp — canon does not
run the check there, so a warping ship cannot fly into a planet. The port called
`gravity()` on every move with neither condition, while citing those exact
lines. Two divergences from one missing `if`: players killed by planets at warp,
and AI ships subject to a pull the comment above the line explicitly exempts
them from.

The arithmetic says why canon skips it: the warning ladder is 250 units deep
(GRAVITY1 at 250, GRAVITY2 at 50, GRAVITY3 at 25) against 1,385 units of travel
per tick at warp 9, so all three warnings and the kill threshold fall inside a
single tick. It cannot function at speed.

**Alternatives rejected:** Widening the warning bands so they work at warp. That
invents a number to paper over a check canon does not run at all.

## 2026-09-04 — Three of the four revolt findings were canon; one was wrong

**Context:** Round 5 filed four P2 defects around planet revolt. Checked against
the C source, only one is real.

**REJECTED — `**Free**` ownership is canon.** `GEPLANET.C:377` does
`strcpy(plptr->userid,"**Free**")` on revolt, and the claim menu is gated on
`plptr->userid[0] == 0` (GECMDS.C:3485). `'*'` is not `0`, so a revolted world
is unclaimable via `adm` in the ORIGINAL too. Abandon is the only path that
truly clears ownership. Ours behaves identically. No change.

**REJECTED — a stale `User.planets` is canon.** Canon only ever INCREMENTS it,
at `GEMAIN.C:2911`, on claim. Nothing decrements it on revolt or abandon.
`gemidnighta` zeroes the counter (`tmpusr.planets = 0`, :1109) and re-increments
while walking owned worlds (:1139) — a nightly zero-and-recount, which is
exactly what our midnight does. The count is stale until the next night in the
original as well. No change.

**REJECTED — the Vakory drone does exist.** The finding said a player scanned
~15 sectors over three hours and never saw a class-33. The ship-loss mail says
otherwise: Vakory drones killed TEN players this round — SD-82144 four times,
SD-8220 three, SD-8269 twice, SD-8259 once — more than any other AI in the
galaxy. `DROID_MAX_PER_CLASS` is 2, matching canon's `S31MAKE`/`S32MAKE`/
`S33MAKE` of 2. The observation was wrong, and it is worth noting the "starter
target" is currently the single most lethal thing in the game by kill count.

**ACCEPTED — our help omits what canon's help says.** `MBMGEHLP.MSG:214` states
plainly that troops *"defend your planet from outside attacks and prevent
domestic revolts"*, and the surrounding block covers food, fighters and ion
cannons. Our `hel planet` listed the verbs and none of the consequences.

**Decision:** Restore the substance of that block to `hel planet`.

**Reason:** This is not coaching a player on tactics — the owner's standing rule
is that players should learn what works, as the AI does. It is text the original
ships, which we had dropped. Omitting canon's own documentation is a fidelity
gap, not a difficulty setting.

## 2026-09-04 — The wormhole 'W' on the sector scan is ours
**Context:** `sca se` draws a 'W' for each visible wormhole. Canon draws no
such marker: `scan_se` plots mines ('.'), ships (letters), self ('*') and
planets ('1'+i), and nothing else (GECMDS.C:2598-2634). Reviewing the scan
display turned this up as undocumented drift — exactly what the fidelity rules
exist to catch.
**Decision:** Keep the 'W', and record it here.
**Reason:** A wormhole is navigationally significant and otherwise invisible —
`orb` on one answers "You can't do that to a wormhole!!!", so a pilot can find
them only by trial. Canon's players had the printed manual and a decade of
folklore; ours have the screen. This is a deliberate accessibility deviation,
not a lost value.
**Alternatives rejected:** Dropping it for strict fidelity — it makes wormholes
undiscoverable in a port with no manual. Adding a `sca wh` mode instead — more
surface for the same information, and it would still be an invention.

## 2026-09-04 — Planet precedence on `sca se` follows canon, planets last
**Context:** The port drew planets early and gave the self-cell '*' the highest
precedence. Canon calls `map_planets()` LAST — GECMDS.C:2634, after the ships
loop and after the self-cell is written at :2631 — so a planet overwrites a
ship and even your own marker.
**Decision:** Adopt canon's order: mines -> ships -> self -> planets.
**Reason:** It reads wrong until you notice that a planet sharing your cell
means you are on top of it, which `rep` and `orb` both already tell you. The
rule is that canon wins where we merely find its behaviour surprising.
**Alternatives rejected:** Keeping self on top as a usability call — that is a
preference, not a defect in canon, and it was never written down. If it proves
genuinely confusing in play it can come back HERE as a justified deviation.

## 2026-09-05 — Midnight maintenance runs on a named game timezone, not the host's
**Context:** The nightly pass was `@Cron('0 0 * * *')` with no zone, so it fired
at server-local midnight. The host runs UTC, which put maintenance at 8pm ET —
inside the owner's play evening rather than after it.
**Decision:** A single `GAME_TIMEZONE` (`src/game/midnight/midnight-time.ts`,
default `America/New_York`, overridable by env) governs both the cron's firing
time and the calendar date the run is recorded under.
**Reason:** Which hour maintenance runs is a deployment choice, not a canon one
— the original's sysop set their own — so there is nothing to be faithful to,
and ET is where the owner is. The zone is passed to `@Cron` explicitly rather
than set as a host `TZ` so the schedule survives redeployment onto any machine.
Both halves read one constant because they are one decision: the recorded date
is the idempotency key the boot self-heal checks to answer "has today already
run?", and a cron in ET against a date computed in UTC agrees most of the time
and disagrees either side of the boundary — silently skipping or doubling a
midnight, invisible until scores are wrong.
**Alternatives rejected:** Setting `TZ=America/New_York` on the container —
works, but makes correctness depend on deploy configuration that nothing tests,
and silently changes every other date in the process. Leaving it UTC — the
maintenance window then lands mid-session.

## 2026-09-05 — Invented text is replaced with canon; a branch canon lacks is deleted, not reworded
**Context:** A systematic pass over `MBMGEMSG.MSG` found 349 canon message ids
the port never wired, and 128 places where it answered in prose of its own.
Some of those places were branches canon does not have at all, so there was no
canon string to swap in.
**Decision:** Where canon has a string, use it. Where canon has no string
because it has no such branch, remove the BRANCH rather than keep the invented
line. Where a branch is genuinely port-original (a feature canon lacks), leave
its text alone rather than force a canon string onto a different meaning.
**Reason:** An invented refusal is not a neutral convenience — it changes what
the game does. `mai` refused to service an undamaged ship; canon has no damage
gate and charges regardless (GECMDS.C:cmd_maint), so the refusal was a rule the
original never had. `destruct` refused to restart a countdown; canon assigns
`destruct = COUNTDOWN` unconditionally, so the refusal made a countdown
impossible to extend. Rewording those to sound more canonical would have kept
the wrong behaviour behind better prose.
**Alternatives rejected:** Keeping every branch and inventing canon-sounding
text for it — that is how the port acquired 128 of these. Deleting port-original
features to avoid having any non-canon strings at all — too far; ship-to-ship
`transfer`, `who`, `set`, `dat`, `nav`'s scan additions and the help index are
useful and are left as they are, flagged rather than removed.
**Kept as deliberate deviations:** `abandon`'s confirmation prompt (canon
un-claims immediately), `mai`'s receipt line (canon quotes the repair duration
and never the fee, so repeated calls bill in silence), and the roster printing
`username` rather than the synthetic `usr_<hex>` `userid`.


## 2026-09-05 — The canon audit is closed; its conclusion, kept
**Context:** CANON_AUDIT_2026-09.md (deleted; in git history) was a 15-agent adversarial audit run
on 2026-09-02 against the full original distribution — 98 findings, a ranked
work order, and seven decisions put to the owner. Every one of those is now
settled, so the file was a closed deliverable being indexed as "current".
A 2026-09-05 documentation audit confirmed all 76 of its appendix findings
resolved in code, and all seven owner decisions closed:

- **D1 UNIVMAX** — 100 kept, deviation recorded. Its coupled item,
  `SCAN_LO_PROJECTION_MULTIPLIER`, stays at 3 *because* it is coupled: 3 at
  UNIVMAX 100, 10 at canon's 300, pinned by `scan-projection-ratio.balance.spec.ts`.
- **D2 PLANTOCK** — restored to canon 360.
- **D3 UNIVWRAP** — implemented, defaulting to canon NO; `TELEDAM` is applied at
  `physics-tick.service.ts:358` rather than being a pinned number nothing read.
- **D4 "men don't eat"** — fixed; `planet-economy.ts:129` debits `floor(men/100)`.
- **D5 gold base price** — 1000, from `ITMPR13`, generated and pinned.
- **D6 admin hull** — both the listing and the purchase are gated on
  `FIRST_CPU_CLASS` (`new-ship.handler.ts:165, 207`).
- **D7 the five caps** — all at canon: MAXPLNTS 20, MAXPLRS 30, MAXSHIPS 8,
  MAILDAYS 3, TOOCLOSE 2500.

**Decision:** Delete the file. Keep its conclusion here, because the conclusion
outlives the findings.

**The conclusion:** *the port was structurally faithful and numerically wrong.*
The algorithms survived scrutiny almost everywhere — `pdamage`, firep tonnage
scaling, the shield-drain asymmetry, the mine cubic falloff, the production loop
and its two traps, the starvation ladder, the buy/sell gate order, the kill-score
split, `valuePlanet`, the bearing family, the whole 18-row ship-class table. What
was broken was the TUNING LAYER, and it had a single root cause:

> `game-config.ts` stated that canon's defaults "are not part of the reference
> source, so there is nothing to recover." **That was factually false.**
> `MBMGEMSG.MSG` carries the shipped default inside the `{}` of every option
> block.

Believing it, the port picked the `numopt()` clamp **ceiling** (TDAMMAX 100,
MDAMMAX 100, HPDAMMAX 200, JAMTIME 10, USRMINES 200, MAXPLNTS 256) or **floor**
(PFIRDST 1, HPFIRDST 1, TORFACT 1, MISFACT 1, PLATTR* 0.05) — about 35 of 51
options wrong, each defensibly inside its bounds and none of them canon.

**Reason to keep this and not the findings:** the findings are closed and the
tests now hold them. The failure MODE is what recurs. It reappeared three more
times in the 2026-09-05 doc audit — the same "not in the reference source" claim
about the `s00` table, about item base prices, and about the sysop options
themselves — each time licensing an invented value. A confident sentence
explaining why canon is unavailable is this project's most reliable warning sign.

**Alternatives rejected:** keeping that file with a CLOSED banner — it is 883
lines indexed as the current divergence list, and a stale snapshot read as
current is the exact failure this audit round existed to fix. It remains in git
history.

## 2026-09-06 — Sysop identity comes from an env allowlist, not a user-record flag

**Context:** `sys` is a sysop-only command in canon. `cmd_sysop` refuses before
it even reads the subcommand:

```c
if ((!syscmds) || (sysonly && !(usrptr->flags&ISYSOP)))
    { prf("Huh?\r"); outprfge(ALWAYS,usrnum); return; }
```

(GECMDS.C:4752-4760; both options ship YES — MBMGEMSG.MSG:197 `SYSCMDS`, :202
`SYSONLY`.) The port shipped `sys` with **no authorization check at all**, which
mattered because `sys unjam` sets the caller's own `jammer` counter to 0: any
player could cancel being jammed instantly and for free, a universal hard
counter to the entire jammer weapon. Found by the 2026-09-05 canon sweep.

**Decision:** implement canon's gate. Sysop identity comes from a
`GE_SYSOP_USERNAME` environment allowlist (comma-separated usernames, matched
case-insensitively), checked before the subcommand is read. Unset or empty means
nobody is a sysop, so every player gets canon's `Huh?`.

**AMENDED, same day, before anyone relied on it.** This shipped first as
`GE_SYSOP_USERIDS`, matching on `userid` — which cannot work. `userid` is
`usr_${randomBytes(12).toString('hex')}` (auth.service.ts:38), minted at
registration: it does not exist until the account does, so it cannot be
configured in advance, and it is different after every database reset, so the
allowlist would silently stop granting exactly when the operator most needed it
(a fresh world). The owner caught this immediately — "my in game user will
change if we reset". The username is operator-chosen, case-insensitively unique
(`User.username`), and re-used across resets, so it can be set once and stay
true. `ShipState` already caches it, so the gate needs no lookup.

The trade is name-squatting: whoever registers the configured name becomes
sysop. That is acceptable here because registration is not public and the
allowlist is deployment-time config, but it is the reason to prefer a DB flag
if the server is ever opened up.

**Reason:** canon reads `usrptr->flags & ISYSOP` from the MajorBBS user record,
which this port has no equivalent of — there is no operator account concept in
our auth model, and inventing a `User.isSysop` column would be a schema change
carrying migration and admin-UI weight for a single boolean that only ever
changes by hand. An env allowlist is the same trust boundary the port already
uses for `GE_DEBUG_ENDPOINTS`, it is deployment-time rather than data, and it
fails closed.

The refusal text is canon's literal `"Huh?"` — printed by `prf()` rather than
drawn from the message table, so `MessageId.SYS_HUH` wraps a string that has no
`.MSG` id to be generated from.

**Alternatives rejected:** a `User.isSysop` column (migration + admin surface for
one hand-edited boolean); leaving `sys` ungated behind `GE_DEBUG_ENDPOINTS` only
(that flag mounts unauthenticated debug ROUTES, a different and much larger
hole, and it would leave `sys` fully open whenever debug endpoints were on);
removing `sys unjam` entirely (canon has it — the defect was the missing gate,
not the subcommand).

## 2026-09-06 — Movement runs on the 1-second tick with canon's stride of 3

**Context:** `CLAUDE.md` said the 6-second physics tick "moves ships", and the
port implemented exactly that. Canon does not. `warrti2a` is registered on the
1-second timer and walks the ship table with a stride of 3:

```c
static int clicker = 0;
zothusn = clicker;
while (zothusn < nships) {
    if (ingegame(zothusn)) {
        rotateship(wptr,zothusn); accel(wptr,zothusn);
        moveship(wptr,zothusn);   destruct(wptr,zothusn);
    }
    zothusn += 3;
}
clicker = (clicker+1)%3;
rtkick(TICKTIME2,warrti2);          /* TICKTIME2 == 1 */
```

(`GEMAIN.C:2462-2493`.) Each ship therefore rotates, accelerates, moves and
counts down its self-destruct **every 3 seconds**. `positionIntegration`
(physics-math.ts) carries canon's per-CALL displacement — `speed * sin(heading)
/ 65000`, no `dt` term — so running it every 6 seconds instead of every 3 made
every ship in the game fly at exactly half canon's speed, turn half as fast,
take twice as long to reach an ordered warp, and take twice as long to explode.

**Decision:** `PhysicsTickService` subscribes to `SHIP_UPDATE` (1s) and applies
canon's stride, advancing one third of the fleet per tick. The `hypha` and
`cantexit` countdowns move the other way: they are decremented inside `checktm`
(`GEFUNCS.C:1522-1541`), which canon calls from the SIX-second `warrtia`, so
they now have their own PHYSICS subscription. `SectorTransitionSubscriber` also
moves to the 1-second tick, because it derives crossings by diffing integer
cells and its sampling rate is its fidelity — on the 6-second tick a hull
crossing two cells in six seconds reported one A→C transition and lost the
intermediate crossing canon reports from inside `moveship`.

**Reason:** canon is the source of truth and this is a pure fidelity defect, not
a balance dial. The stride is kept rather than moving the whole fleet every
third second: it is what canon does, and it smooths the per-tick cost across
three seconds instead of spiking it.

**Alternatives rejected:** doubling the per-call displacement and staying on the
6-second tick — arithmetically equivalent at 6-second boundaries, but it halves
the sampling rate of everything derived from position (sector crossings, mine
proximity, gravity, arrival checks), so ships would teleport past hazards that
canon gives them a tick to notice. Leaving it and documenting the deviation —
rejected because it is not a deviation anyone chose; it was a transcription
error in CLAUDE.md that the code faithfully implemented.

**Note for future work:** CLAUDE.md's tick table has been corrected. Canon's
split is counter-intuitive — shields regenerate on the SLOW tick and movement on
the fast one — so anything moved between the two timers must be located in
`GEMAIN.C` first.

## 2026-09-06 — Planet score comes from ITMVAL, not the shop price table

**Context:** Canon values a planet with the item POINT-VALUE table:

```c
value[i] = lngopt(ITMVAL01+i,0L,201288837L);        /* GEMAIN.C:563 */
...
v += (value[i] * ((long)plptr->items[i].qty/pltvdiv));   /* GEMAIN.C:1357 */
```

The shipped table is `ITMVAL01 {Point Value of man: 10}` and **zero for every
other item** (MBMGEMSG.MSG:1265-1330). The port passed `BASEPRICE` — the shop
price table — into `valuePlanet` instead, where gold is 1000 and a man is 2. So
a colony hoarding gold climbed the roster hard while population, the only thing
canon scores, was credited at a fifth of its worth. Found by the 2026-09-05
canon sweep.

**Decision:** pass `ITEM_VALUE` (already generated from `ITMVAL01..14` by
`tools/extract-item-tables.mjs` and pinned by
`test/balance/item-tables-canon.balance.spec.ts`). Existing scores were RESET
rather than migrated, at the owner's instruction.

**Reason:** canon, and the two tables mean genuinely different things — one is
what a trader pays, the other is what the empire is worth. Conflating them
inverted the game's incentive: hoarding beat colonising, which is the opposite
of what a colonisation game should reward.

Scores were reset rather than recomputed-in-place because `klscore` is
accumulated from kills earned under the old scale and cannot be re-derived;
leaving it while `plscore` changed basis would have produced a leaderboard that
was half old-money and half new. `plscore`, `planets` and `population` are
recomputed from live planets by the next midnight pass, so only `klscore` is
genuinely lost.

**Alternatives rejected:** scaling old scores by the ratio between the tables —
there is no single ratio, since the two tables disagree per item and canon's is
zero for twelve of the fourteen; any factor would be invented. Leaving old
scores in place — the roster would rank players on two incompatible scales with
no way to tell which was which.

## 2026-09-06 — The planet production schedule is persisted, not process state
**Context:** `PlanetTickService` decided when each planet was next due from an
in-memory `Map<planetKey, number>` holding the last tick time. Boot cleared it,
so on the first sweep after startup every populated planet had no recorded
last-tick and was immediately due. **Every restart therefore handed the whole
galaxy a free PLANTOCK** — 30 minutes of production, permanently in the ground.
During a heavy development day that is hours of unearned economy, and it is
invisible: nothing logs it and the stock it creates is indistinguishable from
stock that was actually earned.

Found by the owner asking a plain question — "so anytime we deploy changes we
cause issues?" — during a playtest. Everything else survives a restart cleanly:
ships flush every second, player ships hydrate on connect rather than at boot,
and mines, Cybertrons and locked torpedoes are all persisted columns. This was
the only real cost, and it was not the one either of us had written down. The
standing note in memory said to hold deploys because a restart wipes droids;
droids are ephemeral by design and the owner does not mind losing them.

**Decision:** add `Planet.lastTickAt DateTime?` and schedule against it.
`PlanetTickService.advance` stamps the planet immediately before running its
economy, and `runEconomicTickFor`'s existing flush carries the stamp to Postgres
in the same write as the production result. A NULL means "never ticked",
therefore due. A second migration backfills every existing row to `NOW()` so the
deploy that lands this does not itself grant one last free tick.

`PlanetState.lastTickAt` is declared optional, like `dirty`, because thirty-odd
test fixtures build a `PlanetState` by hand and have no schedule to carry;
absent reads the same as NULL.

**Reason:** elapsed game time should be measured against the wall clock, not
against process uptime. The economy is balanced around one `multiply()` per
planet per 30 minutes (GEMAIN.C:469) and that invariant has to hold across a
restart, or the balance work is measuring a world that got extra turns.

**Alternatives rejected:** seeding the in-memory map to boot time — one line and
no migration, and it errs toward slow rather than fast, but it still discards
real elapsed time. A server down for six hours would resume as though no time
had passed, which is the same class of bug pointing the other way. Accepting the
free tick and counting restarts by hand — that is what we were already doing,
and it silently corrupted every economy measurement taken on a day with deploys.

**Note on canon:** the original has the same class of artefact for a different
reason — `plarti` walks the planet file with an in-memory cursor that resets to
record 0 on boot, so a restart re-does the front of the file (GEMAIN.C:656). We
schedule per planet by elapsed time rather than by cursor position, which is why
ours landed as a clean free tick for everyone rather than a partial replay. This
is a deliberate deviation from canon's mechanism in service of canon's stated
invariant.

## 2026-09-06 — Killing a Cybertron pays no cash
**Context:** `CybertronRepository.transferGold` moved the victim Cybertron's
entire bank balance to the killer on every AI kill, citing
`GECYBS.C:104-105 kill gold transfer`. Those lines are the middle of
`cyb_init`'s name-building block (`strncpy(cybname,"@Cybrg-",UIDSIZ)`); no such
transfer exists there or anywhere else in canon.

Canon's complete set of Cybertron cash sites:

  GECYBS.C:121-122   clamp to CYB_MAXCASH (2,000,000) at init
  GECYBS.C:229       cash += CYB_ALLOW, the periodic allowance

and in `killem`:

  GEFUNCS.C:1137-1139  the flotsam cash grab — COMMENTED OUT in the original
  GEFUNCS.C:1200-1210  chgloser, gated on
                       `ptr->status == GESTAT_USER && wptr->status == GESTAT_USER`

A Cybertron's cash is its purchasing power, not a prize. The port already gates
`chgloser` correctly to PvP; this was a second, invented reward on top.

Found in play: three Cybertron kills paid ~308,000 credits against ~60,000 for
selling 300 flux pods, making combat worth roughly five times the entire
trading economy. The clamp allowed up to CYB_MAXCASH — 2,000,000 — from one
kill.

**Decision:** delete `transferGold` and its `combat.ship-destroyed`
subscription. What a killer is entitled to is the gold in the victim's HOLD,
looted by the ordinary flotsam loop under `chkweight` — which the port already
implements in `kill-resolution.ts`, and which is why a rich Cybertron is often
*harder* to loot: the take is `qty/(gernd()%5+1)` and must fit whole, so a
larger pile can put every possible take over the tonnage limit.

Balances already earned were LEFT IN PLACE at the owner's instruction — this is
a dev server mid-playtest and the inflated cash harms nobody. Only the ongoing
payout is removed.

**Reason:** canon, and the economy. Trading, colonising and tax exist as ways
to make money; a payout that dwarfs all three by an order of magnitude makes
them decorative.

**Alternatives rejected:** scaling the transfer down to `chgloser`'s 2% — still
invented, just quieter, and it would have kept a citation that points at
nothing. Clawing back the ~308,000 already banked — the owner's call, and they
declined.

## 2026-09-06 — `hel class` shows canon's full table; only `sca se` clears on transit
**Context (1):** `hel class` printed seven columns — #, Class, Price, Phas,
Shld, Cargo, Warp — where canon prints eighteen (GECMDS.C:411-431) under the
stacked header at MBMGEHLP.MSG HLPCLS1, followed by HLPCLS2, a legend defining
every abbreviation. The eleven missing columns are exactly the ones that say
what a hull can DO: torpedo, missile, decoy, jammer, zipper, mine, planetary
attack, cloak, acceleration, scan range and kill value.

Reported from play, and the report was a question the table itself provoked: on
the visible columns the Star Cruiser (700k) is a Destroyer (600k) with 2,000
tons LESS cargo and nothing to show for the extra hundred thousand. The answer
— cloak, double acceleration, and 5,000 kill points against 2,000 — was in
three of the columns we were not printing. A buyer could not make the decision
the shipyard was asking them to make.

**Decision (1):** print canon's table, generated from `SHIP_CLASSES` (already
extracted from MBMGESHP.MSG and pinned by ship-class-canon.balance.spec.ts), in
canon's column order — note Shld BEFORE Phsr, which the port had reversed — with
canon's stacked header and the HLPCLS2 legend beneath it.

Canon's width helpers are integer division, so the Frigate's 1,250,000 credits
print as "1m". That lossiness is kept rather than "improved" to 1.3m: the
columns are fixed width, and inventing a decimal in the one table a buyer reads
before spending a million is a silent divergence for no gain.

NOT done: canon's `HELP CLASS nn` per-class detail view, which HLPCLS2's closing
note advertises. The table and legend answer the reported problem; the detail
view is a separate piece of work and is not pretended at.

**Context (2):** FR-013 blanked the sector map on ANY sector crossing, for every
scan mode. That is right for `sca se`, which draws the sector you are standing
in, and wrong for `sca lo` and `sca ra`, which are RANGE-scoped and do not know
what a sector boundary is. A long-range map spans about 30 sectors, so crossing
one invalidates ~3% of it — and at warp you cross one every few seconds, so the
map was blank for most of any journey, exactly when a long-range picture is
worth having.

This got worse on 2026-09-06: until `sca lo` was fixed to project every ship it
only ever drew contacts inside the 10-sector scantab, so a sector of travel was
a meaningful fraction of what could be seen. Once the map reached its real
radius, the rule was discarding a view that was almost entirely still good.

**Decision (2):** clear on transit only when the last render was `kind === 'se'`.
`ScanRenderEvent.kind` is already on the wire; App threads it to ScanMap.

**Reason:** canon never invalidates the map at all — it is text printed into a
scrolling terminal, and with SCANHOME the next scan redraws in place. Clearing
only the sector-scoped mode is the narrowest rule that still blanks the one view
that would otherwise be a picture of somewhere else.

**Alternatives rejected:** matching canon exactly by never clearing — `sca se`
would then show a neighbouring sector's contents under your current sector's
header, which is worse than either rule. Clearing on a distance threshold rather
than a boundary — invented, untestable against canon, and it would still fight
the fact that the map goes stale continuously rather than at a threshold.

## 2026-09-06 — gebemean is rolled once per WEAPON, and the hyperspace batch
**Context (1):** Reported from play — "AI has not really fought back... no
torpedo, no phasers, just let me kill it", against Cybertron Scouts at 6 kills.

Canon calls `gebemean` TWICE inside `cyb_attack`: once to decide phasers
(GECYBS.C:514) and again, independently, to decide torpedoes (GECYBS.C:527).
The port evaluated it once and reused the result, with a comment claiming that
"preserves deterministic PRNG consumption" — which has it backwards. Matching
canon means consuming the generator the way canon consumes it, which is twice.

For an ordinary Cybertron against a player under CYB_BE_NICE (30) kills,
`gebemean` is a 1-in-CYBSLO (1-in-3) roll:

    canon:  P(phasers) = 1/3, P(torps) = 1/3, INDEPENDENT
            P(does anything) = 1 - (2/3)(2/3) = 5/9 = 56%
    port:   one roll drives both
            P(does anything) = 1/3 = 33%

So Scouts engaged at 0.6x canon's rate and could be farmed nearly unopposed.
Ruled out first, all fine: AI phaser charge (24/24 at 100 vs PMINFIRE 60), scan
ranges (all match MBMGESHP.MSG), the attack gate (`cybCanAttack` is true for the
Interceptor so it always passes), and aiming (`degrees` set in both paths).

**Decision (1):** roll `gebemean` separately for each weapon, as canon does.

**Reason:** it is the difference between a PvE opponent and a pinata, and the
grace period for new players is supposed to be a reduced chance of being shot,
not a near-guarantee of not being shot.

**Context (2), the hyperspace batch — four defects found by the same playtest:**

  a. `cmd_phas` routes to `firehp` on `warsptr->where == 1` (GECMDS.C:843). The
     port tested `speed >= WARP_THRESHOLD`. For a player the two normally agree
     (you only reach warp by accelerating through the boundary, the one thing
     that sets `where`), but they come apart for any hull whose speed was
     ASSIGNED rather than accelerated into — which is what canon's Cybertron
     pursuit bands do (GECYBS.C:746, 761, 775).
  b. `prfmsg(HPFIRED,deg)` lives inside `firehp` (GECMDS.C:1037). The port
     emitted it from the ORDINARY phaser path and not from the hyper one, so a
     normal shot reported "Hyper-Phaser fired at bearing N, Sir!" immediately
     before "Phasers fired at N percent" — telling the pilot they had fired a
     weapon they had not. Found by the routing test above.
  c. HYSHDN, HYCLDN, HYPERIN and HYPEROUT were all paraphrased ("** Shields
     collapse as you enter hyperspace. **"). All four exist verbatim in the
     generated canon table.
  d. HYPERIN2 was not emitted at all. Canon tells the SECTOR a ship jumped
     (`outsect`, GEFUNCS.C:605-606), so leaving a fight was silent.
  e. `decideAutoShield` gated on `cantexit` and `shieldstat` but not `where`,
     so `set autoshield on` would raise shields in hyperspace — a state
     `cmd_shields` refuses outright (SHLD1, GECMDS.C:3125) and `hyperspace()`
     undoes on entry.

**Decision (2):** fix all five. `PhysicsHyperspaceEvent` gains `shipname` and
`sector` so the gateway can address the sector room.

**Alternatives rejected:** leaving (a) because player behaviour is unaffected —
it is a wrong test that happens to agree most of the time, and it was hiding
(b). Keeping the paraphrases as friendlier text — canon's wording is the thing
being ported, and the paraphrase in (c) is what made the invented HPFIRED in (b)
hard to spot among other invented lines.

## 2026-09-06 — Projectile hull damage is fractional; only the phaser truncates
**Context:** Reported from play — "missiles seem interesting.. even at like 3k I
don't seem to record hits at 20000."

`WARSHP.damage` is a `double` (GEMAIN.H:332) and canon adds to it WITHOUT a cast
for both projectiles:

    ptr->damage += damfact;             /* torpedo, GEFUNCS.C:1574        */
    ptr->damage += mdammax*damfact;     /* missile, GEFUNCS.C:1644, :1658 */

The phaser is the deliberate exception and truncates on the way in:

    damage = (int)(factor);             /* GECMDS.C:969, :1063 */

The port floored all three. For the phaser that is correct; for the projectiles
it silently deleted every hit worth less than one point.

The missile is where it showed. Against a SHIELDED target the roll is `rndm(.1)`,
so with MDAMMAX 25 and MISSILE_CHARGE_MAX 50000, a 20,000-charge missile on a
90-damfact hull earns 0.2-1.0 hull per hit — floored to ZERO on almost every
hit. A full volley that should have taken ~8% off did nothing measurable, which
is exactly what the report described. Torpedoes lost under a point per hit,
noticeable only in aggregate.

**Decision:** return the fraction from `rollMissileHullDamage` and
`rollProjectileHullDamage`; leave the phaser's floor alone.

**Reason:** canon, and the shielded-missile case is not a rounding detail — it
is the difference between a weapon that works and one that does not. The
missile's role against a shielded target is to strip shields via `shieldhit`
while contributing a trickle of hull damage; deleting the trickle removed half
of what the weapon is for.

**Alternatives rejected:** rounding rather than truncating — still wrong, and it
would over-credit as often as it under-credited. Scaling MDAMMAX up to
compensate — invents a balance change to paper over an arithmetic bug.

Two tests pinned the floored integers (`toBe(Math.floor(dmg100 * 0.5))` and
`toBe(Math.floor(soft / 2))`); both are corrected in place, since the identity
they relied on held only while the defect did.

## 2026-09-06 — Cybertrons leave hyperspace to fight; canon's never do
**Context:** Canon's pursuit block (GECYBS.C:735-805) contains exactly ONE
`where` assignment: `ptr->where = 1` in the long band, at `low_dist >=
hyperdist1` (25 sectors). The three closer bands never clear it — they only
TEST it, `if (ptr->where == 0) shieldup(ptr,usrn);`.

And the AI snaps `ptr->speed` directly rather than decelerating through
`accel()`, which is the only thing that calls `hyperspace(ptr,usrn,0)`. So a
canon Cybertron that hyperwarps toward a player is stuck at `where == 1`
permanently, and `cyb_attack`'s normal-space branch requires `ptr->where == 0`
(GECYBS.C:282). It closes to point-blank and can never fire.

The port already deviates: `cyb-decisions` returns `where: 0` for the mid,
brake and combat bands, so ours drop out of hyperspace and engage.

**Decision:** keep the deviation. Recorded at the owner's explicit instruction —
"I like ours being more dangerous so we can leave that."

**Reason:** canon's behaviour here is a dead end rather than a design. A
pursuer that closes to within half a sector and then cannot shoot is not a
difficulty choice; it makes the entire long-range pursuit ladder decorative,
and `gebemean`, `cyb_attack`, `cyb_lay_decoys` and the torpedo volley all
become unreachable for any Cybertron that ever crossed 25 sectors to reach you.

**Alternatives rejected:** matching canon exactly — faithful, and it would have
quietly removed most of the PvE game. Clearing `where` only in the combat band
rather than all three — closer to canon in shape, but the mid and brake bands
are where a pursuer spends most of its time, so it would reintroduce the same
dead end for anything still closing.

**Note:** this is the second AI-aggression finding of the day and they interact.
The first (gebemean rolled once instead of per weapon) was a port bug making
Cybertrons *less* dangerous than canon; this one is a port deviation making them
*more* so. They are not a matched pair — the first is now fixed to canon, this
one is kept deliberately.

## 2026-09-07 — The firer is told THAT their ordnance hit, never how hard
**Context:** Canon tells a torpedo's firer nothing after launch. `TFIRE1`
("Torpedoes fired sir!") is the last word they get; every subsequent message
about that torpedo goes to the TARGET — the tracking alert `TORP1`, the decoy
intercept `TORDEST` (`outprfge(FILTER, usrn)` where `usrn` is the carrier,
GEFUNCS.C:1587-1588) and the impact `THIT1`/`THIT2`. There is no unused string
in MBMGEMSG.MSG for a firer-side impact either; the vocabulary simply does not
exist, because the code never asks for one. Missiles are the same.

Phasers are the exception: `PHITHIM` reports the outcome to the firer, because
a beam resolves instantly under the firer's own sensors.

The port broke that asymmetry. It rendered a client-side kill-feed line,
`QuiteCat hits Cybertron 43319 (torpedo, hull -23%)`, to everyone in the
sector — the shooter included — and did it with a hull PERCENTAGE. Two problems:
the shooter narrated themselves in the third person, ahead of their own
narration; and the figure was more precise than canon is anywhere in the game.
The original reports another ship's condition only as one of `damstr`'s six
words (GECMDS.C:2110) — "no / very light / light / moderate / heavy / severe" —
and the single integer in the whole damage message set is `PHITDEF`'s shield
deflection magnitude, not hull damage.

**Decision:** For ordnance the local ship fired:
- phaser / hyper-phaser — drop the feed line entirely. Canon's `PHITHIM` and
  `PDEFLECT` already narrate it and the port relays them; the feed line was a
  duplicate arriving in the wrong order.
- torpedo / missile — replace it with `Sensors confirm a <weapon> strike on
  <ship>.` The strike is confirmed; nothing is assessed.

Bystander lines are unchanged.

**AMENDED same day, on the player's call — the victim side goes canon too.**
The port also rendered the victim an `** INCOMING TORPEDO! Hull -6% shields
-15% from Cybertron 43319 **` banner on top of canon's `THIT2`, which the
gateway already relays. That banner is now removed. Canon reports hull damage
as a number NOWHERE in the game: not to the attacker (`PHITHIM` passes a
damstr word), not to the victim (`THIT2` carries no magnitude at all), and not
even to you about your own ship — `rep` sends `REP14` with the damstr word
(GECMDS.C:2037-2040). Only shield CHARGE is ever numeric (`REP11B`).

This corrects a claim made earlier in this same entry. "Exact knowledge of your
own ship" was too strong: it holds for shield charge and not for hull. The rule
is narrower and simpler — **hull condition is one of damstr's six words, always,
for everyone, about everyone.** A pilot is told they were hit and by what
weapon; `rep` tells them their condition, in words.

**Reason:** Canon's silence is a design, not an omission. A torpedo flies for
seconds and the target may leave scan range before it lands, so the intended
feedback loop is `sca sh <name>` → `Damage: severe damage`. That is what the
scan's damage line is FOR, and handing the shooter a percentage removed the
reason to type it. Confirming the hit without assessing it keeps the loop —
"moderate" spans 25-49, so you still have to look — while avoiding the failure
this port already hit once with missiles, where an unacknowledged shot read as
a broken weapon.

The underlying canon rule, made explicit here because it should govern future
message work: **exact knowledge of your own ship, band knowledge of everyone
else's.**

**Alternatives rejected:**
- *Full canon — say nothing to the firer.* Purest, and it does restore the scan
  loop. Rejected because it reproduces the missile-feels-broken failure: a
  torpedo fired at a ship that then leaves scan range becomes unknowable, and
  playtest showed that reads as a defect rather than as design.
- *Report `damstr` bands to the firer.* Considered and preferred at first.
  Rejected on the player's reasoning: knowing something connected is what a
  sensor suite plausibly gives you; grading the damage is what a scan is for.
  Bands would also have half-replaced `sca sh` rather than leaving it intact.
- *Keep the percentages.* Most precise thing in the game, in a game that never
  shows a percentage.

**Status:** port addition, not canon text. The string is ours.

## 2026-09-07 — A bystander is told nothing about a fight they are not in
**Context:** Third and final pass over combat messaging, closing the same thread
as the two entries above. The port rendered two client-side lines to everyone in
a sector: `X fires phasers!` on COMBAT_PHASER_FIRED, and
`X hits Y (phaser, hull -24%)` on COMBAT_HIT.

**Decision:** Both removed. A player is told about combat only when they are the
firer or the target.

**Reason:** Canon addresses every combat message to one of the two participants.
`PFIRED` goes `outprfge(FILTER, usrn)` — the firer alone (GECMDS.C:943-944);
PHITHIM/PDEFLECT to the firer; PHITYOU/PHITDEF/THIT/MHIT/MINE4 to the victim.
The sector- and range-wide broadcasts canon DOES make are cloak collapse
(GEFUNCS.C:1380), the self-destruct countdown (:1836), sector entry and exit
(:717-722), radio traffic, and the destruction energy burst (:1848-1860). Combat
is deliberately not among them. To learn whether the two ships off your bow are
fighting, you scan them and read their damage — the same loop the firer uses.

The hit line also carried a hull percentage, which conflicts with the rule
settled in the entry above: hull condition is one of damstr's six words, always,
for everyone, about everyone.

**Alternatives rejected:**
- *Keep the lines, drop the percentage.* Would have left a sector-wide combat
  feed canon has no equivalent for, and the information is free — a bystander
  would learn who is fighting whom without spending a scan or entering range.
- *Keep `X fires phasers!` only.* Same objection; it is the more informative of
  the two, since it reveals a shooter who has not yet connected.

**Consequence to watch:** on a populated server a player will no longer see
combat happening beside them. That is canon, and it makes `sca` the instrument
it was meant to be — but it is a real change in feel, and worth revisiting only
with evidence from actual multiplayer, not from single-player intuition.

## 2026-09-07 — "Phasers fired — no targets in arc." is kept, as a declared deviation
**Context:** Canon prints nothing when a phaser discharge reaches nobody. `firep`
loops the ship table, finds no one inside `smallest(heading,deg) < percent+PHABIAS`,
sets `phasr = 0` and returns (GECMDS.C:946-1006). The player sees `PFIRED`
("Phasers fired at N percent power - focus M") and then silence. The only other
message on that path is `NOFIREP`, which is for an undercharged bank, not an
empty arc. The port adds a line the original does not have, and the same for
the hyper-phaser.

**Decision:** Keep it. Recorded here so it is deliberate rather than undeclared.

**Reason:** On a text interface the alternative to this line is silence, which
is indistinguishable from a dropped command — and this port has already shipped
one bug where an unacknowledged shot read as a broken weapon (see the missile
fractional-damage entry). It leaks nothing canon withholds: a deflection still
reports differently from a miss (`PDEFLECT` names the commander), so the line
only makes an absence explicit. The player, asked directly, chose to keep it.

**Alternatives rejected:**
- *Remove it for full fidelity.* Purest, and rejected on the above: the silence
  it restores is not informative, it is ambiguous.
- *Leave it undeclared.* Not an option under the project's own rule —
  deviations are allowed only when deliberate AND written down.

**Scope:** the normal phaser and the hyper-phaser miss lines. Nothing else in
the phaser path deviates.

## 2026-09-07 — Email as the login credential, with a partial lower() unique index
**Context:** Public-web-presence plan, Task 2. The game is moving to a public
subdomain and the only credential was a display handle (`username`), which is
unrecoverable if forgotten and gives a stranger no idea what to type to sign
up. `User.userid` was already an opaque key with every foreign key (Ship,
Mail, MailStat, planet ownership) pointing at it, and `username` a separate
display handle — so adding a login credential touches no foreign key and is
not an identity migration.

**Decision:** Add `email String?` (nullable — the 24 Cybertron rows can never
have one) and `emailVerifiedAt DateTime?` (written by nothing, read by
nothing yet — it exists so a future verification flow is a token table plus a
handler, not another `User` migration). Enforce case-insensitive uniqueness
with a raw, partial SQL index, since Prisma's `@unique` can express neither
`lower()` nor a `WHERE` clause:

```sql
CREATE UNIQUE INDEX user_email_lower_key
  ON "User" (lower(email)) WHERE email IS NOT NULL;
```

`RegisterDto` and `LoginDto` become `{ email, password }`. The constant-time
bcrypt path in `login` — always comparing against `DUMMY_BCRYPT_HASH` when the
account is absent or has a null hash — is preserved exactly, now keyed on
email instead of username.

**Reason:** With two unique constraints on `User` (email, username), a
duplicate-key failure must say which one was hit. Prisma surfaces the
expression in `P2002.meta.target`, but empirically (confirmed live by the
Task 2 implementer, not assumed) it can report either the index name or the
raw expression — `['user_email_lower_key']` in some cases,
`['lower(email)']` in others. `AuthService.isUniqueViolation` therefore
matches against a **markers array**, `EMAIL_INDEX_MARKERS = ['user_email_lower_key', 'lower(email)']`,
not a single string. The original plan told both this task and Task 3 to
match on the index name alone, which would have made every real duplicate
surface as an unhandled 500 instead of a 409 the moment Prisma chose the
other form. Task 3 carries the same fix for `USERNAME_INDEX_MARKERS`.

**Alternatives rejected:**
- *A single generic "account exists" message covering both fields.* Rejected
  as a worse registration experience — a player who mistyped an email they
  already used and one who picked a taken display name need different next
  steps.
- *Backfilling email onto existing rows.* Not built. The database is wiped
  when the game moves to <panel>, and the nine existing human rows are test
  accounts, so there is nothing real to migrate.
- *Matching `meta.target` on index name only.* This was the plan's original
  design and is the bug the markers-array fix corrects — see Reason above.

## 2026-09-07 — Two-step registration and the nullable username guarded by WsAuthGuard
**Context:** Public-web-presence plan, Task 3 (registration split) and Task 4
(the socket-side gate). Creating an account now needs an email and a password
before a display handle exists at all, and canon's `username()`
(`GEFUNCS.C:2596`) is called throughout combat and sector messaging — a ship
with no display handle is not a safe thing to let onto the game board.

**Decision:** `POST /auth/register` with `{ email, password }` creates the row
with `username = null` and returns a JWT. `POST /auth/username` —
authenticated — with `{ username }` sets it and returns a fresh token.
`WsAuthGuard` rejects any token whose payload carries no username, with code
`USERNAME_REQUIRED`, before a socket connection is allowed to proceed.

The username-claim write is atomic: it is expressed as
`updateMany({ where: { userid, username: null } })` and branches on the
affected-row count, rather than a `findUnique` read followed by a separate
`update`. A read-then-write version leaves a window where two concurrent
requests carrying the same token and different names both pass the null
check, and the last write wins — the unique index only prevents two
*accounts* claiming one name, not one account being named twice.

**Reason:** Creating the row at step 1 (rather than holding credentials
client-side until both fields are known) means "that email is taken" surfaces
immediately, instead of after the player has already invested time choosing a
name. Gating the socket on a non-null username is what makes the nullable
column safe: without `WsAuthGuard`'s check, a half-registered account could
open a socket and board a ship with a null display handle reaching every
combat and sector message in the game.

**Alternatives rejected:**
- *Single-step registration collecting email, password and username at once.*
  Rejected because a taken username then surfaces at the same moment as a
  taken email, and the two-request split was already needed to let
  `WsAuthGuard` gate on username presence independently of credential
  validity.
- *Read-then-write username claim (`findUnique` then `update`).* This was the
  original design; a code review during Task 3 found the race described
  above and it was replaced with the atomic `updateMany` before the task
  closed.
- *Silently coercing a null username to the userid for display purposes.* An
  early fix inside Task 1 made `login()` return
  `username: user.username ?? user.userid`, which would have made a
  half-registered account look complete to the frontend's `Login` screen,
  routing it to `/play` where the socket then refuses it with
  `USERNAME_REQUIRED` — a dead end. Not carried forward: Task 2 rewrote
  `login()` to return `username: null` directly, and the frontend branches on
  that null to route to `/register/name` instead.

**Known gap, deferred:** if the account row is deleted between the guard read
and the `updateMany` in an unlucky interleaving, the response reports
`USERNAME_ALREADY_SET` rather than a more accurate "no such account". This is
not purely theoretical — the abandoned-signup sweep below deletes
username-less accounts at 10 days — but narrow enough that it was flagged to
the final review rather than fixed in Task 3.

## 2026-09-07 — Logout is site chrome, not a game command
**Context:** Public-web-presence plan, Task 11. The port had no logout at
all; the only way to end a session was to close the tab, leaving a stale JWT
in `localStorage` and no way to switch accounts on a shared machine.

**Decision:** Logout is added as **site chrome**, not a game command — an
option on the ship-select screen, and a header link on `/` and `/stats`. It
clears the stored token, disconnects the socket, and routes to `/`. It is
deliberately **not reachable from inside the live terminal** while a ship is
active.

**Reason:** Canon's `x` command (`GEMAIN.C:2859 mnu_fightsub`) clears
torpedo locks, saves, announces `EXIWAR2` to the sector, sets `GESTAT_AVAIL`
and returns the player to the ship-select menu — that is canon's own exit
from Galactic Empire, not a logoff. Logging off the BBS entirely was a
separate action at the outer menu, one level up, which this port had never
implemented because there was no "outer menu" to log off from. Disconnecting
a live socket is `warhupa`, and with `cantexit > 0` (an active combat
countdown) that destroys the hull outright. So the sequence has to be `x`
first — which enforces `cantexit` itself and answers `CANTEXT` when it
cannot — and only then logout from the ship-select screen or site header.
This reproduces canon's real two-level exit (out of the game, then off the
service) instead of collapsing it into one button that can blow up an active
ship.

**Alternatives rejected:**
- *A single logout reachable from anywhere, including mid-flight.* Rejected
  outright: it bypasses `cantexit` and would let a player evade a
  self-destruct countdown or an active engagement by disconnecting, which
  canon's own exit path is explicitly built to prevent.
- *Making logout a typed game command (e.g. `logout`) alongside `x`.*
  Rejected because logout is a site-level session concept, not something
  canon's command table has room for, and the ship-select screen already sits
  exactly at the point in the flow where canon's outer-menu logoff belongs.

**Known gap, deferred (fixed same task):** the first cut of `tokenStore`
called bare `localStorage.getItem`/`setItem`/`removeItem` with no
`try/catch`. `SiteHeader` calls `tokenStore.getToken()` on the **landing
page** — the first thing a stranger sees — and a browser that blocks site
data (private windows, strict cookie settings) throws on any `localStorage`
access, which would have put a blank page in front of every visitor whose
browser happens to be configured that way. All three `tokenStore` functions
were hardened with `try/catch` in the same task rather than deferred, because
the alternative was undetectable without deliberately restrictive browser
settings.

## 2026-09-07 — The roster query is extracted from `ros`, not from `rank-roster.ts`
**Context:** Public-web-presence plan, Task 5, `/public/stats`'s roster.

**CORRECTION.** The design spec for this feature
(`docs/superpowers/specs/2026-09-07-public-web-presence-design.md`) originally
stated that the public roster would reuse `midnight/rank-roster.ts`, on the
premise that doing so would keep the public board from ever disagreeing with
the in-game `ros` command. That premise was wrong on both counts: `rankRoster`
assigns `rospos` during the nightly midnight job and is not what `ros` uses
at all; `ros.handler.ts` runs its own, independent Prisma query with canon's
own predicate. Sharing `rank-roster.ts` would therefore have built a public
board that could disagree with `ros` — the opposite of the stated goal. The
correction was caught and written into the spec before implementation began,
so no code was ever built against the wrong premise.

**Decision:** Extract the shared selection from `ros.handler.ts` itself into
a new pure module, `game/player/roster-query.ts`, exporting
`ROSTER_WHERE` and `ROSTER_ORDER_BY`. `ros` is refactored to import and use
these constants in the same task, with its existing (42, unmodified) test
suite serving as the proof that the refactor is behaviour-preserving.
`/public/stats`'s roster imports the same constants.

**Reason:** Canon's predicate and ordering are preserved exactly: `score > 0`
(`GECMDS.C:4038`), AI excluded via the `Cybrg-`, `@Droid-` and `@` userid
prefixes, ordered score desc, then kills desc, then userid ascending. Having
one module both call sites import makes "the public board agrees with `ros`"
a structural fact rather than a hope maintained by two independently-edited
queries staying in sync by hand.

**Alternatives rejected:**
- *Reuse `midnight/rank-roster.ts` as originally specified.* This is the
  premise the correction above withdraws — it ranks for a different job
  (`rospos` at midnight) and does not answer the same question `ros` does.
- *Duplicate the predicate inline in the new `StatsService`.* Rejected for
  the reason the shared module exists at all: two hand-maintained copies of
  a canon predicate are two chances for one to drift, and this project has
  already been burned by exactly that shape of bug.

**Note, not a further correction:** the roster predicate and the
`/public/stats` `commanders` count answer different questions and
legitimately differ from each other. The roster is canon's scoreboard, which
omits anyone who has never scored (`score > 0`). `commanders` counts
`passwordHash IS NOT NULL` and includes players who have signed up but never
flown. Both exclude the 24 Cybertron rows, but for different reasons and via
different predicates.

## 2026-09-07 — The 10-day abandoned-signup sweep is PORT-ORIGINAL
**Context:** Public-web-presence plan, Task 8. Two-step registration (see the
entry above) means an account can complete step 1 — email, password, a real
row in `User` — and never complete step 2, holding an email address forever
with no way to ever become a playable character.

**Decision:** The nightly midnight job deletes any `User` row where
`passwordHash IS NOT NULL`, **`username IS NULL`**, and `createdAt` is older
than a named constant, `ABANDONED_SIGNUP_DAYS = 10`, alongside the existing
`MAILDAYS`. This is **PORT-ORIGINAL** — canon has no concept of a two-step
signup and nothing to model this against. There is no C source citation for
this behavior because none exists; the 10-day figure and the sweep itself are
this project's own invention, not a canon value that happened to move.

All three conditions in the predicate are load-bearing, not incidental:
`passwordHash IS NOT NULL` keeps the sweep away from the 24 Cybertron rows,
whose usernames are also atypical and would otherwise look abandoned by
accident. The null username is what marks an account as abandoned mid-signup
in the first place — once step 2 completes, a real player's row can never
match this predicate again regardless of age, so the sweep cannot reach a
completed account no matter how it ages. Such a row owns no ships, planets or
mail (those are only created once a player boards a ship after registration
completes), so this is a plain delete with no cascade to reason about.

**Reason:** An abandoned signup is not player data — it is an email address
with no story, no way to log back in and finish becoming a character, and no
reason to keep it. Deleting it is both a privacy courtesy (data one did not
mean to keep isn't kept) and cleanliness for anyone querying `User` directly.
Ten days was chosen as generous enough that a player who registered, got
distracted, and came back the next weekend is unaffected, while still being a
concrete bound rather than "forever."

The predicate itself received extra scrutiny beyond the norm for this
project's midnight additions: this is the only `DELETE` in the entire
midnight job, and it runs unattended every night against a database holding
a real, ongoing playtest. A white-box unit test asserting the shape of the
`where` object can prove the code constructs the predicate it means to
construct; it cannot prove Prisma renders `username: null` as `IS NULL` at
the SQL level, or that the delete actually removes the rows intended and
nothing else. A DB-backed integration test with four fixture rows (an
abandoned signup past the cutoff, one short of it, a Cybertron of any age,
and a fully-registered account of any age) was added specifically to close
that gap, confirming both the SQL rendering and the survivor set by
re-querying identity after the sweep runs.

**Alternatives rejected:**
- *No sweep — leave abandoned rows in place indefinitely.* Rejected: it
  accumulates real email addresses attached to accounts that can never be
  used, indefinitely, for no benefit.
- *Trust the white-box unit test alone, without a DB integration test.* This
  was the plan's original test list and is what the review flagged as
  insufficient for the project's only unattended `DELETE` — see Reason above.
  Fixed within the same task rather than deferred, given the destructive,
  unattended nature of the job.
- *Key the sweep off `updatedAt` instead of `createdAt`.* Not adopted: the
  intent is "how long has this signup sat unfinished," which is measured from
  when the row was created, not from whatever last touched it.


## 2026-09-07 — `SCRFACT` is wired and kept at 100, a declared deviation from canon 35

**Context:** Deployment prep asked a simple question — where does a sysop set
things on a live server? The answer was two places. `src/game/config/game-config.ts`
holds 57 canon sysop options with defaults extracted from `MBMGEMSG.MSG`, a
`config/game.config.json` file and environment overrides. Seven separate
`.config.ts` files read `process.env` directly under their own names.

Auditing the overlap found one setting implemented in both halves, and settable
in neither. `score.config.ts` read a private `SCORE_F2` variable defaulting to
100. `SYSOP_OPTIONS` carried the same option as `SCRFACT`, canon default 35,
marked `implemented: false`. Setting `SCRFACT` anywhere did nothing, and the
game deducted 100% of a victim's score on a kill where the original deducts 35%.

```
GEMAIN.C:603       score_f2 = numopt(SCRFACT,0,32700);
MBMGEMSG.MSG:472   SCRFACT {Factor points to deduct from loser: 35} N 1 100
```

The 2026-09-03 audit that found 14 wired options wrongly flagged
`implemented: false` could not have caught this one. `SCRFACT` *was* wired —
under a different name, in a different file. Searching for the option's own name
found nothing. Only merging the two systems surfaced it.

**Decision:** `score.config.ts` resolves through the central manifest;
`SCRFACT` is marked implemented and is the single name. The VALUE stays at
**100**, declared in `config/game.config.json` and in the `DEVIATIONS` table
that `test/balance/sysop-options-canon.balance.spec.ts` enforces.

**Reason:** the deviation is real and worth keeping for now, but it was never
chosen — it was an artefact of a second code path. Changing it to canon's 35
would retroactively revalue every kill in a running game, roughly thirding the
worth of a kill. That is the owner's balance call, not a refactor's side effect.
What this changes is that it is a decision instead of an accident, and that it
is finally settable.

Merging also had to carry across input hygiene `score.config.ts` had earned:
the central loader already rejected non-numeric and empty values, but read a
whitespace-only value as zero (`Number('   ')` is 0), silently switching an
option off. It now trims before testing for "set".

Out-of-range values now clamp with a warning rather than throwing. That is
canon — `numopt` clamps — and the old throw was a port invention.

**Alternatives rejected:**
- *Deploy at canon 35.* Correct on fidelity, but it changes live balance
  mid-playtest. Offered and declined; revisit before the public server opens.
- *Leave the two systems separate and just document it.* The divergence is not
  cosmetic: one of the two names was inert, and nothing said which.
- *Merge all seven `.config.ts` files into `SYSOP_OPTIONS`.* Not done, and not
  wanted wholesale. The rest either chain to canon correctly (cloak, midnight,
  galaxy, cybertron, attack) or hold C-source constants that are not sysop
  options at all (droid). Only `SCRFACT` was broken.

## 2026-09-07 — The container never shipped the sysop tuning file

**Context:** `config/game.config.json` carries `UNIVMAX: 100` against a canon
default of 300. The path resolver finds it correctly at
`/app/config/game.config.json` in the image — but `backend/Dockerfile` copied
`dist`, `node_modules`, `prisma` and `package.json`, and never `config/`.

A missing tuning file is a legitimate state that falls back to canon defaults
without complaint. So a containerised deployment would have generated a
**601x601 galaxy instead of 201x201** — nine times the area, with absolute scan
ranges unchanged around it — silently, and with the landing page advertising 201.

This is the same failure `test/unit/config/config-path.spec.ts` documents
(wrong path arithmetic from a compiled tree), reintroduced one layer up. The
arithmetic was fixed; the build instruction feeding it was not.

**Decision:** the Dockerfile copies `config/` into both stages, and a test reads
the Dockerfile to assert it — the way the migration tests read `migration.sql`.
`GE_CONFIG_PATH` is added ahead of the four derived paths so a deployment can
state where the file is rather than rely on arithmetic it cannot see, and can
mount a volume instead of rebuilding an image to retune.

**Reason:** a build step that silently omits a file is exactly what does not
show up in a passing suite. Asserting on the Dockerfile is the only way this
class of bug fails in CI rather than on a server.

**Alternatives rejected:**
- *Collapse the four derived paths to one.* They are load-bearing: they are
  what makes source runs, `ts-jest` runs and compiled runs all work with no
  setup. `GE_CONFIG_PATH` gives deployment its single predictable answer
  without taking that away.
- *Make a missing config file fatal.* It would catch this, and break every
  fresh checkout. The defaults are a complete, playable configuration by
  design.


## 2026-09-08 — `SCRFACT` returns to canon 35 (AMENDS 2026-09-07)

**Context:** Yesterday's entry kept `SCRFACT` at 100 and declared it a
deviation, on the reasoning that changing it would retroactively revalue every
kill in a running game. That reasoning was sound at the time and is now spent:
the public galaxy was hours old, and the owner, reading the guide, said plainly
that canon's 35 is the better game.

The deviation was never chosen. `score.config.ts` hardcoded its own default of
100 while `SCRFACT` sat in the option table marked `implemented: false`, so the
option was inert and nobody had ever picked the number. It was an artefact of
two config systems, not a balance decision.

**Decision:** `SCRFACT` is removed from `config/game.config.json` and falls back
to canon's shipped 35 (`MBMGEMSG.MSG:472` — *"Factor points to deduct from
loser: 35"*). It is removed from the enforced `DEVIATIONS` table and from
`GUIDE_DEVIATIONS`, because it is no longer a deviation.

**Reason:** it costs nothing now and cannot be done cheaply later. Checked
before changing it: `SCRFACT` governs only the VICTIM's deduction. The
attacker's award comes from `killScoreAward` and never touches it, and AI
victims are skipped for deduction entirely — so hunting Cybertrons pays exactly
the same before and after, and the one live score on the server (1000, from a
Cybertron kill) is untouched. The factor only bites in player-versus-player,
which has not happened yet on this server and will begin when a second person
joins. Landing it now means no human score was ever earned at the wrong rate.

**Alternatives rejected:**
- *Keep 100 and leave it declared.* Honest, but it preserves a number nobody
  chose, and every day of play makes it more expensive to correct.
- *Change it later, before the public launch.* Same change, strictly more
  cost: by then there is PvP score on the board earned at the wrong rate.
- *Rescore existing accounts.* Nothing to rescore — the only score on the
  server came from an AI kill, which this does not affect.

**Correction to the record:** the 2026-09-07 entry describes the deviation as
"real and worth keeping for now". Keep that text; this entry supersedes the
decision, not the history of how it was found.

## 2026-09-08 — Eight surviving hand-written lines go back to canon, even where ours said more

**Context:** the 2026-09-05 pass ("Invented text is replaced with canon") set
the policy and cleared 128 invented lines. A sweep of the remaining message
sites found eight it had missed. None of them appears in that entry's list of
deliberate exceptions, so none of them was a decision — they were residue.

The eight, and what canon says instead:

| ours | canon |
|---|---|
| `Torpedo locked on <target>.` | `TFIRE1` — "Torpedoes fired sir!" |
| `Missile locked on <target>.` | `MFIRE1` — "Missile fired sir!" |
| `Welcome aboard, <shipname>.` (3 sites) | `WELCOM` — "Welcome aboard Commander %s, the con is yours. Type ? if you need assistance." |
| `<old> renamed to <new>.` | `RENAME1` — "Your ship is now named The %s." |
| `New <class> purchased and docked at Zygor…` | `NEW3` — "You are now the proud owner of a %s." |
| `Insufficient credits. You need N cr but have M cr.` (hull) | `NEW4` |
| `Insufficient credits. Need N cr, have M cr.` (phaser/shield) | `NEW11` / `NEW8` |

**Decision:** all eight use canon's string.

**Reason:** the rule is that canon wins, and these are the cases where the rule
actually costs something — so they are the ones that test whether it is a rule.
Every one of ours carried MORE information: the torpedo line named your target,
the affordability lines quoted the shortfall, the rename showed both names. We
gave that up. A port that keeps canon's words except where it thinks of a
better sentence is a rewrite with a citation, and the landing page's "the same
words" claim would be false in exactly the places a returning player would
notice.

Three consequences worth stating plainly:

- **`WELCOM` is a net GAIN.** Ours had quietly dropped "Type ? if you need
  assistance" — in a game that is entirely typed commands, the only pointer to
  the help system a new pilot ever gets. It also greets the COMMANDER, not the
  hull: `GEFUNCS.C:172` passes `waruptr->userid`. Canon's `tossingegame` prints
  it on every boarding, first run and returning alike, which is why `WELBACK`
  ("Welcome back Commander %s") is dead text in the `.MSG` — nothing calls it.
- **The freshly-finalized `ShipState` has no username**, so the first-run
  welcome falls back to the JWT handle on `client.data`. Without that fallback a
  brand-new pilot is greeted by their internal user id.
- **The purchase hint stayed, as its own line.** Canon buys you a hull and drops
  you at the main menu where the fleet list waits; we stay in the cockpit, so
  the new ship is invisible until you ask for it. The hint is PORT-ORIGINAL and
  is kept separate from `NEW3` rather than folded into it. Its wording changed
  too: it said "reconnect to fly her", which stopped being true when `x` began
  returning to ship-select instead of disconnecting.

**Alternatives rejected:**
- *Keep ours where it is strictly more informative.* That is the argument for
  every one of the 128 lines already removed, and it is how the port drifted in
  the first place.
- *Append canon's line to ours.* Doubles the output and reads like a bug.

**Also:** the landing page claimed "the text on your screen is the text the game
printed thirty years ago, typos and all". Softened to "wherever the original had
a line for something, that is the line you get" — the port does add lines where
canon printed nothing, which `CHANGED` already admits, and an absolute claim a
player can falsify in one session costs more than the hedge saves.

**Tests:** `test/unit/canon-wording-restored.spec.ts` pins all eight against
`CANON_MESSAGES` byte for byte. Five existing tests asserted the old wording
and were corrected, not exempted — a test that encodes a deviation from canon
is wrong.

## 2026-09-08 — AI population scales with UNIVMAX; HYPDST1/HYPDST2 wired

**Context:** a review of whether the economy can be short-circuited — "come in,
take a few kills, own the best hull." Every per-kill number was checked against
the C and all of them are exact:

- canon's cash-grab on a kill is COMMENTED OUT (`GEFUNCS.C:1137-1140`); we
  correctly do not do it;
- cash moves player-to-player only, at `CHGLOSER` 2%, both sides human;
- kills pay in ITEMS, divided by `rnd()%5+1`, men and troops excluded,
  weight-gated by `chkweight`;
- Cybertron gold is `rnd()%1200`, gold sells at 1000 cr less a `1+doll/1000`
  fee, and among droids only the Murdonian carries any (`rnd()%250`).

Expected value per kill therefore runs ~2,400 cr for a Vakory or a Scow,
~62,000 for a Murdonian, ~275,000 for a Cybertron. And `GECMDS.C:4568` gates a
hull purchase on CASH ALONE — no score gate, no kill gate. So canon really does
let ~7 Cybertron kills buy a 2,000,000 cr Dreadnought. That is the original's
design: the only brake is that the gold sits on things that can kill you.

**The problem was not the payout. It was the density.** `tot_to_create` is a
fixed per-class count in `GECYBS.C` — 24 hulls in total — and canon never
scales it to the size of the galaxy. Canon puts those 24 in 601x601 = 361,201
sectors. We deploy `UNIVMAX` at 100, which is 201x201 = 40,401 sectors: the
same 24 hulls in an eighth of the area, so roughly NINE TIMES canon's density.
With per-kill economics canon-exact, credits-per-hour was ~9x canon and the run
to a Dreadnought ~9x shorter than 1992 ever allowed.

This deviation was never chosen. It fell out of the `UNIVMAX` one, and it is
the single biggest reason the economy would feel unlike the original.

**Decision:** `tot_to_create` now scales LINEARLY with `UNIVMAX`, floored at one
hull per class — `scaleAiPopulation` in `src/game/cybertron/cyb-population.ts`.
At our 100 that gives 3/2/1/2/1 = **9 Cybertrons**. At canon's 300 it is a
no-op and restores 10/5/1/6/2 = 24 exactly.

Also wired `HYPDST1` and `HYPDST2`, which `cybertron.config.ts` hard-coded as
25 and 10. Those are canon's values, so behaviour never diverged — but the
sysop options of the same name had no consumer: they appeared in `sys`, clamped
correctly, reported at boot, and changed nothing. A setting that looks live and
is not is worse than one that is absent. Five options remain
`implemented: false` and should stay that way; each configures something a web
port does not have (`FREEBIES`, `SHOWOPT`, `MAXPLREC`, `S00PLNUM`) or, in
`NUMSHIPS`' case, only SIZES a C array with no runtime gate behind it —
implementing it would be an invention, not a port.

**Reason for LINEAR rather than by area:** area is the honest model of density,
but 24 x (100/300)^2 is under 3 hulls, which empties the galaxy of the thing
players are meant to hunt. Linear keeps 9 — inside the range that felt right —
and is still a no-op at canon's size, so raising `UNIVMAX` for a busier server
later moves the population on its own with canon's numbers restored the moment
the galaxy is canon's size again. That property is the point: the next person
to change `UNIVMAX` does not have to remember this file exists.

**Droid population is deliberately NOT scaled.** Droids are ephemeral, capped at
`DROID_MAX_PER_CLASS` (2 each, 6 live), and canon gives gold to the Murdonian
alone — the Vakory and the Scow carry none. They are the low-value target
supply. Thinning them would leave a new pilot with nothing to shoot, and their
being gold-poor is exactly what makes planets worth developing instead.

**Alternatives rejected:**
- *Scale by area.* Under 3 Cybertrons. Correct model, unplayable result.
- *Pick a flat 9 and hardcode it.* Same numbers today, but it silently becomes
  wrong the next time `UNIVMAX` moves, which is the failure this whole entry is
  about.
- *Cut the per-kill gold instead.* That breaks canon-exact economics to
  compensate for a density problem — fixing the wrong variable, and it would
  have made the Murdonian and the planet economy wrong too.

**Tests:** `test/unit/cyb-population.spec.ts` pins the scaling (canon-exact at
300, 9 at 100, never zero for a class canon populates, scales back up). Two
older cybertron specs hardcoded canon's counts as fixtures while reading the
live config for caps; they now derive from the config, so a retune cannot fail
a test about boot-seeding or class selection.

## 2026-09-08 — `pln`'s heading is ours; its data row stays canon's

**Context:** a player ran `pln`, saw

    Planet Name         sector planet
    Colony #1               -4     5  1

and reported the sector numbers as wrong. They were not: the port's output is
byte-for-byte identical to canon. The heading is what is wrong, and it is wrong
in canon.

`cmd_planet` writes the row with a raw `prf`, not a message id:

    prf("%-20s %5d %5d  %d \r", planet.name, planet.xsect, planet.ysect, planet.plnum)
                                             ^^^^^^^^^^^^^^^^^^^^^^^^^^  three numbers

and heads it with `PLAMSG1`, `Planet Name         sector planet` — **two labels
for three numbers**. `sector` lands over the X, `planet` lands over the Y
SECTOR, and the planet number falls under no label at all. Read as written the
line says sector -4, planet 5, and a stray 1. The truth is sector (-4, 5),
planet 1, which is where that pilot actually was.

**Decision:** the heading becomes port-original —
`Planet Name              x     y  #` — and the data row stays byte-for-byte
canon. Same widths, same positions, same trailing space. Only the labels move,
so each sits over the column it names.

**Reason:** this is the "shape" decision of 2026-09-08 applied to a concrete
case — what is displayed stays canon, how it is LABELLED is ours. Canon's
heading is not a design choice we are overriding; it is a formatting bug in the
original that misinforms a reader on first contact, which is exactly how it was
found. The label is also not one of canon's *words* in the sense the landing
page promises: no prose changes, no message text is paraphrased, and the row a
player would compare against a 1992 screenshot is unchanged.

Note what was NOT done: the row was not widened to fit longer labels. Wider
columns would move every number and break that comparison, to buy nothing the
short labels do not already deliver.

**Alternatives rejected:**
- *Keep canon's heading and document it in the guide.* This is how the warp-8
  and "unless provoked" claims were handled, and it is right for PROSE the
  player reads once. A column heading is read every time the command is run,
  by someone who will not have the guide open, and it is misread in the
  direction of thinking the game is broken.
- *Drop the heading.* Loses the only cue that the two middle columns are a
  coordinate pair.

**Tests:** `test/game/commands/handlers/pln.handler.spec.ts` pins that each
label sits over the column it names, by slicing the header and the row at
canon's own column spans. Asserting the header STRING would not have caught
this — canon's string was perfectly well-formed, it just described a different
table.

## 2026-09-08 — WebSocket only; no long-polling fallback

**Context:** `socketClient.ts` sets `transports: ['websocket']`, which skips
Socket.io's default `['polling', 'websocket']` sequence — no HTTP long-poll
fallback and no upgrade dance. Raised while investigating the disconnect
window; confirmed deliberate rather than incidental.

**Decision:** keep it. WebSocket or nothing.

**Reason:** the fallback is worse than the failure it prevents. This is a text
UI driven by a 1-second tick with sector-scoped broadcasts; over long-polling
every tick becomes an HTTP round trip, and a player on that path would get a
laggy, misleading experience while believing the game itself is bad. A clean
"cannot connect" is more honest and easier to diagnose than a silently degraded
session.

**What it costs, stated plainly:** some corporate proxies and captive portals
block WebSocket upgrades. Those clients could have connected via polling and now
cannot connect at all. That is accepted.

**If a connection complaint arrives, do NOT fix it by adding 'polling' to the
transports list.** That trades one person's hard failure for every fallback
player's degraded session, and the degradation is invisible from the server
side. Diagnose the proxy instead.

**Related:** this is also WHY the ~45s disconnect window exists. An open TCP
socket can die silently — a closed laptop lid, a phone changing towers — so
Socket.io's heartbeat (`pingInterval` 25s + `pingTimeout` 20s, both default) is
the only thing that eventually notices. Holding a real socket is what makes the
heartbeat necessary; it is not a separate problem.

**Alternatives rejected:**
- *Default `['polling', 'websocket']`.* Broadest reach, but see above.
- *Polling as an explicit opt-in for blocked users.* A second code path,
  exercised by almost nobody, that would rot. Revisit only if real players
  actually turn out to be blocked.

**Note:** the Playwright e2e specs pin `transports: ['websocket']` too, so tests
and production agree on the transport rather than testing a path players never
take.

## 2026-09-08 — A destroyed hull logs its full manifest, and why it died

**Context:** asked whether a sysop could make a player whole after a death that
was not their fault — a deploy that bounced them, a flaky network, "call
waiting" in the old idiom. The answer was no, on two counts.

A destroyed hull row is DELETED, canon's `gepdb(GEDELETE)`, and nothing
recorded what was on it. The ship-loss mail carries the cause, the sector and
the killer's name but hardcodes `cash: 0n` and `itemqty: []`. The server log
said only `ship destroyed: victim=… attacker=…`. So the class, the phaser and
shield marks — the expensive part, a Mark-6 phaser being ~253,000 credits of
trade-ins — and the cargo, gold included, were all unrecoverable.

Worse for the case in question: `client.data.disconnectReason` distinguishes
'client namespace disconnect' (the pilot closed the tab) from 'ping timeout'
and 'transport close' (their connection died under them). All four sit in
`CLIENT_SIDE_REASONS`, the `cantexit` kill fires identically, and the reason
was discarded one line before it would have been the evidence.

**Decision:** the destruction handler logs a single greppable line carrying the
whole manifest — victim, attacker, cause, sector, disconnect reason when there
is one, ship name, class, phaser and shield marks, and every non-zero cargo
stack. At WARN, not LOG, because it is the line someone goes looking for months
later and it must survive a level that filters routine chatter.

    ship destroyed: victim=usr_a1b2:2 attacker=none cause=gravity sector=(-4,5)
    disconnectReason='ping timeout' name='WildCat' class=8(Dreadnought)
    phaser=6 shield=4 cargo=[missiles=3 torpedos=12 flux pods=5 food cases=40
    decoys=2 jammers=1 mines=9 gold=814]

It is built from the in-memory hull at the TOP of the handler, before the
eviction a few lines below, and it can never throw: losing the kill because the
forensics failed would be far worse than losing the forensics. A missing hull
degrades to `manifest=unavailable(hull-not-in-memory)` with the identity kept.

**Reason:** this is deliberately the CHEAP half of the problem. It changes no
schema, adds no query surface, and starts working immediately — which matters
because anything lost before it ships is already gone, including anything lost
during the playtest week now under way. A `ShipLoss` table would be queryable,
survive log rotation and could back a `sys` command, and remains the right
answer later; it is not worth blocking the recoverability of the next bad death
on designing it.

**Alternatives rejected:**
- *A ShipLoss table now.* Better end state, but a migration and a schema
  decision stand between the problem and any fix at all.
- *Put the manifest in the ship-loss mail.* It is the player's mail. A pilot
  does not need an itemised list of what they lost, and `MailStat` has no shape
  for it beyond the `itemqty` array, which would then mean something different
  here than in every other mail type.
- *Log at LOG level with everything else.* Filtered out exactly when it is
  wanted.

**Note on scope:** this records what was lost. It does not decide when a sysop
SHOULD restore, and there is deliberately no restore tooling — a manual
judgement with the evidence in hand is the right shape while the population is
small.

**Tests:** `test/gateway/ship-loss-forensics.spec.ts` — fittings, cargo, cause,
the closed-tab-versus-dropped-connection distinction, and the degraded path.

## 2026-09-08 — A burst of log lines is not a scroll gesture
**Context:** Playtest: "↓ jump to latest" flashed on during combat without the
reader touching the log, and once stayed on, forcing a click to resume
following.
**Decision:** `EventLog` records the scroll position it writes itself (read back
after the write, so it is the browser's clamped value) and ignores any scroll
event still reporting that exact position.
**Reason:** The scroll event for a programmatic write is dispatched in the NEXT
frame's scroll steps, before that frame's rAF callbacks. A burst arriving in
between grows `scrollHeight` while `scrollTop` still holds what we wrote, so
distance-from-bottom reads the growth as reader movement. Whether that showed as
a flicker or a stuck log depended on a race: the effect cleanup calls
`cancelAnimationFrame` when sticky flips, so if the pending rAF had already
fired the log recovered on the next event, and if the cleanup won it stopped
following for good. One cause, two symptoms.
**Alternatives rejected:** Raising `STICKY_THRESHOLD` again — the growth in one
frame is unbounded during combat, so no fixed pixel tolerance is safe, and a
larger one erodes the genuine scroll-up it exists to detect. Debouncing the
handler — it would delay the reader's real gesture to paper over ours.

## 2026-09-08 — DIED: the killer-less death was never announced
**Context:** Playtest showed `Cybrg-222 has been destroyed!` — the internal
account name of a Cybertron, which no pilot should ever see. Canon's
`username()` (GEFUNCS.C:2596-2604) returns the SHIP name for a CYBORG or DROID
class precisely so the `Cybrg-NNN` row that gives an automaton a database
record stays off the screen.
**Decision:** Wire canon's `DIED` (GEFUNCS.C:1263) in the gateway and stop the
React client composing destruction lines of its own.
**Reason:** `killem` branches at GEFUNCS.C:1104 on whether a ship fired the
fatal shot: KILLEDBY if one did, DIED if none did. We had implemented only the
first, so a self-destruct, a gravity crash and a colony's ion cannons — every
death not caused by another ship — were announced by nothing. The client filled
the gap with a line of its own whose fallback printed `victimUserid`. Once the
server sends canon's words the client's line is also a duplicate: bystanders saw
both KILLEDBY and the invented line for one kill, and the dying pilot saw both
YOURDEAD and "YOUR SHIP HAS BEEN DESTROYED".

Two details of DIED are canon and easy to get wrong: it goes out with `ALWAYS`,
not `FILTER`, so it reaches pilots who have muted the galaxy feed
(GEMAIN.C:2557-2561); and its subject is the ship name followed by
`username()`, so an automaton reads "The Cyberquad 44135, Commanded by
Cyberquad 44135" — canon's own output, because both arguments resolve to the
shipname for an AI.

This also corrects a comment we had written in the gateway claiming an ion kill
is one "nobody hears about". Canon announces it; it simply takes the DIED
branch, because `fireion` sets the victim's lastfired to -1 (GEFUNCS.C:1797).
**Alternatives rejected:** Keeping the client's line and only fixing the name —
it would still double every kill announcement. Removing the client's line
entirely — an ion kill would then lose the planet's name, which canon's DIED
does not carry and which is the only way a defender learns their own colony
made the kill; that one line survives as a documented deviation.

## 2026-09-08 — Kills owed at shutdown are settled before the process exits
**Context:** A Sarten Obliterator died on the deployed server four seconds
after a watchtower redeploy, carrying 1,146 gold, with `attacker=none`. The
forensics manifest added the day before is what made it legible.
**Decision:** `CombatTickService.beforeApplicationShutdown` runs the
kill-resolution pass once on the way out, emitting with `emitAsync` and awaiting
the listeners, and the three COMBAT_SHIP_DESTROYED listeners now return their
database work instead of voiding it.
**Reason:** A ship dies on the PHYSICS tick once `damage >= 100`, so up to six
seconds separate the fatal shot from the kill. `damage` is a persisted column;
the attacker's identity is not — `attackerSnapshot` is rebuilt per tick,
`lastfiredBy` has no column at all, and `lastfired` holds a channel number that
means nothing after a restart. Stopping inside that window flushed a hull at
damage >= 100 and left the first tick after boot to kill it with nobody to
credit: `resolveKillSpoils` needs an attacker, so the kill, the score and the
whole hold were destroyed rather than transferred.

Nest runs every `onModuleDestroy` before any `beforeApplicationShutdown`, and
TickService stops its timers in the former, so the drain cannot race a live
tick. The gateway's hull DELETE stays fire-and-forget on the live path — a tick
must not block on Postgres — but is now returned so the drain can await it;
without that the process could exit on top of the write and leave exactly the
row this fixes.

Canon has no counterpart: its server did not redeploy underneath a fight.
**Alternatives rejected:** Persisting `lastfiredBy` so a kill can be attributed
after a restart — narrower, needs a migration, and still loses the loot when the
attacker has since disconnected. Doing nothing and scheduling deploys around
players — that is worth doing anyway, but it makes the loss rarer rather than
impossible.

## 2026-09-08 — A recycled Cybertron slot no longer inherits a destruct timer
**Context:** Found while investigating the Obliterator death. Unrelated to that
incident's cause, but the same shape of latent defect.
**Decision:** `createSpawn`'s upsert `update` branch resets `destruct` to 0
along with the two dozen fields it already reset.
**Reason:** The branch exists because a dead Cybertron's row is not always
deleted (P-007), so the slot's next occupant must get a clean hull. It cleared
damage, energy, speed, shields, cloak, cantexit, lastfired, the projectile
arrays, kills and hostile — but not `destruct`, and
`ShipManagementTickService.destructTick` acts on any value above zero. A brand
new Cybertron could therefore detonate seconds after spawning for something the
previous ship did, and the death would surface as `attacker=none cause=unknown`
with no way to explain it.

Canon assigns `destruct` nonzero in exactly one place across the whole original
— `cmd_destruct` (GECMDS.C:5031), on the calling player's own ship — and zeroes
it for every new hull (GEFUNCS.C:256). An automaton never sets it, which is why
canon's help calling Cybertrons prone to "malfunction" (MBMGEHLP.MSG:416) means
their strange transmissions, not self-destruction.
**Alternatives rejected:** Zeroing `destruct` for AI ships at hydration as well
— it would also disarm any countdown already persisted from before this fix,
but it mutates a hot path on every boot to cover a case we have not confirmed
exists. Left as a note instead.

## 2026-09-08 — Two hydration paths disagreed about who is dead
**Context:** `Cybrg-222:222`, a Sarten Obliterator holding 1,146 gold, was
announced destroyed four seconds after a redeploy with `attacker=none`, and had
been announced before. The production row explained it: `destruct = 0`,
`damage = 110.62`, still present.
**Decision:** `ShipStateService.onModuleInit` now queries
`{ status: GESTAT_AUTO, damage: { lt: 100 } }`, the same rule
`CybertronRepository.hydrateAll` already applied in code.
**Reason:** Two boot paths load AI hulls and only one refused corpses. The
Cybertron repository skipped `damage >= 100` and its comment names this exact
failure — "otherwise runKillResolution re-processes the persisted kill on the
first physics tick after boot and emits a phantom COMBAT_SHIP_DESTROYED to all
clients" — but `ShipStateService` runs FIRST and took every GESTAT_AUTO row, so
the corpse was in the map before the repository declined to add it. The boot log
showed the disagreement plainly: 24 ships hydrated, then 23 Cybertrons.

It repeated because the gateway never deletes an AI hull ("death/persistence
owned by the AI layer"), so the row survives at damage >= 100 and the next
restart replays the whole thing. Every deploy re-killed the same ship and told
every player about it.

The guard belongs in the query rather than in a loop: this path selects only
AI hulls, so no player ship is affected, and filtering in SQL does not grow with
the size of the graveyard.
**Alternatives rejected:** Deleting AI hulls on death — it is the AI layer's job
to recycle the slot (P-007), and `createSpawn`'s upsert depends on the row.
Zeroing `damage` at death — that resurrects a ship that was destroyed.
**Note:** the same-day shutdown drain is still right and still needed; it stops
a kill being *owed* across a restart. This is the different failure of a kill
already *taken* being replayed.

## 2026-09-09 — Another player's position is scoped to your own sector
**Context:** Playtest question: "when someone is online, it will always tell
others their sector? was that canon?" It was not. Canon's `who` (GECMDS.C:5162)
prints your own BBS id back at you — three lines, no roster. `ros`
(cmd_geroster, GECMDS.C:4008) lists userid, score, kills, planets and
population, with no coordinates anywhere. A live player's position came from
`sca`, which is gated on your scan range AND fires SCAN1/SCAN2/SCAN3 at the
target so they know they were looked at, or from `spy` — which is planet-only
and consumes an item. There is no canon command that quietly says where someone
is.

This port had two. `who` printed every player's exact sector, and the player
panel was a live tracker: `player.snapshot` carried everyone's sector and
`physics.sector-transition` was `server.emit`-ed to every socket carrying the
mover's raw x/y — finer than a sector — on every boundary crossing. Free,
unlimited-range, silent intelligence, and it left `sca` with nothing to offer
against a player.

**Decision:** Names stay public; positions are scoped to the viewer's own
sector. `who` prints `(  -,  -)` for anyone elsewhere; the panel renders an em
dash. `physics.sector-transition` now goes to the mover alone — its one
consumer is their own ScanMap (FR-013) — and the panel is driven by a new
`player.sector` event whose audience the gateway scopes per sector room.

**Reason:** The gate has to sit on the wire. Filtering in the UI would leak
straight back out through devtools, so the client must never HOLD a position it
may not show. Same-sector is the right line because a scan would have found them
there anyway, so nothing is revealed that play would not have.

**Alternatives rejected:** Canon-strict (drop the column entirely) — the panel
is nearly empty in a small galaxy and the roster is the reason it exists. Keep
it and document it — a deviation this large is not made acceptable by a footnote,
and it devalues `sca` as a verb.

**Known deviation both ways:** canon shows no positions at all. Noted on the
`sca` guide page, the only slug a player reads before scanning.

## 2026-09-09 — `dat` reports your own ship, as canon's always did
**Context:** Raised in play — "not sure I like the command dat <fragment> as
that gives full info on another players ship." It does, and it was the same
leak as the sector column but larger.

Canon's cmd_data (GECMDS.C:5829) is a machine-readable dump for a front-end
terminal program: gated behind `dat qazwsx <report|scan|sector>`, anything else
returning INVCMD, and every field printed from `warsptr`/`waruptr` — the
CALLER's ship and user record. No target argument, no other ship.

The port recast it as "a player-facing scouting verb" (spec 012 D1) taking a
name fragment, returning for ANY ship in the galaxy, at unlimited range,
silently, with no notice to the target: exact sector, heading, speed, energy,
damage, kills and the full cargo manifest including gold. Canon has no way to
learn another ship's cargo at all — `spy` is planet-only, orbit-only and burns
an I_SPY item. It also matched on `!cloak` rather than `cloak < 10`, so a ship
spinning up its cloak stayed exposed, and it excluded no AI, so every
Cybertron's hold was public.

**Decision:** `dat` takes no argument and reports the caller's own ship. Given
one, it says so and points at `sca sh <name>`.

**Reason:** What a pilot may learn about someone else's ship is what `sca sh`
shows — range-gated, and it announces itself to the target. Cargo is not on that
list in canon at any range, by any command.

**Alternatives rejected:** Restoring canon's `dat qazwsx report` protocol dump —
nothing in a browser parses `UD1:` lines, so the readable format stays and only
the subject changes. Deleting the command — `rep` does not show the hold in one
block, and the verb is still useful pointed at yourself.

## 2026-09-09 — The movement stride is indexed by the ship, not by the fleet
**Context:** A playtest report of a chased Cybertron that "jumped distances"
turned out to be a misread scan, but looking for it found a real defect.

Canon strides the ship table by 3 on the 1-second timer, indexed by `zothusn` —
the ship's own table slot, fixed for as long as it is in the game
(GEMAIN.C:2462-2493). The port strided on POSITION in a freshly sorted snapshot
instead. Position is a property of the fleet, not the ship: every ship after a
departure shifts down a slot, every ship after an arrival shifts up. A ship
moving on clicker 0 silently becomes a clicker-1 ship, and depending on where in
the cycle the change lands it either moves twice in consecutive seconds — a
double-length step — or waits up to five seconds and lurches.

Cybertrons die and respawn constantly and players board and unboard, so it fired
often. Rotation, acceleration and the self-destruct countdown ride the same
strided loop, so all four stuttered together.

**Decision:** Stride on `ShipState.channel`, this port's `usrnum` — acquired on
the same line that inserts a ship into the map (`ShipStateService.enter`) and
held until it leaves. Ships constructed outside that path (test doubles only)
fall back to slot 0.

**Reason:** Canon's cadence is a property of the ship. Anything derived from
list position reintroduces the coupling.

**Alternatives rejected:** Hashing the ship key as the fallback — better load
smoothing for channel-less doubles, but it made every single-ship harness
non-deterministic about which second its ship moves, for no production benefit
since production ships always have a channel.

## 2026-09-09 — `set auto-shield` and `set auto-repair` removed
**Context:** Playtest question — "is `set auto-shield on` canon, and if so what
does it actually do?" It is not. `cmd_set` has `#define NUMOPTS 4` and exactly
four names: scannames, scanhome, scanfull, filter. Both extra options were port
inventions (spec 019 US3/US4), and neither was a harmless convenience.

`auto-shield` reversed a rule canon states in capitals in its own help:
"NOTE: When firing a weapon with the shields up, the shields will be
automatically lowered. They WILL NOT be automatically raised after the firing."
(MBMGEHLP.MSG HLPSHI). Canon drops shields to fire — GECMDS.C:930 phaser, :1130
torpedo, :1241 missile — and leaves them down; that cost is the design. It also
never worked as written: `torpedo.handler.ts` set the trigger and
`cantexit = FIRETICKS` in the same mutate, and `decideAutoShield` bails while
the battle lock is up, so the flag latched and shields popped up whenever the
fight ended instead.

`auto-repair` silently ran `mai` on a tick, charging the pilot cash with no
price quoted. Canon's maintenance is a command you issue, with the bill in
front of you (cmd_maint, MAINT5).

**Decision:** Both options gone, with their flags, their trigger fields and the
`autoShield`/`autoRepair` columns.

**Reason:** An invention that contradicts an explicit canon design statement is
not a QoL feature. `GECMDS.C:1172` and `:1332` do call `shieldup` after firing,
but the preceding `shielddn` sets `shieldstat = SHIELDDN`, so the `== SHIELDUP`
test above them can never be true — vestigial code, not evidence of intent, and
the help settles it either way.

**Alternatives rejected:** Keeping them and documenting the deviation — a
deviation that reverses a stated rule is not made acceptable by a footnote.
Fixing auto-shield's `cantexit` guard so it worked as advertised — that would
have made the contradiction complete rather than partial.

## 2026-09-09 — One owner for the shield power collapse
**Context:** Chasing the above, the low-energy collapse turned out to be
implemented TWICE, both on the 6-second tick:
`ShipManagementTickService.shieldPowerTick`, which drops shields and emits
SHDNNOP ("Shields have come down due to lack of power, Sir!!!"), and
`ShipTickService.processRestorativeTick`, which dropped them silently.

Whichever ran first won; the loser then saw `shieldstat !== SHIELDUP` and
returned. When the silent one went first, a pilot lost their shields with
nothing on screen — and the outcome depended on module init order.

**Decision:** `ShipTickService` keeps the CHARGE half of canon's branch and no
longer drops. `ShipManagementTickService` owns the collapse.

**Reason:** Canon's `shieldstat()` (GEFUNCS.C:1340-1348) is one function with
one narration. Two implementations of one rule cannot both be right, and the
silent one loses by construction.

## 2026-09-09 — Economy invariants belong to Postgres, not to the scheduler
**Context:** M1/M2 of the security review. `buy` read the balance with a bare
`findUnique`, awaited the planet transaction, then decremented unconditionally;
`tra down` checked cargo synchronously, awaited the deposit, then decremented
the hull. Nothing serializes one socket's commands — the gateway fires
`dispatch` and only `.then()`s it — so twenty packets all reach the first await
before any resolves. Measured on a real database: a 1,000-credit balance went to
**−19,000**, and a 100-gold hold put **1,000 gold** on a planet and went to −900.
Both debts die with the hull; the goods do not.

**Decision:** Part B — make each invariant a single statement Postgres enforces.
- Every cash debit is `updateMany({ where: { userid, cash: { gte: cost } } })`
  and `count === 0` means refused. Sites: `buy` (via a `debitBuyer` callback
  invoked inside the planet lock, before any goods move), `new ship` (which also
  moved to an interactive transaction so the fleet cap is in the same WHERE),
  and `maintenance`.
- `depositToPlanet` re-reads the hull and decrements it INSIDE `runSerialized`,
  copying `PlanetStateService.sell()`, and clamps at zero.

**Reason:** A lock that does not cover the value being checked is not a lock.
The planet lock was held while the ship's cargo was read outside it, and the
cash gate was evaluated against a snapshot taken before the lock existed.

**Alternatives rejected:** Serializing dispatch per socket alone (Part A) — it
narrows the window but leaves the invariant unenforced against a second socket
on the same account or a tick interleaving with a command. Deferred as a
separate change.

**Note on the clamp:** `buy.handler`'s negative-balance reset to zero is canon
(GECMDS.C:4205-4207) and stays. Canon was safe because MajorBBS ran one command
per user; the clamp is not the defect and should now be unreachable.

## 2026-09-09 — Part A: one command at a time, per socket
**Context:** `handleCommand` fired `dispatch` and only `.then()`-ed it, so a
handler that awaits the database released control and the same socket's next
command started immediately. Part B already made the money and cargo invariants
hold whatever the timing, so this is no longer what stands between a player and
free credits.

**Decision:** Chain each command onto a per-socket promise held on
`client.data`, and `await` the dispatch inside it.

**Reason:** Three things B does not give us. Commands complete in the order
typed, which canon got for free by running one command per player. The ship is
looked up AFTER the previous command finished, so `x` followed by anything
cannot act on a hull just left. And the next async handler anyone writes is safe
by default rather than only if they remembered to make its read-and-write
atomic.

**Cost, measured:** every combat and navigation command — `pha`, `tor`, `mis`,
`shi`, `clo`, `dec`, `loc`, `rot`, `war`, `imp` — makes ZERO database calls, so
each runs to completion synchronously and the queue adds one microtask. A pilot
can only be delayed behind a command that touches the database, and those are
the trade and admin verbs, which need orbit and are not available mid-fight.
`att` is the one battle-adjacent exception: it awaits, so a `pha` typed straight
after one waits a single round trip.

**Not covered, deliberately:** the 1s and 6s ticks. They mutate ship state on
timers and were never in this queue, so the world does not pause for it —
movement, shield charge and torpedo flight continue while a command is queued.
Only data-layer invariants hold against those, which is why B came first.

**Known new failure mode:** a handler whose promise never settles would stall
that one player's queue. Prisma rejects on timeout rather than hanging, and the
rejection path is tested — a failed command moves the queue on rather than
silencing the player. No arbitrary timeout was added: one firing while a command
actually commits would report a failure that did not happen.

## 2026-09-09 — The last three leads: chat throttle, socket cap, non-root container
**Context:** The three remaining unconfirmed leads from the security review,
taken on the condition that none of them changes play.

**Decisions:**
- **`sen` rate limit** — 5 sends per 5 seconds per pilot, rolling window.
  PORT-ORIGINAL: canon throttles `send` not at all, because MajorBBS gave one
  command per user per pass and a flood was unreachable from a terminal. A
  refusal is deliberately NOT recorded, or a flood would extend its own ban and
  the attacker would control the punishment's length. A person sending a
  considered line manages one every few seconds, so a conversation never meets
  it; a script meets it on its second breath.
- **4 sockets per account, evicting the OLDEST.** Refusing the newcomer would
  let a player's own stale tabs lock them out of their own account — a
  hardening measure turned into a denial of service against the person it
  protects. Eviction is also the rule already used for a boarded ship (latest
  wins, SESSION_REPLACED), so this is one rule applied twice rather than two.
- **`USER node` in the backend image**, with `--chown=node:node` on the runtime
  COPYs.

**What the container change cost, and why the build mattered:** the static test
passed on the first attempt and the image did not. Prisma verifies it can WRITE
to `/app/node_modules/@prisma/engines` before it will run, so a non-root
container with root-owned modules fails `prisma migrate deploy` — and the
entrypoint is `set -e`, so that is a container that exits rather than a game
that starts. Watchtower would have pulled it and left the game down. Caught by
building the image and booting it against Postgres; healthy in 9 seconds after
the `--chown` fix. `npx` also went, since it wants a writable `$HOME` cache.

**Reason for verifying by boot rather than by test:** CI has no Docker daemon,
so the spec can only guard the directives. A Dockerfile that reads correctly and
does not run is the failure this pair of checks exists to prevent.

---

## 2026-09-09 — Licensing: AGPL-3.0-or-later, and who is actually owed credit

**Context:** the owner was told by a third party that this port sits under the
AGPL and must credit Elwynor Technologies. Neither half turned out to describe
the code we work from, but checking it surfaced a real gap: the repository had
no LICENSE file at all, and no attribution anywhere, while running a public
service built on someone else's copyleft source.

**What the files actually say.** Every C file in the vendored distribution
carries the same header: `Copyright (C) 1988, 89, 90, 91, 92 Michael B.
Murdock`, released under "the GNU General Public License ... either version 2
of the License, or (at your option) any later version". Not the AGPL. Elwynor
appear nowhere in the distribution.

The republished copy we vendored (`github.com/bsimser/ge`, retrieved
2026-09-02) adds an MIT `LICENSE` at its root. **That file does not govern.** A
republisher cannot relicense an upstream author's work by placing a file beside
it; Murdock's per-file notices are the grant. Inbound terms are therefore
GPL-2.0-or-later.

**Where the AGPL claim comes from.** Amended 2026-09-09, after the source of
the heads-up became clear: it came from ManicPop.org in the `ge-next` Discord,
and `github.com/manicpop/ge-next` is a 2024 fork of **the same `bsimser/ge`
upstream this project vendored**. So the first reading of this entry — "they
were talking about a different codebase" — was wrong and is withdrawn.

Their position is about who holds the rights today, not about who copied what.
`ge-next` licenses itself AGPL-3.0-or-later, claims copyright over its own
modifications only, and attributes the underlying work as "Galactic Empire,
copyright (c) 2025 Elwynor Technologies". Elwynor state they took over the MBM
products and released their own 32-bit Worldgroup port publicly in 2021.

Two things follow, and they are separate questions:

- **Compliance.** Murdock's per-file GPL grant runs with the code and cannot be
  withdrawn by a later owner. Who holds the copyright now does not change what
  this project is permitted to do.
- **Credit.** It does change who is owed acknowledgement. `NOTICE`, the README,
  `CLAUDE.md` and the `/provenance` page now name Elwynor as the game's current
  stewards, alongside the unchanged statement that no code, data or fix from
  their port is used here. Both halves have to stand together: the first alone
  would credit them for work they did not do, the second alone reads as a
  brush-off. `provenance.spec.tsx` pins both.

Neither Elwynor's acquisition nor `ge-next`'s copyright line was verified — both
are stated claims, taken at face value for the purpose of giving credit, which
costs nothing if true and nothing if not.

**Decision:** this port is licensed **AGPL-3.0-or-later**. `LICENSE` carries the
canonical FSF text; `NOTICE` carries the attribution chain, the list of what is
embedded verbatim, and the Elwynor correction. The seven generated files that
embed Murdock's text and data carry a header naming his copyright, and the six
generator scripts emit that header so regeneration keeps it.

**Reason:**

- The port embeds canon verbatim — 1,070 message strings, the 34-class ship
  table, 61 help entries, the class pages, both AI taunt catalogues and the
  neutral-zone fixture. This is not a clean-room reimplementation and it would
  be dishonest to license it as though it were.
- GPL-2.0-or-later permits moving to a later GPL, and the AGPL is the member of
  that family whose §13 matches what we actually are: software people use over
  a network without ever receiving a copy. Under the plain GPL, running this
  site would owe nobody anything, which is a technically correct answer to a
  question the original author's own note was not asking.
- It matches what Elwynor chose for their port, so the community reads it as
  good faith rather than as a loophole.

**Alternatives rejected:**

- **GPL-3.0-or-later** — the straightforward upgrade path, and defensible. It
  simply does not reach the network case, which is our only distribution.
- **GPL-2.0-or-later**, mirroring the inbound terms exactly — the most
  conservative reading, and the easiest to argue. Rejected for the same reason:
  no network clause.
- **MIT, following the republisher's file** — rejected outright. The file is
  wrong about its own contents.
- **Attribution without a licence** — leaves the gap open while the service
  runs.

**Consequence, and the part that is not finished.** AGPL §13 entitles a player
to the source of the service they are using. The repository is still private by
the owner's decision, so that offer is not yet satisfiable. The `/provenance`
page and its `SOURCE_URL` constant carry a comment saying the page must not be
deployed while the link is dead. Going public, or arranging another route to
the corresponding source, is the open item.

**This decision is still reversible, and only until publication.** Nothing has
been distributed — private repository, no published images, no player offered
the source — so the choice between AGPL-3.0 and GPL-3.0 is genuinely open as of
2026-09-09 and will not be once the repo is public, because a copyleft grant
cannot be withdrawn from the version it goes out on. The full decision brief,
including the one-repo-or-two question and the six things that must be true
before publishing, is in the "Backlog — going public" section of
`docs/PROGRESS.md`.

**Not legal advice.** This entry records what the licence files say and what was
decided on that basis. Whether a TypeScript reimplementation written from GPL C
source is a derivative work is a judgement, not a fact that was checked; the
verbatim data makes the question live rather than academic, which is why the
conservative answer was taken.


## 2026-09-10 — `rep sys` reports whether the phaser will FIRE, not whether it has charge

**Divergence marker:** `@divergence rep-sys-phaser-readiness`

**Context:** a citation-and-divergence guard added on 2026-09-10 traps the prose
people write when they notice a divergence and park it instead of ruling on it.
Its first run found this one, sitting in a test docblock since the report
handler was written, in words good enough to read like a decision had been
taken. Nobody had taken one.

**Decision:** keep the port's behaviour. `rep sys` prints REP23 (operative) when
the bank holds at least `PMINFIRE`, and REP24 (inoperable) below it.

**Reason:** canon prints REP23 whenever `warsptr->phasr > 0`
(GECMDS.C:2018-2022 `if (warsptr->phasr > 0)`) while `cmd_phas` refuses to fire
below `PMINFIRE`, which is 60. So in the original, a bank recharging through the
0-59 band reports itself operative and then declines to shoot. The port's
version answers the question the pilot is actually asking. A report that says
your weapon works when it does not is the kind of thing that loses a ship, and
this is the one place a player checks before committing to a fight.

**Alternatives rejected:** matching canon exactly, which is normally this
project's default and is a one-word change (`ship.phasr > 0`). Rejected because
the divergence makes the report MORE truthful about the code beneath it rather
than less, and because canon's own help does not promise the looser reading.
Also rejected: printing the percentage, which is what this port did before —
canon has two lines here and no number, and inventing a third is a bigger
departure than tightening a threshold.

**Player-visible:** yes, and recorded in `GUIDE_DEVIATIONS` on the `report` page.


## 2026-09-10 — the comment layer stays, and it is an asset for going public

**Context:** the runtime port is 46,349 lines of which 15,017 are comments, 35%
of every non-blank line. That number stood out while counting the codebase ahead
of publication, and the question was whether it is documentation or narration.

**Decision:** keep it. No comment-stripping sweep, now or before the repository
goes public.

**Reason:** it was sampled rather than guessed, and the split is not what the
headline number suggests.

| backend `src` comment lines | | |
|---|---|---|
| carry a canon citation, `@see`, or a `.MSG` reference | 11,031 | 80% |
| prose with no canon reference | 2,840 | 20% |

Of the prose, 350 are standalone single-line comments and a restatement
heuristic — most of the comment's words already appear on the line below, and it
adds no clause of its own — flags 23. Reading the flagged set, several are
useful anyway: the numbered gate markers in the weapon handlers mirror canon's
own ordering, and one is the production formula written out above the
expression that implements it.

So the removable narration is on the order of a hundred lines in 41,782. Call it
0.2%. Recovering it would mean a sweep across 270 files with 11,031 lines of
canon reasoning sitting next to it, and the failure mode of that sweep is
deleting the reasoning.

The 80% is the argument-with-canon layer, and it is the reason this port can be
audited at all. When a constant is 21 rather than 1, the paragraph explaining
that 1 is the numopt FLOOR is the only thing standing between the next reader
and a mistake this codebase has now made three times. When behaviour deviates,
the note saying so is what makes a later fidelity fix safe rather than a
suspected regression — two droid defects were corrected on 2026-09-10 precisely
because their characterization tests said "canon differs, do not read a change
here as a regression".

**For a public repository specifically, that layer reads as evidence, not
clutter.** The claim on the landing page is a faithful port of someone else's
1988 game. A reader with the original source open can check that claim line by
line only because the citations are there. Stripping them would leave the claim
unfalsifiable, which is worse than verbose.

**Alternatives rejected:** removing the ~23 flagged restatements. The churn
across a dozen files is not worth ten lines, and the diff would be noise in the
history for anyone later trying to see when behaviour changed. They can go when
someone edits those files for a real reason.

**One real cleanup item does follow, and it is NOT about volume.** 55 source
files cite internal paths — `specs/022-fidelity-audit-v2/findings.md`,
`docs/audits/2026-09-09-security-review.md` and similar. If `specs/` and
`docs/audits/` do not ship with the public repository, those become references
to nothing. Either publish them, or rewrite those references to state the
finding inline. That is part of the going-public decision recorded in the
"Backlog — going public" section of `docs/PROGRESS.md`, not a separate one.

**Not re-litigated without new measurement.** If the question comes back, count
first: the sampling above is reproducible and took minutes.

## 2026-09-10 — TypeScript pinned at 6.0.3, not 7, until Vitest replaces Jest

**Context:** phase 0 of the restructure (`restructure` branch,
`docs/superpowers/specs/2026-09-10-restructure-design.md`) bumped the backend
compiler from TypeScript 5.7 to the newest release that still works, ahead of
NestJS 12/Vitest work in phase 5. TypeScript 7 was on the table — its
typescript-go rewrite is 8-12x faster on this codebase's 137k lines — but it
was rejected for now.

**Decision:** pin TypeScript at exactly `6.0.3` in both `backend/package.json`
and `frontend/package.json`. Do not bump to 7 until `ts-jest` is gone.

**Reason:** `ts-jest` (the backend's Jest-to-TypeScript bridge) declares a peer
range of `typescript: ">=4.3 <7"`. Installing TypeScript 7 today would either
fail the install outright or run with an unsupported compiler underneath
every backend test. NestJS 12's own toolchain replaces Jest with Vitest,
which has no such ceiling — that swap is scheduled for phase 5, and TypeScript
7 moves with it, not before.

Two compile-time-only `backend/tsconfig.json` additions were required to reach
a clean `tsc --noEmit` under 6.0.3, both config, no runtime effect:
- `"ignoreDeprecations": "6.0"` — TypeScript 6 deprecates the
  `moduleResolution: "node"` alias ahead of TypeScript 7 removing it outright
  (see the "Blockers and constraints discovered" section of
  `docs/superpowers/specs/2026-09-10-restructure-design.md` for the full
  chain to phase 5); this is the exact silencing flag TypeScript's own error
  message prescribes, and it changes zero resolution
  behaviour.
- `"types": ["jest", "node"]` — TypeScript 6 stopped automatically including
  every installed `@types/*` package's ambient globals when no `types` array
  is set; without this, `describe`/`it`/`expect`/`jest` stopped resolving.
  Verified safe: every other `@types/*` package in the backend (~35 of them —
  `express`, `bcrypt`, `cors`, `passport`, `validator`, etc.) is consumed via
  an explicit `import`, never as an ambient global, so narrowing `types` to
  just the two that are actually used as globals dropped nothing. Confirmed
  by a clean `tsc --noEmit` across `src/**` too, not just `test/**`.

**Alternatives rejected:** staying on TypeScript 5.7 (loses nothing this
phase needed, but phase 0's brief was to modernise the toolchain wherever
behaviour-neutral, and 5.7 to 6.0.3 was a straightforward, low-risk step
worth taking now rather than stacking two major bumps into phase 5).

**Record this so nobody "helpfully" bumps `typescript` to `^7` in a routine
dependency update** — it will break the backend test runner, not just emit a
warning.

## 2026-09-10 — oxlint, not ESLint, and its current rule shape

**Context:** the backend had no linter at all before phase 0 (strict TS was
carrying that weight; only 4 `any`s existed). The restructure's toolchain pass
needed to pick one, wired into CI for both apps.

**Decision:** oxlint, over ESLint + typescript-eslint.

**Reason:** oxlint's type-aware linting went stable in July 2026, covers 59 of
typescript-eslint's 61 type-aware rules, and runs 20-40x faster (measured on
this repo: ~0.26s backend, 41,826 src + 95,041 test lines; ~0.19s frontend).
NestJS 12's own toolchain is moving to oxlint, so this is also the direction
upstream is heading, not a contrarian choice.

**What actually shipped is narrower than the pitch, and that gap is real, not
hidden.** Type-aware linting (`oxlint-tsgolint`) is built on typescript-go
tracking TypeScript 7, and TypeScript 7 removed the `moduleResolution: "node"`
alias that `backend/tsconfig.json` still uses (see the TypeScript-6-pin
entry above, and the restructure spec's "Blockers and constraints discovered"
section for the full chain to phase 5) — so tsgolint refuses the
backend's tsconfig outright before analysing anything. **Backend oxlint
currently runs syntax-only.** Frontend already uses
`moduleResolution: "bundler"`, so it runs `--type-aware` cleanly. Both apps
share one `.oxlintrc.json` at the repo root; only the invocation differs.
`oxlint-tsgolint` stays installed as a devDependency in both apps for phase 5,
when the `moduleResolution` move unblocks backend type-aware linting too — it
costs nothing at rest.

**The lint gate's rule exceptions, and why each exists** (`.oxlintrc.json`,
enforced by `backend/test/unit/lint-gate.spec.ts`, 7 tests):

- `unicorn/no-new-array` is **off, repo-wide**. `new Array(n).fill(x)` is a
  deliberate fixed-length idiom used at 27 sites in `backend/src/**`
  (`galaxy.service.ts` x18, `midnight.repository.ts` x5, `planet-seed.ts` x2,
  `droid-decisions.ts` x2). The unicorn rule's preferred alternative
  (`Array.from({length:n})`) is not more correct, only a style preference —
  it only reached the correctness category by default classification, not by
  merit here.
- `eslint/no-unused-vars` is set to **`warn`**, everywhere, not `off` and not
  `error`. It reports 111 real dead-import/declaration findings: 41 in
  `backend/src/**`, 70 across 46 backend test files, 6 in frontend `e2e/**`
  (0 in `backend/tools/**`). It is not `off` because hiding 41 dead imports in
  production source ahead of a public release is the wrong instinct. It is
  not `error` because clearing them means editing source and test files,
  which phase 0's "toolchain only, zero behaviour change" premise forbids.
  **Open item, tracked in `docs/PROGRESS.md`'s Known issues for this date:**
  phases 2 and 3 already plan to open every one of the 14 backend `src/**`
  files with a finding (`cybertron-tick.service.ts`, `phaser.handler.ts`,
  `physics-tick.service.ts`, `droid-tick.service.ts`, the combat and galaxy
  modules, and others) — remove the dead imports there and in the 46 test
  files as part of that work, then promote this rule to `error` repo-wide.
- `eslint/no-control-regex`, `unicorn/prefer-string-starts-ends-with`,
  `oxc/erasing-op`, `typescript/unbound-method` are scoped off for
  `test/**`/`tools/**`/`e2e/**` paths only, via `overrides` (not a global
  disable) — each has zero `src/**` findings, confirmed by count, and each
  fires on deliberate test-only patterns (e.g. the balance suite matching
  literal MajorBBS control characters in canon text, which is the thing under
  test).
- `unicorn/no-useless-spread` and `unicorn/no-empty-file` are scoped off for
  the exact files with a genuine hit (`backend/src/game/tick/tick.service.ts`;
  `frontend/src/onboarding/index.ts` and `frontend/src/auth/index.ts`, both
  intentional empty barrel placeholders) rather than disabled repo-wide, so
  the rule stays live everywhere else in `src/`.

**Two smaller deferrals, recorded rather than acted on:** `oxlint-tsgolint` is
installed in both apps but wired into neither backend lint script (see above —
kept for phase 5 rather than churning an uninstall/reinstall commit).
`frontend/src/styles.css` has no explicit `@source` directive after the
Tailwind 4 migration landed in the same phase (frontend dependency batch,
`0e3d4d0`); it relies on automatic content detection, which works today but
would be more resilient made explicit — not urgent, just unfinished.

**Alternatives rejected:** ESLint + typescript-eslint (slower, and the whole
point of moving was to get ahead of where NestJS 12 itself is going);
generating a parallel TypeScript-7-flavoured tsconfig just for backend linting
so `--type-aware` could run today (rejected as scope creep for a phase-0 task
scoped to "install a linter," and risked drifting from the real build
tsconfig's semantics — left as a design option for phase 5 to consider,
not a decision made unilaterally here).

## 2026-09-10 — Node 24, not 22, as the pinned runtime

**Context:** phase 0 bumped the runtime from Node 20, which reached end of
life 2026-04-30 — this repository shipped on it for four months past that
date before this bump landed.

**Decision:** Node 24, pinned by `backend/test/unit/node-runtime-version.spec.ts`
across both Dockerfiles, both CI jobs, and `engines.node` in both
`package.json` files (`>=24`).

**Reason:** Node 24 is Active LTS to 2028-04-30. Node 22 was the more
conservative-looking choice but is Maintenance-only already, ending
2027-04-30 — a shorter support window for a project that is not deploying
this bump immediately. Node 24 is also what NestJS 12 targets, and phase 5
moves this backend onto NestJS 12.

**Alternatives rejected:** Node 22 (shorter support runway, no offsetting
benefit — it does not unblock anything Node 24 doesn't also unblock).


## 2026-09-11 — restructure phase 1: event names frozen, listener-less events recorded

**Context:** phase 1 of the restructure
(`docs/superpowers/specs/2026-09-10-restructure-design.md`) built one typed
declaration, `packages/wire`, for every Socket.io event crossing between the
backend and the frontend. Two questions came up while writing it that were
about the *shape* of the contract, not its enforcement, and both were settled
before Task 2 wrote the declaration rather than left to drift into it.

**Decision 1 — the 30 server-to-client and 2 client-to-server event name
strings are FROZEN as written, mixed naming convention and all.** 8 of the 30
server-to-client names use a colon (`command:result`, `scan:render`,
`auth:logout`, `prompt:ship-name`, `prompt:ship-select`, `sector:ship-left`,
`sector:ship-entered`), plus the inbound `prompt:reply`; the rest use a dot
(`event.log`, `player.snapshot`, `combat.hit`, `combat.ship-destroyed`,
`cybertron.taunt`, and so on). The original restructure plan's phase-1
checklist had a bullet reading "pick dot or colon and convert." That bullet
is withdrawn.

**Reason:** renaming an event string buys nothing but cosmetic consistency,
and it is exactly the kind of change this phase's own ground rule forbids —
"zero gameplay change... if a canon value moves, that is a bug in the
refactor, not a decision." A wire event name is not a canon value, but the
risk profile is the same shape: a missed call site on a rename is a silently
dropped event in a real-time multiplayer game, and it fails nowhere loud — no
exception, no red test, the message just never arrives. `@ge/wire`'s single
typed declaration delivers the phase's actual value (a wrong payload becomes
a compile error) with the strings held exactly as they were. Task 2's
`packages/wire/test/event-names.spec.ts` and
`backend/test/unit/wire-event-parity.spec.ts` both assert the frozen strings
against the backend's own running constants, byte for byte, so the mix is
pinned, not merely inherited.

**Alternatives rejected:** converting everything to one convention in this
phase (rejected — see Reason; also would have touched every emit site and
every frontend listener, expanding a "one declaration, zero behaviour
change" phase into a rename sweep); converting only the minority (8 colon
names) to match the majority (same objection, smaller blast radius, same
risk of a missed site).

**Decision 2 — five server-to-client events are emitted with no frontend
listener, and are RECORDED, not removed:** `combat.miss`,
`combat.mine-detonation`, `cybertron.broke-off`, `beacon`, and
`command.notice`. All five are declared in `packages/wire` with an explicit
"RECORDED, NOT ENDORSED" JSDoc note rather than silently included as if
unremarkable.

**Reason:** deleting an emit is a behaviour change this phase forbids just as
firmly as renaming one, and the typing pass can prove an event is *unheard*,
never that it is *unneeded*. `beacon` in particular carries its own payload
interface and a line in the original spec — a missing listener there reads
as an unfinished feature, not dead code. `command.notice` is now confirmed
(Task 3, see the entry below) to be a real gameplay gap: canon's
SCAN1/SCAN2/SCAN3 "you have been scanned" notice is built and sent and never
rendered. Recording rather than removing keeps that visible instead of
erasing the evidence that it needs fixing.

**Alternatives rejected:** deleting the four events with no accompanying spec
contract and keeping only `beacon` (rejected — `combat.miss` and
`combat.mine-detonation` in particular are the kind of thing a player would
notice going quiet, and "no listener found by this reader" is not the same
claim as "no listener exists or should exist"); wiring up listeners here to
close the gap (rejected — that is frontend feature work, out of scope for a
phase whose job is typing what already crosses the wire, not deciding what
should).

**Alternatives rejected (both decisions):** neither question was escalated
to Rick — both were judged decidable from the measured evidence
(`docs/superpowers/sdd/2026-09-10-restructure-phase-1-wire-contract/progress.md`,
"Rulings made before execution") without a design opinion only he could
supply.

## 2026-09-11 — restructure phase 1: five defects the typing surfaced, and one accepted behaviour change

**Context:** phase 1's actual justification — typing the producer side of the
wire contract for the first time — is that a wrong payload becomes a compile
error instead of a runtime surprise. It found five real defects while doing
exactly that, none of them known before this phase, and one of the five
fixes changes what a player can see.

**Defects found (backend side, Task 3, commit `9e1812d`):**

1. `combat.ship-destroyed` was declared against its 11-field *internal*
   domain-event type (`CombatShipDestroyedEvent`), 8 of those fields
   required, while `game.gateway.ts:1709-1722` builds the actual wire payload
   by hand, field by field, "NOT spread from the event," sending only 4:
   `victimId`, `attackerId`, `weapon`, `attackerName`. The old declaration
   was stale against a 2026-09-09 security fix that deliberately stopped
   sector, internal account keys, cargo, and `victimDisconnectReason` from
   reaching the wire — the declaration just never caught up. Fixed by adding
   `CombatShipDestroyedPayload` (4 fields, `attackerName: string | null`, not
   optional — stricter than the type it replaced) and pointing the event at
   it.
2. `EventLogCategory` was missing `'alert'`. `handleEngineShutdown`
   (`game.gateway.ts:2216`) emits `category: 'alert'` for canon's
   unfilterable engine-shutdown notice (`outprfge(ALWAYS,usrn)`,
   GEFUNCS.C:528), deliberately distinct from `'system'` per that handler's
   own comment — the 6-member declared type had been silently discarding a
   real distinction rather than crashing anything, because the frontend's
   category-to-style lookup falls back to a default for any unrecognised
   key. Widened to 7 members.

**Defects found (frontend side, Task 4, commit `f6121d0`):**

3. `App.tsx`'s hand-written `combat.ship-destroyed` listener type declared a
   required `victimUserid: string` field the backend never sends (stripped
   by the same 2026-09-09 security fix behind defect 1). Nothing in `App.tsx`
   or `destructionLine.ts` ever read it — harmless, but wrong. Fixed by
   importing `CombatShipDestroyedPayload` from `@ge/wire` instead of
   hand-declaring the shape.
4. `useSocket.ts` registered `reconnect_attempt` on `socket`
   (`socket.on('reconnect_attempt', ...)`), which only compiled because the
   untyped `Socket` fell back to `DefaultEventsMap`'s permissive index
   signature. `reconnect_attempt` is a `Manager` event (`socket.io`), not a
   `Socket` event, and is not a member of Socket.io-client's
   `SocketReservedEvents`. The handler had never fired since it was written
   — see the behaviour-change note below.
5. Both `prompt:ship-select` emit sites in `game.gateway.ts` send only
   `{ step: 'SHIP_SELECT', ships }`. `App.tsx` cast the payload to
   `{ ships?: FleetEntry[]; error?: string }` and read `payload.error` for
   the fleet-selection prompt — a field that has never existed on that
   event. (`prompt:ship-name` does carry a real `error` for a rejected name;
   the two prompts were conflated.) Fixed by giving `OnboardingPrompt` a
   discriminated union over the two real wire payload types; `App.tsx` now
   passes `error={null}` for ship-select with a comment explaining why. The
   dead prop this leaves on `ShipSelectPrompt` is tracked as issue #6 in
   `docs/PROGRESS.md`'s known issues for this date, not fixed here — the
   phase's scope was the wire contract, not the component's remaining props.

**Decision — accept `reconnect_attempt`'s behaviour change (defect 4) rather
than delete the handler or cast past the error.** Moving the registration to
`socket.io.on`/`socket.io.off` makes a handler that had been dead since it
was written go **live**. It is user-visible: during a dropped connection the
banner can now show orange "Reconnecting…" interleaved with red
"Disconnected" as Socket.io retries, where before only "Disconnected" ever
appeared, because the `reconnecting` status transition this handler sets was
unreachable.

**Reason:** this phase's own rule is "type what is sent without changing
behaviour," which makes this the one place in the phase that needed a
deliberate call rather than a mechanical fix. All three options change
something: leaving the code as `socket.on('reconnect_attempt', ...)` doesn't
type-check once `Socket` carries the real event map, and silencing that with
a cast is what this phase exists to stop doing. Deleting the handler
type-checks cleanly and looks like the conservative choice, but it is also a
behaviour change — it permanently discards the FR-019/FR-020 reconnect-status
behaviour the code was written to provide, rather than merely fixing where it
was registered. Making it live is the only option that honours what the code
was for. The one hazard checked before accepting this: `handleReconnectAttempt`
lacks `handleDisconnect`'s `displaced` guard, but `handleServerError` calls
`socket.disconnect()` on `SESSION_REPLACED` and a manual disconnect suppresses
Socket.io's own reconnection, so `displaced` cannot be clobbered by a
reconnect attempt that fires after a forced disconnect.

**Alternatives rejected:** delete `socket.on('reconnect_attempt', ...)`
entirely (type-checks, but discards working banner behaviour that was
designed and never shipped due to a bug, not due to a design change); cast
the payload or widen `Socket`'s event map back toward `DefaultEventsMap`
locally to keep the old registration (forbidden outright by this phase's
"no casts" rule, and would have re-hidden the exact class of bug this phase
exists to catch).

**Cost if wrong:** a connection-status banner flickers between two states
during a drop, rather than showing only one. No data loss, no incorrect game
state — a display-only change, confirmed reviewed and accepted (Task 4 fix
round, `f6121d0`).

## 2026-09-11 — restructure phase 1: dual CJS/ESM build kept for one phase, and the Docker build gap it leaves open

**Context:** `packages/wire` (Task 1, commit `84da4b3`) ships both a CommonJS
build (`dist/cjs`) and an ESM build (`dist/esm`), with an `exports` map
routing `require` at the CJS output and `import` at the ESM output. This
exists because the backend is CommonJS under Jest/`ts-jest` and the frontend
is ESM under Vite — the one thing phase 0 could not unify, since `ts-jest`
pins `typescript: ">=4.3 <7"` and Prisma 7 requires ESM, which is why the
backend's own ESM move is deferred to phase 5.

**Decision:** keep the dual build for phase 1. Do not attempt to collapse it
now.

**Reason:** collapsing to a single build means either forcing the backend to
consume an ESM-only package under CommonJS Jest (blocked until phase 5's
ESM/Prisma-7/NestJS-12 move lands) or forcing the frontend onto a CJS-only
package (works today via Vite's interop, but throws away the point of a
types-and-constants package being trivially tree-shakeable and native to
both runtimes going forward). Phase 1's job was proving one declaration
resolves from both consumers, not picking their shared module format ahead
of the phase built for exactly that. **When phase 5 converts the backend to
ESM, `packages/wire` should collapse to a single ESM build** — recorded here
so that phase doesn't have to rediscover why the dual build exists before
deciding to remove it.

**Alternatives rejected:** ESM-only now (blocks the backend until phase 5,
which inverts phase 5's own ordering — the backend has to reach ESM before
an ESM-only shared package is safe to depend on, not the other way round);
CJS-only now (works, but commits the frontend to consuming a CommonJS
package through Vite's interop indefinitely, for a package phase 5 will
touch anyway).

---

**A related gap, found verifying this close-out (2026-09-11), not by any of
the four tasks:** neither Docker image builds on this branch as it stands.
`backend/package.json` and `frontend/package.json` both declare
`"@ge/wire": "file:../packages/wire"` (added in `84da4b3`), but neither
Dockerfile's build context or `COPY` list changed to bring `packages/wire`
or the root manifest into the image — both still `COPY package*.json ./`
from inside their own per-app directory and `RUN npm ci` from there, exactly
as before the workspace existed. Reproduced directly:
`docker build -t x -f backend/Dockerfile backend/` and the frontend
equivalent both fail at `npm ci` with `file:` dependencies requiring
`--install-links` (or a workspace root) that the per-app build context
cannot see.

The task-1 brief anticipated exactly this ("Step 9: Verify the Docker images
still build... **Expect this to fail, and treat fixing it as part of this
task**") and named two acceptable fixes — move both images' build context to
the repo root, or build `packages/wire` as its own Docker stage and copy its
`dist` in. Neither was applied; no report or ledger entry records Step 9
having run for Task 1's actual (recovered) execution, only that it was
planned. This is a real gap against the phase's own exit criteria ("both
Docker images build"), not a new deviation and not something this
documentation-only close-out session is fixing — see
`docs/PROGRESS.md` 2026-09-11's known issues for the tracked item, and the
restructure spec's blockers section for the flag against phase 1's
checklist.

## 2026-09-11 — restructure phase 2: three rulings taken splitting the gateway

**Context:** Phase 2 broke `game.gateway.ts` (2,743 lines at the `fadb7a2`
baseline) into per-concern collaborators and split `scan.handler.ts` (1,258
lines). Three calls made mid-execution are worth keeping past the tasks that
made them.

**Decision 1 — a test-factory seam before touching the constructor.**
`backend/test/helpers/make-gateway.ts` was built first (Task 1), before any
extraction task ran. 43 spec files construct `GameGateway` positionally
against an 11-argument constructor. Without a named-construction seam, every
later task that reordered or added a constructor argument would have been a
43-file diff instead of a two-file one. It held: the two tasks that actually
added a constructor parameter (the death-path extraction and the connection-
lifecycle extraction) each changed two test files, not 43.

**Decision 2 — `recoverVictim` stays on `DestroyedEmitter`, as debt, not an
oversight.** `recoverAfterDeath` needs the live Socket.io `Server` to rejoin
rooms and re-emit state on recovery, and no extracted service holds a `Server`
reference. Moving `recoverVictim` off `DestroyedEmitter` would still require a
hop back through the emitter to reach the `Server`, so the member stays where
it is. Recorded so a later phase doesn't "fix" this into a needless
indirection.

**Decision 3 — the scan handler's `sca ra` renderer was pulled out in a
follow-up commit, not the initial split.** The first split (`9eea0f9`)
carved scan into `scan-strings.ts`, `scan-render.ts` and `scan-planet.ts` but
left one of the four scan modes (`sca ra`) inline in `scan.handler.ts`.
Leaving it meant the same category of rendering code existed in two places —
some in the new `scan-render.ts`, some still in the handler — which is worse
than not splitting at all, so a second commit (`c0305d1`) finished the
extraction rather than leaving it as a documented gap.

**Alternatives rejected:** for Decision 1, converting the 43 call sites
directly instead of building a factory first (rejected — it front-loads the
exact churn the seam exists to avoid, once per later task instead of once);
for Decision 2, threading `Server` into `DestroyedEmitter`'s constructor so
`recoverVictim` could move (rejected — moves the same dependency one hop
without removing it, for no reduction in coupling); for Decision 3, leaving
`sca ra` inline as a documented deviation (rejected during Task 7's own
review — see reasoning above).

**A gap found closing out this phase, not fixed here (verification-only
session):** `game.gateway.ts` still holds 2 `this.prisma` call sites
(`finalizeOnboarding`'s P2002 race-recovery read, `handleShipSelectReply`'s
reload-before-board), down from 10 at baseline but not the 0 the phase-2 plan
(`docs/superpowers/plans/2026-09-11-restructure-phase-2-gateway-split.md`)
expected at close-out. Neither site was in scope for Tasks 2-6, which covered
broadcast dispatch, narration, sector transition, the death path and
connection lifecycle — onboarding was never assigned a task. This is squarely
what Phase 3 ("persistence boundary… `PrismaService` appears in one place per
feature, not in 40 files") exists to finish; recorded here so Phase 3 does not
have to rediscover it. Full before/after table in `docs/PROGRESS.md`
2026-09-11.

**RESOLVED 2026-09-11 (Phase 3 close-out).** `game.gateway.ts` now has 0
`this.prisma` call sites (`grep -c 'this.prisma' backend/src/gateway/game.gateway.ts`
prints 0). Both sites named above moved to `ShipRepository` and
`UserRepository` calls during Phase 3's Tasks 2 and 4. Kept per
`docs/CLAUDE.md`'s doc-hygiene rule — do not delete a closed gap, annotate it.
Full Phase 3 measurement in the entry below.

## 2026-09-11 — Phase 3 close-out: the persistence boundary, measured

**Context:** Phase 3 (`8af4ed2`..`1ff4bea`) built per-feature repositories,
retired the `forwardRef` cycles between `ship`/`planet`/`tick`, cached the
boot-time ship-class table, and moved 334 inline `ShipState` fixtures onto a
shared factory. This entry is Task 7's independent verification, measured
directly against the `8af4ed2` and `1ff4bea` trees rather than copied from
any task's own report.

**Measured before/after** (`backend/`, commands run against both commits):

| Metric | `8af4ed2` (phase start) | `1ff4bea` (now) |
|---|---|---|
| files injecting `PrismaService` | 46 | 34 |
| `forwardRef(` actual calls | 3 | 0 |
| raw string `forwardRef` (incl. comments/docs) | 7 | 7 (all now comments/docblocks — `game/CLAUDE.md`, `ship.module.ts` docblock, port docblocks; zero live calls) |
| `this.prisma.user.*` calls outside a repository file | 36 | 4 (all in `auth/auth.service.ts`, untouched by this phase — see below) |
| `this.prisma` in `game.gateway.ts` | 2 | 0 |
| files building a whole `ShipState` inline (`cybskill:` in `test/`) | 260 | 37 |
| `as never` in `backend/test/` | 509 | 551 |
| backend suite | 617 suites / 6,295 tests | 623 suites / 6,356 tests, all green |

Note on the `forwardRef` row: the brief's own grep (`grep -rn 'forwardRef'`)
counts the bare string and returns 7 at both ends of the phase, which reads as
"unchanged" at a glance. It is not — at `8af4ed2` those 7 lines include 3 real
`forwardRef(` calls (`planet.module.ts` x2, `ship.module.ts` x1, plus
`tick.module.ts` x1 caught by a second grep) wiring the ship/planet/tick
cycle; at `1ff4bea` all 7 are prose in `CLAUDE.md`/docblocks describing the
now-retired pattern. Task 5's ports (`SHIP_STATE_PORT`, `PLANET_STATE_PORT`)
removed every live call. Grepping for `forwardRef(` — the call, not the word —
is the correct check and gives 3 → 0.

**CORRECTION 2026-09-11 (final branch review).** "3 actual `forwardRef(`
calls" is itself a miscount of lines, not calls — the same wrong-unit error
this entry flags in the `raw string forwardRef` row just above. At `8af4ed2`,
`planet.module.ts:29` carries **two** calls on one line —
`forwardRef(() => ShipModule), forwardRef(() => TickModule)` — plus one each
in `ship.module.ts:25` and `tick.module.ts:9`. That is **4 calls on 3 lines**,
not 3 calls. The corrected row is `forwardRef(` actual calls | 4 | 0. There
were two distinct cycles retired, both by Task 5's ports: `ship ↔ planet`,
and `planet → tick → ship`.

**Repository map** (files under `backend/src/`, by when they were introduced):

Pre-existing (before `8af4ed2`): `combat/mine.repository.ts`,
`cybertron/cybertron.repository.ts`, `mail/mail-inbox.repository.ts`,
`midnight/midnight.repository.ts`, `player/player-score.repository.ts`,
`team/team.repository.ts`.

New in Phase 3: `player/user.repository.ts` (Task 2, `6bccd3d`),
`ship/ship.repository.ts` and `galaxy/wormhole.repository.ts` (Task 4,
`3108806`/`6fcdf34`).

**Finding — `as never` went the wrong way, and the spec's premise only holds
for one of its two seams.** Phase 3's own text claims typed seams make such
casts unnecessary. Measured per commit:

```
8af4ed2  509   phase start
d969409  511   Task 1, ship factory          +2
6bccd3d  512   Task 2, user repository       +1
c5bda05  544   Task 3, ship-class cache     +32
3108806  552   Task 4, repositories          +8
602e725  551   fix round
1ff4bea  551   Task 6, fixture sweep          0
```

509 → 551, +42, the wrong direction. Split by seam: the **fixture** seam
(Tasks 1 and 6) is where the premise holds — together they removed 71
`as ShipState` casts (375 → 304 across `test/`) while adding only 2 `as
never`. The **service** seam (Tasks 2-4) is where it fails: narrowing a
dependency to a port (`ShipStatePort`, `UserRepository`'s narrow return
types, the ship-class cache) makes a hand-rolled partial test double harder
to satisfy structurally than a loose `PrismaService` mock was, and specs
reach for `as never` to get the double past the compiler rather than
building a structurally complete one. This is a real, reproducible cost of
this phase's design, not noise — Task 3 alone (the ship-class cache) added
32 in one commit. **Phase 5 leans on the same "narrow the seam, casts go
away" reasoning for its Prisma/ESM migration risk assessment; that
assessment should account for this finding, not assume it away.**

**CORRECTION 2026-09-11 (final branch review).** The mechanism claimed above
is wrong; line-level attribution of every added cast says the opposite of
"narrowing a dependency to a port... harder to satisfy structurally." Task 3
added 32 casts, 30 of them literally `new ShipClassCacheService({} as
never)` — the cast is on the test's fake `PrismaService` **constructor
argument**, a concrete class the spec instantiates for real; the narrowed
seam itself is satisfied exactly, with no cast. Task 4 added 8: `new
WormholeRepository(... as never)`, `new ShipRepository(... as never)`, and
`{ existsInSector: async () => false } as never` — that last one needs its
cast **precisely because** the parameter is typed as a concrete class
(`WormholeRepository`) rather than a port; a narrow interface there would
have accepted the object literal with no cast at all. Task 5 is the only
task that introduced real ports (`SHIP_STATE_PORT`, `PLANET_STATE_PORT`) and
it added **zero** (551 → 551, verified at `602e725` and `6fa0c30`). So casts
track **concrete-class dependencies**, and ports were **cast-neutral**. The
honest statement: `as never` rose because Tasks 3 and 4 made specs
instantiate concrete services and repositories and stub their own Prisma
dependency; the one task that introduced real ports added none. Phase 5's
risk assessment should read this finding as *support* for narrowing seams to
ports, not evidence against it. The per-commit table above is unaffected and
stands as measured.

**Caveat — `ShipRepository` is a beachhead, not a boundary.** Of 15 live
`this.prisma.ship.*` call sites in `backend/src/`, `ShipRepository` covers 2
(`findFirst` by `userid`, `findFirst` by `userid`+`shipno`). The remaining 13
are still direct Prisma calls in `ship-state.service.ts` (6: the auto-ship
hydration `findMany`, three `updateMany`s, two `update`s), `cybertron.repository.ts`
(3, spawning/updating AI hulls — arguably correctly its own repository's
concern, not `ShipRepository`'s), `onboarding.service.ts` (1, ship creation),
`connection-lifecycle.service.ts` (1, reconnect hydration), and
`onboarding/rename.service.ts` (2, rename conflict check + update). The
metric "`PrismaService` appears once per feature" must not be read as "ship
persistence is behind a repository" — it is not yet.

**`prisma.user.*` calls left outside any repository, and why:** all 4 real
remaining call sites are in `backend/src/auth/auth.service.ts`
(`create` at registration, `findUnique` in `chooseUsername`, `updateMany` for
the username race guard, `findFirst` for password-reset lookup by email).
`auth/` was not assigned to any Phase 3 task — Task 2's `UserRepository`
covers the game-side user reads/writes (score, cash, teamcode, kills, etc.)
consumed by `team.service.ts`, `ship-state.service.ts`,
`planet-state.service.ts`, `planet-attack.service.ts`, and the command
handlers that touched `prisma.user.*` before this phase (`buy`, `fset`,
`new-ship`, `price`, `report`, `ros`, `sell`, `sys`, `tea`, `withdraw`) — all
of which now go through `UserRepository`. `auth.service.ts` staying direct is
a real gap for a future `AuthRepository`, not a decision this phase made; it
is recorded here rather than left implicit so Phase 4/5 doesn't assume auth
is already behind a seam.

**Deploy gate, Docker, VERSION:** `git diff --name-only 8af4ed2..HEAD --
.github/` is empty; `.github/workflows/ci.yml` still gates on
`branches: [master]` and `if: github.event_name == 'push'`; `git diff master
-- VERSION` is empty. Both `backend/Dockerfile` and `frontend/Dockerfile`
build clean from the repo root; `require.resolve('@ge/wire')` resolves inside
the running backend image. Full suite: one `npx jest` process, `Ran all test
suites.` appears exactly once, 623/623 suites and 6,356/6,356 tests passed.
