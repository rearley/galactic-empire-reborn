# Canon value re-audit — 2026-09-10

<!-- STATUS: CLOSED 2026-09-10. All 22 fixed in the same session. -->

> **Status: closed.** All 22 findings were fixed on 2026-09-10, thirteen as
> behaviour changes and nine as corrections to comments, test names or
> citations. Each behaviour fix has a test written to canon first. The list is
> kept because the reasoning cost more than the fixes did, and because the
> refuted ten are as useful as the confirmed twenty-two.

The 2026-09-05 test-suite audit asked whether a test could FAIL. It never asked
whether the expected value was RIGHT. This audit asks the second question, over
the 25 spec files where a wrong value costs a ship, a planet or credits.

Five agents, one per area, each finding then put to an adversarial verifier
instructed to refute it and to default to refuted when uncertain.

| batch | raw | refuted | kept |
|---|---|---|---|
| `combat-math` | 5 | 1 | 4 |
| `projectiles` | 11 | 1 | 10 |
| `planet-economy` | 5 | 4 | 1 |
| `planet-combat` | 4 | 3 | 1 |
| `ai-and-ships` | 7 | 1 | 6 |

**22 findings survived.**

## 1. `backend/test/game/combat/hyper-phaser-damage.spec.ts:7` — contradicts-canon (high)

**The test says:** The file's header docblock, which states the formula the tests below pin, declares "dp = dd ^ HPFIRDST (HPFIRDST = 1 -> linear)" and "dam = HPDAMMAX * dp (HPDAMMAX = 200)".

**Canon says:** The shipped option database gives HPFIRDST 5 and HPDAMMAX 50 (the 1 and the 200 are the numopt clamp FLOOR and CEILING, not values). The assertions further down the same file are written against 50 and against a 5th-power falloff, so the docblock also contradicts its own tests.

**Evidence:** `reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG:403`

```c
HPFIRDST {Hyperphaser distance factor: 5} N 1 20
```

**Verifier:** Verified. reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG:403 literally reads 'HPFIRDST {Hyperphaser distance factor: 5} N 1 20' — shipped default 5, with 1 as the numopt FLOOR only. backend/src/game/config/game-config.ts:128 already carries default 5/canonDefault 5, and the assertions at hyper-phaser-damage.spec.ts:40-60 are written against a 5th-power falloff. The docblock's '(HPFIRDST = 1 -> linear)' is the stale pre-fix value and contradicts both canon and the tests in its own file. Not a recorded deviation — docs/DECISIONS.md:3219-3220 records HPFIRDST=1 as the BUG that was corrected. Comment-level only; no assertion is wrong.

## 2. `backend/test/game/combat/hyper-phaser-damage.spec.ts:8` — contradicts-canon (high)

**The test says:** Docblock: "dam = HPDAMMAX * dp (HPDAMMAX = 200)".

**Canon says:** HPDAMMAX ships at 50; 200 is only the upper clamp bound of numopt(HPDAMMAX,1,200) (GEMAIN.C:492). The test on line 22 correctly expects 50, so the header is the stale half.

**Evidence:** `reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG:411`

```c
HPDAMMAX {Hyperphaser maximum damage: 50} N 1 200
```

**Verifier:** Verified. MBMGEMSG.MSG:411 reads 'HPDAMMAX {Hyperphaser maximum damage: 50} N 1 200'; 200 is the numopt ceiling only. game-config.ts:129 sets default 50, and the test at line 17 expects 50. docs/DECISIONS.md:2037 explicitly names 'HPDAMMAX at the ceiling of 200 against a shipped 50' as the corrected error, not an accepted deviation. Docblock '(HPDAMMAX = 200)' contradicts canon and its own tests. Comment-level only.

## 3. `backend/test/game/combat/combat-math.spec.ts:78` — contradicts-canon (medium)

**The test says:** Test name attributes a scanRange of 15_000 to the Interceptor: "true at 1 sector with scanRange=15_000 (Interceptor)".

**Canon says:** The Interceptor (class 01) has Scan Range 100000. 15_000 is the historical scanRange drift value CLAUDE.md records as the seed bug; the current seed (prisma/seed/ship-classes.ts:94) already carries 100_000. The arithmetic under test (sector-units x 10_000 vs raw) is correct; only the canon attribution in the name is wrong.

**Evidence:** `reference/ge-upstream/mbmgemp/GE/REL/MBMGESHP.MSG:141`

```c
S01SRNG {  Scan Range: 100000} (S01TYPE#<NONE>) N 1 10000000
```

**Verifier:** Verified. MBMGESHP.MSG:20 'S01NAME {Interceptor}' and MBMGESHP.MSG:141 'S01SRNG {  Scan Range: 100000} (S01TYPE#<NONE>) N 1 10000000' — the Interceptor's scan range is 100000, and backend/prisma/seed/ship-classes.ts:94 already carries scanRange: 100_000. The test name attributes 15_000 to the Interceptor, which is the historical scanRange-drift value CLAUDE.md records as a seed bug. The auditor correctly noted 15_000 is a harness value and the arithmetic under test is right; only the canon attribution in the test name is wrong. Upheld as a wrong-attribution (kind c) finding, though it is name/comment-level and no assertion is incorrect. Confidence medium.

