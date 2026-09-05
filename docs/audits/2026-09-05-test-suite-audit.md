# Test-suite audit — 2026-09-05

Every spec file in the repo was read: **501 files, 72,535 lines** (483 backend,
18 frontend), split into 29 balanced groups, one reviewing agent each, with every
finding then put to an adversarial verifier instructed to refute it. Of 156
findings verified, **78 survived**; the rest were refuted and discarded.

Baseline at the time of the audit: backend 480 suites / 4,925 tests green in
113s; frontend 22 files / 160 tests green. Everything below passes today. That is
the point — these are tests that pass *whether or not the code is correct*.

Nothing here has been changed. This is a finding list.

Mechanical checks that came back clean: no spec lacks `expect()`; no `.only`; no
reads of the forbidden `GE/MSG/` or `GE/REL2/` canon copies (only comments
explaining why they are forbidden); the four conditional `describe.skip` guards
all resolve to *running* here.


## Two structural notes

- **There is no CI.** `CLAUDE.md` requires "No feature ships without passing CI"
  and there is no `.github/` directory. Every guarantee below rests on someone
  running `npx jest` locally.
- **`frontend/e2e/` is excluded from `vitest run`.** Eight Playwright specs only
  execute under `npm run test:e2e` against a live stack, so they are never part
  of the green result you normally see — and two of them cannot fail.
- **`frontend/tests/` (plural) is an accident.** Vitest collects it by default
  glob, but `tsconfig.json` includes only `test` (singular), so those four specs
  run without ever being typechecked. It has already claimed one victim (a stale
  `ClassPickerPrompt.spec.tsx` after spec 021 deleted the component).


## B — cannot fail (23)


**[medium] `backend/test/game/combat/phaser-narration.spec.ts:63`**  
The "no message still renders an unfilled slot" test cannot fail, and the very call it makes contains the defect it claims to guard against: PHITDEF is invoked with two arguments for a three-specifier template.  
*Fix:* Pass all three arguments (letter, commander, magnitude) at lines 43 and 63 as line 52 already does, and replace the unfailable `%[ds]` check with an assertion that each supplied argument appears in the rendered text.

**[medium] `backend/test/game/commands/handlers/transfer.conservation.spec.ts:89`**  
Both "conservation" tests address the receiver by a bare `String(receiver.shipno)`, which `resolveTransferTarget` now interprets as "a hull in your OWN fleet", so every one of the 200 transfers is rejected before any item moves — the invariant assertions pass vacuously and would still pass if the transfer code created or destroyed items.  
*Fix:* Address the receiver by name (`receiver.shipname`) as the sibling specs do, and assert that at least one transfer actually succeeded before asserting the totals.

**[medium] `backend/test/game/cybertron/cybertron-tick.service.spec.ts:435`**  
The T038 breakoff test cannot fail — it asserts a counter is >= 0.  
*Fix:* Inject a seeded/stubbed Random that forces the 1-in-CYB_BREAKOFF roll and assert `cybertron.broke-off` fires exactly once and `cybmine` returns to 255; keep the constant pin as a separate test.

**[medium] `backend/test/game/cybertron/cybertron-tick.service.spec.ts:541`**  
The T051 cyb_check_damage test asserts only facts it established itself, so it proves no defensive behaviour.  
*Fix:* Stub the Random to return values that pass both gates and assert `items[I_MINE]` decreased by exactly 1 and the heading was randomised.

**[medium] `backend/test/game/planet/attack-troop-math.spec.ts:222`**  
The item-destruction test guards its only real assertions behind `if (result.itemsDestroyed.length > 0)` and closes on `expect(result.narration).toBeDefined()`, which cannot fail.  
*Fix:* Assert unconditionally that `itemsDestroyed` is non-empty and that `planet.items[5].qty` dropped below its seeded 100n.

