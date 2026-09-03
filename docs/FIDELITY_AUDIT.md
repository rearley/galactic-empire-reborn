# Fidelity Audit — port vs. original C source

> **SUPERSEDED, in part.** This audit predates
> `reference/ge-upstream/` — the full original distribution, obtained 2026-09-02.
> It was written against the nine C files and the wiki, so **any claim about a
> VALUE here should be re-checked** with the extractors in `tools/`; several
> figures it treats as canonical came from wiki tables that turned out to be
> rounded or wrong. Its findings about **logic** stand.
>
> Current audit: `CANON_AUDIT_2026-09.md`. Index: `README.md`.

> ## VALUE RE-CHECK 2026-09-03
>
> Acting on this document's own "any claim about a VALUE here should be
> re-checked" warning: **every numeric claim and every `file:line` citation in
> this report has now been re-read** against `reference/ge-source/*.C` and the
> **shipped** `reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG`. (The other
> copy of that file, `GE/MSG/`, is an earlier partial snapshot and must not be
> used — see `reference/ge-upstream/PROVENANCE.md`.)
>
> **Result: the report is in very good shape.** All 65 findings' *logic* stands,
> and roughly 120 of the ~130 C citations resolve exactly. **Twelve** claims are
> wrong, all listed below: six substantive and six one-line citation slips.
> (This line originally said "Nine … five … four", which matched neither the
> tables beneath it nor the re-check that produced them — a counting error in
> the summary of a counting exercise.)
>
> ### Substantive corrections
>
> | Where | Claim | Verdict |
> |---|---|---|
> | **7.3 `score_f2`** | "Latent at the shipped default 100." | **WRONG.** Canon `SCRFACT` is **35** (`GE/REL/MBMGEMSG.MSG:472`; `GEMAIN.C:603`). The bug is **live**, not latent: the port awards the attacker a 35%-scaled amount where C awards the full `amt`. `game-config.ts` already records `canonDefault: 35, implemented: false` with a note that `score.config.ts` reads its own `SCORE_F2` env var defaulting to 100. |
> | **7.4 `TEAMBONU`** | "Latent at the default 0." | **WRONG.** Canon `TEAMBONU` is **5** (`:529`), i.e. `teambonus = 500` after `GEMAIN.C:478`'s `*100L`. The bug is **live**: every zero-score team member is denied their 500. `game-config.ts:125` now carries `default: 5`. |
> | **7.1 `PLTVCASH`** | "Fix: choose a real sysop value (must be ≤ 1e6 for the expression to be a divisor)." | **Was UNVERIFIABLE; now RESOLVED.** Canon is **10** (`:1831`), giving `v = (cash+tax)/100000`. The diagnosis (201,228,378 is the `lngopt` ceiling, `GEMAIN.C:593`) is CONFIRMED. `midnight.constants.ts:63` currently defaults to **1000** — a live 100x deviation from canon. |
> | **7.2 `PLTVDIV`** | "Fix: pick a sane divisor." | **Was UNVERIFIABLE; now RESOLVED.** Canon is **10000** (`:1823`) — which is exactly what `midnight.constants.ts:77` already defaults to. Nothing to change. |
> | **1.1 missiles** | "Max possible missile hull damage is 100." | **Half wrong.** 100 is the `numopt(MDAMMAX,1,100)` **ceiling** (`GEMAIN.C:511`), not the value. Shipped `MDAMMAX` is **25** (`:333`), so canon's ceiling on missile hull damage is 25 and the port's overshoot is worse than stated. |
> | **1.7 mail purge** | "purge mail older than 7 days" | **Wrong number, right finding.** The 7 is C's *comment* (`GEMAIN.C:1182`); the shipped retention is `MAILDAYS = 3` (`:449`, clamp `numopt(MAILDAYS,1,7)` at `GEMAIN.C:497`). `midnight.constants.ts` has since been corrected to canon 3. |
>
> ### Citation slips (value/logic unaffected; the corrected line is given)
>
> | Where | Cited | Correct |
> |---|---|---|
> | 1.1 | `GEFUNCS.C:1648` for the missile `rndm(.1)` | **`GEFUNCS.C:1642`** (`:1648` is `power = mptr->energy/999`) |
> | 2.1 | `GECMDS.C:986` "branches solely on `shieldstat != SHIELDUP`" | **`GECMDS.C:982`** (`:986` is the `outprfge`) |
> | 4.7 | `GEFUNCS.C:2497-2499` for the shield energy debit | **`GEFUNCS.C:2502-2503`** — and the report omits the guard: `if (type < 20)`, so a sysop type-20 shield draws nothing |
> | 5.3 | `GEPLANET.C:359-361` for "two independent `gernd()` calls" | **`GEPLANET.C:359` and `:363`** |
> | 5.4 | `GEPLANET.C:232-234` for the men `/8` | **`GEPLANET.C:234-236`** |
> | 1.7 | `GEMAIN.C:1160-1161` for the MAILSTAT `mailit()` | **`GEMAIN.C:1163`** (`:1160` is the `/*HERE*/` marker) |
>
> ### Spot-checks that came back CONFIRMED (not exhaustive, but the load-bearing ones)
>
> `MDAMMAX` clamp `GEMAIN.C:511`; `ddist *= 10000` at `GECMDS.C:1637` and `:1705`;
> `buy` affordability `GECMDS.C:4333` and negative-cash clamp `:4208-4209`;
> `amt4sale` `GECMDS.C:4411-4415` and the gold branch `:4417-4423` (the gate is
> `plnum == 1`, and `plnum` is 1-based via `where = 10 + plnum`, `GECMDS.C:801` —
> so "Zygor-3" in this report means canon's planet **#1, named simply "Zygor"**,
> `GE/REL/MBMGEMSG.MSG:559`); teamcode sentinel `GEMAIN.C:1293-1301`; shield
> knockdown `GEFUNCS.C:2453-2469`; `cmd_shields` gates `GECMDS.C:3114-3170`;
> decoy loops `GEFUNCS.C:1581-1592` / `:1666-1677` with `DECOYTIME 15`
> (`GEMAIN.H:132`) and `MAXDECOY 10` (`:127`); torpedo/missile channel writes
> `GECMDS.C:1202` / `:1317`; `cybmine` on phaser hit `GECMDS.C:980-981` /
> `:1071-1072`; `useenergy`'s `+500` `GEFUNCS.C:1507`; `unsigned dam`
> `GEFUNCS.C:2067`; the AI 1s countdown `GEMAIN.C:2401-2426` + `rtkick(1,…)`
> `:2438`; `isquad` `GECYBS.C:834-838` and `CYB_BREAKOFF` `:255`; `notclaimed`
> `GECYBS.C:357-376` and `lta` `:711/:719`; the four pursuit clamps `:745-746,
> :760-761, :774-775, :789-790`; `cyb_lay_decoys` `:606-612` called from `:296`;
> the three evasive branches `:541-557, :559-565, :566-580` (`rndm(5000)+4500` at
> `:575`); `CYB_ALLOW 35` `GEMAIN.H:170` + `GECYBS.C:229` and `CYB_MAXCASH`
> `:121-122`; droid ticks 18-33 idle / 6-11 locked `GEDROIDS.C:216-227` (with
> `CYBTICKTIME 6`, `GEMAIN.H:135`); `int diff,intspeed` `GEFUNCS.C:639` and the
> 27-vs-26 arithmetic `:743-745`; the 6s restorative block `GEMAIN.C:2256-2274`
> and `TICKTIME 6` `GEMAIN.H:133`; the seven repair-completion fields
> `GEFUNCS.C:413-421`; `SHMINPWR` collapse `GEFUNCS.C:1340-1352`; gravity
> `GEFUNCS.C:836-902`; hyperspace `GEFUNCS.C:580-626`; `hostile`
> `GEFUNCS.C:724, :797-798, :907-929`; the planet loop `GEPLANET.C:268-333` with
> cash decay at `:286` and the cap at `:295/:297`; starvation integer division
> `GEPLANET.C:206-209` (100 troops → 88; 150 troops + 1 food does not starve);
> `GEMAIN.C:2130`; `BUYPAS3/4` `GECMDS.C:4232-4246`; `BUY7` `GECMDS.C:4322`;
> `score_f2` split `GEFUNCS.C:1155-1157, :1162, :1184-1185`; `TEAMBONU`
> `GEMAIN.C:1275`; `outprfge` `GEMAIN.C:2547-2576`; `cmd_set`'s four options
> `GECMDS.C:5196-5201`.
>
> **Not re-verified:** the port-side (`backend/src/…`) line numbers throughout.
> Those files have moved under seven commits since 2026-08-31 and this pass
> checked canon only.