## 4. `backend/test/game/combat/hyper-phaser-damage.spec.ts:29` — contradicts-canon (medium)

**The test says:** Trailing annotation on the tonnage assertion says the expected halved value is 100: `expect(heavy).toBe(Math.floor(light / 2)); // 100`.

**Canon says:** With canon HPDAMMAX 50, point-blank phasrtype 1 gives dam=50, and tonfact = 1 + 15000/15000 = 2, so factor = 50*1/2 = 25. The assertion itself is right (Math.floor(light/2) = 25); the "// 100" is left over from the HPDAMMAX=200 era.

**Evidence:** `reference/ge-source/GECMDS.C:1059`

```c
tonfact = 1.0 + ((double)(shipclass[wptr->shpclass].max_tons)/TONFACT);
```

**Verifier:** Verified arithmetic. GEMAIN.H:102 '#define TONFACT	15000.0      /* divisor for ton factor */' and GECMDS.C:1059 'tonfact = 1.0 + ((double)(shipclass[wptr->shpclass].max_tons)/TONFACT);' (line number confirmed exact). With canon HPDAMMAX 50 (MBMGEMSG.MSG:411) and phasrtype 1 at dist 0, light = 50 and heavy = 50/2 = 25, so the trailing '// 100' annotation is left over from the HPDAMMAX=200 era. The assertion itself, expect(heavy).toBe(Math.floor(light / 2)), is correct and canon-faithful; only the comment is stale. Comment-level.

## 5. `backend/test/game/combat/combat-tick-projectiles.spec.ts:338` — contradicts-canon (high)

**The test says:** After a projectile IMPACT the victim's and firer's cantexit are set to FIRETICKS, cited as 'Both ends of a fight are battle-locked by it — GEFUNCS.C:1570.'

**Canon says:** checktm never SETS cantexit. Its only contact with the counter is a decrement at the top of the function; cantexit = FIRETICKS is written exclusively at FIRE/LOCK time in GECMDS.C (lockon 1405-1406 and 1419-1420, phaser 945/978-979, hyper-phaser 1041/1080-1081, laymine 1809). A grep of the whole C source shows no assignment of FIRETICKS anywhere in GEFUNCS.C. GEFUNCS.C:1570 is the torpedo shields-down damage line, not a battle lock.

**Evidence:** `reference/ge-source/GEFUNCS.C:1541`

```c
	--(ptr->cantexit);
```

**Verifier:** Verified independently; confidence high. checktm (GEFUNCS.C:1522-1690) touches cantexit exactly once, and only to decrement: line 1540 `if (ptr->cantexit > 0)` / 1541 `\t--(ptr->cantexit);`. A grep of the whole vendored C tree shows every `= FIRETICKS` assignment is in GECMDS.C (945, 978-979, 1041, 1080-1081, 1405-1406, 1419-1420, 1650, 1715, 1809, 3569, 3595) - i.e. fire/lock/mine-lay time, never impact. The cited GEFUNCS.C:1570 is literally `\t\t\t\tdamfact = tdammax * damfact;`, the torpedo shields-DOWN hull-damage line - not a battle lock, and not even in the missile branch this test is about. The port really does re-arm on impact (combat-tick.service.ts:900, 908, 916). Not a recorded deviation: nothing in docs/DECISIONS.md covers re-arming cantexit on a hit. The only supporting document is specs/006b-combat/spec.md FR-028a, whose own citation list is entirely fire/lock sites and whose decrement citation `GEFUNCS.C:1180-1181` points at the scoring routine (`(wuptr->score) += amt;`), not the decrement. Both halves of the finding - wrong expected value and wrong citation - stand.

## 6. `backend/test/game/combat/combat-tick.service.spec.ts:337` — contradicts-canon (high)

**The test says:** A torpedo hit resolved by the physics tick sets cantexit = FIRETICKS on the victim (line 337) and on the attacker (line 339) — the test title says 'sets cantexit on victim'.

**Canon says:** Same as above: a hit landing in checktm applies damage, lastfired and shieldhit, and nothing else touches cantexit except the decrement at 1540-1541. Canon's battle lock is armed by the LOCK (GECMDS.C:1405-1406) several ticks earlier and is counting DOWN by the time the torpedo arrives; re-arming it on impact extends the no-exit window beyond canon's ten ticks.

**Evidence:** `reference/ge-source/GECMDS.C:1406`

```c
		ptr->cantexit = FIRETICKS;
```

**Verifier:** Verified; confidence high. Canon's battle lock is armed by lockon: GECMDS.C:1405 `\t\twptr->cantexit = FIRETICKS;` / 1406 `\t\tptr->cantexit = FIRETICKS;` (mirrored at 1419-1420 for a failed lock), which runs at FIRE time via torp()/cmd_missl. checktm only counts it down (GEFUNCS.C:1540-1541). At the moment a torpedo lands, canon's counter is strictly BELOW FIRETICKS, not equal to it, so asserting `bob.cantexit === FIRETICKS` and `alice.cantexit === FIRETICKS` as a consequence of the impact pins a rule canon does not have. The test explicitly seeds `cantexit: 0` on the victim, so it is not accidentally reading a lock-time value. No deviation recorded in docs/DECISIONS.md. The port additionally decrements before hit resolution (combat-tick.service.ts:633-646) specifically so the re-arm survives the tick, which makes the divergence deliberate but still undocumented.