**[medium] `backend/test/game/ship/ship-tick.auto-shield.spec.ts:113`**  
'does NOT raise shields when autoShield=false' asserts on the original ship object, which the harness's mutate never writes to, so it passes regardless of production behaviour.  
*Fix:* Assert `mutatedState.shieldstat` instead of `ship.shieldstat`, matching the sibling negative tests at lines 140 and 154.

**[medium] `backend/test/invariants/fixture-domains.spec.ts:81`**  
The fixture-domain scanner's regex stops at an underscore, so the exact wrong-unit value it was written to ban — `topspeed: 8_000` — is read as `8` and passes.  
*Fix:* Match `([-]?[\d_]+)` and parse with `Number(m[1].replace(/_/g,''))` so numeric separators cannot smuggle an out-of-domain value past the guard.

**[medium] `backend/test/game/cybertron/integration/cybertron-end-to-end.spec.ts:288`**  
The end-to-end "mine deploy on damage" step asserts a mine count is >= 0, which a bigint inventory always is.  

**[medium] `backend/test/game/cybertron/noclaim.spec.ts:195`**  
Both noClaim tests assert only an upper bound, which a totally broken acquisition path satisfies with zero claims.  

**[medium] `backend/test/game/ship/ship-tick.service.spec.ts:130`**  
The fault-isolation test never provokes a fault, so ShipTickService's per-ship try/catch is never exercised.  

**[medium] `frontend/e2e/combat.spec.ts:119`**  
The neutral-zone self-zap test polls the whole log for /neutral|zap|destroyed/i, and both alternatives are already present before `pha` is sent (onboarding prints the neutral-zone line; the ship is named Zap...). Deleting phaser.handler.ts:166-188 leaves it green.  
*Fix:* Assert the actual backfire text (ZAPP!!!!! / Enforcer Planet) instead of the three-way alternation.

**[medium] `frontend/e2e/fleet.spec.ts:48`**  
'Boarded the second hull' asserts not.toContainText('Interceptor — <name>'), but the backend emits REP01 '%s: The %s' (colon, not em-dash). The negative holds whichever hull was boarded.  
*Fix:* Assert positively on the second hull's name (buildPurchasedShipName appends '#2').