**Run:** 2026-08-31. **Method:** ten subsystem auditors read `reference/ge-source/`
and the corresponding port code independently, each followed by an adversarial
reviewer instructed to refute its findings by re-reading both sides. 76 findings
survived refutation; the synthesis below merges duplicates down to 65.

**Status: WORKED THROUGH.** All 65 findings were addressed between
2026-08-31 and 2026-09-01 across seven commits. The report is kept as the
record of what was wrong and why, and as the source for the mistake-class
sweeps in the Patterns section below, which remain the durable value.

| Tier | Commit | What it covered |
|------|--------|-----------------|
| 2.3 (early) | `cbfc87d` | kill credit by channel, `cybmine`, dead-firer cleanup |
| 1 | `740cc2a` | missile damage, jammer/zipper range, `buy` affordability, midnight teamcode PK, mail purge |
| 2 | `d7deb46` | shield knockdown cluster, decoys, phaser power, Cybertron provocation, pdamage truncation |
| 4 (energy) | `4260b28` | deceleration, recharge/auto-flux, repair restore, tick cadence, shield power, overspeed gating |
| 3 | `8e57b0f` | Cybertron cadence, targeting columns, break-off, shields, pursuit, evasion, allowance; droid cadence and behaviours |
| 4 (rest) | `9bd81b3` | hyperspace consequences, gravity wells, wormholes, `hostile`, overspeed truncation |
| 5-7 | `aa3e5c4` | planet economy loop, starvation integers, zero-pop skip, revolt draws, trade gates, PLTVCASH/PLTVDIV, kill-score split, TEAMBONU |
| 8 | this commit | `sca sh` announcement, damstr bands, `rep sys` subsystems, roster filter, scan prefix matching, cloak deafness, blank input, `flu` keyword |

Two findings were closed as deliberate deviations rather than changes:

- **Droid neutral-zone blindness (3.10).** C places droids anywhere and its
  three scan loops have no neutral-zone filter. The port keeps the exclusion:
  the neutral zone is where new players start and dock, and the A-004 record
  for Cybertrons is extended to cover droids for the same reason.
- **`msgFilter` (Tier 8).** Still decorative; covered by DECISIONS.md D4.

Not a finding, recorded so it is not re-raised: a planet abandoned while closed
stays unlandable. That is C's behaviour — `cmd_abandon` clears only the owner and
the planet counter (GECMDS.C:3420-3445).

---

# Galactic Empire Reborn — Fidelity Audit Report

65 confirmed behavioural divergences from `/reference/ge-source/`. Several were reported twice by different area passes (jammer range, the 1s-vs-6s repair tick, shield knockdown); they are merged here.

Ranked by effect on actual play.

---

## Tier 1 — Broken outright: one command wins the game or breaks the server