## 7. `backend/test/game/commands/handlers/mine.handler.spec.ts:136` — contradicts-canon (high)

**The test says:** '5. default timer 30 when no arg given' — `min` with no argument deploys a mine with timer 30 (also asserted in the happy path at line 165).

**Canon says:** cmd_mine requires exactly one argument and refuses outright when it is missing: margc != 2 prints MINFMT ('Type HELP MINE for the correct usage.') and returns before laymine is ever reached. Canon has no default timer at all, and the value 30 appears nowhere in cmd_mine or laymine — mine.handler.ts:15 declares it as a port constant with a wall-clock justification, not a canon citation.

**Evidence:** `reference/ge-source/GECMDS.C:1756`

```c
if (margc != 2 )
```

**Verifier:** Verified; confidence high. cmd_mine at GECMDS.C:1756 reads `if (margc != 2 )` and 1758 `\tprfmsg(MINFMT);` then returns - a bare `min` (margc == 1) is refused outright and laymine is never reached. laymine (GECMDS.C:1783-1817) takes the timer as a parameter and supplies no default; the literal 30 appears nowhere in either function. mine.handler.ts:15 declares `const MINE_INITIAL_TIMER = 30;` with the comment '30 ticks = 3 minutes at 6s tick', a wall-clock rationale, not a canon citation. Nothing in docs/DECISIONS.md records a default mine timer as a deviation (the only mine entries are the NUMMINES table and the MINE2 failure message). Test 5 at line 136 and the happy path at line 165 both pin `timer: 30` on a no-arg invocation, so both encode an invented rule.

## 8. `backend/test/game/commands/handlers/torpedo.spec.ts:205` — contradicts-canon (medium)

**The test says:** 'firing from inside the neutral zone self-zaps and does not lock' — the firer sits at (0,0), names a target 'Bob' that does not exist in the ship map, and the test asserts the Enforcer-Planet zap plus SE100DAM hull damage.

**Canon says:** The zap is inside the `shpnum >= 0` branch, i.e. it fires only after findshp has RESOLVED a real target. With no such ship, cmd_torp falls to the final else and prints NOSHIP ('the tactical scanners cannot locate that ship') with no damage. The port hoisted the neutral check above target lookup (torpedo.handler.ts step 5c), so this fixture pins a self-inflicted hit canon would not deliver.

**Evidence:** `reference/ge-source/GECMDS.C:1157`

```c
if ( shpnum >= 0)
```

**Verifier:** Verified, and I would raise the auditor's confidence from medium to high. GECMDS.C:1149 `shpnum = findshp(margv[1],1);` then 1151 `if (shpnum == usrnum)` -> FOOLISH, 1156 `else`, 1157 `if ( shpnum >= 0)`, 1159 `\tif (neutral(&warsptr->coord))` -> `zaphim(warsptr,usrnum); return;`, with the trailing `else { prfmsg(NOSHIP); ... }` at 1166-1170. The neutral-zone zap is unreachable unless findshp resolved a real ship, so a fixture naming a nonexistent 'Bob' gets NOSHIP and zero damage in canon. The port hoists the check: torpedo.handler.ts step 5c (`if (isInNeutralZone(ship))` -> `s.damage += SE100DAM; s.cantexit = FIRETICKS;`) runs before target lookup at step 6 (line 155). No deviation for this ordering is recorded in docs/DECISIONS.md - the only neutral-zone entries there are the droid exclusion, the S00P* generation, and the SE100DAM 101->40 retune.

## 9. `backend/test/game/commands/handlers/missile.spec.ts:174` — contradicts-canon (medium)

**The test says:** 'firing from inside the neutral zone self-zaps and does not lock' — firer at (0,0) with no target ship present is zapped for SE100DAM.

**Canon says:** Identical to the torpedo path: cmd_missl's zaphim call sits inside `if ( shpnum >= 0)` at GECMDS.C:1295-1301, so an unresolvable target name yields NOSHIP and no damage. The port checks the neutral zone at missile.handler.ts step 4b, before target lookup at step 5.

**Evidence:** `reference/ge-source/GECMDS.C:1295`

```c
if ( shpnum >= 0)
```

**Verifier:** Verified identically; confidence high. GECMDS.C:1287 `shpnum = findshp(margv[1],1);`, 1289 `if (shpnum == usrnum)` -> FOOLISH, 1294 `else`, 1295 `if ( shpnum >= 0)`, 1297 `\tif (neutral(&warsptr->coord))` -> zaphim/return, with the NOSHIP else after the lock block. The zap is inside the resolved-target branch. The port checks the neutral zone before target lookup in missile.handler.ts, so the fixture at line 174 (firer at 0,0, target name 'Bob' absent from the ship map) pins a self-inflicted SE100DAM hit canon would never deliver - canon answers NOSHIP. Not recorded in docs/DECISIONS.md.