**[low] `backend/test/e2e/boot.e2e.spec.ts:110`**  
The "no leaked Socket.io connections" assertion can never fail, because the property path it reads does not exist and falls back to 0.  
*Fix:* Capture the Socket.IO server the adapter created (e.g. keep a reference to the IoAdapter's server, or `app.get(GameGateway).server`) and assert on `server.engine.clientsCount` — with no `?? 0` fallback.

**[low] `backend/test/e2e/ion-cannon.e2e.spec.ts:176`**  
`expect(s.lastfiredBy).toBeUndefined()` cannot fail, because the fixture never sets `lastfiredBy` in the first place.  
*Fix:* Seed the ship with `lastfiredBy: { channel: 3, name: 'Someone Else' }` before running the tick, so the assertion actually measures fireIon clearing it.

**[low] `backend/test/game/physics/physics-tick.service.spec.ts:363`**  
'wrap is a no-op when ship is in orbit' cannot fail: with the deployed UNIVWRAP=NO the boundary-wrapped event is never emitted for any ship, orbiting or not.  
*Fix:* Assert the orbit gate on something observable — that xcoord/ycoord and damage are unchanged and no PHYSICS_UNIVERSE_EDGE fires for a ship at `xcoord: UNIVMAX - 0.05` with `where: 10` — and drop the dead 29.8 fixture.

**[low] `backend/test/game/planet/call-for-help.spec.ts:239`**  
The test 'emits alert when won == 1 even if ratio <= 1' asserts only `expect(typeof alertPayloads.length).toBe('number')`, which is true for any array and can never fail.  
*Fix:* Assert `alertPayloads.length` is 1 and `payload.ownerUserid === 'defender'` for a fixture whose ratio is below the gate but whose `won` is 1, or drop the test.

**[low] `backend/test/game/ship/ship-tick.overspeed.spec.ts:152`**  
The break-path assertion `expect(breakOccurred || warnOccurred).toBe(true)` is satisfied before any tick fires, because the ship is seeded with warncntr: 5.  
*Fix:* Seed warncntr for the break precondition but assert the post-conditions directly — topspeed === 0, speed2b === 0 and damage increased — with a deterministic rng and the SHIP_UPDATE handler.

**[low] `backend/test/gateway/player-snapshot.spec.ts:135`**  
The test titled 'player.snapshot contains every ship currently in the registry' never actually puts a second ship in the registry, so the multi-ship case it names is unexercised.  
*Fix:* Register the second ship through the public API (`registry.upsert('user2:1','sock-2')` plus a shipStateService.get stub for it) and assert both ids appear in the snapshot.

**[low] `backend/test/unit/format-message-printf.spec.ts:62`**  
The test titled "leaves %% as a literal percent and consumes no argument" never calls formatMessage; it only asserts a canon string contains no '%%'.  
*Fix:* Feed a string containing %% through formatMessage and assert it renders a single '%' with later arguments unshifted.

**[low] `backend/test/unit/scan-se.spec.ts:314`**  
The test named 'ship overwrites planet at same grid cell' asserts nothing about precedence — every path through it ends in `expect(true).toBe(true)` or in no assertion at all — and the precedence it claims to prove is the opposite of both canon and the production code.  
*Fix:* Rewrite as a real assertion of canon order: assert exactly one cell at the collision position and that its `type` is 'planet' (and add the self-vs-planet case, since map_planets() overwrites even '*').

**[low] `frontend/test/useSectorRoster.spec.tsx:139`**  
"removes listeners on unmount (no leaks)" asserts nothing after unmount - the comment says so explicitly - so a missing cleanup would not fail it.  
*Fix:* After unmount assert `emitter.listenerCount('droid.spawned') === 0 && emitter.listenerCount('droid.killed') === 0`.

**[low] `backend/test/game/droid/spawn-cadence.spec.ts:205`**  
'tick 60 → spawner runs a second time' proves nothing about a second rollover — it asserts population `> 0`, which the first rollover at tick 30 already guarantees.  

**[low] `backend/test/game/planet/attack-mail.spec.ts:140`**  
The test titled 'uses type=3 for MESG03 (ratio > 1 && won == 1)' both wraps its assertions in `if (mailCreates.length > 0)` and accepts either type 2 or type 3, so it never proves the MESG03 path.  

## A — does not exercise real code (17)


**[medium] `backend/test/game/commands/handlers/abandon.destruct-precedence.spec.ts:52`**  
The entire "abandon takes precedence over destruct" spec asserts behaviour its own mock performs; the handler under test never touches `destruct` or `status`.  
*Fix:* Assert against the real ShipStateService (as abandon-persistence.spec.ts does) that `abandon()` zeroes `destruct`, and have the handler spec assert only that `shipState.abandon` was called.

**[medium] `backend/test/game/commands/handlers/attack-concurrent.spec.ts:62`**  
The concurrency spec proves nothing about in-lock re-validation — both of its ATT_SELF rejections come from the pre-lock ownership check.  
*Fix:* Make the ownership flip happen inside the mocked lock callback (planet owned by 'defender' at dispatch time, captured only once the lock body runs), and assert `withPlanetLock` was invoked.

**[medium] `backend/test/game/cybertron/allowance.spec.ts:18`**  
The whole spec exercises `creditAllowance`, an exported function that no production code calls — the real allowance path it claims to protect is never touched.  
*Fix:* Assert against the real path: drive `CybertronTickService` for N activations and check the map handed to `repository.creditAllowances`, plus a `creditAllowances` test that a purse over CYB_MAXCASH is clamped back; or delete `creditAllowance` and have the tick service use it.

**[medium] `backend/test/game/cybertron/fault-isolation.spec.ts:167`**  
The "fault isolation" test never reaches the fault-isolation code: the deliberately-broken ship is filtered out before cybLives is ever called, and the test's only assertions are tautologies.  
*Fix:* Give the bad ship a class that IS 'CPU_COMBATIVE' but whose `getMaxPhaser`/`get` throws, then assert the healthy five had their `tick` decremented and that `logger.error` was called once for the faulting ship.

**[medium] `backend/test/game/physics/physics-tick.service.spec.ts:375`**  
The 'FR-019 ordering — processes ships in ascending shipKey order' test never observes the order ships were processed in; its only ordering assertion compares a locally sorted literal array to itself.  
*Fix:* Record real order by having the `mutate` stub in `makeHarness` push `shipKey(userid, shipno)` into an array, then assert that array equals ['a:1','a:2','b:1']; delete the self-comparing literal assertion.

**[medium] `backend/test/game/ship/ship-tick.overspeed.spec.ts:94`**  
The overspeed noop/warn/break harness captures the wrong tick handler, so processMovementTick — the code under test — never runs.  
*Fix:* Filter on kind in the harness (`if (kind === TickKind.SHIP_UPDATE) capturedHandler = h`), as the file's later `harness()` helper already does.

**[medium] `backend/test/unit/planet-tick-cadence.spec.ts:14`**  
The whole file tests a locally-defined `computeCadence` against a re-statement of its own formula; no production code runs, and the formula it pins no longer exists in the port.  
*Fix:* Delete the file (its behaviour is already covered by planet-tick-cadence-plantock.spec.ts, which drives the real `advance()`), or repoint it at a production-exported cadence function.

**[medium] `backend/test/game/planet/attack-troop-math.spec.ts:104`**  
`simulateTroopAttack` is a dead local reimplementation of `attackTroop`'s formula, and its copy of the ratio is the pre-fix, wrong one — missing the ×100 the production code was explicitly corrected to include.  

**[low] `backend/test/game/droid/droid-roster.invariant.spec.ts:12`**  
The whole spec imports nothing from src/ — it builds a `mockPrisma` whose findMany is `jest.fn().mockResolvedValue([])`, calls that mock, and asserts the empty array it was told to return, plus two string-prefix checks on hand-written literals.  
*Fix:* Drive the real ShipStateService with an ephemeral droid state and a jest-mocked PrismaService, then assert prisma.ship.update/delete were never called; or delete the file as redundant with ephemerality.spec.ts.

**[low] `backend/test/game/droid/spawn-naming.spec.ts:26`**  
A spec that lives in the droid suite and is titled "canon SNAME prefixes are available to the spawners" imports nothing from src/ — it only re-asserts the generated seed table, which a dedicated canon test already pins.  
*Fix:* Spawn a droid/cybertron through DroidSpawner.spawn / the cybertron spawn path with a stubbed class cache and assert the resulting `shipname` starts with the SNAME prefix, not the typeName.

**[low] `backend/test/game/ship/maintenance.service.spec.ts:315`**  
The applyMaintenance test asserts only that `mutate` was called with some function, never that the function queues the repair, so the one line of state change in the method is unmeasured.  
*Fix:* Assert `expect(mutated.repair).toBe(11)` (or invoke the captured callback on a real ShipState) instead of `expect.any(Function)`.

**[low] `backend/test/integration/set-scan-options-persistence.spec.ts:405`**  
The two "logout simulation" tests construct the ShipState themselves from the options array and then assert their own construction — no rehydration code runs.  
*Fix:* Drive the real hydration path (ShipStateService with a Prisma mock returning `{ user: { options: [1,0] } }`) and assert the resulting ShipState, instead of hand-building the ship from the same expression.

**[low] `backend/test/manual/T053.manual.spec.ts:46`**  
The spec claims to verify that toggling scannames/scanhome/scanfull/filter 'via the set handler' persists, but it never touches the set handler — it writes User.options with Prisma and reads it back.  
*Fix:* Drive SetHandlerService.command.handler('set scannames on') against the test DB and assert the persisted User.options, instead of writing the array directly.

**[low] `backend/test/unit/scan-ra.spec.ts:133`**  
The SC-001 test asserts only that the spec's own helper is monotonic; the production zoom formula is never called.  
*Fix:* Assert monotonicity on the header ranges the handler actually returns (`result.scanRender.header` across levels 1..9), not on the local helper.

**[low] `backend/test/unit/price-buy-parity.spec.ts:1`**  
A spec titled 'price and buy agree' never touches the `price` command path — it only re-tests `computeBuyOutcome`, which planet-trade.spec.ts already covers identically.  
*Fix:* Drive `price.handler`'s handler and the `planet-state.service` buy path over the same Zygor-3 fixture and assert the two quote the same result, or delete the file as redundant.

**[low] `frontend/test/socketClient.spec.ts:93`**  
The four "ConnectionStatus event mapping" tests only assert that an event name was registered with the mocked socket; they never fire a handler nor read the resulting status, so the mapping they claim to verify is never executed.  
*Fix:* Render the hook with a fake socket, invoke the captured handler, and assert `result.current.status` equals the expected ConnectionStatus (including the 'displaced' branch at useSocket.ts:72).

**[low] `backend/test/game/planet/spy-counter-espionage.spec.ts:61`**  
The 'sharpens the odds as the garrison grows' test asserts arithmetic on literals rather than anything `checkSpy` computed; the only production-derived assertion is a call count.  

## C — wrong or ungrounded canon (17)


**[medium] `backend/test/game/commands/handlers/price.handler.spec.ts:183`**  
The spec pins BUY5 as the answer to "that item is not for sale", but canon prints BUY4 with the item name; BUY5 is canon's answer to a non-positive quantity.  
*Fix:* Assert `formatMessage(MessageId.BUY4, ITEM_NAMES[I_TROOPS])` and change the SELL_FLAG_OFF mapping in price.handler.ts to MessageId.BUY4.

**[medium] `backend/test/game/commands/handlers/price.handler.spec.ts:233`**  
The insufficient-funds case is asserted against a port-invented string, PRICE_NO_CASH, where canon has a real message for exactly this branch.  
*Fix:* Assert `formatMessage(MessageId.BUY2, totalCost, qty, ITEM_NAMES[I_FOOD])` and have the handler emit the already-wired canon BUY2.

**[medium] `backend/test/game/commands/handlers/price.handler.spec.ts:150`**  
The spec asserts that an unowned planet quotes prices as an "open shop", which contradicts canon's outright BUY7 refusal and is recorded nowhere as a deliberate deviation.  
*Fix:* Either restore the BUY7 gate for `planet.userid === null` and assert it, or write the open-shop rule into docs/DECISIONS.md and cite that entry in the test's comment instead of implying canon.

**[medium] `backend/test/game/commands/handlers/shield-gates.spec.ts:108`**  
The spec asserts, citing canon, that `shi dn` has no preconditions and answers SHLDDN in hyperspace on a hull with no generator — but in C the max_shlds / where==1 / shieldtype==0 gates sit in `cmd_shields` BEFORE the up/down dispatch and therefore apply to `down` as well.  
*Fix:* Either hoist the three global gates above the up/down split in shield.handler.ts and flip this test, or record the divergence in docs/DECISIONS.md and drop the "as it is in the C" framing from lines 17 and 107.

**[medium] `backend/test/game/ship/maintenance.service.spec.ts:147`**  
The neutral-zone gate tests pin an off-by-one Zygor planet number: they assert plnum=0 is a valid maintenance planet and plnum=2 is not, while canon allows plnum 1 or 2.  
*Fix:* Change the production constants to 1 and 2 and re-point the tests: `where: 11`/`where: 12` pass, `where: 13` (plnum 3, Enforcer Planet) returns nz-not-zygor.

**[medium] `backend/test/gateway/sector-transition-notices.spec.ts:141`**  
The test asserts the mover is told nothing at all when crossing a sector boundary at speed >= 21000, but canon's MOVE1 (the mover's own "you moved from A to B" line) is emitted unconditionally — only MOVE2/MOVE3 are speed-gated.  
*Fix:* Move the mover's `event.log` emission above the `speed >= 21000` return in game.gateway.ts and change this test to assert the mover still gets the (4,3)→(5,3) line at high warp while both sector rooms stay silent.