### 1.1 Missiles one-shot everything
- **Port:** `backend/src/game/combat/combat-tick.service.ts:596-597` passes the raw stored charge (`carrier.lmisslEnergy[i]`, legal range 1..50000 per `missile.handler.ts:88-96`) as `dmgMax` into `rollProjectileHullDamage` (`combat-math.ts:259-267`).
- **C:** `GEFUNCS.C:1645-1659` — `damfact = ton_fact(energy)/50000.0; damage += mdammax*damfact*(rndm(.5)+.5)`, with `mdammax` clamped 1..100. Max possible missile hull damage is 100. **[RE-CHECK 2026-09-03: WRONG — 100 is the `numopt(MDAMMAX,1,100)` **ceiling** (`GEMAIN.C:511`). The shipped value is **25** (`GE/REL/MBMGEMSG.MSG:333`), so canon's cap is 25 and the overshoot is ~4x worse than stated.]**
- **Effect:** any missile above ~200 charge is an instant kill regardless of hull, class or shields. ~500x the intended damage.
- **Fix:** normalise — `dmgMax = MDAMMAX * (charge / 50000)`. Also split the shields-up branch: C uses `rndm(.1)` for missiles (`GEFUNCS.C:1642` **[RE-CHECK 2026-09-03: citation corrected from `:1648`, which is `power = mptr->energy/999`]**), not the torpedo `rand*0.5`.

### 1.2 Jammer jams the entire galaxy
- **Port:** `backend/src/game/commands/handlers/jammer.handler.ts:55-61` feeds `cdistance()` (sector units, 0..33) into `jammerCounter(dist, scanRange, JAMTIME)` (`combat-math.ts:422-425`), which expects raw units (3750..50000).
- **C:** `GECMDS.C:1636-1648` — `ddist = cdistance(...); ddist *= 10000;` before both the `< scanrange` gate and the `1.0 - ddist/scanrange` falloff.
- **Effect:** `dist/scanrange ≈ 0.0006`, so every active ship in `findAllShips()` gets full `JAMTIME`. The out-of-range early return is unreachable.
- **Fix:** multiply by 10_000, or route through the existing `inScanRange()` helper (`combat-math.ts:36-47`) that was written for exactly this guard and is unused here.

### 1.3 Zipper deletes every mine in the galaxy
- **Port:** `backend/src/game/commands/handlers/zipper.handler.ts:59, 130-135` — `mineRegistry.getAll().filter(m => cdistance(ship, m) <= scanRange)`. Same unit mismatch; matches all mines.
- **C:** `GECMDS.C:1703-1707` — `ddist *= 10000; if (ddist < scanrange) mptr->timer = 1;`
- **Fix:** scale the distance. (The "delete rather than detonate" half is a documented port decision — `specs/006b-combat/spec.md:327-328` — leave it.)

### 1.4 `buy` never checks whether you can afford it
- **Port:** `backend/src/game/commands/handlers/buy.handler.ts:87-111` → `PlanetStateService.buy` (`planet-state.service.ts:247-288`) → `computeBuyOutcome` (`planet-trade.ts:43-134`). None reads `User.cash`; the handler then unconditionally does `prisma.user.update({ data: { cash: { decrement: result.totalCost } } })`.
- **C:** `GECMDS.C:4333` — `if ((tot = price(item,amt)) <= waruptr->cash)` gates the whole transfer, else `BUY2`; `cmd_buy` also clamps negative cash to 0 on entry (`GECMDS.C:4207-4209`).
- **Effect:** unlimited free weapons, troops and gold; balance runs arbitrarily negative and planet cash is minted from nothing. `pri` (`price.handler.ts:120-128`) *does* check, so the quote refuses and the purchase succeeds.
- **Fix:** load buyer cash in `computeBuyOutcome`, return `BUY2` when `totalCost > cash`, and clamp negative cash on entry.

### 1.5 Neutral-zone buys skip the stock check entirely
- **Port:** `planet-trade.ts:76-89` — the neutral branch applies only the cargo-tonnage cap; `item.qty`, `item.reserve` and the gold rule are never consulted.
- **C:** `GECMDS.C:4330-4331, 4417-4423` — `avail = amt4sale(item); if (avail > 0 && avail >= amt)` runs for *every* purchase; only the inventory decrement is skipped in the neutral zone. `amt4sale` additionally caps gold at Zygor-3 to `waruptr->cash`.
- **Fix:** run the availability gate unconditionally; keep only the mutation inside the neutral-zone guard (which `planet-state.service.ts:272-280` already does correctly).

### 1.6 Midnight aborts permanently once two teams are empty
- **Port:** `backend/src/game/midnight/midnight.repository.ts:355-372` loops `tx.team.update({ where: {teamcode}, data: { teamcode: -1n } })`. `Team.teamcode` is the `@id` (`prisma/schema.prisma:307`). Two empty teams in one pass — or one empty team on any night after a `-1` row already exists (the `gt: 0n` selector hides it from the read but not from the PK index) — throws a unique-constraint error that escapes the `$transaction` (`midnight.service.ts:112-146`) and is only logged (`:81-84`).
- **C:** `GEMAIN.C:1293-1301` — `teamtab[i].teamcode = -1;` into a fixed 50-slot array, no uniqueness.
- **Effect:** the entire nightly pass rolls back — no scores, no plscore, no production reports, no ranks, no purge, no `MidnightRun` ledger row, so the boot self-heal retries and fails identically. The scoreboard silently freezes forever.
- **Fix:** don't reuse the PK as a sentinel. Add a `removed Boolean` (or nullable `removedAt`) column and set that; or delete the row.

### 1.7 The mail purge deletes from a table nothing writes to
- **Port:** `midnight.repository.ts:169-178` deletes from `tx.mail`. Repo-wide, the only writers of the `Mail` model are test files. All real mail goes to `MailStat` — production reports (`midnight.repository.ts:156`), attack notices (`planet-attack.service.ts:296`), economy notices (`planet-economy.service.ts:150`) — and the inbox reads only `MailStat` (`mail-inbox.repository.ts:19`).
- **C:** `GEMAIN.C:1182-1196` — phase 3 walks `gebb4`, the single file `mailit()` writes *all* mail into, including the MAILSTAT production records mailed at `GEMAIN.C:1163` **[RE-CHECK 2026-09-03: citation corrected from `:1160-1161` (the `/*HERE*/` marker). Separately, the section title's **"7 days" is WRONG**: 7 is C's comment text and the `numopt` ceiling (`GEMAIN.C:497`); shipped `MAILDAYS` is **3** (`GE/REL/MBMGEMSG.MSG:449`).]**.
- **Effect:** mail never expires. 10 planets = 3,650 undeletable inbox rows per year; unbounded table growth.
- **Fix:** point `purgeMail` at `MailStat` (age cutoff + `*`-prefixed recipients). Note `specs/017-mail-inbox/research.md:144` asserts the purge already covers this — correct that too.

---

## Tier 2 — Combat resolution is systematically wrong

### 2.1 Shield knockdown never enters the damaged state (cluster)
Four findings, one root cause.

- `combat-math.ts:196-206` returns a single `knockedDown` boolean for both the `newCharge <= 2` and `newCharge < SHMINCHG` branches; every caller (`phaser.handler.ts:218`, `cybertron-tick.service.ts:440`, `droid-tick.service.ts:416`) responds `v.shieldstat = 0`.
- **C `GEFUNCS.C:2453-2469`:** `shield <= 2` → `shieldstat = SHIELDDM` **and** `shield -= knock*3`; the `else if (shield < SHMINCHG)` branch prints `SHKNKDN` only and **leaves shields up**.
- `shield.handler.ts:21-25` sets `shieldstat = 1` unconditionally. **C `GECMDS.C:3114-3170`** rejects on `max_shlds == 0` (SHIELD0), `where == 1` (SHLD1), `shieldtype == 0` (SHLD2), `energy <= SHMINPWR` (SHNOPWR) and `shieldstat == SHIELDDM` (SHNORPR).
- `phaser.handler.ts:209` adds `&& candidate.shield > 0` to the shields-up test. **C `GECMDS.C:982`** **[RE-CHECK 2026-09-03: citation corrected from `:986`, which is the `outprfge`]** branches solely on `shieldstat != SHIELDUP`; `shieldup()` (`GEFUNCS.C:2409-2415`) grants no charge, so a just-raised 0-charge shield still absorbs the hit fully in C.

**Net effect:** shields fail two charge points early, fail into a freely re-raisable state, and a defender who has just raised shields or is pinned at 0 charge eats full hull damage. The `shieldrep` climb at `ship-tick.service.ts:137-143` is unreachable from combat. Sustained phaser pressure — the defining Cybertron/PvP tactic — buys nothing.

**Fix:** have `shieldhit` return a three-way outcome (`damaged` / `warned` / `none`); on `damaged` set `shieldstat = SHIELDDM` and `shield -= knock*3`; on `warned` change nothing. Add the five `cmd_shields` gates to `shield.handler.ts`. Drop `&& candidate.shield > 0` from `phaser.handler.ts:209`.

### 2.2 Decoys are infinite-use and don't stack
- **Port:** `combat-tick.service.ts:540-546, 580-586` — one `hasActiveDecoy()` boolean test plus one `decoyIntercept()` roll; `emitDecoyIntercept` (`:627-642`) mutates nothing on the defender.
- **C:** `GEFUNCS.C:1581-1592` (torps) and `1666-1677` (missiles) — `for (j=0;j<MAXDECOY;++j) if (dptr[j] > 0) { if (... gernd()%decodds == 0) { dptr[j] = 0; tptr->distance = 0; break; } }`
- **Effect:** one decoy = unlimited intercepts for its 15-tick life; stacking gives no benefit.
- **Fix:** loop the slots, roll per live decoy, zero the winning slot.

### 2.3 Torpedo/missile kill credit goes to the wrong player ✅ FIXED (cbfc87d)
- **Port:** `torpedo.handler.ts:157` and `missile.handler.ts:168` write `ship.shipno` (per-user index 1,2,3…) into `ltorpsChannel`/`lmisslChannel`. Read-back is by global channel: `combat-tick.service.ts:711-717` and `:343-355` match `s.channel === channel` from `ship-channel.registry.ts:62-64`. `cybertron-tick.service.ts:550` and `droid-tick.service.ts:536` do the same. `mine.handler.ts:88` gets it right.
- **C:** `GECMDS.C:1202, 1317` store `usrnum`, the same globally unique value `killem()`/`acctm()` use (`GEFUNCS.C:1559`).
- **Effect:** kill credit, score and salvage go to whoever holds that channel number — usually an unrelated player's first ship. Cybertron escalation is fed wrong kill counts.
- **Fix:** write `ship.channel` on all four write sites; update `clearInFlightFromDeadFirer` (`combat-tick.service.ts:308, 323`) to compare channels too. Note the comment at `:344-348` already documents this as a known bug fixed on the read side only.

### 2.4 Phaser hits don't provoke Cybertrons
- **Port:** `phaser.handler.ts:210-230, 350-360` set only `lastfired`/`cantexit`. `cybmine` is written only in `cybertron-tick.service.ts` (`:310, 320, 573, 582, 623`) by proximity acquisition.
- **C:** `GECMDS.C:980-981` (firep) and `GECMDS.C:1071-1072` (firehp) — `if (wptr->status == GESTAT_AUTO) wptr->cybmine = usrn;` inside the `damage >= 1` block, overriding current target and the noClaim rules.
- **Effect:** you cannot pull a Cybertron off a teammate; a Cybertron you shoot ignores you. PvE is pure proximity.
- **Fix:** in both phaser handlers, on a landed hit against `status === GESTAT_AUTO`, set `victim.cybmine = attacker.channel`.

### 2.5 Phasers recharge for free
- **Port:** `combat-tick.service.ts:482-488` applies `phasr += reloadAmt` and `energy = Math.max(0, energy - 57)` unconditionally.
- **C:** `GEFUNCS.C:1026-1041` wraps the whole preload in `if (useenergy(ptr,usrn,PENGUSE) == 1)`; `useenergy` (`GEFUNCS.C:1500-1514`) returns 0 unless `energy >= amount + 500`, spending nothing and charging nothing.
- **Fix:** call the existing `tryEnergyDebit` helper (`physics-math.ts:129`) with a 500 floor and skip the charge on refusal.

### 2.6 `pdamage` truncation missing
- **Port:** `combat-math.ts:127-131, 159-162` keep `dam = PDAMMAX * dp` as a float through the outer multiplier, flooring only at the end.
- **C:** `GEFUNCS.C:2060-2092` declares `unsigned dam` — truncated *before* `firep`/`firehp` scale it (`GECMDS.C:956-969, 1056-1063`).
- **Fix:** `Math.floor` the base `dam` before the `(1+phasrtype)/2.5` / `phasrtype` multiply.

---

## Tier 3 — AI does not fight like the original

### 3.1 Cybertrons think 6x too slowly
- **Port:** `cybertron-tick.service.ts:144-166` decrements `ship.tick` on `TickKind.PHYSICS` (6s).
- **C:** `GEMAIN.C:2401-2426` decrements `wptr->tick` inside `autortia()`, re-kicked with `rtkick(1,autorti)` (`GEMAIN.C:2438`) — tick counts *seconds*.
- **Effect:** with C's values, a Cybertron re-evaluates every 36-66s in combat instead of 6-11s, and every 180-330s idle. The `CYBMAXPERTICK=2` cap (documented in `DECISIONS.md` R-3) compounds it, and `break`s *before* the decrement so capped ships don't even count down.
- **Fix:** move the countdown to the 1s `SHIP_UPDATE` tick. Also correct `specs/007-cybertron-ai/plan.md:135`, which claims the PHYSICS decrement "matches the C source verbatim".

### 3.2 Cybertrons fight with shields down
- **Port:** `cyb-decisions.ts:192, 201, 209` — `raiseShields: currentWhere === 1`, i.e. only on the hyperwarp-exit tick. `cybAttack` (`cybertron-tick.service.ts:479-503`) has no shield raise, and `cybertron.repository.ts:162` spawns them shields-down.
- **C:** `GECYBS.C:783-784, 802-803` and `GECYBS.C:580-584` — `if (ptr->where == 0) shieldup(ptr,usrn);` in both close pursuit bands and in `cyb_attack`.
- **Fix:** invert to `currentWhere === 0`, and add a `shieldup` in `cybAttack`. (`DECISIONS.md` R-9 covers only the hyperwarp drop/restore, not this.)

### 3.3 The wrong Cybertrons break off
- **Port:** `cybertron-tick.service.ts:319` — `if (tough !== CYB_TOUGH_1 && rnd % CYB_BREAKOFF === 0)`, then `return`s out of the whole engagement scan.
- **C:** `GECYBS.C:255` — `if (isquad(ptr) && gernd()%CYB_BREAKOFF == 0)`, where `isquad` is `tough_factor == CYB_TOUGH_1` (`GECYBS.C:834-838`); C then falls through and still evaluates fire.
- **Effect:** exact inverse. Heavy classes pursue relentlessly; light Scouts/Drones randomly disengage.
- **Fix:** flip to `===`, and continue the scan instead of returning.

### 3.4 The two Cybertron target-selection columns are swapped and read off the wrong ship
Two findings, one seed bug.
- `cybertron-tick.service.ts:604` passes `cls?.noClaim` where `cls` is the *Cybertron's* class (fetched `:565`). **C `GECYBS.C:719, 357-376`** — `notclaimed(wptr,...)` uses the *victim's* class `noclaim`.
- The seed holds each column's C semantics in the other: `schema.prisma:457-460` documents `cybLowestClassAttacks` as the wiki "Cyb#" (player) column and `noClaim` as the wiki "User" (CPU) column, and `ship-classes.ts` follows that — player rows carry Cyb# in `cybLowestClassAttacks` (`:68, 96, 124`), CPU rows carry `lowest_to_attk` in `noClaim` (`:407=20, :463=3`).
- Consequence 1: every CPU class has `cybLowestClassAttacks = 0` (`ship-classes.ts:350, 378, 406, 434, 462`), so the guard at `:590/:597` never fires and Base Stars / Obliterators hunt class-1 rookies. The guard is also one class stricter than C's `lta = lowest_to_attk - 1` (`GECYBS.C:711, 719`).
- Consequence 2: Heavy Freighter and Freight Barge (Cyb#=0, "cannot be attacked unprovoked") are claimable, and gang-up limits depend on the hunter rather than the hunted. `notClaimed` (`:689-698`) also returns true when `noClaim` is 0, so classes 21/22/24 claim without limit.
- **Fix:** swap the two seed columns to match C semantics, pass the *candidate's* class to `notClaimed`, use `shpclass >= lowest_to_attk - 1`, and make `noClaim === 0` mean "never claimable".

### 3.5 Cybertron pursuit drifts instead of snapping
- **Port:** `cyb-decisions.ts:169-212` returns only `desiredSpeed`; `cybertron-tick.service.ts:659` writes only `speed2b`. The module never assigns `.speed`.
- **C:** `GECYBS.C:745-746` (`ptr->speed = ptr->speed2b` on hyperwarp entry), `:760-761` (clamp to 20000 in the brake band), `:774-775, 789-790` (clamp to `d_topspeed` in both close bands).
- **Fix:** apply the instantaneous assignment/clamps in `applyPursuitBand`.

### 3.6 Cybertrons never deploy decoys
- **Port:** `cybertron-tick.service.ts:527-537` fills one slot and decrements `I_DECOY`; but `decout` is `[]` at spawn (`cybertron.repository.ts:174`, nothing on the create path), so `findIndex(t => t === 0)` returns `-1` and it returns early for the ship's whole life. It is also called at `:363` outside the attack branch.
- **C:** `GECYBS.C:606-612` — `for (i=0;i<5;++i) if (ptr->decout[i] == 0) ptr->decout[i] = DECOYTIME;`, no inventory cost, called only from the attack branch (`GECYBS.C:296`).
- **Fix:** initialise `decout` to 10 zeros at spawn, fill the first five empty slots, drop the inventory decrement, move the call into the attack branch.

### 3.7 Cybertron evasive repertoire missing
- **Port:** `cybertron-tick.service.ts:479-503` fires phasers and torpedoes only. The zipper branch (`:306-316`) triggers on any `minesnear > 0`, reverses heading by exactly 180°, and `return`s.
- **C:** `GECYBS.C:541-557` gates the zipper on `gernd()%10==1 && has_zip` then `minesnear` then `gernd()%3==1`, flees on `rndm(359.9)` and keeps evaluating; `:559-565` is a 1-in-20 attack-vector scramble; `:566-580` is hyperspace missile evasion (`speed2b = rndm(5000)+4500`, hold 5-9 ticks).
- **Fix:** port the three branches into `cybAttack`.

### 3.8 Cybertron allowance goes to energy, then is discarded
- **Port:** `cybertron-tick.service.ts:180` adds `CYB_ALLOW` to `ship.energy`, overwritten with `50_000` at `:206`.
- **C:** `GECYBS.C:228-229` — `warusroff(usrn)->cash += CYB_ALLOW;` (35, `GEMAIN.H:170`), clamped to `CYB_MAXCASH` (`GECYBS.C:121-122`).
- **Effect:** veteran Cybertrons carry no accumulated purse; killing an old one pays the same as a fresh spawn.
- **Fix:** credit `User.cash` with a `CYB_MAXCASH` clamp. The port's own constant comment (`constants.ts:316`) already says "gold allowance".

### 3.9 Cybertron hyperwarp fire gate
- **Port:** `cybertron-tick.service.ts:336` — `ddist < tooclose || cybCanAttack || target.cantexit > 0`.
- **C:** `GECYBS.C:270-273` — `ddist < (tooclose+rndm(tooclose)) || cybs_can_att || wptr->cantexit > 0 || ptr->cantexit > 0`.
- **Fix:** add the random widening (the normal-space branch at `:353-354` already has it) and the attacker's own `cantexit` clause.

### 3.10 Droids
- **Cadence** (`droid-tick.service.ts:109-119`): one global `spawnTickCounter % 30` gate runs every droid once per 30 physics ticks; `ShipState.tick` is written at `droid-spawner.ts:100,149` and never read or decremented. **C `GEMAIN.C:2406-2424`** runs the loop every physics tick, calling `droid_lives` only when that droid's own `tick` hits 0; `GEDROIDS.C:216-227` recomputes it as 18-33 idle vs **6-11 when battle-locked**, and `:278, 335, 442` shorten it on detection. An engaged droid reacts ~3.5x too slowly. `specs/008-droid-ai/plan.md:152` documents the fusion but justifies it with a misreading of the C loop — the `ticktock2 >= 30` block (`GEMAIN.C:2320-2396`) is spawn evaluation, not action scheduling. **Fix:** restore the per-droid countdown; keep the 30-tick gate for spawn evaluation only.
- **Murdonian speed drop** (`droid-tick.service.ts:243-245`, placeholder at `droid-act-class-11.ts:71-73`): gated behind the 1-in-4 `rollAnnoy`. **C `GEDROIDS.C:326-336`** drops speed unconditionally on detection, *then* makes the separate chatter roll. **Fix:** implement the empty `if (droid.holdcourse === 0)` block and ungate it.
- **Vakory torpedoes** (`droid-tick.service.ts:314-326`): the volley is nested inside the `fireMode === 'normal'` branch, so a phaser below `PMINFIRE` also suppresses torpedoes. **C `GEDROIDS.C:476-483`** puts the volley outside the phaser guard. Narrow (cloak and scanrange are handled by `lockon` in C too) — **fix:** hoist the loop out of the `fireMode` branch.
- **Neutral-zone blindness** (`droid-tick.service.ts:155-157`, `droid-spawner.ts:162-165`): `grep -n neutral GEDROIDS.C` returns nothing; all three scan loops (`GEDROIDS.C:268-272, 318-322, 426-430`) filter only on `ingegame && status == GESTAT_USER`, and `droid_init` (`:131-140`) places droids anywhere. `specs/022.../findings.md` A-004 documents the NZ exclusion for Cybertrons only. **Fix:** either remove for droids or extend the A-004 record to cover them.

---

## Tier 4 — Energy, repair and tick cadence

### 4.1 Deceleration costs energy, and a dry ship is stuck at warp forever
- **Port:** `physics-math.ts:91` — `energyDebit = newSpeed < WARP_THRESHOLD ? 0 : ACCENGAMT`, with no direction test; `physics-tick.service.ts:177-193` charges it on any speed change and, on refusal, leaves `speed` unchanged while setting `speed2b = 0` (already 0 when stopping).
- **C:** `GEFUNCS.C:492-497` — the only `useenergy` call is inside the `speed < speed2b` accelerate branch. `GEFUNCS.C:534-573` decelerates with `ptr->speed -= decelrate` unconditionally. Slowing down is always free and always possible.
- **Effect:** warp trips cost roughly double; a ship that runs dry at warp coasts forever with no recovery path (there is no passive recharge — see 4.3).
- **Fix:** charge only when `newSpeed > speed`; on refusal, still allow deceleration.

### 4.2 The final snap-to-target step is charged
- **Port:** `physics-math.ts:73-91` — the `gap <= step` snap branch falls through to the same unconditional `energyDebit`.
- **C:** `GEFUNCS.C:484-490` — the snap branch sets `speed = speed2b`, prints SPEEDIS and never calls `useenergy`; the debit at `:497` lives only in the `else`.
- **Fix:** set `energyDebit = 0` in the snap branch.

### 4.3 No passive recharge, no auto-flux
- **Port:** `ship-tick.service.ts:71-180` has neither. `ENGRECHG` (`constants.ts:163`) and `ENGYMIN` (`:165`) are referenced only by a balance spec. Energy rises only via the manual `flux` command (`flux.handler.ts:30`) and the Cybertron top-up (`cybertron-tick.service.ts:180`).
- **C:** `GEFUNCS.C:1290-1300` `recharge()` (+ENGRECHG up to ENGYMAX) and `GEFUNCS.C:1307-1330` `fluxstat()` (auto-consume a pod below ENGYMIN=5000, with FLUXLOAD/LASTFLUX), both called every 6s (`GEMAIN.C:2256, 2266`). `GEFUNCS.C:1009-1012` `checkdam` also decays hull damage by `repairrate` each tick.
- **Effect:** a ship carrying pods can be stranded at zero energy; nothing self-heals.
- **Fix:** add all three to the 6s tick. This plus 4.1 is what makes energy starvation unrecoverable.

### 4.4 The 500-energy `useenergy` reserve is missing
- **Port:** `physics-tick.service.ts:180, 276` both call `tryEnergyDebit(..., 0)`.
- **C:** `GEFUNCS.C:1507` — `if (ptr->energy >= amount+500) /* fudge a bit */`.
- **Fix:** pass 500. This also contradicts the port's own `specs/006a-physics-tick/spec.md:96` / FR-007.

### 4.5 Repair, shields and subsystems run 6x too fast
- **Port:** `ship-tick.service.ts:42` subscribes to `TickKind.SHIP_UPDATE` (1s, `tick.service.ts:53`), and `:100-160` applies the full per-call amounts there: `damage -= 3`, `repair = floor(damage/3)`, `shield += shieldtype*3` at `shieldtype*100` energy, and the ±1 subsystem recovery.
- **C:** `GEMAIN.C:2256-2274` — `repairship`, `shieldstat`, `cloakstat`, `checktm`, `recharge`, `checkdam` all inside `warrtia()`, re-armed with `rtkick(TICKTIME, warrti)`, TICKTIME=6 (`GEMAIN.H:133`). The per-call amounts match exactly (`GEFUNCS.C:394-410`, `2491-2515`); only the cadence differs. `warrti2a` (`GEMAIN.C:2470-2495`) does only rotate/accel/move/destruct.
- **Effect:** hull heals 18/6s instead of 3/6s; shot-out helm/tactical/firecntl/cloak return 6x sooner. Combat attrition is largely erased.
- **Fix:** move the restorative block to the 6s tick (or divide every amount by 6 — but the tick move is faithful and simpler).

### 4.6 Cloak repairs twice per cycle
- **Port:** `ship-tick.service.ts:133` (1s) and `ship-management-tick.service.ts:65-74` (6s) both increment negative `cloak` toward 0 — 7 points per 6 seconds.
- **C:** `GEFUNCS.C:1388-1398` `cloakstat()` is the sole increment, once per 6s (`GEMAIN.C:2259`).
- **Fix:** delete one. Given 4.5, keep the 6s one.

### 4.7 Raised shields are free, and never collapse
- **Port:** `ship-tick.service.ts:148-160` nests the debit inside both `ship.shield < maxCharge` and `ship.energy >= energyCost`. `SHMINPWR` is read nowhere (`constants.ts:167` only).
- **C:** `GEFUNCS.C:2502-2503` **[RE-CHECK 2026-09-03: citation corrected from `:2497-2499`; and the report omits the guard — the debit is wrapped in `if (type < 20)`, so a sysop type-20 shield draws no energy]** debits `type*SHENGUSE` at the *top* of `shieldchg`, before the charge test; `GEFUNCS.C:1340-1352` `shieldstat()` collapses shields (`SHIELDDN`, `shield = 0`, SHDNNOP) when `energy < SHMINPWR`.
- **Fix:** debit unconditionally while shields are up; add the `SHMINPWR` collapse.

### 4.8 Completed repairs don't restore `topspeed` (or subsystems)
- **Port:** `ship-tick.service.ts:111-115` sets only `repair = 0; damage = 0; phasr = 100`.
- **C:** `GEFUNCS.C:406-421` also sets `tactical = 0; helm = 0; firecntl = 0; shieldstat = SHIELDDN; shield = 0; topspeed = shipclass[].max_warp;`
- **Effect:** blow your engines overspeeding (`ship-overspeed.ts:52-58` sets `topspeed = 0`) and `warp` is refused permanently (`warp.handler.ts:57`); paying for `maint` doesn't fix it. The only restore path is the boot-time self-heal at `ship-state.service.ts:88-91`.
- **Fix:** restore all seven fields on repair completion.

### 4.9 Overspeed rolls fire 3x too often, on the wrong ships
- **Port:** `ship-tick.service.ts:73` calls `decideOverspeed` for every ship in `findAllShips()` (AI included, status 2) once per second; `ship-overspeed.ts:42` tests only `intspeed > topspeed && speed <= speed2b`.
- **C:** `GEFUNCS.C:733-771` — the whole block is nested in `if (ptr->speed > 1000.0 && ptr->status == GESTAT_USER)` inside `moveship`, driven from `warrti2a` where each ship is visited every 3rd 1s firing (`zothusn += 3; clicker = (clicker+1)%3`, `GEMAIN.C:2478-2488`).
- **Fix:** gate on `status === GESTAT_USER` and roll once per ship-move (every 3s).

### 4.10 Overspeed `diff` truncation
- **Port:** `ship-overspeed.ts:43-47` — float division, subtract, then `Math.floor`. intspeed=9/topspeed=6 → 26.
- **C:** `GEFUNCS.C:742-747` — all `int`, so `(3*100)/9 = 33` then `60-33 = 27`.
- **Fix:** `Math.floor` the division before the subtraction.

### 4.11 Planet gravity and wormholes are inert
- **Port:** no implementation — `grep -rn -i gravity backend/src` returns nothing; `physics-tick.service.ts:219-271` ends at the sector-transition emit.
- **C:** `GEFUNCS.C:794-795` calls `gravity(ptr,usrn)` every move; body at `GEFUNCS.C:836-905` — `dist < 250`/`< 50` warn, `< 25` sets `damage = 101.0` on a planet or teleports to `worm.destination` with +5.5 damage and `cleartm`.
- **Status:** tracked as deferred (`specs/019-physics-polish/spec.md:311`, `plan.md:14`, `docs/PROGRESS.md:1869/1936`) but 020 never picked it up. Two whole mechanics are absent.

### 4.12 Hyperspace entry/exit does nothing
- **Port:** `physics-tick.service.ts:202-217` emits `PHYSICS_HYPERSPACE`; `grep` finds only the constant (`physics-events.ts:11`), the emit and a test — **no listener**. `where` is never set to 1 for a player, so the `where === 1` gates in report/cloak/combat and the `impulse.handler.ts:52` TODO are all dead code.
- **C:** `GEFUNCS.C:580-628` — on entry `shieldstat = SHIELDDN`, `cloak = 0`, `where = 1`, all `ltorps[i].distance = 0`, all `decout[i] = 0`; on exit `where = 0`.
- **Effect:** you can run at warp with shields up and cloaked, and torpedo locks survive the jump. Hyperspace's whole risk/reward is gone.
- **Fix:** apply the state change inline in the physics tick (an event with no consumer is the bug here).

### 4.13 `hostile` never clears; neutral-zone self-destruct never cancels
- **Port:** `hostile` is written only by `planet-attack.service.ts:140, 242`; neither `physics-tick.service.ts:260-270` nor `sector-transition.subscriber.ts:60-62` touches it. The destruct countdown (`ship-management-tick.service.ts:105-146`) has no neutral-sector cancellation.
- **C:** `GEFUNCS.C:724` clears `hostile` on sector change and `GEFUNCS.C:797-798, 907-930` (`checkdist`) clears it beyond 1000 units; the same block cancels an armed self-destruct on entering a neutral sector (`GEFUNCS.C:725-730`).
- **Note:** `hostile` currently has no consumer in the port, so only the self-destruct half is player-visible today. Worth fixing before something starts reading `hostile`.

---

## Tier 5 — Planet economy

### 5.1 `if (rate === 0) continue` skips two things C does unconditionally
`planet-economy.ts:84` guards the loop body; **C `GEPLANET.C:265-332`** iterates all 14 slots with no rate test. Two consequences:
- **Cash decay** (`planet-economy.ts:92-96` vs `GEPLANET.C:286`): the port applies `cash *= tfact` once per *producing* slot. A fresh colony has two non-zero rates (`planet-state.service.ts:173-177`), so cash decays `tfact²` instead of `tfact¹⁴` — 0.90/tick instead of 0.49/tick at best environment, and the `if (cash > 0) fact *= 1.5` production bonus lingers for many extra ticks. The `if (updatedMen === 0) break` at `:81` stops decay entirely.
- **Storage cap** (`planet-economy.ts:99-101` vs `GEPLANET.C:294-296, 328-332`): rate-0 slots are never truncated to `MAXPL[i] * fact`. Ferry unlimited mines/ion cannons/flux pods onto a planet with rate 0 and nothing culls them. `MAXPL` is used nowhere else in `backend/src`.
- **Fix:** run the loop body for all slots; keep only the production computation gated on `rate`. The spec's own pseudocode (`specs/005-planet-system/data-model.md:207-218`) has it unconditional.

### 5.2 Zero-population planets still run the economy tick
- **Port:** `planet-tick.service.ts:57` filters `p.userid !== null`; `planet-state.service.ts:462` comments the guard as matching `GEMAIN.C:2130` but checks ownership only. Troop starvation (`planet-economy.ts:50-54`), gold conversion (`:72-74`) and tax (`:105`) all run first.
- **C:** `GEMAIN.C:2130` — `if (plptr->items[0].qty > 0 && plptr->userid[0] != 0)` skips the planet entirely.
- **Effect:** a depopulated but garrisoned world bleeds 1/8 of its troops per tick; in C it stays frozen and defended.
- **Fix:** add the `men > 0` condition.

### 5.3 Revolt reuses one RNG draw
- **Port:** `planet-economy.service.ts:78` draws `randVal` once, gates on `randVal % 10 !== 0` (`:79`), derives `divisor = (randVal % 8) + 2` from it (`:82`). Survivors are `{0,10,…,90}`, whose `%8` residues are only `{0,2,4,6}` — divisor ∈ {2,4,6,8}, weighted 3/10, 3/10, 2/10, 2/10.
- **C:** `GEPLANET.C:359` and `:363` **[RE-CHECK 2026-09-03: citation corrected from `:359-361`]** — two independent `gernd()` calls; divisor uniform over 2..9.
- **Fix:** draw a second random for the divisor.

### 5.4 Population re-read and integer truncation
- `planet-economy.ts:87, 105` use the pre-growth `updatedMen` captured at `:46/64` for every item and for the tax. **C `GEPLANET.C:271`** re-reads `men` inside the loop, and I_MEN is slot 0 written back at `:332`, so slots 1-13 and the tax at `:335-338` see the grown population. **Fix:** update `updatedMen` after slot 0.
- `planet-economy.ts:50, 61` compare real quotients (`troops / 100 > food`) and compute `Math.floor(qty - qty/8)`. **C `GEPLANET.C:206-209, 234-236`** **[RE-CHECK 2026-09-03: second range corrected from `:232-234`]** uses unsigned integer division on both — 100 troops leaves 88, not 87, and 150 troops with 1 food does *not* starve. Line 57 floors correctly, which shows the intent. **Fix:** `Math.floor` both divisions.

---

## Tier 6 — Trade rules

- **`team` password rejects your own team.** `buy.handler.ts:50-57` tests only `if (pwd === 'team') { if (state.teamcode !== 0n) return BUYPAS3 }` — the buyer's teamcode is never loaded. **C `GECMDS.C:4232-4246`** denies only when `plptr->teamcode != waruptr->teamcode`, printing BUYPAS4 and falling through on a match. Also, `teamcode === 0` falls out of the branch with no password check at all. **Fix:** load the buyer's teamcode and compare; emit BUYPAS4 (defined at `messages.ts:501`, never used) on match.
- **Owners locked out of their own warehouse.** `planet-trade.ts:48-56` returns SELL_FLAG_OFF before consulting `buyerIsOwner`, and computes `available = qty - reserve` for everyone. **C `GECMDS.C:4411-4415`** permits on `sameas(userid) || sell == 'Y'`, and `amt4sale` returns the full qty for the owner. `price.handler.ts:96-115` models it correctly, so quote and purchase disagree. **Fix:** short-circuit both checks on `buyerIsOwner`.
- **Abandoned planets remain open shops.** `buy.handler.ts:39-63` has no ownerless check; BUY7 (`messages.ts:750`) is never emitted. **C `GECMDS.C:4322`** — `if (plptr->userid[0] != 0)` else BUY7. (Zygor is unaffected — `neutral-zone.ts:37` gives origin planets a non-null `**neutral**` owner.) **Fix:** emit BUY7 when `userid === null`.

---

## Tier 7 — Scoring formulas

- **`PLTVCASH` inflates planet cash ~201x.** `midnight.constants.ts:35` hard-codes `201_228_378`, so `value-pl.ts:28-29` turns C's divisor into a multiplier. That number is `lngopt`'s **max bound** at `GEMAIN.C:593`, used identically as the ceiling for phaserprice, maxpl, weight, value, manhours and shieldprice (`GEMAIN.C:557-589`) — with that value C's expression `(cash+tax)/(1000000L/pltvcash)` divides by zero, proving it is not what C runs. Since `score = plscore + klscore`, banked planet cash dominates the leaderboard and combat contributes nothing measurable. **Fix:** set it to canon **10** (**[RE-CHECK 2026-09-03: RESOLVED — `GE/REL/MBMGEMSG.MSG:1831` `PLTVCASH {The point value of each 1,000,000 : 10}`. `midnight.constants.ts` currently defaults to 1000, still a 100x deviation.]**) and keep it configurable.
- **`PLTVDIV` zeroes all stockpiles.** Same ceiling value at `midnight.constants.ts:38`; `value-pl.ts:31-34` computes `qty / 201_228_378`, which truncates to 0 for all 13 non-Men items against `MAXPL` (≤1e8) and to 4 for a fully-maxed Men stock. **C `GEMAIN.C:1357, 596`.** Inventory is invisible to score, so the only rational play is converting everything to cash. (The `BASEPRICE`-vs-`value[]` substitution is deliberate — `specs/009.../research.md:224-238` D12 — leave it.) **Fix:** canon is **10000** (**[RE-CHECK 2026-09-03: RESOLVED — `GE/REL/MBMGEMSG.MSG:1823`. `midnight.constants.ts` already defaults to 10000, so this one needs no change.]**).
- **`score_f2` scales the wrong side.** `player-score.repository.ts:39-42, 64-74` computes one `transfer = floor((scr/100)*scoreF2)` (and `/10` for AI attackers) and uses it for both the victim decrement and the attacker award. **C `GEFUNCS.C:1145-1185`** — `amt = scr + bonus; ded_amt = (amt/100)*score_f2;` only `ded_amt` is scaled and only `ded_amt` is `/10`'d for AI killers; the attacker gets unscaled `amt`. Latent at the shipped default 100. `specs/019.../spec.md:325-331` claims the award path is already correct. **[RE-CHECK 2026-09-03: The clause **"Latent at the shipped default 100" is WRONG** — canon `SCRFACT` is **35** (`GE/REL/MBMGEMSG.MSG:472`), so this is a live scoring bug, not a dormant one.]** **Fix:** compute the two separately.
- **`TEAMBONU` skipped for zero-score members.** `midnight.repository.ts:277-284` adds `score: { gt: 0n }` to the where clause; **C `GEMAIN.C:1249-1286`** adds `teambonus` for every member regardless of score, and `teamcount` (the divisor) includes them. **[RE-CHECK 2026-09-03: **"Latent at the default 0" is WRONG** — canon `TEAMBONU` is **5** (`GE/REL/MBMGEMSG.MSG:529`), i.e. 500 after `GEMAIN.C:478`'s `*100L`. Live bug.]** **Fix:** drop the predicate.

---

## Tier 8 — Player-visible output

- **`sca sh` no longer announces you.** `scan.handler.ts:599-687` returns `{ lines }` with no `broadcasts`; SCAN1/2/3 appear nowhere in `backend/src`. **C `GECMDS.C:2261-2280`** *always* sends the scanned ship SCAN2 (bearing), SCAN3 (bearing) or SCAN1 (letter + scanner's ship name) via `outprfge(FILTER, shpnum)`. Reconnaissance is now completely free and silent — this is the highest-impact item in this tier and arguably belongs in Tier 3. **Fix:** add the three-way broadcast.
- **`damstr()` bands are invented.** `combat-math.ts:431-437`: `<10 Undamaged / <25 Light / <50 Moderate / <75 Heavy / <90 Critical / else Destroyed`. **C `GECMDS.C:2110-2131`**: `<2 no / <12 very light / <25 light / <50 moderate / <75 heavy / else severe`. A live ship at 95% reads "Destroyed". **Fix:** restore the six C bands.
- **`rep sys` leaks a number.** `report.handler.ts:218` prints `${Math.round(ship.damage)}% hull damage` into REP14; **C `GECMDS.C:2037-2040`** passes the `damstr` word. **Fix:** call `damstr`.
- **`rep sys` omits subsystem lines.** `report.handler.ts:180-222` never mentions helm, tactical, cloak damage or repair countdown; **C `GECMDS.C:2041-2050`** prints REP15/16/17/18/18A. The port tracks all of these (`ship-state.types.ts:57, 66, 67, 89`) and acts on them but never tells the player. **Fix:** add the five lines.
- **`filter` option is decorative.** `set.handler.ts:110-127` writes `msgFilter`; nothing reads it. **C `GEMAIN.C:2547-2576`** `outprfge` drops FILTER-class messages for opted-in users (~65 send sites). Partly excused by `DECISIONS.md` D4.
- **Cloak makes you deaf to hails.** `game.gateway.ts:1206-1215` — `accept = (ship) => !ship.cloak`. **C `GECMDS.C:1845` / `GEMAIN.C:1518-1540`** — `outwar` delivers to every `ingegame` ship; cloak is never examined. `specs/012-social-commands` records this as *matching* `outwar`, which misreads it.
- **`ros`** (`ros.handler.ts:44-52, 81`) lists zero-score rows and prints raw population; **C `GECMDS.C:4037-4043`** requires `score > 0` and formats `" %8.3fm"` with `population/100.0`.
- **`sca` defaults** (`scan.handler.ts:167, 412-419`): bare `sca` runs a full local scan and `sca ra` defaults to level 1; **C `GECMDS.C:2154-2183, 2495-2501`** prints SCANFMT in both cases. The `argMissingMessage` at `:151` is unreachable because `minArgs` is 0.
- **Scan sub-commands are exact-match** (`scan.handler.ts:178-201`); **C `GECMDS.C:2157-2172`** uses `genearas` prefix matching, so `sca ship`, `sca planets`, `sca range 5` all work. The port implements prefix matching for item keywords (`validators.ts:19-24`) — inconsistent, not policy.
- **Blank input is swallowed** (`command-router.service.ts:69-72`, with a comment claiming it mirrors C); **C `GECMDS.C:282-284, 349-352`** prints FORHELP.
- **`'fla'` typo** (`validators.ts:11`); **C `GECMDS.C:77-90`** has `kwrd[4] = "flu"`. `'flu'` still resolves via the name fallback, so the only effects are that `fla` is wrongly accepted for buy/sell/price/transfer (but rejected by `jet`) and the price list prints the wrong hint.

---

## Patterns

The individual bugs cluster into eight recurring mistake classes. Each is worth a targeted sweep.

**P1 — Identity read off the wrong entity (the known class, and it is broader than `usrnum`).** The `shipno`-vs-`channel` writes (2.3) are the reported instance. But the same shape appears in **3.4**: `notClaimed` reads `noClaim` from the *attacking* Cybertron's class row where C reads it from the *victim's*, and the seed swapped the two class columns so each holds the other's C semantics. That is the same error one level up — the port asked "who is looking?" where C asks "who is being looked at?". Generalise the rule from *numeric identity fields* to *any lookup keyed on a participant*: for every combat/AI decision, verify which of attacker/victim/carrier the C source indexes. **Sweep:** grep every `shipClassCache.get(...)` in `game/cybertron/` and `game/droid/` and confirm the argument against the C line.

**P2 — Coordinate unit scale (sector vs raw ×10 000).** `cdistance()` returns sectors; class `scanrange` is raw units. The jammer (1.2) and zipper (1.3) compare them directly. Every other call site scales correctly (`phaser.handler.ts:198`, `droid-act-class-11.ts:93`, `droid-act-class-12.ts:84`), and `inScanRange()` (`combat-math.ts:36-47`) exists specifically to prevent this and is unused in both broken sites. **Sweep:** grep every `cdistance(` call and confirm either a `* 10000` or an `inScanRange` wrapper.

**P3 — `lngopt` ceilings mistaken for defaults.** `201228378` is the max bound argument in `lngopt(X, 0L, 201228378L)` and appears as the ceiling for at least seven sysop options (`GEMAIN.C:557-596`). Two of them were pinned into `midnight.constants.ts` as if they were values (7.1, 7.2), producing a ×201 multiplier and a divide-to-zero. **Sweep:** grep `201228378` across `backend/src` and `specs/`; every hit is wrong. More generally, any constant sourced from a `lngopt`/`numopt` call needs the *middle* argument or a chosen sysop value, not the third.

**P4 — Mechanics attached to the wrong tick.** Five findings. C has three cadences: `warrtia` at 6s (repair, shields, cloak, recharge, flux, checkdam), `warrti2a` at 1s but every third ship (rotate/accel/move/destruct/overspeed), and `autortia` at 1s (AI countdowns). The port put restorative mechanics on 1s (6x too fast, 4.5), Cybertron countdowns on 6s (6x too slow, 3.1), overspeed on every-1s-every-ship (3x too often, 4.9), droids on a 30-tick global gate (3.5x too slow, 3.10), and cloak repair on *both* ticks (4.6). **Sweep:** enumerate each C routine's home tick and audit every `@Interval`/`TickKind` subscription against that table.

**P5 — Command handlers implement the ammo check and drop every other gate.** `decoy` (no `has_decoy`, no `where == 1`, no `cloak`, no MAXDECOY cap), `jam` (no `has_jam`, no `cloak`, no `cantexit`), `zip` (no `has_zip`, no `cloak`, no `cantexit`), `shi up` (no class/type/hyperspace/energy/SHIELDDM gate). The class-capability columns exist (`schema.prisma:430-434`) and are cached (`ship-class-cache.service.ts:25-27`) but are read only by the AI path and `report`. `mine.handler.ts:105` sets `cantexit` correctly, proving the pattern is known. **Sweep:** for each `cmd_*` in GECMDS.C, list its early-return guards and diff against the handler.

**P6 — Emitted-but-unconsumed events and defined-but-unread constants.** `PHYSICS_HYPERSPACE` has no listener (4.12); `msgFilter` is written five places and read by nothing; `hostile` has no consumer; `ENGRECHG`, `ENGYMIN`, `SHMINPWR`, `MAXDECOY`, `FORHELP`, `BUYPAS4`, `SCAN1/2/3`, `REP15-18A` are declared and never used; `Mail` is a table with no writer (1.7). **This is the cheapest audit in the report:** a dead-code / unused-export scan over `constants.ts`, `messages.ts` and the event constants would have surfaced roughly ten of these findings mechanically. Run it in CI.

**P7 — Integer truncation dropped.** C's `unsigned`/`int`/`long` arithmetic truncates at each step; TypeScript numbers do not. `pdamage` (2.6), overspeed `diff` (4.10), starvation `/100` and `/8` (5.4), planet `qty/pltvdiv` (7.2, where truncation is *present* but the divisor is wrong). The fix is always the same: floor at every point C's type would have. **Sweep:** for each ported formula, check the C declaration of every intermediate.

**P8 — Over-generalised shared helpers.** `resolveProjectileHit` serves torpedoes and missiles and hard-codes the torpedo shield drain and damage cap, losing both missile-specific formulas (1.1, and the `energy/999` drain). `shieldhit` collapses two distinct C outcomes into one boolean (2.1). `damstr` was rewritten rather than transcribed (Tier 8). When C has two call sites with different bodies, the port should have two functions.

**P9 — Guards added inside loops that C runs unconditionally.** `if (rate === 0) continue` and `if (men === 0) break` in `planet-economy.ts:81, 84` silently disable cash decay *and* the storage cap (5.1). `raiseShields: currentWhere === 1` inverts C's condition (3.2). `tough !== CYB_TOUGH_1` inverts `isquad` (3.3). `score: { gt: 0n }` has no C counterpart (7.4). Three of these are inversions, which suggests transcription under time pressure rather than misreading.

**P10 — Single RNG draw reused for two decisions.** Only one confirmed instance (5.3, revolt), but worth grepping: any place a `gernd()` appears twice in C should be two `random.next()` calls in the port.

---

## What I would fix first

**1. The three free-win exploits, in one sitting.** Missile damage normalisation (1.1), and the two `* 10000` scale fixes for jammer and zipper (1.2, 1.3). Each is a one-to-three-line change with an obvious C reference, and each currently lets a single command end the game for everyone else. There is no reason for these to survive another day of play.

**2. `buy` affordability (1.4) plus the neutral-zone availability gate (1.5).** Also small and localised, and together they make the entire economy — which everything else in the port feeds — meaningless. `pri` already contains the check, so the correct behaviour is sitting in the adjacent file.

**3. The midnight teamcode PK collision (1.6).** Not a balance issue; an outage. Once two teams empty out, scoring stops forever with only a log line to show for it, and the self-heal cannot recover. It is a schema change plus five lines, and it gates whether any of the Tier 7 scoring fixes are observable at all. Fix it before touching `PLTVCASH`/`PLTVDIV`.

**4. The shield cluster (2.1).** The largest single behavioural correction available: four findings, one `shieldhit` return type, one handler gate list. It restores the phaser exchange to something recognisable and unblocks `shieldrep`, which is currently dead code.

**5. Then P6 as a standing CI check** — an unused-symbol scan over `constants.ts`, `messages.ts` and the event constants. It costs an afternoon, would have caught roughly a sixth of this report mechanically, and will catch the next one.

After that, the Tier 3 Cybertron work (3.1–3.4) is the highest-value block, because the port's PvE is currently a different game from the original in four independent ways at once.