## 10. `backend/test/game/commands/handlers/missile.spec.ts:285` — contradicts-canon (medium)

**The test says:** 'fails to lock a target beyond ~4.9 sectors', with three supporting comments (lines 131, 150, 193) stating the missile lock range is '~4.93 sectors'.

**Canon says:** The missile branch is fact = (5 - dist)/mis_fact with mis_fact = numopt(MISFACT,1,50)/10 and the shipped MISFACT is 21, i.e. 2.1 (MBMGEMSG.MSG:324 'MISFACT {Missile Lock-on divisor: 21} N 1 50'). The lock succeeds only while fact > .7, which is dist < 5 - 0.7*2.1 = 3.53 sectors, not 4.93. 4.93 is the figure for a divisor of 0.1. The port itself runs MISFACT 21 (game-config.ts:144), so the assertions still pass — but the stated threshold, and any future fixture placed on it between 3.53 and 4.93 sectors, is wrong.

**Evidence:** `reference/ge-source/GECMDS.C:1392`

```c
		fact = ((5.0-dist)/mis_fact);
```

**Verifier:** The arithmetic checks out, with the caveat that no assertion currently fails; confidence medium on whether it is in scope, high on the number. GECMDS.C:1392 is `\t\tfact = ((5.0-dist)/mis_fact);` and 1395 `\tif (fact > .7)`; mis_fact comes from GEMAIN.C:509-510 `mis_fact = (double)numopt(MISFACT,1,50);` / `mis_fact = mis_fact/10.0;`, and the shipped value is MBMGEMSG.MSG:324 `MISFACT {Missile Lock-on divisor: 21} N 1 50`, i.e. 2.1. Lock therefore holds only while dist < 5 - 0.7*2.1 = 3.53 sectors. 4.93 is the figure for a divisor of 0.1 and is traceable to nothing; the torpedo branch does not produce it either (tor_fact 4.0, speed 0 -> dist < 2.67). The port runs MISFACT 21 (game-config.ts:144), so the 6-sector fixture at line 285 and the 1-sector fixtures still behave as asserted. This is a wrong stated threshold in the test's own prose (line 285's title, comments at 131, 150, 193) rather than a failing expect(), so severity is documentation-only - but the number is genuinely wrong and would misplace any future fixture between 3.53 and 4.93 sectors.

## 11. `backend/test/game/combat/combat-tick-projectiles.spec.ts:318` — contradicts-canon (medium)

**The test says:** A missile slot at distance exactly MISLSPED (1212) 'arrives exactly this tick' and detonates, with all the hit assertions that follow.

**Canon says:** The missile arrival test is a STRICT less-than, unlike the torpedo's `if (tptr->distance <= torpsped)` at GEFUNCS.C:1550. At distance == mislsped canon does not detonate: it falls to the else, runs the decoy check and decrements to 0, after which the outer `if (mptr->distance > 0)` guard leaves the slot dormant forever. The port hits at oldDist <= MISLSPED (combat-tick.service.ts:770, 785), one unit early.

**Evidence:** `reference/ge-source/GEFUNCS.C:1615`

```c
		if (mptr->distance < mislsped)
```

**Verifier:** Verified; confidence medium-high. GEFUNCS.C:1615 is `\t\tif (mptr->distance < mislsped)` - strict less-than - against the torpedo's GEFUNCS.C:1550 `\t\tif (tptr->distance <= torpsped)`. At distance == mislsped canon takes the else, the decoy loop does not fire (distance is not < 3000 for any realistic mislsped), then GEFUNCS.C:1680 `\t\t\tif (mptr->distance > 1)` runs `mptr->distance -= mislsped;` leaving 0, and the outer guard GEFUNCS.C:1613 `\tif (mptr->distance > 0)` never re-enters the slot. Canon therefore never detonates a missile whose distance lands exactly on mislsped. The port computes `newDist = oldDist - MISLSPED` and hits when `newDist <= 0` (combat-tick.service.ts:782-797), so the fixture `lmisslDistance: [MISLSPED, 0, 0]` with the comment 'arrives exactly this tick' pins a detonation canon does not produce. Nothing in docs/DECISIONS.md records the missile/torpedo comparison being unified.

## 12. `backend/test/game/combat/combat-tick-projectiles.spec.ts:189` — wrong-citation (medium)

**The test says:** The mine-sweep docblock quotes canon's in-game guard as "canon's loop is `if (shipdata[i].status == GESTAT_USER || ... GESTAT_AUTO)` (GEFUNCS.C:1420-1426)", and the file header calls the function `minesweep (GEFUNCS.C:1414-1490)`.

**Canon says:** No such line exists. The function is checkmines, starting at GEFUNCS.C:1403, and its guard is a call to ingegame(zothusn) at line 1426. ingegame (GEMAIN.C:2651-2665) does not test GESTAT_USER at all — for a channel below nterms it tests the BBS session state (`user[shpno].state == gestt && user[shpno].substt >= FIGHTSUB`) and only tests GESTAT_AUTO for automatons. Lines 1420-1426 are the timer decrement, the %5 cadence test and the ship loop.

**Evidence:** `reference/ge-source/GEFUNCS.C:1426`