**[medium] `backend/test/unit/handlers/orbit.spec.ts:71`**  
The 'no planets in this sector' case is asserted by MessageId only, and that id resolves to canon's wormhole refusal, so the test green-lights the wrong canon string.  
*Fix:* Assert the rendered text (ORBIT2's wording) rather than the MessageId, and remap ORBITNO off ORBIT0.

**[medium] `backend/test/unit/phaser-range-characterisation.spec.ts:14`**  
`INTERCEPTOR_SCAN_RANGE = 15_000 // ShipClass seed, class 1` is a stale hand-transcription — the seed says 100_000 — and it inverts the conclusion the last test draws.  
*Fix:* Import the class-1 row from `prisma/seed/ship-classes.ts` instead of retyping the number, and restate the last test as "the 60_000 falloff binds before the 100_000 scan gate".

**[medium] `backend/test/unit/overspeed-warning.spec.ts:25`**  
The spec pins port-invented warning wording while presenting the ladder as canon's WARPFAST+warncntr sequence, even though canon ships the five strings verbatim.  
*Fix:* Generate the ladder from the MBMGEMSG.MSG WARPFAST/WARPFST1-4/WARPBRK entries (as mine-warning-canon.spec.ts does for MINE6) and assert the canon text.

**[medium] `backend/test/unit/scan-mines.spec.ts:191`**  
The spec asserts mines are drawn on `sca lo` and cites GECMDS.C:2529, but that mine loop is inside `scan_ra`; `scan_lo` has no mine loop at all.  

**[low] `backend/test/game/combat/chgloser-pvp.spec.ts:6`**  
The header states canon's rule as `transfer = floor(loser.cash * CHGLOSER% / 100)`, but canon divides first: the two differ for any bank not a multiple of 100.  
*Fix:* Either state the port's rounding as a documented deviation in docs/DECISIONS.md, or change the cited formula (and production) to canon's (cash/100)*percent and pin it with a case where the two diverge.

**[low] `backend/test/game/combat/droid-kill-scoring.spec.ts:39`**  
DROID_CLASS_POINTS asserts fabricated kill-point values (31→75, 32→5000, 33→100) and attributes them to reference/wiki/cpu-ships.md, which does not say that; canon says 5, 200 and 50.  
*Fix:* Delete the hand-written table (or generate it from MBMGESHP.MSG as prisma/seed/ship-classes.ts is) and assert against the seeded shipclass row if class→points is meant to be under test.

**[low] `backend/test/game/commands/handlers/jettison.handler.spec.ts:105`**  
The spec pins `jet ALL <item>` on an empty slot to JETTFMT with no mutation, but canon's jettison() takes the ALL branch unconditionally and prints JETT3 ("0 Food Cases have been jettisoned, Sir!").  
*Fix:* Assert JETT3 with a count of 0 for `ALL` on an empty slot (and fix the handler), or record the deviation in docs/DECISIONS.md and say so in the spec.

**[low] `backend/test/game/commands/handlers/jettison.handler.spec.ts:135`**  
`jet 0 food` and `jet -5 food` are asserted to return JETTFMT, but canon prints JETT2 ("Sorry Sir! I didn't understand the command.") for a non-positive amount; JETTFMT is only the no-item-match path.  
*Fix:* Route the amt<=0 branch to a JETT2-backed MessageId and assert that, keeping JET_FMT for the unknown-item case only.

**[low] `backend/test/game/ship/maintenance.service.spec.ts:211`**  
The gate-ordering tests assert an order presented as canonical ("NZ gate fires before password gate") that inverts the original — canon checks the password second, before the facility, combat-lock and neutral-zone gates.  
*Fix:* Either move the password gate to position 2 to match GECMDS.C:4469-4482 and flip the ordering assertions, or keep the order and label it in the spec and DECISIONS.md as a deliberate deviation rather than as canon.

**[low] `backend/test/team/tea.handler.spec.ts:91`**  
The test pins a player-facing message stating the team password limit is 8, contradicting canon's 10 and the port's own MAX_TEAM_PASSWORD_LENGTH.  
*Fix:* Change the expectation (and tea.handler.ts:156,181) to the canon TEAMBPSS wording naming 10, matching tea-subcommands.spec.ts:307.

**[low] `backend/test/unit/config/population-caps.spec.ts:55`**  
The spec treats MAXX=30 / MAXY=15 as the galaxy's sector extents ("the 30x15 grid is 450 sectors") and derives a seat-per-sector rule from it; the assertion also cannot fail.  
*Fix:* Delete the test or restate it against the real world size using the UNIVMAX constant: expect(MAXPLRS).toBeLessThanOrEqual((2*UNIVMAX+1)**2).

## D — missing error path (21)


**[medium] `backend/test/game/commands/handlers/attack.handler.spec.ts:125`**  
No test reaches the neutral-zone rejection branch of `att`, the one that both zaps the attacker and aborts the raid.  
*Fix:* Add a case with the ship at the origin asserting WPN_ZAP, that `damage` grew by SE100DAM, and that `attackTroop`/`flushPlanet` were not called.

**[medium] `backend/test/game/player/player-score.repository.spec.ts:57`**  
PlayerScoreRepository.applyCashPenalty — the CHGLOSER cash transfer — is never executed by any test; every spec that mentions it substitutes a jest mock.  
*Fix:* Add cases to this spec driving applyCashPenalty against the same fake-Prisma harness: zero-cash loser, percent rounding to 0, absent killer row, and a rejecting $transaction.

**[medium] `backend/test/gateway/player-join-leave.spec.ts:100`**  
The handleConnection specs cover only the successful boarding path; the seat-cap refusal branch is never reached by any test in the suite.  
*Fix:* Add a case where findAllShips returns MAXPLRS GESTAT_USER ships from other userids and assert the refusal message plus `client.disconnect(true)`, and a companion case proving the connecting user's own ships do not count toward the cap.

**[medium] `backend/test/integration/handshake-resolution.spec.ts:55`**  
The handshake-resolution suite proves only the two success resolutions (returning player boards, new player is prompted) and never reaches the seat-cap refusal branch in handleConnection.  
*Fix:* Add a case where findAllShips returns MAXPLRS ships with status GESTAT_USER for other userids and assert the client receives the 'game is full' event.log and is disconnected.

**[medium] `backend/test/unit/new-ship.handler.spec.ts:276`**  
The `new phaser`/`new shield` upgrade path has four explicit refusal branches that no test reaches; only the non-numeric-type branch is covered.  
*Fix:* Add cases driving `new phaser 19` on a class-max-10 hull, a same-type request, and an upgrade attempted outside Zygor / out of orbit.

**[medium] `backend/test/game/planet/attack-troop-math.spec.ts:179`**  
The retreat test never asserts the retreat branch's actual effect — surviving attackers folded back into the planet's garrison and `left1` zeroed — despite its title claiming to.  

**[medium] `backend/test/mail/ship-loss-cause.spec.ts:63`**  
The file's own docblock says it asserts the whole chain 'through to the inbox mapping it back', but the inbox's type→cause mapping is never exercised.  

**[medium] `backend/test/mail/mail-render.spec.ts:186`**  
formatDetail's starvation branch — and the inbox routing that produces it — is unreached by any test, so a render path of the same kind that was already wrong twice for revolt is unguarded.  

**[low] `backend/test/game/combat/chgloser-pvp.spec.ts:57`**  
applyCashPenalty is only ever a jest.fn() here (and in the other two specs that mention it), so none of its real guard branches are covered anywhere in the suite.  
*Fix:* Add a repository-level spec driving applyCashPenalty with a stub $transaction covering: missing victim row, zero cash, sub-1 transfer, and a missing attacker row.

**[low] `backend/test/game/commands/handlers/spy.handler.spec.ts:79`**  
The rejection-branch suite walks SPY1/SPY0B/SPY0/SPY0C/SPYM0 but never reaches the port-original "planet not found" branch, which silently reuses SPY1.  
*Fix:* Add a case with `makeHandler(null)` and `where: 10` asserting SPY1 and that no spy is consumed.

**[low] `backend/test/game/droid/droid-act-class-11.spec.ts:124`**  
Every normal-space fightback test satisfies both weapon gates at once, so neither refusal branch is exercised — the test name claims "phasr >= PMINFIRE and attacker not cloaked" but only the success path runs.  
*Fix:* Add two cases mirroring the A-001 range test: attacker with `cloak: 10`, and droid with `phasr: PMINFIRE - 1`, each asserting `fireMode` is null while `fightback` is still defined.

**[low] `backend/test/game/droid/droid-act-class-12.spec.ts:81`**  
Same gap for the Vakory: the phaser-charge and cloaked-attacker refusals in the normal-space fightback are never reached.  
*Fix:* Add a `cloak: 10` attacker case and a `phasr: PMINFIRE - 1` droid case asserting `fireMode` is null.

**[low] `backend/test/gateway/single-socket-per-ship.spec.ts:64`**  
The connect-path suite mocks `findAllShips` to an empty array, so the MAXPLRS seat-cap refusal branch in handleConnection is never reached, and no other spec in the repo reaches it either.  
*Fix:* Add a case where `findAllShips` returns MAXPLRS ships with `status === GESTAT_USER` under a different userid and assert the client receives the "game is full" system line and is disconnected before presentShipEntry runs.

**[low] `backend/test/integration/onboarding-init.spec.ts:142`**  
The only spec of `OnboardingService.finalize()` never reaches its explicit fail-fast branch for a missing spawn sector.  
*Fix:* Add a case where `sector.findUnique` resolves null and assert `finalize()` rejects with SpawnSectorMissingError (and that `ship.create` was never called).

**[low] `backend/test/unit/adm-claim.spec.ts:133`**  
The generic claim-failure branch of the adm claim flow is never reached by any test.  
*Fix:* Add cases where claim resolves {ok:false, reason:'OWNED'} and where it rejects, asserting LAND_REFUSED.

**[low] `backend/test/unit/handlers/sell.spec.ts:62`**  
The sell spec proves the not-landed, wrong-sector and INSUFFICIENT_CARGO paths but never reaches either argument-validation refusal.  
*Fix:* Add cases for `sel 0 food`, `sel abc food` and `sel 10 zzz` asserting formatMessage(MessageId.SELLFMT).

**[low] `backend/test/unit/scan-sh-cloak.spec.ts:75`**  
The `sca sh` specs in this group cover the cloak refusal and the happy path, but two other explicit refusal branches of the same handler are unreached by any test in the repo.  
*Fix:* Add two cases to this spec: scanning your own ship name returns the mirror message, and a target placed beyond the scanner class's scanRange returns the out-of-range message with no intel lines.

**[low] `backend/test/game/cybertron/gold-transfer.spec.ts:36`**  
`CybertronRepository.transferGold` is mocked in every test that mentions it, so none of its own branches are ever executed.  

**[low] `backend/test/game/midnight/self-heal.spec.ts:39`**  
The self-heal spec covers only the two happy decisions (run / skip) and never reaches the catch that keeps a failed self-heal from taking down application boot.  

**[low] `backend/test/game/player/score.config.spec.ts:19`**  
The config spec covers only numeric SCORE_F2 values; a non-numeric value silently produces NaN and no test or production guard catches it.  

**[low] `frontend/tests/auth/AuthScreen.register.spec.tsx:18`**  
Every AuthScreen test clicks through to register mode, so the '/auth/login' arm and the rejecting-fetch catch ('Network error') are unreached.  
*Fix:* Add a login-mode test and a rejecting-fetch test.