```c
				if (ingegame(zothusn))
```

**Verifier:** Verified - the quoted 'canon' line is a fabrication; confidence high. The function is `checkmines`, declared at GEFUNCS.C:1403 `void  FUNC checkmines()`, not `minesweep` at 1414-1490 as the file header (line 26) claims. Its in-game guard is GEFUNCS.C:1426 `\t\t\t\tif (ingegame(zothusn))`, and ingegame (GEMAIN.C:2651) contains no GESTAT_USER test at all: `if (shpno < nterms)` / `\tif (user[shpno].state == gestt && user[shpno].substt >= FIGHTSUB)` / `\t\treturn(TRUE);` and only then `if (shpno >= nterms && warshpoff(shpno)->status == GESTAT_AUTO)`. Lines 1420-1426 are `--mptr->timer;`, `if (mptr->timer%5 == 0)`, the `for (zothusn=0 ; zothusn < nships ; zothusn++)` loop, `wptr=warshpoff(zothusn);` and the ingegame call - there is no `shipdata[i].status ==` expression anywhere in checkmines. A grep for GESTAT_USER in GEFUNCS.C returns 175, 733, 794, 999, 1199, 1200 - none inside it. Wrong function name, wrong line range, and a quoted line that does not exist. The port's own approximation (status 1 or 2) is a reasonable stand-in for ingegame in a world with no BBS session state; only the citation is defective.

## 13. `backend/test/game/commands/handlers/mine.handler.spec.ts:124` — contradicts-canon (medium)

**The test says:** Timer 0 (line 124) and timer 51 (line 132) are refused with a message containing 'range from', i.e. canon's NUMOOR ('Please enter a number in the range from %d to %d.').

**Canon says:** The 1..50 bounds are right, but canon answers an out-of-range mine timer with MINFMT, not NUMOOR: 'Type HELP MINE for the correct usage.' NUMOOR is a real canon string, but cmd_mine never prints it. docs/DECISIONS.md 2026-09-03 ('Message text comes from the shipped catalogue, not paraphrase') requires the shipped text for the shipped path, and no deviation is recorded for this substitution.

**Evidence:** `reference/ge-source/GECMDS.C:1767`

```c
	prfmsg(MINFMT);
```

**Verifier:** Verified; confidence medium. GECMDS.C:1765 `if (i < 1 || i > 50)` confirms the bounds, but the body is 1767 `\tprfmsg(MINFMT);` - MBMGEMSG.MSG:6135 `MINFMT {Type HELP MINE for the correct usage.` - the same message canon uses for the missing-argument case (1756/1758). NUMOOR exists in the catalogue (MBMGEMSG.MSG:2090) but cmd_mine never prints it; cmd_mine and laymine print only MINFMT, MINE1, MINE2 and MINE3. docs/DECISIONS.md 2026-09-03 ('Message text comes from the shipped catalogue, not paraphrase') requires the shipped string where one exists, and no deviation is recorded for this substitution - the only trace is docs/superpowers/plans/2026-06-25-combat-depth-persistence.md:60 ('MIN_TIMER (reuse NUMOOR(1,50))'), a plan note that predates that decision and is not a deviation record. Tests at lines 124 and 132 assert `.toContain('range from')`, i.e. NUMOOR's wording, so they pin the wrong catalogue entry.

## 14. `backend/test/game/commands/handlers/missile.spec.ts:105` — contradicts-canon (medium)

**The test says:** Charge 0 (line 105) and charge 50001 (line 112) are refused with a message containing 'range from' (NUMOOR).

**Canon says:** The bounds are canon-correct (`eng_long == 0 || eng_long > 50000L`), but the message canon prints for both is MISFMT — 'Type HELP MISSILE for the correct usage.' (MBMGEMSG.MSG:6119) — never NUMOOR.

**Evidence:** `reference/ge-source/GECMDS.C:1271`

```c
	prfmsg(MISFMT);
```

**Verifier:** Verified; confidence medium. GECMDS.C:1269 `if (eng_long == 0 || eng_long > 50000L)` confirms the bounds the auditor concedes are correct, and the body is 1271 `\tprfmsg(MISFMT);` - MBMGEMSG.MSG:6119 `MISFMT {Type HELP MISSILE for the correct usage.` - the same message cmd_missl uses for a missing charge argument at 1262. NUMOOR is never printed by cmd_missl. The tests at lines 105 and 112 assert `.toContain('range from')`, NUMOOR's wording, against the shipped path. Same governing decision as the mine case (docs/DECISIONS.md 2026-09-03) and no recorded deviation. Note this is a message-text finding only - the 1/50000 clamp itself is canon-correct.

## 15. `backend/test/game/planet/planet-economy-branches.spec.ts:42` — wrong-citation (high)

**The test says:** The file header states that canon clears `spyowner` on exactly two outcomes, citing GEPLANET.C:113 (the master owning the planet) and GEPLANET.C:144 (counter-spies catching the infiltrator).

**Canon says:** The two live `spyowner[0] = 0` assignments are at GEPLANET.C:95 (the same-owner kill) and GEPLANET.C:142 (the caught-spy kill). Line 113 is the opening of a commented-out DEBUG block (`/*DEBUG`), not code at all, and line 144 is the `return;` that follows the clear. A third assignment at :101 sits inside a block that is commented out (`/* if(!uidxst(...)) ... else */`), which is why the live count is two.

**Evidence:** `reference/ge-source/GEPLANET.C:142`

```c
				plptr->spyowner[0]=0;
```

**Verifier:** Verified in reference/ge-source/GEPLANET.C. The header's two cited lines are both wrong. Line 113 is `		/*DEBUG` — the opening of a commented-out debug block, not code. Line 144 is `				return;`. The two live clears are at :95 `	plptr->spyowner[0] = 0;` (the same-owner kill) and :142 `				plptr->spyowner[0]=0;` (the caught-spy kill); the third at :101 sits inside the `/* if(!uidxst(...)) ... else */` comment, so the header's substantive claim of exactly two live outcomes is correct — only the line numbers are off. Note the service itself cites the correct spans (GEPLANET.C:122-141, :149-186), so this is confined to the spec header. Confidence high; upheld as a wrong-citation finding only, no behaviour change implied.

## 16. `backend/test/game/planet/attack-troop-math.spec.ts:126` — contradicts-canon (high)

**The test says:** The test's own re-implementation of canon's troop-attack math computes the attack ratio as `const ratio = left2 > 0 ? Math.floor(left1 / left2) : 0;` — a bare quotient — and then gates the counter-kill on `ratio > 2`.

**Canon says:** attack_men() computes the ratio as a PERCENTAGE, left1*100/left2. Dropping the x100 makes every gate (`> 2` counter-kill, `> 2` item destruction, `> 1` owner alert, `> 5` spy report) demand 100x more attackers than canon does. The production service at src/game/planet/planet-attack.service.ts:95 has the x100 and carries a comment saying this exact omission was a shipped bug; the helper in the test still has the pre-fix formula.

**Evidence:** `reference/ge-source/GECMDS.C:3655`

```c
	ratio = (left1*100UL)/left2;
```

**Verifier:** Canon verified verbatim: GECMDS.C:3655 `\tratio = (left1*100UL)/left2;` inside attack_men(), and the gates at 3670 (`if (ratio > 2L)`) act on that percentage. The test's helper at attack-troop-math.spec.ts:125 does compute `const ratio = left2 > 0 ? Math.floor(left1 / left2) : 0;` with no x100, contradicting canon, and the production service at src/game/planet/planet-attack.service.ts:95 has `Math.floor((left1 * 100) / left2)` with a comment recording the missing x100 as a shipped bug. Two caveats that lower the severity but do not refute it: (a) the ratio line is at spec line 125, not 126 as cited; (b) `simulateTroopAttack` is dead code — grep for the identifier in that file returns only its definition at line 106, so no assertion in the suite currently derives an expectation from the stale formula. It is a wrong canon transliteration sitting in a spec file, not a wrong passing assertion.

## 17. `backend/test/game/droid/droid-tick-decisions.spec.ts:274` — contradicts-canon (high)

**The test says:** After a Droid hyper-phaser shot lands, the Droid's phaser bank is spent: `expect(droid.phasr).toBe(0)`, commented "The bank is spent whether or not the beam connected."

**Canon says:** `firehp` never touches `ptr->phasr` at all. It is gated on FLUX ENERGY (`if (ptr->energy >= HPMINFIR)`, GECMDS.C:1029, HPMINFIR=6000) and its cost is `ptr->energy -= HPFIRAMT` (5000). `ptr->phasr = 0` exists only in `firep` (GECMDS.C:1006), the normal-space beam. The port's own player path and Cybertron path model this correctly (phaser.handler.ts:436, cybertron-tick.service.ts:526 both debit HPFIRAMT energy); only the droid path zeroes `phasr`, and this test pins that.

**Evidence:** `reference/ge-source/GECMDS.C:1039`

```c
	ptr->energy -= HPFIRAMT;
```

**Verifier:** UPHELD (high confidence). I read GECMDS.C:1020-1088 myself. `firehp` is gated on flux energy — GECMDS.C:1029 `if (ptr->energy >= HPMINFIR)` — and its cost is GECMDS.C:1039 `	ptr->energy -= HPFIRAMT;`, followed by 1040 `ptr->hypha = 1;` and 1041 `ptr->cantexit = FIRETICKS;`. There is no assignment to `ptr->phasr` anywhere in `firehp`; the only `ptr->phasr = 0` is at GECMDS.C:1006, inside `firep` (the normal-space beam). The port's own player and Cybertron paths model this correctly (phaser.handler.ts:436 and cybertron-tick.service.ts:526 both do `energy - HPFIRAMT`, the latter with a comment quoting GECMDS.C:1039-1041), while droid-tick.service.ts:634 does `droid.phasr = 0` and never touches energy — an asymmetry the test pins at line 274. I searched docs/DECISIONS.md, docs/PROGRESS.md and docs/audits/ for any recorded deviation covering a droid hyper-phaser spending the phaser bank instead of flux; there is none (the only `phasr = 0` entries cite GECMDS.C:1006, the firep path). Not explained by any listed trap.

## 18. `backend/test/unit/new-ship.handler.spec.ts:265` — contradicts-canon (high)

**The test says:** `new ship 4` while not orbiting (`where = 0`, inside the neutral zone) answers with an orbit-requirement message: `expect(result.lines[0].text).toMatch(/orbit/i)`. The handler under test returns NEW5 ("Sir, we must be in orbit around Zygor in Sector 0 0 to get new equipment.") for this case.

**Canon says:** `cmd_new` tests `where < 10` FIRST and answers NEW1, which is "Sorry Sir, we must go to Zygor to get a new ship." (MBMGEMSG.MSG:3922) — no mention of orbit. NEW5 is the LATER, different branch, reached only when the ship IS orbiting (`where >= 10`) but is not in the neutral zone or is orbiting a body other than plnum 1 (GECMDS.C:4558 / :4718-4720). The port collapses the two into NEW5 and the test pins the collapsed behaviour.

**Evidence:** `reference/ge-source/GECMDS.C:4547`

```c
if (warsptr->where < 10)
```

**Verifier:** UPHELD (medium-high confidence). GECMDS.C:4547 reads `if (warsptr->where < 10)` and the body at :4549 is `prfmsg(NEW1);` then `return;` — NEW1 is MBMGEMSG.MSG:3922 `NEW1 {Sorry Sir, we must go to Zygor to get a new ship.`, which contains no orbit wording. NEW5 (MBMGEMSG.MSG:3938 `NEW5 {Sir, we must be in orbit around Zygor in Sector 0 0 to get new equipment.`) is emitted only from the closing else at GECMDS.C:4718-4720, reached after the `where < 10` early return, i.e. only when the ship IS orbiting but fails `neutral(&warsptr->coord) && plnum == 1` (GECMDS.C:4558). The port collapses both: new-ship.handler.ts:203-219 tests only `atZygor()` (in-NZ AND where-10 === ZYGOR_PLNUM) and answers NEW_WRONG_PLACE = NEW5 for everything else, so a `where = 0` ship gets NEW5. The spec's `where: 0` fixture at line 261 matches `where < 10`. docs/PROGRESS.md:3246-3250 records the Zygor-only tightening (the NEW5 branch) but says nothing about the NEW1 branch, and docs/DECISIONS.md has no NEW1 entry, so this is not a recorded deviation. Caveat on materiality only: the divergence is the message text, not a gameplay gate.

## 19. `backend/test/unit/new-ship.handler.spec.ts:437` — contradicts-canon (medium)

**The test says:** A purchased hull is created at the buyer's exact intra-sector position: `expect(created.data['xcoord']).toBeCloseTo(0.4812, 6)` / `ycoord` 0.5533 — "leaves the new hull where the buyer is, not at the sector corner".

**Canon says:** `cmd_new` creates the hull through `initshp` (GECMDS.C:4572), and `initshp` places it at a RANDOM point in the neutral sector, re-rolled in a loop until it is at least 1000 units from every planet in that sector (GEFUNCS.C:202-216). Canon never copies the buyer's coordinates, and it deliberately pushes the new hull AWAY from the station; the port puts it inside orbit range of Zygor. The sector-corner (0.0, 0.0) placement the test is reacting to is indeed non-canon, but so is the buyer's position. I found no entry for this in docs/DECISIONS.md (PROGRESS.md:265 records the corner fix for the ONBOARDING path only).

**Evidence:** `reference/ge-source/GEFUNCS.C:204`

```c
	tmpshp.coord.xcoord     = NEUTRAL_X + rndm(.9999);
```

**Verifier:** UPHELD (medium confidence). I read GEFUNCS.C:190-245. `initshp` sets the new hull's position randomly in the neutral sector — GEFUNCS.C:196-197 `tmpshp.coord.xcoord = NEUTRAL_X + rndm(.9999);` / `ycoord`, then a re-roll loop at :202-216 whose body repeats `tmpshp.coord.xcoord = NEUTRAL_X + rndm(.9999);` (:204) and sets `flag = 1` whenever `ddistance < 1000` from any planet in the sector (:211-213). `cmd_new` reaches it via GECMDS.C:4572 `initshp(waruptr->userid,type);`. Canon therefore never copies the buyer's coordinates and specifically forbids a spawn within 1000 units of a planet, whereas the buyer is by definition within 250 of Zygor (GECMDS.C:798 `if (distance <= 250)`), so the pinned value lands the hull exactly where canon re-rolls away from. I found no entry in docs/DECISIONS.md covering this (the nearest, 2026-09-01 at :1896-1911, is about phasrtype/shieldtype from the same initshp) and none in docs/PROGRESS.md beyond the onboarding-path corner fix. Confidence is medium only because the deviation is plainly deliberate (the test's own comment argues the 250-unit orbit rule makes canon's placement punishing) — it looks like an unrecorded deliberate deviation rather than an accident.

## 20. `backend/test/game/droid/droid-tick-decisions.spec.ts:111` — wrong-citation (high)

**The test says:** "Fight-back needs BOTH `cantexit > 0` and `lastfired` pointing at the attacker's CHANNEL (GEDROIDS.C:443 for the Vakory, :338 for the Murdonian)".

**Canon says:** The Vakory's fight-back gate is GEDROIDS.C:447, not 443 (443 is a blank line inside the detection loop). The Murdonian's is GEDROIDS.C:340, not 338 (338 is a closing brace). The functions named are right; both line numbers are off. Note also that the two gates are not identical — the Vakory uses `> 0` and the Murdonian `>= 0`, which the spec's own later cases (droid-act-class-12.spec.ts:56-77) depend on.

**Evidence:** `reference/ge-source/GEDROIDS.C:447`

```c
	if (ptr->cantexit > 0 && ptr->lastfired > 0)
```

**Verifier:** UPHELD (high confidence). GEDROIDS.C:447 is `	if (ptr->cantexit > 0 && ptr->lastfired > 0)` (Vakory) and GEDROIDS.C:340 is `	if (ptr->cantexit > 0 && ptr->lastfired >= 0)` (Murdonian). The lines the comment cites are neither: 443 is a blank line inside the preceding shield/annoy block, and 338 is a closing brace `			}`. docs/DECISIONS.md:2352 independently cites the Murdonian gate as GEDROIDS.C:340, confirming the numbering of the vendored file. Functions named are right; both line numbers are off by 4 and 2 respectively. Minor but it is exactly kind (c).

## 21. `backend/test/game/droid/droid-tick-decisions.spec.ts:313` — wrong-citation (high)

**The test says:** "`firep` branches solely on `wptr->shieldstat != SHIELDUP` (GECMDS.C:986)".

**Canon says:** That branch is GECMDS.C:982. Line 986 is `outprfge(ALWAYS,usrn);`, a print inside the shields-down arm. The claim itself is correct — only the line number is wrong. (The neighbouring citations in the same file, GECMDS.C:1054 and :1078, are exact.)

**Evidence:** `reference/ge-source/GECMDS.C:982`

```c
						if (wptr->shieldstat != SHIELDUP)
```

**Verifier:** UPHELD (high confidence). GECMDS.C:982 is `						if (wptr->shieldstat != SHIELDUP)`; line 986 is `							outprfge(ALWAYS,usrn);`, a print inside the shields-down arm. The substantive claim in the comment (firep branches solely on that test, and the SHIELDUP arm never touches `wptr->damage` — the else arm at :991-998 calls `shieldhit` and prints only) is correct; only the line number is wrong. The neighbouring citations I spot-checked in the same block are exact (:975 `if (damage >= 1)`, :999 `randamage(...)`, :1006 `ptr->phasr = 0;`).

## 22. `backend/test/game/physics/physics-tick.service.spec.ts:195` — wrong-citation (medium)

**The test says:** "rotateship contains no reference to `where` at all (GEFUNCS.C:433-461) — the gate lives only in moveship (:641, :652)", supporting the case that an orbiting ship (`where = 13`) at speed 1000 does not move.

**Canon says:** `moveship` contains no orbit gate anywhere. The only `where` test in it is `if (ptr->where <= 1)` at GEFUNCS.C:651, which guards the universe-boundary block, and :652 is that block's opening brace. Line 641 is `if (ptr->speed > 0)`, a speed gate. Canon reaches the same outcome by a different route: `cmd_orb` zeroes speed on entering orbit (GECMDS.C:802-803 `warsptr->speed = 0; warsptr->speed2b = 0;`), so an orbiting canon ship is never moving in the first place. The rotateship half of the claim is correct and exactly cited.

**Evidence:** `reference/ge-source/GEFUNCS.C:651`

```c
	if (ptr->where <= 1)
```

**Verifier:** UPHELD (medium-high confidence). I read `moveship` in full (GEFUNCS.C:632 onward). Line 641 is `if (ptr->speed > 0)` — a speed gate, not an orbit gate — and the sole `where` test in the function is GEFUNCS.C:651 `	if (ptr->where <= 1)`, whose opening brace is :652 and which guards only the univmax boundary/telezip block (:653-700+). There is no orbit gate anywhere in `moveship`, so "the gate lives only in moveship (:641, :652)" points at lines that are not that gate. Canon reaches the same no-movement outcome by a different route: `cmd_orb` zeroes speed on entry — GECMDS.C:801-803 `warsptr->where = 10 + plnum; warsptr->speed = 0; warsptr->speed2b = 0;` — so an orbiting canon ship has speed 0 and `moveship`'s :641 gate is what stops it. The rotateship half of the comment is correct and exactly cited: GEFUNCS.C:433-462 contains no reference to `where`.


## Found while fixing, NOT acted on

**Canon's missile impact never sets `lastfired`.** `checktm`'s torpedo branch
does — GEFUNCS.C:1559 `ptr->lastfired = tptr->channel;` — and the missile
branch at GEFUNCS.C:1625-1665 sets damage, drains the shield and rolls
`randamage` without ever recording who fired. Since `lastfired` is what kill
attribution reads, following canon here would mean a missile kill credits
nobody.

Left alone deliberately. It was outside the audit's findings, nobody has
verified it is not compensated somewhere else in the original, and changing
kill attribution on a live galaxy on the strength of one reading is a bigger
step than any fix in this list. Worth its own look before the next round.
