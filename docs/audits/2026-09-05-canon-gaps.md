# Canon not implemented — audit note, 2026-09-05

An 18-way survey of the original C source against `backend/src`, each claimed
gap then put to an adversarial verifier whose only instruction was to refute it
by finding the implementation. **72 of 74 verified gaps survived.**

This is a **finding list, not a work order.** Nothing here has been changed. Each
item needs a decision: implement it, or record it in `DECISIONS.md` as a
deliberate deviation. CLAUDE.md permits the second, but not silence.

---

## CLOSED — 2026-09-06

Every actionable item in this file is now either implemented or recorded below
as a deliberate non-implementation. Commits `e7bc7b2`, `f4949a6`, `870a5e8`,
`d0e598e`, `4869689`, `f3cd81b`, `8c00b11`, `667b9a2`, `63d6e5b`, plus the
earlier round in `ac4e034` and before.

**Three entries in this file were WRONG and are withdrawn**, all for the same
reason — they were verified by grepping the canon token (`ORBIT4`, `TRANSOPT`,
`MSG_FILTER`) when the port aliases canon strings behind its own `MessageId`
names. The correct check is to map the token through `messages.ts` and grep the
`MessageId` instead:

- **`orb` from hyperspace is allowed / ORBIT4 never emitted** — implemented all
  along at `orbit.handler.ts:47` as `MessageId.ORBIT_HYPERSPACE`.
- **TRANSOPT ships YES, the port always refuses `tra down`** — implemented;
  `depositToPlanet` has carried the "NO ownership test" rule and its citation
  the whole time.
- **Open hails ignore MSG_FILTER** — implemented at `game.gateway.ts:1365-1375`.

**Deliberately NOT implemented**, each with its reasoning recorded at the code:

- **DEADSTOP** (`speed-events.ts`) — dead code in canon. Its branch needs a
  negative `speed2b`; canon assigns a negative speed nowhere, and GEFUNCS.C:566
  is the only `prfmsg(DEADSTOP)` in the source. The standstill a pilot sees is
  the snap to zero, already reported by SPEED0.
- **ATTACK6A** (`planet-attack.service.ts`) — it addresses an owner logged into
  the BBS but outside Galactic Empire. This port has no lobby outside the game;
  connecting to the gateway *is* entering it. Its ATTACK7 half is covered by the
  first arm of the chain.

The one item left open by choice is the `ITEM_NAMES` spelling divergence
("Torpedoes"/"Gold" against canon's "torpedos"/"gold"), which is a change of its
own and is recorded in `PROGRESS.md`.

---

All 44 canon command verbs in `GECMDS.C:126-171` already have a handler, so
nothing below is a missing command — every gap sits *inside* a command or a tick.

Impact: **high** = a mechanic is missing or materially wrong; **medium** = a
reachable branch or message never occurs; **low** = an edge case.


## The theme

The port implements the *mechanic* and omits the *telemetry*. Canon is a text
game: its messages are not decoration, they are the feedback loop the player acts
on. The clearest case is the projectile chain — a target is never told it is
locked (LOCK2/LOCK4), never told a torpedo was fired at it (TFIRE2/MFIRE2), never
sees the per-tick inbound alert (TORP1/MISSL1), and is never held in place by the
lock's `cantexit`. Those four together leave `decoy` with no trigger a player
could ever react to. The same shape recurs in phaser recharge, subsystem repair,
shield collapse, cloak ramp and maintenance completion: the state changes
correctly and silently, and the only way to observe it is to poll `rep`.


## Verified by hand, not only by agents

Five findings were re-checked directly against the C source because they
would drive real code changes:

- **Movement runs at half canon's rate.** Canon's `warrti2a` (`GEMAIN.C:2462-2491`)
  runs `rotateship`/`accel`/`moveship`/`destruct` every `TICKTIME2` = 1s, walking
  the fleet with `zothusn += 3` and `clicker = (clicker+1)%3` — so each ship moves
  once per **3 seconds**. Our `PhysicsTickService.advanceAll` runs on the 6s tick,
  and `positionIntegration` (`physics-math.ts:121-133`) is canon's formula exactly,
  with no `dt` term to compensate. Same displacement per call, half the calls.
  `CLAUDE.md` encodes this ("Physics tick: 6 seconds — moves ships"); no
  `DECISIONS.md` entry records it. NOTE: the sibling claim that shields/repair are
  also mis-assigned is FALSE — `ShipTickService.processRestorativeTick` correctly
  sits on the 6s tick, matching canon's `warrti`, and its comment records that the
  6x-too-fast version was already found and fixed.
- **`sys` has no authorization check at all** (`sys.handler.ts`). Canon gates the
  whole command behind SYSONLY (`GECMDS.C:4752-4760`). `sys unjam` sets
  `s.jammer = 0` on the caller, so any player cancels being jammed for free.
- **Rotation is free.** `ROTENGUSE = 30` is exported from `constants.ts:63` and
  `rotate.handler.ts` carries three `TODO(006)` comments exactly where canon's
  `useenergy` gates go (`GECMDS.C:664`, `:691`, `:711`).
- **Cybertrons never aim.** Canon assigns `ptr->degrees = cbearing(...)` before
  every shot (`GECYBS.C:277`). In `cybertron-tick.service.ts`, `degrees` appears
  once — at line 526, being *read*. It is never assigned.
- **The troop-raid loop is inverted in both directions.** Canon's
  `for(ii=1;ii<NUMITEMS;++ii)` (`GECMDS.C:3714`) never destroys Men (index 0) but
  does destroy Troops (index 8). Ours starts at 0 and skips `I_TROOPS` — the exact
  mirror image. We kill the colonists canon protects and spare the garrison canon
  destroys.


## A correction worth keeping

Mid-audit I found 15 canon constants defined in `constants.ts` and pinned by
balance tests but used by no production code, and started to call it systemic.
Checking canon's own usage showed **12 of them are used zero times in the original
`.C` files** (`PMINENG`, `CYB_MINCLASS`, `ROTAMT`, `SHHITENG`, `SCANADJ`,
`HYSCANRANGE`, `NUM_MINES`, `SHMAXCHG`, `QUADMAXPERTICK`, `CYB_TOUGH_0` among
them) — vestigial defines in `GEMAIN.H`. Not wiring them up is faithful.
`TOPPHASOR`/`TOPSHIELD` are redundant with the class-max bound the port already
enforces. Only `DESTRUCTRANGE` is a real gap.


## cybertrons (4)


### [high] A Cybertron never aims its phaser: `ptr->degrees` is never set, so the beam goes down the hull's facing

- **Canon** (`reference/ge-source/GECYBS.C:276-277 and 280-281 — `ptr->degrees = (int)(cbearing(&ptr->coord,&wptr->coord,ptr->heading)+.5);` immediately before `firehp` / `cyb_attack``): Before firing, the Cybertron sets `degrees` to the bearing of the target RELATIVE to its own heading, so `firep`'s firing bearing `normal(heading + degrees)` (GECMDS.C:941) points at the victim regardless of which way the hull is pointed.
- **Port**: cybertron-tick.service.ts:526 passes `degree: (ship.heading + ship.degrees) % 360` to `selectPhaserVictims`, but `ship.degrees` is never assigned for an AI hull — grepping backend/src for `.degrees =` finds only rotate.handler.ts:53 (player `rot`) and droid-spawner.ts:170 (`degrees: 0`); the Cybertron path only sets `head2b` (lines 434-441, 869-876), which the physics tick then turns toward at ROTAMT per tick. The DB default is 0 (prisma/schema.prisma).
- **Player sees**: Cybertron phaser fire only connects when the hull happens to be pointed within the arc — during a turning fight, or against a target that keeps changing relative bearing, its shots go past you into empty space. Canon's Cybertron hits whatever it has locked, whichever way it is flying.

### [medium] Cybertrons in hyperwarp fire the normal phaser instead of the hyper-phaser (firehp)

- **Canon** (`reference/ge-source/GECYBS.C:263-279 (`if (ptr->where == 1 && wptr->where == 1 ... firehp(ptr,usrn);`), implemented at GECMDS.C:1020-1094`): When both the Cybertron and its prey are in hyperspace, canon calls `firehp` — a different weapon from `firep`: it needs `energy >= HPMINFIR`, spends HPFIRAMT (5000) flux energy, sets `hypha = 1`, sweeps a fixed HPBEAMW (5 degree) beam, uses the hyper branch of `pdamage` (hpdammax/hpfirdst), scales by `phasrtype` alone, and adds the result straight to `wptr->damage` — shields are never consulted. Messages HPFIRED / HPHITM / HPHITU.
- **Port**: backend/src/game/cybertron/cybertron-tick.service.ts:444-461 takes this branch but calls `cybFirePhaser`, which emits `hyper: false` and resolves through `selectPhaserVictims` (backend/src/game/combat/firep.ts:64-93). That function applies canon's *normal*-phaser gate `victimAtWarp && firer.phasrtype < PHATOWRP` — PHATOWRP is 5 (MBMGEMSG.MSG:433) while classes 21/22/24 ship phaser types 2/3/1 (MBMGESHP.MSG:4624, 4854, 5314) — so every candidate is counted `unreachableAtWarp` and discarded. I grepped backend/src for `firehp`, `hypha`, `HPFIRED`, `HPHITM`, `hyperPhaserDamage`: the hyper-phaser exists and is used by the player handler (commands/handlers/phaser.handler.ts) and by droids (droid/droid-tick.service.ts:535-590), but nothing in game/cybertron/ references it.
- **Player sees**: A Cybertron Scout, Cyberquad or Sartern Attack Drone chasing you through hyperspace never lands a shot — no HPFIRED, no damage, no shield drain — where canon would be putting hull damage on you every reload that your shields cannot absorb. Warp flight is a free escape from three of the five Cybertron classes.

### [medium] `ptr->percent = 2` is never applied — Cybertron phaser arc is half canon's and its damage ~1.5x canon's

- **Canon** (`reference/ge-source/GECYBS.C:281-282 — `ptr->degrees = ...; ptr->percent = 2;` in the normal-space engagement branch`): Every engagement pass sets the Cybertron's phaser focus to 2. `firep` then tests `smallest(heading,deg) < ptr->percent + PHABIAS` (GECMDS.C:954, PHABIAS 2 → a 4 degree arc) and `pdamage` scales the shot by `fd = 1 - foc/11`, squared (GEFUNCS.C:2085-2086) → a 0.669 factor.
- **Port**: cybertron-tick.service.ts:527 passes `focus: ship.percent`, and nothing in game/cybertron/ ever writes `percent` — `cybertron.repository.ts` createSpawn omits it, so it stays at Prisma's `@default(0)` (schema.prisma:119-120). Result: arc = 0 + PHABIAS = 2 degrees, and `fd² = 1.0`.
- **Player sees**: A Cybertron that does connect hits about 50% harder than the original (fd² 1.0 vs 0.669), but its cone is half as wide, so hits are rarer and each one is disproportionately punishing — the opposite of canon's wide, grinding fire.

### [low] CYBNEW is never broadcast — no galaxy-wide warning when a new Cybertron is created

- **Canon** (`reference/ge-source/GECYBS.C:186-187 — `prfmsg(CYBNEW,gernd()%359); outwar(FILTER,usrn,0);` in the new-ship branch of `cyb_init`; text at MBMGEMSG.MSG:4286`): Every time a brand-new Cybertron hull is created, every player in the game is told "Sir! The scanners indicate a huge energy burst bearing %d." with a random bearing 0-358.
- **Port**: `spawnOne` (cybertron-tick.service.ts:1017-1085) emits only the internal `CYBERTRON_EVENT.SPAWNED` payload, and game.gateway.ts has no `@OnEvent` for it — grep for `CYBERTRON_EVENT.SPAWNED` in backend/src/gateway returns nothing (only DroidEvents.SPAWNED at game.gateway.ts:1805 is wired). `CYBNEW` appears in backend/src only as a string in canon-messages.generated.ts:763 and in a balance test; it is never referenced by any handler or gateway code.
- **Player sees**: New Cybertrons appear silently. Canon gave every logged-in pilot a scanner warning with a bearing each time one was born — the game's ambient sense that something dangerous just entered the galaxy is missing.

## droids (4)


### [high] Droid normal-space phasers are guided and un-focused — canon fires a fixed 4° beam straight ahead at focus 2

- **Canon** (`reference/ge-source/GEDROIDS.C:361-362 (class 11) and :468-469 (class 12); GECMDS.C:942, 953-955 firep; GEFUNCS.C:2083 pdamage`): Before calling firep, both fighting droid classes set `ptr->degrees = 0; ptr->percent = 2;`. firep then fires along `deg = normal(ptr->heading + ptr->degrees)` — i.e. straight out the droid's nose, NOT at the attacker — and a ship is only struck when `smallest(vector(firer,victim), deg) < ptr->percent + PHABIAS`, a 4° half-arc (PHABIAS 2, GEMAIN.H:84). Damage is computed with the same focus: `pdamage(ptr, dist, ptr->percent)` with `fd = 1 - foc/11`, so foc 2 scales damage by fd² = 0.669. The beam also sweeps every ship in that arc, not just the attacker.
- **Port**: backend/src/game/droid/droid-tick.service.ts:432-436 computes the exact relative bearing to the attacker and passes it as the firing degree, then gates with `lineOfFire(droid, target, bearing, 0)` at :470 — the arc test compares the bearing to itself (combat-math.ts:61-77 withinArc), so it can never fail. Damage at :475 passes `focus: 0`. I grepped the whole droid module and combat-math for `percent`, `degrees`, `PHABIAS` and `focus`: nothing sets a droid's firing degree to 0 or its focus to 2, and docs/DECISIONS.md has no entry for AI phaser aiming.
- **Player sees**: A Murdonian or Vakory that fights back hits you every single shot regardless of which way its hull is pointing, and each hit lands about 1.5x harder than canon (fd² 1.0 instead of 0.669). In canon you can break contact simply by getting off the droid's nose, and passing third parties can be caught in the beam.

### [high] Vakory torpedoes bypass lockon entirely — no lock-quality gate and no warning to the target

- **Canon** (`reference/ge-source/GEDROIDS.C:476-483 (torp(ptr,usrn,zothusn), lockwarn); GECMDS.C:1195-1215 torp; GECMDS.C:1341-1400 lockon`): The droid's torpedo goes through the same `torp()` a player uses, which fires only `if (lockon(ptr,0,shpnum,usrn) == 1)`. lockon requires the target not cloaked and inside the firer's scanrange, then computes `fact = (1.2 - (speed_sum/5000)) * ((5.0 - dist)/tor_fact)` — 0 outright when the target's speed > 999 — and refuses unless `fact > .7`. On a successful lock it prints LOCK2 ("WARNING! WARNING! Ship %c has a fire control scanner locked on us!") to the target and sets `wptr->cantexit = FIRETICKS` on both ships; torp then prints TFIRE2 ("WARNING! WARNING! Incoming torpedo from ship %c.") to the target and seeds the slot with `cdistance*10000 + 20`.
- **Port**: backend/src/game/droid/droid-tick.service.ts:617-627 launchTorpedo just finds a free `ltorps` slot on the victim and writes channel + raw ddist. No lock roll, no scan-range or warp check, no `+20`, no cantexit on the victim, and no message. The port does implement the lock math for players (`lockFact` in backend/src/game/commands/handlers/torpedo.handler.ts:145-150) — the droid path skips it. Grepping backend/src for TFIRE2/LOCK2 finds them only in canon-messages.generated.ts:380,390; nothing emits them, and combat-tick.service.ts:564-606 narrates a torpedo only when it hits.
- **Player sees**: A Vakory that you have engaged lands torpedoes on you at warp and at ranges where canon could never hold a lock, and the first indication you get is the detonation — no fire-control lock warning, no incoming-torpedo warning.

### [low] No DROIDNEW announcement when a droid enters the galaxy

- **Canon** (`reference/ge-source/GEDROIDS.C:173-174 — `prfmsg(DROIDNEW,gernd()%359); outwar(FILTER,usrn,0);`; GEMAIN.C:1517-1540 outwar`): droid_init ends by printing DROIDNEW ("Sir! We have detected some low frequency energy fluxation bearing %d.") with a random bearing 0-358 and pushing it through outwar, which sends it to EVERY ship in the game (all channels except the new droid). Canon does the same for Cybertrons with CYBNEW (GECYBS.C:185-186).
- **Port**: DroidTickService emits only a structured DroidEvents.SPAWNED payload (backend/src/game/droid/droid-tick.service.ts:155-163), and game.gateway.ts:1805-1809 relays it to the spawn sector's room as roster data — no text line, no galaxy-wide send, no bearing. `grep -rn DROIDNEW backend/src` hits only canon-messages.generated.ts:764; the string exists but is never used, and docs/DECISIONS.md has no entry dropping it.
- **Player sees**: Players never get the ambient "low frequency energy fluxation bearing NNN" traffic that in canon tells the whole galaxy a new droid has appeared; droids simply materialise silently.

### [low] The Garbage Scow never shortens its action countdown when it spots a player

- **Canon** (`reference/ge-source/GEDROIDS.C:276-280 — inside the scan-range branch, `ptr->tick = CYBTICKTIME + gernd()%CYBTICKTIME;``): All three droid classes reset `tick` to the short 1x cadence the moment a player falls inside scanrange (class 10 at :278, class 11 at :335, class 12 at :442). droid_lives only applies the long `*3` cruising cadence when `tick` is still 255, i.e. when nothing was spotted (GEDROIDS.C:216-227).
- **Port**: backend/src/game/droid/droid-tick.service.ts:252 actClass10 returns void, and droid-act-class-10.ts's Class10Action has no `detected` field at all — unlike Class11Action/Class12Action, which do. At :211-223 `detected` therefore stays false for the Scow, so nextDroidTick is called with 0 and the Scow always re-arms on the 3x cruising cadence unless it has been shot (cantexit > 0). I searched the whole droid module for `detected` and `nextDroidTick`; nothing else re-arms the Scow.
- **Player sees**: Flying alongside a Lydorian Garbage Scow, its hazmat beacon chatter and shield-state reactions come about three times less often than canon — it stays sleepy while a player is right next to it.

## midnight-scoring (4)


### [high] Planet scoring uses the item PRICE table instead of canon's item POINT-VALUE table

- **Canon** (`GEMAIN.C:563 `value[i] = lngopt(ITMVAL01+i,0L,201228378L);` and GEMAIN.C:1357 `v += (value[i] * ((long)plptr->items[i].qty/pltvdiv));`; shipped values at GE/REL/MBMGEMSG.MSG:1265-1330 (ITMVAL01 man = 10, ITMVAL02..14 all 0)`): `value_pl()` — the whole of a planet's contribution to plscore, and therefore to `score = plscore + klscore` — multiplies each item stack by `value[i]`, the ITMVAL point-value table. In the shipped configuration only MEN carry a point value (10 each); missiles, torpedoes, ion cannons, flux pods, food, fighters, decoys, troops, zippers, jammers, mines, gold and spies are all worth exactly ZERO points. A colony scores for its population and its banked cash, and for nothing else.
- **Port**: backend/src/game/midnight/midnight.repository.ts:113 calls `valuePlanet(planet.cash, planet.tax, planet.itemsQty, BASEPRICE, PLTVCASH, PLTVDIV)` — it passes BASEPRICE (the shipyard/market PRICE table: 2, 20, 7, 33, 200, 2, 50, 18, 1, 99, 21, 16, 1000, 100) where canon passes `value[]`. The canon table IS present and canon-pinned as ITEM_VALUE in backend/src/game/constants/items.ts:120 (and asserted against MBMGEMSG.MSG by test/balance/item-tables-canon.balance.spec.ts:66) — it is simply never read by anything. I grepped the whole backend/src and test tree for ITEM_VALUE: items.ts and that one balance spec are the only hits, and the source comment at items.ts:117 says so outright ("NOT the same table as BASEPRICE, which is what valuePlanet currently uses"). Not in docs/DECISIONS.md — the only ITEM_VALUE mention there (line 2137) is the gold base-price entry, which does not touch scoring.
- **Player sees**: The leaderboard rewards the wrong thing. A colony hoarding gold (1000/unit in the port, 0 in canon), ion cannons (200 vs 0) or flux pods (200 vs 0) climbs the roster hard, while population — the only stockpile canon scores — is worth 2 points a head instead of 10, five times too little relative to itself and worthless relative to the gold sitting beside it. `ros`, `rep acc` score, the `tea` team standings and the kill bonus (SCRBONUS/rospos) all read off this number, so the whole ranking economy is skewed toward stockpiling tradeables rather than growing people.

### [medium] The CHGLOSER reparations transfer happens silently — neither player is told

- **Canon** (`GEFUNCS.C:1198-1213 — `prfmsg(CHGLSR1,gechrbuf); outprfge(ALWAYS,usrn); prfmsg(CHGLSR2,gechrbuf,ptr->userid); outprfge(ALWAYS,who);``): After moving `chgloser` percent of the loser's cash to the winner, killem prints CHGLSR1 to the LOSER ("According to Galactic Treaty you have been ordered to pay to the winner the amount of %s as reparations and fines. Next time don't lose!") and CHGLSR2 to the WINNER ("...you are awarded the sum of %s as reparations and fines from Commander %s"). Both go out with class ALWAYS, so they bypass the message filter.
- **Port**: backend/src/game/player/player-score.service.ts:86 calls `this.repo.applyCashPenalty(...)` and discards its return value; backend/src/game/player/player-score.repository.ts:105-133 moves the cash and returns the amount, emitting nothing. Both message strings exist, generated from canon, at backend/src/game/commands/canon-messages.generated.ts:658-659 (CHGLSR1, CHGLSR2). I grepped backend/src, frontend/src, docs/ and specs/ for CHGLSR / "reparations" — the only hit outside the generated catalogue is a comment in gateway/game.gateway.ts:1349 explaining which message class CHGLSR uses. Nothing is recorded in docs/DECISIONS.md.
- **Player sees**: A player killed in PvP loses 2% of their bank with no notification at all — they discover it only by comparing `rep acc` before and after. The winner is never told they were paid, so the one mechanic that makes killing a rich commander lucrative is invisible from both ends.

### [medium] The killer is never told what they salvaged or what the kill scored

- **Canon** (`GEFUNCS.C:1121 `prfmsg(KILLGOT1,ptr->shipname);` and the item list at 1123-1136; GEFUNCS.C:1187-1194 `prfmsg(KILLPNTS,gechrbuf,shipclass[ptr->shpclass].typename);` and `if (bonus > 0) prfmsg(KILLBON,gechrbuf);``): killem writes a running block to the winner: KILLGOT1 ("We have destroyed The %s. Our crew have collected any usable flotsam. We have retrieved"), then one `", %ld %s"` fragment per looted stack and a closing ".", then KILLPNTS ("You got %s points for The %s.") and, when the victim was on the roster, KILLBON ("You also got %s bonus points for killing a top player.").
- **Port**: The mechanics are all there — backend/src/game/combat/kill-resolution.ts:76-95 does the loot transfer, combat-tick.service.ts:276-307 computes scoreAwarded, player-score.service.ts:78-81 adds killScoreBonus — but no message is ever emitted for any of it. The gateway (backend/src/gateway/game.gateway.ts:1303) puts `loot` and `scoreAwarded` on the structured COMBAT_SHIP_DESTROYED payload and stops there; grepping frontend/src for `loot` returns nothing, so nothing renders it either. KILLGOT1/KILLPNTS/KILLBON exist unused at backend/src/game/commands/canon-messages.generated.ts:655-657 — grep across backend/src, frontend/src, docs/ and specs/ finds no other reference. Only KILLEDBY (the galaxy-wide announcement) is wired up.
- **Player sees**: You destroy a ship, your hold silently gains a random fraction of its cargo and your score silently moves, and the log says only "X was destroyed by Y". The player cannot tell what they picked up, how many points a class was worth, or that killing a top-ranked commander paid a bonus at all — which removes the entire feedback loop behind the SCRBONUS/rospos mechanic.

### [low] `rep` omits canon's "Ros Pos:" line

- **Canon** (`GECMDS.C:2052 `prf("Ros Pos: %d\r",waruptr->rospos);` — the closing line of the default `rep` block`): The bare `rep` status block ends by printing the captain's roster position, the value the midnight job assigns and the value that sets how big a bonus whoever kills you collects.
- **Port**: backend/src/game/commands/handlers/report.handler.ts:263-267 — the default block ends at REP18A (repair) and returns; there is no rospos line. `rospos` is read from the DB in exactly one place in the whole tree (backend/src/game/player/player-score.repository.ts:41, for the kill bonus) and written in one (midnight.repository.ts:229-243). Grep of backend/src and frontend/src for "Ros Pos" or a rospos display returns nothing; `ros` shows an ordered board but never the player's own numeric position, and it truncates at MAXLIST=10 so a player outside the top ten cannot infer it. Nothing in docs/DECISIONS.md.
- **Player sees**: A player can never see their roster position, so they have no way to know the number that determines the bounty on their head.

## projectiles (4)


### [high] The target is never told a torpedo or missile was fired at it (TFIRE2 / MFIRE2)

- **Canon** (`reference/ge-source/GECMDS.C:1198 (prfmsg(TFIRE2,shpltr(shpnum,usrn)); outprfge(FILTER,shpnum)) and GECMDS.C:1313 (MFIRE2)`): On every successful launch canon prints TFIRE1/MFIRE1 ("Torpedoes fired sir!") to the firer AND routes TFIRE2/MFIRE2 — "WARNING! WARNING! Incoming torpedo from ship %c." — to the target's channel, naming the firer by the letter in the TARGET's scan table.
- **Port**: backend/src/game/commands/handlers/torpedo.handler.ts:194-200 returns only a locally-invented line to the firer ("Torpedo away — locked on X."); missile.handler.ts:250-256 does the same. Neither touches this.events (both constructors do `void this.events`), and nothing anywhere emits the strings: `grep -rn "TFIRE1\|TFIRE2\|MFIRE1\|MFIRE2" backend/src --include=*.ts` matches only the generated table at game/commands/canon-messages.generated.ts:379-386, and `grep -rn "WARNING! WARNING"` outside that file returns nothing.
- **Player sees**: A player being shot at gets no launch warning at all — the first indication of a torpedo or missile is the hit message six-plus seconds later. In canon they get a red incoming warning naming the attacker's scan letter, which is what makes decoys, a course change or a warp-out a live decision.

### [medium] No per-tick RED ALERT while a torpedo or missile is inbound (TORP1 / MISSL1)

- **Canon** (`reference/ge-source/GEFUNCS.C:1600 (prfmsg(TORP1)) and GEFUNCS.C:1685 (prfmsg(MISSL1))`): Every physics tick, in the "still flying" branch, canon prints TORP1 ("RED ALERT! Tracking incoming torpedo.") / MISSL1 ("RED ALERT! Sensors tracking incoming missile!") to the carrier — once per tick regardless of how many are inbound, via the `flag` guard.
- **Port**: backend/src/game/combat/combat-tick.service.ts:598-606 and :645-653: when the projectile is still flying the port only writes the new distance (`s.ltorpsDistance[i] = newDist`) and emits nothing. There is no COMBAT_PROJECTILE_INBOUND event in game/combat/combat-events.ts (the full list is PHASER_FIRED, HIT, MISS, DECOY_INTERCEPT, MINE_DETONATION, MINE_WARNING, SUBSYSTEM_DAMAGED, SHIP_DESTROYED), and TORP1/MISSL1 appear only in canon-messages.generated.ts:400-401.
- **Player sees**: A projectile crosses the gap in total silence. The player never sees the tracking alert that in canon is the cue to launch decoys, so the decoy command has no trigger a player can react to.

### [medium] lockon does not warn the target it is being locked (LOCK2 / LOCK4)

- **Canon** (`reference/ge-source/GECMDS.C:1401 (prfmsg(LOCK2,shpltr(ship,usrn)) to the target on a good lock) and GECMDS.C:1415 (prfmsg(LOCK4,...) to the target on a failed lock)`): Both lockon outcomes notify the TARGET: LOCK2 "WARNING! WARNING! Ship %c has a fire control scanner locked on us!" on success, LOCK4 "...Ship %c is attempting to lock fire control scanners on us." on failure — the firer separately gets LOCK3 on failure.
- **Port**: torpedo.handler.ts:139-150 and missile.handler.ts:199-212 emit LOCK3 (MessageId.LOCK_FAIL) to the firer and nothing at all to the target. `grep -rn "LOCK2\|LOCK4" backend/src --include=*.ts` outside canon-messages.generated.ts:390-392 returns nothing, and messages.ts only maps LOCK_FAIL/LOCK_UNREACHABLE/LOCK_NEUTRAL (lines 1046-1048).
- **Player sees**: Being painted by an enemy's fire control is invisible. In canon even a failed lock attempt betrays a stalker's presence and letter; in the port a cloaked-intent attacker can probe for locks with no feedback to the victim.

### [medium] Locking a torpedo/missile does not battle-lock the TARGET's exit

- **Canon** (`reference/ge-source/GECMDS.C:1405-1406 (success) and GECMDS.C:1419-1420 (failure): `wptr->cantexit = FIRETICKS; ptr->cantexit = FIRETICKS;``): lockon sets cantexit = FIRETICKS on BOTH ships, on a successful and on a failed lock — the moment someone gets fire control on you, you cannot log out. The phaser path does the same (GECMDS.C:978-979).
- **Port**: torpedo.handler.ts:186-192 and missile.handler.ts:242-248 mutate only the firer (`s.cantexit = FIRETICKS`). `grep -rn "cantexit = FIRETICKS" backend/src` shows the target being set only in phaser.handler.ts:265/274, cybertron-tick.service.ts and in combat-tick.service.ts resolveProjectileHit — i.e. not until the projectile actually lands, and never on a failed lock. exit.handler.ts:41 is the consumer (`if (ship.cantexit > 0)` refuses).
- **Player sees**: A player who is locked on and fired at can type `exit` and leave cleanly during the whole flight time of the torpedo, and can always leave after a failed lock. Canon nails them in place for FIRETICKS from the instant the lock is attempted.

## tick-physics (4)


### [high] Movement, rotation, acceleration and the self-destruct countdown run half as often as canon

- **Canon** (`reference/ge-source/GEMAIN.C:2470-2491 (warrti2a); rtkick(TICKTIME2,pwarrti2) at :2491, TICKTIME2=1 (GEMAIN.H)`): warrti2a is kicked every 1 second and calls rotateship, accel, moveship and destruct. It walks the ship table in a stride of three — `zothusn += 3` (:2485) with `clicker = (clicker+1)%3` (:2488) — so every ship gets exactly one rotate/accel/move/destruct step every 3 seconds. Each step advances position by `speed*sin(heading)/65000` (GEFUNCS.C:637-638), rotates by `max_accel/10` degrees (GEFUNCS.C:441), and changes speed by max_accel (accel) or max_accel*2 (decel).
- **Port**: backend/src/game/physics/physics-tick.service.ts:93 subscribes rotate/accel/move to TickKind.PHYSICS, which backend/src/game/tick/tick.service.ts:54 fires on a 6000 ms setInterval; backend/src/game/commands/ship-management-tick.service.ts:31 puts destructTick on the same 6 s tick. So every one of those steps happens once per 6 s instead of once per 3 s. The port is aware of the stride — backend/src/game/ship/ship-tick.service.ts:52 defines MOVE_STRIDE=3 and :131-134 applies it — but it uses it only for the overspeed roll on the 1 s tick, leaving the overspeed check running at canon's 3 s cadence while the movement it is supposed to be part of runs at 6 s. I grepped tick.service.ts, physics-tick.service.ts, ship-tick.service.ts and every TickKind.SHIP_UPDATE subscriber, and searched docs/DECISIONS.md for 'TICKTIME2', 'warrti2', 'stride', 'clicker' and '1s tick' — no entry records this as a deliberate deviation.
- **Player sees**: Everything about flying is exactly twice as slow as the original: a ship covers half the sectors per minute at any given warp, takes twice as long to reach an ordered speed, takes twice as long to complete a turn (a 180 on a 200-accel hull is ~54 s instead of ~27 s), and a `des 20` self-destruct counts down over 120 s instead of 60 s. Because the overspeed roll still fires every 3 s, a pilot running above rated warp also takes roughly twice as many strain rolls per sector travelled as canon, so engines blow sooner relative to distance covered.

### [medium] Phaser recharge is completely silent — PHSRUP, PHSRMAX and PHREPR are never emitted

- **Canon** (`reference/ge-source/GEFUNCS.C:1037 prfmsg(PHSRUP), :1046 prfmsg(PHSRMAX), :1021 prfmsg(PHREPR) — all in checkdam, all outprfge(ALWAYS)`): On every 6 s pass checkdam recharges the phaser bank by `phasrtype*PRELOAD` behind a useenergy(PENGUSE) gate and narrates it: PHSRUP ('Phaser banks are now at minimum fire power, Sir!') on the tick the charge crosses PMINFIRE, PHSRMAX ('Phaser banks are at full power, Sir!') on reaching 100, and PHREPR ('Damage Control reports Phasers are now functional Sir!') when a shot-out negative phasr climbs back to 0. All three go to the captain unconditionally (ALWAYS, not FILTER).
- **Port**: backend/src/game/combat/combat-tick.service.ts:521-536 does the reload and the PENGUSE debit correctly but emits no event of any kind; backend/src/game/ship/ship-tick.service.ts:238-247 lifts negative phasr to 0 silently. The strings exist unused in backend/src/game/commands/canon-messages.generated.ts:301-302 and :324. `grep -rn '\bPHSRUP\b|\bPHSRMAX\b|\bPHREPR\b' backend/src --include=*.ts` outside the generated catalogue returns nothing, and there is no MessageId mapping for them in backend/src/game/commands/messages.ts.
- **Player sees**: A pilot has no idea when their phasers are ready. In canon you break off, wait for 'Phaser banks are at full power, Sir!' and re-engage; here the only way to know is to fire and see, or to poll `rep`. After a fire-control hit that drove phasr negative, nothing ever tells you the bank is working again.

### [medium] Subsystem repairs complete silently — TAREPR, HLREPR, FCREPR, CLREPR and SHREPR never print

- **Canon** (`reference/ge-source/GEFUNCS.C:1059 TAREPR, :1070 HLREPR, :1080 FCREPR (checkdam); :1393 CLREPR (cloakstat); :2486 SHREPR (shieldrep)`): Each damaged subsystem walks its counter one step per 6 s tick and, on the tick it reaches 0, Damage Control reports it: tactical display, helm navigational controls, fire control systems, cloaking device, and shields each get their own line, all outprfge(ALWAYS).
- **Port**: backend/src/game/ship/ship-tick.service.ts:238-255 increments tactical, helm, firecntl and the SHIELDDM shield back to 0 with no event emitted; backend/src/game/commands/ship-management-tick.service.ts:63-69 does the same for a negative cloak. The five strings sit unused at backend/src/game/commands/canon-messages.generated.ts:366, :367, :371, :350, :340. Grepping backend/src for each identifier outside the generated file returns zero hits.
- **Player sees**: After a torpedo knocks out your tactical display or helm, the port tells you it happened but never tells you it came back. The player has to keep retrying `sca` or `rot` to discover the system works again, and a captain who took a shield hit never learns the shields are repairable and re-raisable.

### [medium] Queued repair (`mai`) finishes and aborts silently — MAINT7 and MAINT10 never print

- **Canon** (`reference/ge-source/GEFUNCS.C:399 prfmsg(MAINT10), :422 prfmsg(MAINT7) in repairship`): repairship runs each 6 s tick while `repair > 0`. If the ship is combat-locked (`cantexit > 0`) it prints MAINT10 — the maintenance team's union-contract refusal — and zeroes the repair queue. When the queue drains it restores the ship and prints MAINT7, 'Repairs and general maintenance have been completed Sir!'.
- **Port**: backend/src/game/ship/ship-tick.service.ts:185-217 implements both branches — the cantexit abort at :186-188 and the seven-field restore at :195-215 — but neither path emits an event or message. `grep -rn 'MAINT7|MAINT10' backend/src --include=*.ts` outside backend/src/game/commands/canon-messages.generated.ts:680,:683 returns nothing.
- **Player sees**: A pilot who pays for maintenance is never told when it finishes, and a pilot whose repair is cancelled because someone shot at them is never told it stopped — they undock believing they are repaired, still carrying damage.

## constants-sweep (3)


### [medium] Self-destruct does no damage to nearby ships (DESTRUCTRANGE unused; SELFD6/SELFD7 never emitted)

- **Canon** (`reference/ge-source/GEFUNCS.C:1860-1899 (blast loop), GEMAIN.H:197 `#define DESTRUCTRANGE 10000``): When the countdown reaches zero, canon sets `ptr->damage = 101`, prints SELFD3/SELFD3A, then walks every ship in the game: for each one within MINERANGE (`ddist*10000 < MINERANGE`) and outside the neutral sector it computes a cubic falloff `ddist = 1.0-(ddist/DESTRUCTRANGE); ddist = ddist*ddist*ddist`, scales `minedammax` by `((ptr->shpclass/2)+1)`, and applies it. Shields-up victims get the damage divided by `gernd()%5 + shieldtype`, take a `shieldhit(wptr, zothusn, damage+20)`, and are told SELFD6 ("Shields deflected some of the blast! Damage Control reports %s damage."); shields-down victims take it whole and are told SELFD7 ("The shock wave caused %s damage Sir!"). Every victim also has `lastfired` reset to -1. Self-destruct is a kamikaze weapon.
- **Port**: backend/src/game/commands/ship-management-tick.service.ts:143-172 handles the detonation branch: it emits SELFD3 to the pilot, SELFD3A to the sector, fires COMBAT_SHIP_DESTROYED with `attackerId: null, loot: [], scoreAwarded: 0`, and calls `removeFromGame`. There is no proximity loop, no falloff, no shieldhit. `DESTRUCTRANGE` is declared at backend/src/game/constants.ts:401 and exported in GEMAIN_GAMEPLAY_PINS but referenced by no other file (`grep -rlw DESTRUCTRANGE` over backend/src returns constants.ts alone). `SELFD6`/`SELFD7` exist only as strings in backend/src/game/commands/canon-messages.generated.ts:761-762 — not mapped in messages.ts, emitted nowhere. I searched backend/src for DESTRUCTRANGE, SELFD6, SELFD7, 'shockwave', 'shock wave', 'blast' and 'minedammax'; docs/DECISIONS.md records nothing on it.
- **Player sees**: A captain can scuttle inside a hostile formation and nobody feels it. In canon a self-destructing hull damages every ship within one sector, hardest at point-blank, and neighbours read "The shock wave caused N damage Sir!" — in the port the ship simply vanishes and adjacent ships take zero damage and see only the SELFD3A announcement.

### [medium] Rotating costs no energy — ROTENGUSE is never charged and NOROTPW is never printed

- **Canon** (`reference/ge-source/GECMDS.C:660 and GECMDS.C:702 (`if (useenergy(warsptr,usrnum,ROTENGUSE) == 1)`), GEMAIN.H:73 `#define ROTENGUSE 30``): Both branches of `cmd_rotate` (absolute `rot @<deg>` and relative `rot <deg>`) call `useenergy(warsptr, usrnum, ROTENGUSE)` BEFORE setting `head2b`. The turn happens only if the debit succeeds; on failure canon prints NOROTPW ("Sorry Sir, we don't have enough power to rotate") and head2b is left untouched. Every rotation costs 30 energy, and a drained ship cannot turn at all.
- **Port**: backend/src/game/commands/handlers/rotate.handler.ts:41-45 leaves the debit as an explicit deferral — five `TODO(006)` comments naming GECMDS.C:679/691/711/717 — then sets `ship.head2b = target` unconditionally at line 51. The physics tick does not compensate: backend/src/game/physics/physics-tick.service.ts:183-193 `applyRotation` states "Tick does not debit rotation energy; that is paid by the `rotate` command" and debits nothing. `ROTENGUSE` appears only at backend/src/game/constants.ts:63/672 and in backend/test/game/physics/balance-regression.spec.ts:30 — no production file consumes it. `MessageId.NOROTPW` is declared (messages.ts:28, mapped :521) but grep across backend/src finds no emitter. docs/GAME_MECHANICS.md:144-145 and :331 already assert the command pays ROTENGUSE, so docs and code disagree; docs/DECISIONS.md's only rotation entry (2026-05-02) is about using max_accel/10 instead of ROTAMT for the per-tick step, not about the energy cost.
- **Player sees**: Turning is free. A captain at near-zero energy can still spin to any heading, and never sees "Sorry Sir, we don't have enough power to rotate"; in canon each `rot` burns 30 energy and is refused when the flux runs dry.

### [low] No captured-document reveal on a player kill (SHOWDOC/RNDDOC, CAPTDOC never printed)

- **Canon** (`reference/ge-source/GEFUNCS.C:1227-1248, GEMAIN.H:192-193 `#define SHOWDOC 1` / `#define RNDDOC 6``): Inside the kill-award path, guarded by `#ifdef SHOWDOC`, canon rolls `gernd()%RNDDOC == 0` — a 1-in-6 chance on every kill — and on success prints CAPTDOC ("Our intelligence team has captured a secret document, it reads... / Planet Name sector planet") to the victor followed by up to 20 rows of the victim's planets: `prf("%-20s %d %d   %d\r", planet.name, planet.xsect, planet.ysect, planet.plnum)`. GEMAIN.H:186-191 documents this as a deliberate, switchable game feature.
- **Port**: The CAPTDOC string exists only as data in backend/src/game/commands/canon-messages.generated.ts:743; grep for CAPTDOC across backend/src outside that generated file returns nothing, and messages.ts defines no MessageId for it. Grep for 'RNDDOC', 'SHOWDOC' and 'secret document' over backend/src finds nothing. SHOWDOC and RNDDOC are listed in the EXCLUDED set of backend/test/unit/gemain-pins.spec.ts:60 with no justification in that file's header comment — every other exclusion there is comment-justified — so they are neither pinned nor implemented. I also read the kill-resolution path (game/combat, game/mail) for any planet-list reveal under a different name; there is none, and docs/DECISIONS.md and docs/GAME_MECHANICS.md do not mention it.
- **Player sees**: Killing another commander's ship never yields intelligence. In canon roughly one kill in six hands the victor a printed list of up to 20 of the victim's planets with sector and planet number — a direct lead on where to raid next. In the port that reveal never happens.

## countermeasures (4)


### [medium] Zipper deletes mines instead of detonating them

- **Canon** (`reference/ge-source/GECMDS.C:1698-1712 (zip)`): `zip()` does not remove mines. For every live mine inside the firer's scanrange it sets `mptr->timer = 1` — "set mine to explode next tick". On the next `checkmines` pass the timer hits 0, `timer%5 == 0` is true, and the mine goes through the full detonation branch (GEFUNCS.C:1435-1470): cubic-falloff damage to every ship inside MINERANGE, MINE4 hit messages, shieldhit, randamage, `lastfired` credit to the mine's layer, and MINE5 to ships out of range. A zipper is therefore a controlled mass detonation you must be clear of, and it can kill the pilot who fired it or anyone nearby.
- **Port**: backend/src/game/commands/handlers/zipper.handler.ts:69-75 filters mines in range and calls `this.mineRepo.delete(mine.id)` + `this.mineRegistry.remove(mine.id)` for each — the mines vanish with no timer change, no detonation, no damage, no events. I grepped backend/src for `timer = 1`, `timer: 1`, ZIPPER3, MINE5 and for any zipper->detonation path; there is none, and docs/DECISIONS.md has no entry for zipper behaviour.
- **Player sees**: Firing a zipper is completely risk-free and silent: mines simply disappear. In canon the swept minefield explodes one tick later and can damage or destroy the sweeper and any ship in the blast, and everyone in range sees MINE4/MINE5 explosion text.

### [medium] cmd_jammer skips the has_jam hull gate, the cloak gate, and the FIRETICKS combat lock

- **Canon** (`reference/ge-source/GECMDS.C:1593-1651`): cmd_jammer refuses with PCLOKUP if `warsptr->cloak > 0` (:1599-1604), refuses with JAMMER0 ("We don't have a Jammer System on this ship, Sir!") if `!shipclass[warsptr->shpclass].has_jam` (:1607-1612), and `jam()` ends with `ptr->cantexit = FIRETICKS` (:1652).
- **Port**: backend/src/game/commands/handlers/jammer.handler.ts:47-79 checks only `items[I_JAMMER] > 0n`. It injects ShipClassCacheService but never asks it for the jammer flag (the cache exposes hasJammer — report.handler.ts:124 reads it), never tests `ship.cloak`, and its final `mutate` only decrements ammo; no `s.cantexit = FIRETICKS`. Grepped backend/src for JAMMER0, `hasJam`, and `cantexit` in this file — all absent.
- **Player sees**: Any hull carrying jammers as cargo can fire them even though canon says it has no jammer system, and can fire while cloaked. Because cantexit stays 0, the pilot can immediately repair/maintenance (maintenance.service.ts:64) and auto-shield (auto-shield.ts:27) right after jamming — canon locks them out for FIRETICKS.

### [medium] cmd_zipper skips the has_zip hull gate, the cloak gate, and the FIRETICKS combat lock

- **Canon** (`reference/ge-source/GECMDS.C:1658-1717`): cmd_zipper refuses with ZIPPER0 ("Sorry Sir! We don't have a Zipper Launcher on this ship") when `!shipclass[warsptr->shpclass].has_zip` (:1663-1668) and with PCLOKUP when `warsptr->cloak > 0` (:1671-1676); `zip()` ends with `ptr->cantexit = FIRETICKS` (:1716).
- **Port**: backend/src/game/commands/handlers/zipper.handler.ts:51-84 checks only `items[I_ZIPPER] > 0n`; ShipClassCacheService is injected purely to read scanRange. No ZIPPER0, no cloak test, no cantexit assignment. Grepped backend/src for ZIPPER0 and hasZip usage in command handlers — only cyb-decisions.ts and report.handler.ts use the flag.
- **Player sees**: A hull with no zipper launcher can still sweep minefields, and can do it while cloaked; and unlike canon the pilot is not battle-locked afterwards, so they can repair or raise shields on the very next tick.

### [medium] JAMMER3 — jammed ships are never told their scanners are being jammed

- **Canon** (`reference/ge-source/GECMDS.C:1645-1646 (`prfmsg(JAMMER3); outprfge(FILTER,zothusn);`)`): Inside jam()'s per-ship loop, every ship whose `jammer` counter is set receives JAMMER3: "***\nOur scanners are being jammed Sir!"
- **Port**: backend/src/game/commands/handlers/jammer.handler.ts:71-77 sets `s.jammer = value` on each in-range ship and emits nothing to them; the only output is JAM_FIRED back to the firer. `grep -rn JAMMER3 backend/src` matches only canon-messages.generated.ts:687 — the string is generated and never referenced.
- **Player sees**: A jammed pilot suddenly loses cloak-wake detection and mine proximity warnings with no explanation at all — canon prints a warning line at the moment of jamming.

## defense (4)


### [medium] Self-destruct does no blast damage to nearby ships

- **Canon** (`GEFUNCS.C:1863-1893 (destruct(), SELFD6/SELFD7 loop); GEMAIN.H:197 DESTRUCTRANGE`): When the countdown reaches zero, canon does not just kill the ship. It walks every ship in the game, and for any within MINERANGE (10000 raw units) that is NOT in the neutral zone it computes `ddist = 1.0-(ddist/DESTRUCTRANGE)`, cubes it, and applies `minedammax * ddist^3 * ((shpclass/2)+1)` damage. Shielded victims get the damage divided by `(gernd()%5 + shieldtype)`, are told SELFD6 ("Shields deflected some of the blast! Damage Control reports %s damage.") and take a `shieldhit(wptr,zothusn,damage+20)`; unshielded victims get SELFD7 ("The shock wave caused %s damage Sir!") at full strength. Every victim also gets `lastfired = -1`. The scaling by `(shpclass/2)+1` makes a big hull's suicide a genuine area weapon.
- **Port**: backend/src/game/commands/ship-management-tick.service.ts:145-175 — the `destructTick` zero branch emits `ship-management.destruct-boom` (SELFD3 to the pilot, SELFD3A to the sector), emits COMBAT_SHIP_DESTROYED with `attackerId: null, loot: [], scoreAwarded: 0`, and calls `removeFromGame`. There is no iteration over nearby ships and no damage application. I grepped the whole backend/src tree for `SELFD6`, `SELFD7`, `DESTRUCTRANGE`, `blast`, `shock wave` and `destruct`: SELFD6/SELFD7 exist only as unused strings in game/commands/canon-messages.generated.ts:761-762, and DESTRUCTRANGE is only declared and re-exported in game/constants.ts:400-401 (and pinned by test/balance/unpinned-constants.balance.spec.ts) — it is read nowhere. docs/DECISIONS.md has no entry for it; docs/GAME_MECHANICS.md:2137 describes only the countdown and abort.
- **Player sees**: Scuttling your ship next to an enemy is harmless. In canon a captain about to lose a big hull can ram a fight and take shields (and hull) off everything within a sector; here the ship simply vanishes and nobody nearby takes a scratch or sees the "Shock wave" message. Conversely, sitting next to a ship whose countdown you have heard (SELFD2A/2B/2C are broadcast) carries no risk at all, so the warnings are theatre.

### [medium] Shield-hit narration (SHDAMAG / SHKNKDN) is computed but never sent to the victim

- **Canon** (`GEFUNCS.C:2453-2467 (shieldhit)`): shieldhit prints to the victim on two of its three outcomes: when `shield <= 2` it sends SHDAMAG ("The last hit damaged the shields Sir!! Damage Control notified.") with outprfge(ALWAYS,usrn) before flipping to SHIELDDM, and when `shield < SHMINCHG` (5) it sends SHKNKDN ("The last hit knocked the shields down Sir, restoring them now.").
- **Port**: backend/src/game/combat/combat-math.ts:206-231 returns the correct three-way `outcome` ('damaged'|'warned'|'none'), but every call site uses it only to set state: combat-tick.service.ts:443 and :758, phaser.handler.ts:260, droid-tick.service.ts:503, cybertron-tick.service.ts:552, ship-tick.service.ts:386 all read `if (r.outcome === 'damaged') v.shieldstat = SHIELDDM;` and nothing else. Grepping backend/src for SHDAMAG and SHKNKDN finds them only as unused strings in canon-messages.generated.ts:338-339; there is no MessageId for either in game/commands/messages.ts.
- **Player sees**: A pilot under fire is never told their shields have been blown or are about to be. They find out only when `shi up` later refuses with SHNORPR, or by reading the shield line in `rep`. Canon gives the moment its own alarm, which is the cue to break off or drop shields deliberately.

### [medium] Shields collapsing for want of power, and finishing repair, are both silent

- **Canon** (`GEFUNCS.C:1340-1348 (shieldstat, SHDNNOP); GEFUNCS.C:2473-2487 (shieldrep, SHREPR)`): In shieldstat, a raised shield with `energy < SHMINPWR` is dropped and the captain is told SHDNNOP ("Shields have come down due to lack of power, Sir!!!") with outprfge(ALWAYS). In shieldrep, when a SHIELDDM shield's charge climbs back to non-negative it is returned to SHIELDDN and the captain is told SHREPR ("Damage Control reports the shields have been repaired, Sir.").
- **Port**: backend/src/game/ship/ship-tick.service.ts:277-282 does the SHDNNOP drop (`s.shieldstat = 0; s.shield = 0;`) inside a mutate with no event emitted — the comment on line 278 even names SHDNNOP. Lines 246-252 do the shieldrep climb and clear `shieldstat` to 0 with no event. Both paths emit nothing; only the charging path (SHIP_SHIELD_CHARGE, ship/shield-events.ts) reaches the gateway. Grepping backend/src for SHDNNOP and SHREPR finds them only as unused strings in canon-messages.generated.ts:337 and :340, with no MessageId entries.
- **Player sees**: Shields silently fall off while the pilot is running the energy down, and silently come back after a repair. The pilot has to poll `rep` to learn either. In canon both transitions announce themselves, and the repair message is the signal that `shi up` will be accepted again.

### [medium] Cloak never announces reaching full concealment (CLOKUP) or finishing repair (CLREPR)

- **Canon** (`GEFUNCS.C:1717-1727 (checktm cloak ramp, CLOKUP); GEFUNCS.C:1388-1394 (cloakstat, CLREPR)`): The ramp 1→2→10 is not silent: on the tick the cloak reaches 10 canon prints CLOKUP ("We are now completely invisible, Sir!") with outprfge(ALWAYS,usrn). Separately, a shot-out cloak (`cloak < 0`, set by randamage at GEFUNCS.C:2021-2027) increments each tick and, on reaching 0, prints CLREPR ("Damage Control reports that the Cloaking Device is now functional, Sir!").
- **Port**: backend/src/game/commands/ship-management-tick.service.ts:59-97 — `cloakTick` performs both transitions (`s.cloak = CLOAK_RAMP_MID` / `CLOAK_RAMP_FULL` at lines 91-95; `s.cloak += 1` for the damaged case at lines 66-71) and emits nothing in either case. The only cloak event the service emits is 'ship-management.cloak-collapsed'. Grepping backend/src for CLOKUP and CLREPR finds them only as unused strings in canon-messages.generated.ts:346 and :350 (the PCLOKUP hits are the unrelated "not while cloaked" refusal). No gateway listener exists for either.
- **Player sees**: After `clo on` the captain sees "cloak engaged" and then nothing — they cannot tell when the two-tick ramp completes, which is exactly the moment that matters, because canon gates torpedo/missile locks and the who/scan listings on `cloak < 10`, not `cloak > 0`. Likewise a captain whose cloak was shot out gets no notice that it works again.

## ground-assault (4)


### [medium] The attacker is never told the planet called for help (ATTACK7), and ATTACK6A is never sent

- **Canon** (`reference/ge-source/GECMDS.C:3952-3970 (call_4_help); message text at reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG:3207 and :3213`): call_4_help is a three-way chain. If the owner is logged in AND in the game (`instat(...) && othusp->substt >= FIGHTSUB`), canon prints ATTACK6 to the owner AND `prfmsg(ATTACK7); outprfge(ALWAYS,usrnum)` to the ATTACKER — "The planet is sending a distress signal, Sir!". If the owner is on the BBS but not in the game, canon prints ATTACK6A ("*** GALACTIC EMPIRE ALERT! *** Planet under attack... Check GE Mail for details.") to the owner and again ATTACK7 to the attacker.
- **Port**: `PlanetAttackService.callForHelp` (backend/src/game/planet/planet-attack.service.ts:315-345) emits only ATT_OWNER_ALERT (= ATTACK6) into the owner's room and returns; nothing is ever added to the attacker's narration. `grep -rn "ATTACK7\|ATTACK6A\|distress signal" backend/src` matches only the generated string table (canon-messages.generated.ts:524-525) — neither string has a MessageId entry in backend/src/game/commands/messages.ts and neither is referenced by any handler or service.
- **Player sees**: An attacker gets no feedback that the defender was alerted. In canon, seeing "The planet is sending a distress signal, Sir!" is the tell that the owner is online and inbound — the cue to press the assault or break orbit. In the port that tactical information is silently absent, and an owner who is connected but not currently flying gets no alert at all.

### [medium] The spy owner receives an owner-style distress mail instead of the SPYM3/SPYM4 intelligence report, on the wrong gates

- **Canon** (`reference/ge-source/GECMDS.C:3972-3994 (call_4_help spy branches); message text at MBMGEMSG.MSG:6024 (SPYM3) and :6035 (SPYM4)`): The spy branches are `else if`s reached only when the owner is neither in-game nor on the system. On a failed attack: `won == 0 && send_spy_mail && gernd()%6 == 0 && spyowner[0] != 0` sends SPYM3 with `mail.topic = "Intelligence Report"`. On a successful one: `won == 1 && spyowner[0] != 0` — no send_spy_mail gate, no random roll — sends SPYM4, same topic. Both are "Classification: TOP SECRET / Our operative on %s in sector %d %d reports..." written from the spy's point of view.
- **Port**: planet-attack.service.ts:338-342 does `if (sendSpyMail && planet.spyowner) { if (won === 1 || gernd(this.random) % 6 === 0) { insertDistressMail(planet.spyowner, MESG02|MESG04, ...) } }`. Three differences: it fires regardless of whether the owner was reachable (no else-if chain); a WON attack is gated on `sendSpyMail` (ratio > 5) where canon has no such gate; and the mail body is MESG02/MESG04, whose text is "Distress message from %s in Sector %d %d, they were attacked by Commander %s ... They successfully defended the planet." (canon-messages.generated.ts:721-724). `grep -n "SPYM3\|SPYM4" backend/src/game/commands/messages.ts` returns nothing — the two strings exist only in the generated table and have no MessageId, so nothing can emit them.
- **Player sees**: A player who has planted a spy on someone else's planet and watches it get invaded receives a distress message phrased as though the planet were his own and had defended itself, rather than the TOP SECRET operative report canon sends. And when the planet actually falls at low attack ratio (ratio <= 5), canon always tells the spy's owner it was taken; the port sends nothing.

### [medium] Troop raids destroy the planet's colonists; canon's item-destruction loop starts at index 1 and never touches Men

- **Canon** (`reference/ge-source/GECMDS.C:3714-3730 — `for(ii=1;ii<NUMITEMS;++ii)` in attack_men (compare attack_fig at GECMDS.C:3875-3890, which uses `for(ii=0;...)` with `ii != I_FIGHTER`)`): In the troop branch, when `ratio > 2 && left1 > (left2/2)`, canon walks items 1..NUMITEMS-1 and destroys `gernd()%15` of each — deliberately starting at 1 so item 0, I_MEN (GEMAIN.H, mirrored in backend/src/game/constants/items.ts:27), the planet's colonist population, is exempt. It does not exclude I_TROOPS (index 8); destroying troops there is moot because `plptr->items[I_TROOPS].qty = left2` at GECMDS.C:3743 overwrites it afterwards. The fighter branch is written the other way round — it starts at 0 and excludes only I_FIGHTER — so the asymmetry is intentional in the source.
- **Port**: planet-attack.service.ts:134-145 loops `for (let i = 0; i < planet.items.length; i++) { if (i === I_TROOPS) continue; ... }`. The exemption was moved from Men to Troops, so index 0 is now included. The Troops half is invisible (the port also overwrites `planet.items[I_TROOPS].qty = BigInt(left2)` at line 149), but the Men half is not.
- **Player sees**: A defender who survives a heavy ground assault loses up to 14 colonists per raid that canon would never kill, and the attacker sees an extra "%s of their Men were also destroyed!" line. Men are the planet's production workforce and the only item with a nonzero ITEM_VALUE (10 points each, items.ts), so repeated raiding erodes the defender's population, output and score in a way the original never did.

### [low] Precondition order inverted: attacking your own planet inside the neutral zone zaps you instead of being refused

- **Canon** (`reference/ge-source/GECMDS.C:3521-3559 — max_attk check, then `where < 10`, then PLTYPE_WORM, then `sameas(plptr->userid,warsptr->userid)` -> ATTACK0, and only then `if (neutral(&warsptr->coord)) zaphim(...)``): The self-attack test precedes the neutral-zone test, so ordering your own planet in the hub and typing `att 10 tro` returns ATTACK0 harmlessly. The ship-class capability test (`max_attk == 0` -> ATTACK0A) precedes the orbit test, so a non-assault ship gets told its class cannot attack even when it is not in orbit.
- **Port**: attack.handler.ts:54-93 runs orbit -> class -> wormhole -> neutral zone -> self, so `isInNeutralZone(ship)` fires before the `planet.userid === ship.userid` branch and applies `s.damage += SE100DAM` (matching zaphim at GECMDS.C:1525-1532). The class check is also after the orbit check, so ATT_NOT_ORBIT wins where canon prints ATTACK0A.
- **Player sees**: A player who owns a neutral-zone planet and mistypes `att` at his own world takes se100dam hull damage and the ZAPHIM1 message, where the original just said "that's one of ours". Sector (0,0) is where new players sit, so the mistake is cheap to make and now costs damage.

## movement (3)


### [medium] Rotating the ship is free — ROTENGUSE is never spent and NOROTPW never printed

- **Canon** (`reference/ge-source/GECMDS.C:664 and GECMDS.C:703 (`if (useenergy(warsptr,usrnum,ROTENGUSE) == 1)`), GEMAIN.H:73 `#define ROTENGUSE 30`, GEFUNCS.C:1505 useenergy`): Both arms of cmd_rotate (absolute `rot @nnn` and relative `rot nnn`) wrap the whole turn in `useenergy(ptr, usrn, ROTENGUSE)`. Each rotation order costs 30 energy, and the debit is refused unless `energy >= 30 + 500`; on refusal the ship does NOT turn and the helm answers NOROTPW, "Sorry Sir, we don't have enough power to rotate".
- **Port**: backend/src/game/commands/handlers/rotate.handler.ts:42-45 still carries the gate as three `TODO(006)` comments and sets `ship.head2b` unconditionally — no energy is read or written. backend/src/game/physics/physics-tick.service.ts:185 explicitly disclaims it ("Tick does not debit rotation energy; that is paid by the `rotate` command"), so nobody pays it. `grep -rn "ROTENGUSE" backend/src` matches only its declaration at constants.ts:63 and its re-export at constants.ts:672 — it has no consumer. `grep -rn "NOROTPW"` matches only the message table (messages.ts:28/521, canon-messages.generated.ts:326). Not listed in docs/DECISIONS.md; docs/GAME_MECHANICS.md:145 wrongly claims the command "debits ROTENGUSE up-front", while :331 admits the gate was "deferred to feature 006" and it was never picked up.
- **Player sees**: A drained ship can still turn. In canon a captain at low energy is locked on their current heading and told so — you cannot spin to bring phasers to bear, or turn to run, until energy regenerates past 530. In the port manoeuvring is unlimited and free, and the NOROTPW line never appears.

### [medium] The acceleration energy cut-out is silent and fires 500 energy too late — NOACCEL is never emitted

- **Canon** (`reference/ge-source/GEFUNCS.C:493-533 (`if (useenergy(ptr,usrn,usage) == 1) … else { prfmsg(NOACCEL,(int)ptr->speed); outprfge(ALWAYS,usrn); ptr->speed2b = 0; }`), GEFUNCS.C:1505 `if (ptr->energy >= amount+500)``): When the per-tick ACCENGAMT (120) debit is refused, canon prints NOACCEL — "Helm reports engine shutdown at warp %d, Sir!" — on the captain's own socket (ALWAYS, so it is not filtered) and then forces `speed2b = 0`. The refusal threshold is `useenergy`'s fudge floor: the debit fails whenever energy < 120 + 500 = 620.
- **Port**: backend/src/game/physics/physics-tick.service.ts:212 calls `tryEnergyDebit(ship.energy, accel.energyDebit, 0)` — floor 0, not USEENERGY_RESERVE — so the debit only fails below 120. The failure arm (physics-tick.service.ts:220-229) sets `s.speed2b = 0` and emits nothing at all. `grep -rn "NOACCEL" backend/src` matches only canon-messages.generated.ts:306; there is no MessageId for it and no emitter. The 500 reserve is modelled (constants.ts:345 USEENERGY_RESERVE) but used only by combat-tick.service.ts:528 for the phaser preload.
- **Player sees**: A ship that runs out of neutron flux at warp stops accelerating with no message whatsoever — the captain watches the speed stop climbing and is never told the engines shut down. And it happens 500 energy later than canon, so the port lets you push into a reserve canon protects.

### [low] The helm never answers a warp boundary — "Helm reports WARP %d" and DEADSTOP are never printed

- **Canon** (`reference/ge-source/GEFUNCS.C:498-500 (`prfmsg(WARP,(int)((ptr->speed + accelrate)/1000))`) and GEFUNCS.C:556-566 (`prfmsg(WARP,(int)((ptr->speed-decelrate)/1000)+1)` / `prfmsg(DEADSTOP)`)`): Every tick on which the integer warp factor changes, accel() prints WARP — "Helm reports WARP %d" — on the way up and on the way down, and prints DEADSTOP, "Helm reports we are at a dead stop, Sir.", on the deceleration step that carries the ship to zero. This is the running progress readout while the engines spool.
- **Port**: backend/src/game/physics/physics-tick.service.ts computes the boundary crossing (line 238, `Math.trunc(speedBefore/1000) !== Math.trunc(accel.newSpeed/1000)`) but uses it *only* to roll the missile-shake threshold; no message is emitted. The only speed announcement is SHIP_SPEED_REPORT on the snap tick (physics-tick.service.ts:277, backend/src/game/physics/speed-events.ts), i.e. SPEEDIS/SPEED0 once at arrival. `grep -rn "DEADSTOP"` and a search for a WARP emitter across backend/src match only canon-messages.generated.ts:304-305.
- **Player sees**: Ordering `war 9` from a standstill produces one acknowledgement and then silence for the ~9 ticks it takes to get there, instead of canon's "Helm reports WARP 1 … WARP 2 …" ladder counting up (and back down when slowing). The pilot has no per-tick feedback on how far the engines have spooled.

## phasers (4)


### [medium] Phaser charge notifications (PHSRUP, PHSRMAX, PHREPR) are never sent

- **Canon** (`GEFUNCS.C:1015-1050 (checkdam); strings at MBMGEMSG.MSG:2145 PHSRUP, :2150 PHSRMAX, :2249 PHREPR`): On every recharge tick canon tells the captain when the bank crosses the firing threshold — `if ((ptr->phasr < PMINFIRE) && (ptr->phasr + preload >= PMINFIRE)) prfmsg(PHSRUP)` (GEFUNCS.C:1035-1039, "Phaser banks are now at minimum fire power, Sir!") — and when it tops out — `if (ptr->phasr >= 100) prfmsg(PHSRMAX)` (GEFUNCS.C:1044-1049, "Phaser banks are at full power, Sir!"). A phaser shot out by randamage sits negative and recovers +1/tick; when it reaches 0 canon prints PHREPR, "Damage Control reports Phasers are now functional Sir!" (GEFUNCS.C:1016-1023).
- **Port**: The reload itself is ported (backend/src/game/combat/combat-tick.service.ts:522-537) and the negative-phasr recovery too (backend/src/game/ship/ship-tick.service.ts:245), but neither emits anything. `PHSRUP`, `PHSRMAX` and `PHREPR` exist only as generated strings in backend/src/game/commands/canon-messages.generated.ts:301,302,324 — they have no MessageId entry in backend/src/game/commands/messages.ts and no emission site anywhere. I grepped backend/src for PHSRUP/PHSRMAX/PHREPR, for the literal phrases "minimum fire"/"full power"/"functional", and for every write to `s.phasr`.
- **Player sees**: After firing, a pilot gets no notice at all that the bank has recharged to firing level or to 100%, and no notice that a shot-out phaser has come back online. The only way to know is to type `rep` repeatedly. In canon these three lines arrive unprompted and are the whole feedback loop of the 36s/18s reload cadence.

### [medium] Hyper-phaser prints none of its own messages — HPFIRED, HPHITM, HPHITU are never emitted

- **Canon** (`GECMDS.C:1037 (HPFIRED), :1074 (HPHITM), :1076 (HPHITU); strings at MBMGEMSG.MSG:3768, 3772, 3776`): `firehp` announces the shot to the firer and sector — `prfmsg(HPFIRED,deg)` "Hyper-Phaser fired at bearing %d, Sir!" — and each hit produces two distinct messages: HPHITM to the firer ("Our Hyper-Phaser caused %s damage to Commander %s's ship!", with damage rendered as a WORD by damstr) and HPHITU to the victim ("Hyper-Phaser hit from Commander %s's ship, caused %s damage, Sir!").
- **Port**: backend/src/game/commands/handlers/phaser.handler.ts:398-460 emits no fired line at all, and pushes an invented line `Hyper-phaser hit on ${candidate.shipname}: hull -${damage}.` (:452-455) plus `'Hyper-phaser fired — no targets in arc.'`. The hit event is tagged `weapon: 'phaser'` (:432), so the victim is routed through `hitText`'s default branch in backend/src/gateway/game.gateway.ts:173-198 and is told "Phaser hit from Commander X's ship" (PHITYOU) rather than HPHITU. HPHITM/HPHITU/HPFIRED appear only in canon-messages.generated.ts:662,663 and 3768's counterpart; no MessageId exists for them.
- **Player sees**: Firing the hyper-phaser produces no confirmation line, hits are reported in modern English with a raw number instead of canon's damstr word, and a ship hit by a hyper-phaser at warp is told it was hit by an ordinary phaser — so it cannot tell the two weapons apart.

### [medium] firehp has no `damage >= 1` gate — the port drops grazing hyper hits entirely

- **Canon** (`GECMDS.C:1063-1082`): Unlike `firep` (which wraps its consequence block in `if (damage >= 1)`, GECMDS.C:975), `firehp` has no such gate. Once a victim is in the 5° beam and inside scanrange, canon unconditionally runs damstr, claims the Cybertron (`wptr->cybmine = usrn`), prints HPHITM/HPHITU, adds the damage, sets `wptr->lastfired`, and battle-locks both ships with FIRETICKS — even when `damage` computed to 0.
- **Port**: backend/src/game/commands/handlers/phaser.handler.ts:428 `if (damage < 1) continue;` skips the whole block, copying the normal-phaser gate onto the hyper path where canon has none.
- **Player sees**: A hyper-phaser shot that grazes a target at long range does nothing in the port: the victim is not battle-locked (so it can jump out immediately), a Cybertron is not pulled onto the shooter, and neither side sees a hit message. In canon that graze still locks both ships for 10 ticks and claims the Cybertron.

### [low] `pha <deg> <focus>` while in hyperspace fires instead of being rejected

- **Canon** (`GECMDS.C:843-862`): In hyperspace (`warsptr->where == 1`) `cmd_phas` accepts exactly `margc == 2` — bearing only. Any other argument count falls to the `else` at GECMDS.C:858-862 and prints HPHAFMT ("Type HELP HYPER for the correct usage.") without firing. Focus is meaningless to the hyper beam, whose width is the fixed HPBEAMW.
- **Port**: backend/src/game/commands/handlers/phaser.handler.ts:132-141 parses an optional focus for both paths, then :151-153 routes to `handleHyper(ship, degree, focus)`, which fires and spends HPFIRAMT flux; focus is carried only into the event payload (:404). HPHAFMT exists in canon-messages.generated.ts:1071 but has no MessageId and is never emitted.
- **Player sees**: A pilot who types `pha 0 3` at warp burns 5000 flux and their hyper-phaser cooldown on a shot canon would have refused with a usage hint.

## planet-economy (3)


### [medium] Planet score uses the BASEPRICE table instead of canon's ITMVAL point-value table

- **Canon** (`GEMAIN.C:1348-1359 (value_pl), GEMAIN.C:563 `value[i] = lngopt(ITMVAL01+i,...)`, GE/REL/MBMGEMSG.MSG:1265-1330`): value_pl scores a planet as `(cash+tax)/(1000000/pltvcash)` plus `value[i] * (qty[i]/pltvdiv)` where `value[]` is the ITMVAL01-14 option family. Canon ships ITMVAL01 {Point Value of man: 10} and ITMVAL02-14 all 0 — population is the ONLY inventory that scores; missiles, torpedoes, ion cannons, flux pods, food, fighters, decoys, troops, zippers, jammers, mines, gold and spies are worth exactly zero points.
- **Port**: backend/src/game/midnight/midnight.repository.ts:113 calls `valuePlanet(planet.cash, planet.tax, planet.itemsQty, BASEPRICE, PLTVCASH, PLTVDIV)` — it passes the trade price table, not the point-value table. The canon table IS extracted and present at backend/src/game/constants/items.ts:120 as `ITEM_VALUE = [10,0,0,...]`, and its own doc comment even flags the mismatch ("This is NOT the same table as BASEPRICE, which is what valuePlanet currently uses"), but grepping backend/src for `ITEM_VALUE` finds only the definition — no consumer. test/game/midnight/value-pl.spec.ts pins the wrong table in place. Nothing in docs/DECISIONS.md records this as deliberate (searched for ITMVAL, value_pl, 'planet value').
- **Player sees**: Leaderboard position (`ros`, `rep`, team scores) is computed from the wrong quantities. Men score 2 points per 10,000 instead of canon's 10 — a million-colonist world is worth 200 points instead of 1,000 — while stockpiled war materiel, which canon deliberately makes worthless for score, now dominates: a planet at the fighter cap (579,332 x baseprice 50 / PLTVDIV 10,000) is worth ~2,850 points on its own, more than fourteen maxed colonies. The optimal play becomes hoarding fighters and missiles rather than growing population, which is the inverse of what canon rewards.

### [medium] A planted spy never files an intelligence report (SPYM2)

- **Canon** (`GEPLANET.C:146-183 (second half of check_spy); message SPYM2`): After the capture roll, check_spy rolls `gernd()%10 == 0`; on a hit it picks a random stocked item (up to 10 tries for a slot with qty > 0), computes a confidence rating `50.0+rndm(48.0)`, fuzzes the count by that factor (`d_rptcnt = d_itemcnt - (d_itemcnt*rndm(d_odds)) + (d_itemcnt*rndm(d_odds))`) and mails the spy's owner a TOP SECRET/EYES ONLY 'Intelligence Report' (SPYM2) naming the planet, sector, confidence percentage, item and the estimated quantity.
- **Port**: backend/src/game/planet/spy.ts implements only the removal half — its own header comment says so ("The removal half of `check_spy`") and its result type is limited to own-planet | caught | none. backend/src/game/planet/planet-economy.service.ts:82-96 acts on that result and sends only SPYC1/SPYC2. `grep -rn 'SPYM2\|TOP SECRET\|confidence' backend/src` matches nothing outside canon-messages.generated.ts:1050, where the string is generated and then never referenced. docs/DECISIONS.md 'Decision 6' deferred check_spy to feature 006; the capture half was later implemented, this half was not, and no decision records dropping it. The 2026-05-07 D3 entry covers a different mechanism (exact inventory revealed on `scan pl` when you are in the sector), not the periodic remote report.
- **Player sees**: A player who spends a spy gets no mail, ever. Canon's spy is a remote passive intelligence source that trickles in fuzzed reserve figures with a stated confidence rating from anywhere in the galaxy; the port's spy only widens what `scan pl` shows when you fly back to that sector yourself — and shows it exactly, with no confidence rating, so the 'questionable source' flavour and the risk/accuracy trade-off never appear.

### [medium] Revolted (**Free**) planets keep rolling for further revolts

- **Canon** (`GEPLANET.C:341 `if (!sameas(plptr->userid,"**Free**"))``): The whole revolt block — tax-pressure test, the 1-in-10 roll, the troop massacre, the MESG30 distress mail and the ownership flip — is wrapped in a test that excludes a planet already marked "**Free**". Once a colony has thrown off its ruler it keeps producing and feeding its people but can never revolt again until someone claims it.
- **Port**: backend/src/game/planet/planet-economy.service.ts:100 gates the revolt branch on `if (next.userid === null) return` only. FREE_PLANET_OWNER ('**Free**') is not null, so a revolted planet re-enters the branch on every subsequent PLANTOCK; the file has a `hasRealOwner()` helper (planet-economy.ts:64, used correctly for the tax levy) that is not applied here. Nothing in docs/DECISIONS.md covers it.
- **Player sees**: A revolted world keeps its old taxrate, so it repeatedly re-rolls: its garrison is cut by another 1/(2..9) roughly every tenth tick until it is effectively demilitarised, making a reclaimed colony far easier to take and cheaper to hold than canon intends. Each roll also writes a MailStat row addressed to the literal userid '**Free**' — dead mail no player can read (swept by the '*'-prefix purge at midnight).

## sensors (4)


### [medium] `sca ra` never plots mines — the mine loop was ported onto `sca lo` instead

- **Canon** (`reference/ge-source/GECMDS.C:2529-2545 (scan_ra); GECMDS.C:2686-2721 (scan_lo has no mine loop)`): `scan_ra` walks the whole live mine table (`for (i=0,mptr=mines; i<nummines; ...)`, `if (mptr->channel != 255)`), projects each mine through the same xfactor/yfactor as ships and writes `map[y][x]='.'`. `scan_lo` contains no mine loop at all — its only projection loop is over ships at :2686.
- **Port**: backend/src/game/commands/handlers/scan.handler.ts:509-597 `handleRangeScan` projects scantab ships and the self-cell only; there is no MineRegistry iteration anywhere in it. The mine loop instead sits in `scanLo` at scan.handler.ts:349-357, whose comment cites "GECMDS.C:2529-2545" — scan_ra's lines. I grepped the whole handler for `mineRegistry` (hits at scan.handler.ts:352 in scanLo and :653 in handleSectorScan only) and for `'mine'`/`MINE_SLOT_FREE` across backend/src to be sure no other code adds mine cells to a `kind: 'ra'` render.
- **Player sees**: The zoomable tactical scan — the one mode a pilot uses to pick a way through a minefield, since it is the only one with adjustable range — shows no mines at all, so a player closing on a mined approach sees clean space. Meanwhile the long-range overview shows mines the original never plotted there.

### [medium] `sca lo` only shows ships the scantab already holds, so the long-range scan reveals nothing `sca ra` does not

- **Canon** (`reference/ge-source/GECMDS.C:2686-2720 (scan_lo); contrast GECMDS.C:2816-2824 (update_scantab's `ddistance < scanrange && wptr->cloak < 10` gate)`): `scan_lo` never calls `update_scantab`. It loops every ship in the game (`for (othusn=0; othusn<nships; othusn++) if (ingegame(othusn))`) and plots any whose projected cell lands inside the 30×15 window at 10× scanrange — with no scan-range test and no cloak test — as '+' (auto) or '=' (manual).
- **Port**: backend/src/game/commands/handlers/scan.handler.ts:326-401 `scanLo` (and :415-490 `scanLoFull`) call `buildScantab(ship, allShips, prevScantab, scanRange)` and iterate only its entries; buildScantab (backend/src/game/commands/handlers/helpers/scantab.ts) applies canon's `dist < scanRange && cloak < 10` detection gate. The code comment at scan.handler.ts:336-338 claims it "additionally projects ships up to 10× scanRange that are NOT cloaked", but no such loop exists — every plotted cell comes from the scantab. docs/DECISIONS.md 015-scan-modes D1 covers only the glyph substitution, not the visibility gate; I grepped DECISIONS.md for scan_ra/sca lo/scanfull and found nothing on detection range.
- **Player sees**: `sca lo` — the command the welcome text tells a new pilot to type — plots exactly the same ships as `sca ra 1`, just spread over a 10× wider window, so distant contacts and cloaked ships that canon shows on the long-range plot are simply absent. Ten times the range buys no extra information.

### [medium] The SCANFULL option does nothing on `sca ra`; the side panel was moved to an invented `sca lo full`

- **Canon** (`reference/ge-source/GECMDS.C:2571-2574 (`if (waruptr->options[SCANFULL]) printmapfull(); else printmap();`), GECMDS.C:3019-3080 printmapfull, GECMDS.C:2646-2660 (scan_lo returns SCANFMT unless margc==2)`): SCANFULL is read in exactly one place — the tail of `scan_ra` — where it swaps `printmap` for `printmapfull`, which draws the grid with a per-row legend of letter, distance, bearing, heading and speed (plus a name row when SCANNAMES is on). `scan_lo` has no SCANFULL branch and rejects any argument beyond `sca lo` with SCANFMT.
- **Port**: backend/src/game/commands/handlers/scan.handler.ts:509-597 `handleRangeScan` reads `ship.scanHome` for the overwrite mode but never reads `ship.scanFull`, and emits `scanRender` with no `sidePanel`. The only side-panel producer is `scanLoFull` (scan.handler.ts:415-490), reached from scan.handler.ts:286-291 by the port-only syntax `sca lo full`. `set scanfull on` is accepted and persisted (set.handler.ts:93-100, ship-state.service.ts:155) but I grepped backend/src for `scanFull` and it is read nowhere in the scan path.
- **Player sees**: A player who types `set scanfull on` sees no change to `sca ra` — no letter/distance/bearing/heading/speed legend beside the map, ever. To get the legend they must instead use `sca lo full`, a form the original answers with the SCANFMT usage message.

### [low] Bare `loc` cannot clear a fire-control lock, and LOCK01 is never printed

- **Canon** (`reference/ge-source/GECMDS.C:5070-5078 (`if (margc == 1) { warsptr->lock = -1; prfmsg(LOCK01); ... return; }`); reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG:5839 `LOCK01 {*** Fire control Lock removed!``): `loc` with no argument sets `lock = -1` and prints LOCK01, "Fire control Lock removed!" — the player's way to drop a target.
- **Port**: backend/src/game/commands/handlers/lock.handler.ts:39 declares `minArgs: 1` with `argMissingMessage: LOC_FMT`, so a bare `loc` returns the usage text and never reaches the handler; there is no clear path. `LOCK01` exists in canon-messages.generated.ts:1015 but I grepped backend/src for LOCK01 and for any other unlock verb (`unl`, `unlock`, NOLOCK_SENTINEL outside find-ship.ts) — the sentinel is only written on a stale-target lazy clear at lock.handler.ts:83, never on player request.
- **Player sees**: Once locked, a pilot cannot deliberately release the lock; `loc` alone answers with a usage line, and the "Fire control Lock removed!" confirmation never appears.

## session-lifecycle (3)


### [medium] No arrival broadcast when a captain boards and enters the game (ANNOUN / ENTWAR)

- **Canon** (`reference/ge-source/GEFUNCS.C:153-176 (tossingegame); message text at reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG:2672 (ENTWAR) and :2714 (ANNOUN)`): Every time a player boards a ship and enters the arena, `tossingegame` prints ANNOUN — "*** Hyperspace Transmission: The <class>, The <shipname> has been detected cruising the galaxy. <end trans>" — with `outwar(FILTER,usrnum,0)`, i.e. to EVERY ship in the game, and ENTWAR — "*** A <class> The <shipname> just appeared in this star system!" — with `outsect(FILTER,&coord,usrnum,0)`, i.e. to every ship in the arrival sector. Both are gated on `warsptr->cloak != 10`, so a fully cloaked hull enters silently.
- **Port**: backend/src/gateway/game.gateway.ts:485-573 `boardShipAndWelcome` emits only `client.emit('command:result', ... 'Welcome aboard, <shipname>.')` to the arriving player plus `client.broadcast.emit('player.joined', ...)` — a roster/UI event, not a game log line. No `event.log` is pushed to the sector room or to all players. Searched the whole backend/src tree for `ENTWAR`, `ANNOUN`, `just appeared`, `Hyperspace Transmission`: the only hits are the string table backend/src/game/commands/canon-messages.generated.ts:411 and :418. Neither id exists in the MessageId enum (backend/src/game/commands/messages.ts), so nothing can emit them. There is also no cloak==10 suppression, because there is no announcement to suppress.
- **Player sees**: Nobody in the galaxy — or even in the same sector — is told when another captain logs in and materialises next to them. In canon a pilot sitting in a sector watches ships arrive in their event log and hears the galaxy-wide hyperspace transmission naming class and ship; in the port an enemy can appear on your scan with no notice at all. The port implements the mirror-image case (exit.handler.ts broadcasts EXIWAR2 to the sector), which makes the missing arrival half more conspicuous: you see people leave but never see them come.

### [medium] New ships spawn with 65,000 energy instead of canon's 50,000

- **Canon** (`reference/ge-source/GEFUNCS.C:227 — `tmpshp.energy = 50000L;` inside `initshp``): `initshp` hard-codes a new hull's starting energy at 50000, which is deliberately BELOW the ENGYMAX ceiling of 65000 (GEMAIN.H:90). ENGYMAX is the cap that `flux` refills to (GECMDS.C flux), not the value a ship is created with — canon starts a captain at roughly 77% of a full tank, so the first flux pod is a real gain.
- **Port**: backend/src/game/onboarding/onboarding.service.ts:145 sets `energy: ENGYMAX` (65000, backend/src/game/constants.ts:357) on ship creation. Every other initshp field on the same block is annotated with the correct GEFUNCS.C line (phasr 100 @:222, shieldtype 1 @:233, phasrtype 1 @:234), so this one field was taken from the wrong constant. Searched docs/DECISIONS.md for a recorded deviation on starting energy — none; the only related note is docs/PROGRESS.md:1078 F-007, which corrected the ENGYMAX *cap* 50000→65000 and appears to have propagated 65000 into the spawn value too. The same value is used by the `new ship <N>` purchase path (backend/src/game/commands/handlers/new-ship.handler.ts uses the same onboarding loadout).
- **Player sees**: A brand-new captain (and every purchased hull) starts with 30% more energy than canon: 65,000 vs 50,000. That is roughly 400 extra units of rotation (ROTENGUSE 30) or 100 extra units of acceleration (ACCENGAMT 120) of free manoeuvring, and it makes the three starting flux pods less meaningful because the first one restores a tank that is already full.

### [low] A clean logoff prints nothing to the sector — WARHUP is never emitted

- **Canon** (`reference/ge-source/GEMAIN.C:1424-1425 (warhupa); message text at reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG:2074`): On a hangup with `cantexit == 0`, `warhupa` does `prfmsg(WARHUP,username(warsptr)); outsect(ALWAYS,&warsptr->coord,usrnum,0);` before saving — every ship in the departing player's sector sees "*** Commander <name>'s ship just vanished!!". Note `ALWAYS`, not `FILTER`: it bypasses the message filter, so even a player with messages filtered gets it.
- **Port**: backend/src/gateway/game.gateway.ts:577-706 `handleDisconnect`. The kill branch (`cantexit > 0`) is faithfully ported, but the else branch at :689-700 only calls `shipStateService.unboard(...)` and then `this.server.emit('player.left', { shipId })` — a roster event with no text. No `event.log` goes to `sector:x:y`. Grepped backend/src for `WARHUP` and `vanished`: the only hit is canon-messages.generated.ts:288; `MessageId.WARHUP` does not exist.
- **Player sees**: You are in a sector with another captain; they close the tab and their ship silently disappears from your scan with no explanation. Canon tells you their ship vanished, and names the commander. Combined with the finding above, a sector in the port gives no narration for anyone entering or leaving the game, only for the deliberate `x` exit.

## ships (4)


### [medium] `maint` works at uncolonized planets — canon requires an established colony

- **Canon** (`GECMDS.C:4485-4490 (`if (plptr->userid[0] == 0 || plptr->items[I_MEN].qty < 25000L)` → `prfmsg(MAINT8)`)`): cmd_maint refuses with MAINT8 ("Sorry this planet has not established a repair facility.") when the planet has NO OWNER at all, independently of its population. That first clause is load-bearing because canon seeds wild planets with a random population: GEPLANET.C:623 `planet.items[I_MEN].qty = (unsigned long)rndm(50000.0)` while GEPLANET.C:591 sets `planet.userid[0] = 0`. So roughly half of all unowned planets in canon are above the 25,000 threshold and canon still refuses them — repair depots only exist where someone has colonized.
- **Port**: backend/src/game/ship/maintenance.service.ts:70-72 evaluates only `const men = planet ? Number(planet.items[0]?.qty ?? 0n) : 0; if (!planet || men < MAINT_MIN_POPULATION) return { ok: false, reason: 'no-facility' };` — planet.userid is never consulted anywhere in evaluateGates. The port reproduces canon's population seeding faithfully in backend/src/game/galaxy/planet-seed.ts:49 (`itemsQty[I_MEN] = BigInt(Math.floor(rng.next() * 50_000))`), so the unowned-but-populous planets exist here too. I grepped maintenance.service.ts, maint.handler.ts and mai.handler.ts for `userid`, `owner`, `colon` and `MAINT8`; the ownership clause appears nowhere, and docs/DECISIONS.md records nothing about it (its only maint entries are D3/D4 about the password gate ordering and the mai/rea split).
- **Player sees**: A damaged captain can orbit almost any random wild planet in the galaxy and pay 200 credits for a full repair. In canon, repairs are only available at a colonized world (yours or someone else's, subject to its trade password) or at Zygor/Tahanian for 2,500 — which is what makes damage a reason to fly home and what makes a colony worth holding. The port removes that constraint entirely and never prints MAINT8.

### [medium] Repair completion and combat-interrupt messages (MAINT7, MAINT10) are never sent

- **Canon** (`GEFUNCS.C:399 `prfmsg(MAINT10)` and GEFUNCS.C:422 `prfmsg(MAINT7)` inside repairship`): repairship tells the captain how the job ended. When the queue drains it prints MAINT7 — "Repairs and general maintenance have been completed Sir!" (MBMGEMSG.MSG:3857) — at the same moment it restores phasr/tactical/helm/firecntl/shield/topspeed. When `cantexit > 0` it prints MAINT10 — "The Maintenance Team reports that they have ceased work under the conventions of their union contract…" (MBMGEMSG.MSG:3871) — and zeroes `repair`.
- **Port**: backend/src/game/ship/ship-tick.service.ts:193-224 implements both branches' STATE changes exactly (repair=0 on cantexit; the seven-field restore on completion) but emits nothing on either path — the block contains no `events.emit` and no MessageId, unlike the overspeed and shield-charge blocks in the same file which do emit. MessageId has no MAINT7 or MAINT10 member at all: `grep -rn 'MAINT7|MAINT10' backend/src --include=*.ts` matches only canon-messages.generated.ts:680 and :683, never messages.ts or any handler/service.
- **Player sees**: Repairs finish in total silence. The captain has no way to know the job is done other than re-running `rep`, and when a shot lands mid-repair the paid-for maintenance is silently cancelled — the crew never says the yard walked off, so the player keeps waiting for a repair that will never complete and only discovers it by checking REP18A and finding the counter gone.

### [medium] Damage Control never announces subsystems coming back online (PHREPR, TAREPR, HLREPR, FCREPR), nor phaser charge milestones (PHSRUP, PHSRMAX)

- **Canon** (`GEFUNCS.C:1021 (PHREPR), :1037 (PHSRUP), :1046 (PHSRMAX), :1059 (TAREPR), :1070 (HLREPR), :1080 (FCREPR) — all in checkdam`): checkdam narrates every recovery as it happens: when `phasr` climbs back to 0 it prints PHREPR ("Damage Control reports Phasers are now functional Sir!"), when tactical reaches 0 TAREPR, when helm reaches 0 HLREPR, when firecntl reaches 0 FCREPR. It also announces the phaser bank crossing PMINFIRE (PHSRUP) and reaching 100 (PHSRMAX).
- **Port**: The recovery arithmetic is present and correct but wordless. backend/src/game/ship/ship-tick.service.ts:238-254 increments tactical/helm/phasr toward 0 and decrements firecntl inside a single `shipState.mutate` with no message on any transition to 0. The phaser bank reload is backend/src/game/combat/combat-tick.service.ts:521-536, which does `s.phasr = Math.min(100, s.phasr + reloadAmt)` and emits nothing at the PMINFIRE crossing or at 100. `grep -rn 'PHREPR|TAREPR|HLREPR|FCREPR|PHSRUP|PHSRMAX' backend/src --include=*.ts` hits only canon-messages.generated.ts — none of the six is in MessageId or referenced by any handler or tick service.
- **Player sees**: After a fight that knocks out the helm, tactical display or fire control, the captain gets the BROKE refusals (those are implemented in rotate/torpedo/missile handlers) but is never told when the system comes back — the only way to find out is to keep retrying the command until it stops refusing. Likewise a player waiting to fire again gets no "phasers back to minimum firing power" or "phasers at 100%" cue and must poll `rep wpns`.

### [low] `new` is accepted at any neutral-zone planet, not only Zygor

- **Canon** (`GECMDS.C:4557 `if (neutral(&warsptr->coord) && plnum == 1)` … GECMDS.C:4720 `prfmsg(NEW5)``): cmd_new gates the ENTIRE command — ship purchase, phaser upgrade and shield upgrade alike — on being in orbit around planet 1 of sector 0,0, which is Zygor (MBMGEMSG.MSG:559 `S00P1NM {Zygor}`). Orbiting any of the other five neutral-zone planets (Tahanian Station, Enforcer Planet, Kayriez Portal, Lydorian Portal, Murdonian Portal) falls to the else branch and prints NEW5, "Sir, we must be in orbit around Zygor in Sector 0 0 to get new equipment."
- **Port**: backend/src/game/commands/handlers/new-ship.handler.ts:176-190 (purchaseShip) and :330-336 (handleUpgrade) both check only `Math.floor(ship.xcoord) !== 0 || Math.floor(ship.ycoord) !== 0` and `ship.where < 10`. Neither derives `plnum = ship.where - 10` nor compares it to the Zygor index. The port knows the index — backend/src/game/ship/maintenance.service.ts:9-10 defines `ZYGOR_PLNUM_1 = 0` for exactly this purpose — but the new-ship handler never imports or reproduces it, and MessageId has no NEW5 (grep for NEW5/NEW1 outside canon-messages.generated.ts returns nothing; the handler emits invented English strings instead).
- **Player sees**: A player can buy a new hull or fit a Mark-N phaser or shield while orbiting Tahanian Station or the Enforcer Planet. In canon the shipyard exists only at Zygor and every other NZ planet answers NEW5, which is what gives Zygor its identity as the one place you outfit a ship.

## spy-admin (4)


### [medium] `sys` is ungated — any player can run the sysop command, and `sys unjam` cancels being jammed

- **Canon** (`reference/ge-source/GECMDS.C:4752-4760 (with GEMAIN.C:466-467, MBMGEMSG.MSG:197 SYSCMDS, :202 SYSONLY)`): cmd_sysop's first act is `if ((!syscmds) || (sysonly && !(usrptr->flags&ISYSOP))) { prf("Huh?\r"); return; }`. Both options ship YES, so on a stock game only a MajorBBS sysop may use `sys` at all; every other player gets "Huh?". `sys unjam` (GECMDS.C:4911-4916) then clears `warsptr->jammer`, the *victim-side* counter another ship's `jam` writes.
- **Port**: backend/src/game/commands/handlers/sys.handler.ts:14-41 has no privilege check of any kind, and backend/src/game/commands/commands.module.ts:226 registers the command unconditionally for every bound ship. `sys unjam` calls `shipState.mutate(... s.jammer = 0)` for the caller. I grepped backend/src for `SYSCMDS`, `SYSONLY`, `isSysop`, `ISYSOP` and any guard around the router registration: SYSCMDS and SYSONLY are absent from game-config.ts and config/game.config.json, and no guard exists.
- **Player sees**: `jam` is supposed to blind everyone in range for JAMTIME ticks (jammer.handler.ts:61-64). In the port any jammed player just types `sys unjam` and the jamming ends instantly and for free, so the jammer weapon has a universal one-word counter. In canon that command answers "Huh?" for them.

### [medium] The spy never sends an intelligence report — the SPYM2 half of check_spy is missing

- **Canon** (`reference/ge-source/GEPLANET.C:147-186 (called each planet tick from GEMAIN.C:2137)`): After the capture roll, `check_spy` rolls `gernd()%10 == 0`; on a hit it picks a random stocked item (up to 10 draws), computes a confidence rating `50.0+rndm(48.0)`, deviates the true quantity by that factor, and mails the spy's master SPYM2 ("Classification: TOP SECRET/EYES ONLY … Planatary Reserves of %s - %s … %d% confidence rating") with topic "Intelligence Report", class MAIL_CLASS_DISTRESS.
- **Port**: backend/src/game/planet/spy.ts:41-54 implements only the own-planet and 'caught' outcomes and returns 'none' otherwise; backend/src/game/planet/planet-economy.service.ts:83-98 acts on those two outcomes and nothing else. I grepped backend/src for SPYM2, 'confidence', 'Intelligence Report' and 'intel': SPYM2 exists in canon-messages.generated.ts:1050 but is never referenced by any code path.
- **Player sees**: A player who spends a spy on an enemy colony never receives the periodic TOP SECRET reserve report in their mailbox — the only in-canon payoff of the item other than the risk of it being executed. (The port's `sca pl` inventory reveal is a documented deviation, DECISIONS.md 2026-05-07 D3, but it is exact and instant, so the confidence rating and the deviated figure canon reports never appear at all.)

### [low] Admin menu item 4, "Rename planet", has no equivalent — a colony's name is fixed at claim time

- **Canon** (`reference/ge-source/GEMAIN.C:3041-3043 (case '4': prfmsg(ADMENU2G); substt = ADMENU1A) with GEMAIN.C:2947-2981 mnu_admenu1a`): Selecting 4 from the Planet Administration Menu prints ADMENU2G ("Enter the new name ---") and re-enters `mnu_admenu1a`, which uppercases the first letter, writes up to 19 chars into `plptr->name`, persists the planet and redisplays the menu. The owner can rename an owned colony as often as they like.
- **Port**: backend/src/game/commands/handlers/admin.handler.ts:127-180 switches on rate/markup/sellflag/reserve/tax/beacon/password only; anything else falls to `usageError()`, and ADMIN_USAGE (lines 25-33) lists no rename. `AdminChange` in backend/src/game/planet/planet-state.types.ts has no name variant. I grepped backend/src for ADMENU2G, 'renamePlanet' and planet-scoped rename: ADMENU2G exists in canon-messages.generated.ts:491 and is never used; rename.handler.ts renames the ship only.
- **Player sees**: Typing `adm rename <name>` (or `adm 4`) on your own colony answers "Invalid value." plus the usage list. The name typed during the one-time claim prompt is permanent for the life of the colony.

### [low] The accounting report drops canon's "Sold" column and hides items that are out of stock with no rate

- **Canon** (`reference/ge-source/GEMAIN.C:2996-3016 (ADMIN01/ADMIN02 header 'Item Rate Qty Price Resv S Sold', then `for (i=0; i<NUMITEMS; ++i)` printing rate, qty, markup2a, reserve, sell and sold2a)`): Menu item 1 prints one row for every one of the NUMITEMS slots unconditionally, with six numeric columns including `plptr->items[i].sold2a` — the running units-sold counter — under the 'Sold' heading.
- **Port**: backend/src/game/commands/handlers/admin.handler.ts:88-98 does `if (qty === 0 && item.rate === 0) continue;` and formats only name/qty/rate/price/sell/reserve. `sold2a` is carried in state and persisted (backend/src/game/planet/planet-state.types.ts:14, planet-state.mappers.ts:18,74) but I found no read of it anywhere in a handler or report — grepping backend/src for `sold2a` returns only those three type/mapper lines.
- **Player sees**: An owner can never see how much of each commodity their colony has actually sold to visiting traders, and an item they have priced and reserved but currently hold none of vanishes from the report entirely, so they cannot verify or correct its settings without re-issuing the command blind.

## trade (4)


### [medium] Gold's half-ton weight is rounded up to 1 in the buy capacity gate, halving how much gold a hold can take

- **Canon** (`GEFUNCS.C:2541-2557 (chkweight); MBMGEMSG.MSG ITMWT13 {Weight of 100 Gold: 50}`): chkweight accumulates `(wptr->items[i]*weight[i])/100L` and adds `(amt*weight[itm])/100`, comparing the total against `shipclass[...].max_tons`. Gold's weight option is 50 per 100 units, i.e. 0.5 tons each, so an empty 1,000-ton hull can legally take 2,000 gold.
- **Port**: backend/src/game/planet/planet-trade.ts:57-60 `unitsThatFit()` computes `Math.floor(remainingTons / Math.max(1, tonsEach))`. The `Math.max(1, …)` floor turns gold's 0.5 into 1, so only 1,000 units fit in 1,000 tons. ITEM_TONS[I_GOLD] is correctly 0.5 (backend/src/game/constants/items.ts:112) and is used correctly for `usedTons` in buy.handler.ts:80-84 and for the `tra up` check in transfer.handler.ts:113-120 — the rounding exists only in this one helper, which both `buy` and `pri` route through. Searched: ITEM_TONS, unitsThatFit, chkweight, capacityRemaining across backend/src.
- **Player sees**: With an empty 1,000-ton Interceptor at Zygor-3, `buy 2000 gol` is refused with "Sorry Sir! That would put us overweight." (BUY8) even though canon fills the hold exactly; `pri 2000 gol` gives the same false refusal. Every gold run carries half the cargo the original allowed, halving the main money-making loop's throughput. Gold is the only item with sub-1-ton weight, so it is the only one affected.

### [medium] TRANSOPT is shipped YES, so canon lets anyone `tra down` onto a planet they do not own; the port always refuses

- **Canon** (`GECMDS.C:3323 `if (trans_opt || sameas(plptr->userid,warsptr->userid))`; GEMAIN.C:465 `trans_opt = ynopt(TRANSOPT)`; GE/REL/MBMGEMSG.MSG:191 `TRANSOPT {Allow goods transfers to planets not owned? YES} B``): trans_down's ownership gate is disjunctive with the sysop option trans_opt, and the shipped option database sets it to YES. In the shipped configuration any pilot in orbit can unload cargo onto any planet (wormholes excepted); the TRANSFR4 "We don't own this planet" refusal is only reachable if a sysop turns TRANSOPT off.
- **Port**: backend/src/game/planet/planet-state.service.ts:617-637 `depositToPlanet` returns `NOT_OWNER` whenever `state.userid !== requesterUserid` — unconditional, with no TRANSOPT equivalent anywhere. Grepped backend/ for TRANSOPT/trans_opt/transOpt: the only hit is the generated message text at canon-messages.generated.ts:38; no option is read. Not listed in docs/DECISIONS.md (D1 there covers the ship-to-ship addition and states `tra up|down` against the orbited planet is implemented, not that the ownership rule was changed).
- **Player sees**: `tra down 100 foo` while orbiting an ally's or an unclaimed world is refused, so players cannot resupply a team-mate's colony, stock a planet before claiming it, or dump cargo anywhere but their own worlds. In the original that transfer succeeds and prints "100 food cases have been transferred to the planet Sir!"

### [medium] BUY4 is never emitted: a planet that has an item switched off answers "I don't understand the command"

- **Canon** (`GECMDS.C:4390-4393 `else { prfmsg(BUY4,item_name[item]); }`; MBMGEMSG.MSG BUY4 = "They are not selling their %s, Sir!"; BUY5 = "Sorry Sir, I don't understand the command." (GECMDS.C:4394-4397, the `amt <= 0` branch)`): In buy(), the `sell != 'Y'` branch prints BUY4 naming the item; BUY5 is a different branch, reached only when the quantity parses as <= 0.
- **Port**: buy.handler.ts:112-113 maps `SELL_FLAG_OFF` to `MessageId.BUY5`, and price.handler.ts:134 does the same. `MessageId.BUY4` is declared (messages.ts:151) and wired to the canon string (messages.ts:657) but no handler ever emits it — grepped `BUY4` across backend/src: only the declaration, the mapping, and a doc comment in price.handler.ts:17.
- **Player sees**: Asking a planet for a commodity its owner has flagged not-for-sale returns "Sorry Sir, I don't understand the command." — reading as a syntax error — instead of "They are not selling their torpedos, Sir!". The pilot cannot tell a typo from a closed market.

### [low] The transfer not-owner refusal prints "We are not in orbit" instead of "We don't own this planet"

- **Canon** (`GECMDS.C:3348 (trans_down else → TRANSFR4) and GECMDS.C:3411 (trans_up else → TRANSUP4); MBMGEMSG.MSG TRANSFR4/TRANSUP4 = "Sorry Sir! We don't own this planet."`): When the ownership gate fails, canon prints TRANSFR4 / TRANSUP4 — "Sorry Sir! We don't own this planet." TRANSFR3 is a different message, printed only at the top of cmd_transfer when `warsptr->where < 10`.
- **Port**: backend/src/game/commands/messages.ts:870 maps `TRAN_NOT_OWNER` to `CANON_MESSAGES.TRANSFR3` ("Sorry Sir! We are not in orbit."), and transfer.handler.ts:82-84 and :139-143 emit it for the ownership failure on both `tra down` and `tra up`. TRANSFR4 and TRANSUP4 exist in canon-messages.generated.ts:461,466 but are referenced nowhere in backend/src (grepped). The `tra up` path is reachable in canon terms — trans_up requires owner or an unowned planet regardless of TRANSOPT — so this is not merely a consequence of the gap above.
- **Player sees**: `tra up 50 tro` while orbiting someone else's colony answers "Sorry Sir! We are not in orbit." — a flatly untrue statement about the ship's state — instead of telling the pilot the planet is not theirs. Two canon messages never appear.

## planets-cmds (4)


### [low] Planet rename (admin menu option 4) is not implemented

- **Canon** (`reference/ge-source/GEMAIN.C:3033-3035 (mnu_admenu2 case '4': prfmsg(ADMENU2G); substt = ADMENU1A) with the rename applied at GEMAIN.C:2947-2960 (mnu_admenu1a writes plptr->name and flushes the record); menu text at GE/REL/MBMGEMSG.MSG ADMENU2 "4 - Rename planet", prompt ADMENU2G "Enter the new name ---"`): An owner in orbit picks 4 from the Planet Administration Menu, is prompted "Enter the new name", and the same routine that named the planet at claim time (mnu_admenu1a) overwrites plptr->name, capitalises the first letter, truncates to 19 chars and writes the record. Renaming is reachable at any time, as often as the owner likes.
- **Port**: backend/src/game/commands/handlers/admin.handler.ts:26-33 (ADMIN_USAGE) offers only rate/markup/sellflag/reserve/tax/beacon/password; the switch at :126-176 has no rename case and falls through to usageError(). backend/src/game/planet/planet-state.types.ts:56-63 AdminChange has no `name` variant, and applyAdminChange (planet-state.service.ts:441-528) never touches state.name. backend/src/game/commands/handlers/rename.handler.ts renames the SHIP only (delegates to onboarding/rename.service). I grepped backend/src for `renamePlanet`, `rename.*planet`, `ADMENU2G`, and `state.name =` — the only writer of PlanetState.name is claim() at planet-state.service.ts:246.
- **Player sees**: A captain who mistypes their colony's name at claim time is stuck with it permanently — the only way to change it is to abandon the planet and re-claim it (which risks losing it and resets nothing else). Worse, the port's own generated help still advertises the feature: backend/src/game/commands/help/canon-help.generated.ts:483 prints "4 - Rename planet", so `hel adm` promises a command that does not exist.

### [low] `orb` from hyperspace is allowed; ORBIT4 is never emitted

- **Canon** (`reference/ge-source/GECMDS.C:770-774 — `if (warsptr->where == 1) { prfmsg(ORBIT4); outprfge(...); return; }`; GE/REL/MBMGEMSG.MSG:2852 ORBIT4 {We cannot obtain an orbit from hyperspace Sir!`): cmd_orbit tests the hyperspace flag (`where == 1`) BEFORE the already-in-orbit test and before any planet lookup, and refuses outright with ORBIT4. A ship at warp can never enter orbit, regardless of how close it passes to a planet.
- **Port**: backend/src/game/commands/handlers/orbit.handler.ts:43-45 checks only `ship.where >= 10` (already in orbit) and then proceeds straight to the sector planet list and the 250-unit range test at :101. There is no `ship.where === 1` branch. `grep -rn "ORBIT4" backend/src` finds it only in game/commands/canon-messages.generated.ts:448 — no handler references it, and MessageId has no ORBIT4 entry (messages.ts:121-126 has ORBITALR/ORBITNO/ORBITPK/ORBIT_TOO_FAR only). The port does model the flag elsewhere (decoy.handler.ts:77 `ship.where === 1`, cyb-decisions.ts:307), so this is an omission in orbit specifically.
- **Player sees**: A captain at warp who passes within 250 units of a planet can drop into orbit mid-flight (the handler then zeroes speed and speed2b), instead of being told "We cannot obtain an orbit from hyperspace Sir!". In the near-miss case they instead get "We must be much closer to establish an orbit Sir!", which tells them the wrong thing about why it failed.

### [low] Item markup and reserve accept values far above canon's 32000 ceiling

- **Canon** (`reference/ge-source/GEMAIN.C:3159-3161 (mnu_admenu2f2: `if (margc == 1 && amt <= 32000) { titems[usrnum].markup2a = amt; ... }` else re-prompt ADMEN2F2) and GEMAIN.C:3192-3196 (mnu_admenu2f4: same `amt <= 32000` guard before setting reserve)`): Both the per-item sale price and the stockpile reserve are unsigned 16-bit fields and canon refuses any entry above 32000, re-prompting with ADMEN2F2 / ADMEN2F4 rather than storing the value.
- **Port**: backend/src/game/commands/handlers/admin.handler.ts:135-142 (markup) and :154-161 (reserve) validate with `parseUint32(...)` and only reject `undefined`; parseUint32 (backend/src/game/commands/validators.ts:37-43) accepts anything up to 0xFFFFFFFF. PlanetStateService.applyAdminChange (planet-state.service.ts:472-478 markup, :485-491 reserve) checks only `value < 0` and the item index — no upper bound. The taxrate case immediately below (:494-499) does enforce its canon ceiling, so the omission is specific to these two. I grepped for `32000` and `0x7d00` across backend/src: no occurrence.
- **Player sees**: A colony owner can run `adm markup gold 999999999` or `adm reserve food 500000` and the port answers "Setting saved." Visiting captains are then quoted (and charged, via the buy path that reads markup2a) prices canon makes impossible, and an absurd reserve locks the whole stock out of sale permanently. In canon both entries bounce back to the prompt.

### [low] `orb <n>` ignores the planet number when the sector holds exactly one planet

- **Canon** (`reference/ge-source/GECMDS.C:785-816 — plnum is always taken from margv[1], `getplanetdat` returns FALSE when `plnum > sector.numplan` (GEMAIN.C:1800, 1834-1837), and cmd_orbit then prints FOOLISH (GECMDS.C:810-813); a wormhole slot prints ORBIT0 (GECMDS.C:791-794)`): The number the pilot types is always the slot that is looked up. Naming a slot that is a wormhole gives ORBIT0; naming a slot that does not exist gives FOOLISH. Canon never substitutes a different planet.
- **Port**: backend/src/game/commands/handlers/orbit.handler.ts:62-64 — `if (planets.length === 1) { targetPlnum = planets[0].plnum; }` — the args array is never consulted on that path, so the wormhole check at :78-84 and the not-found re-prompt at :86-92 are both skipped. Only the multi-planet branch parses the argument. Sectors routinely mix one planet with wormholes (GEPLANET.C:487-490 assigns PLTYPE_WORM per slot in the same numbering run), and `sca pl` numbers wormholes alongside planets.
- **Player sees**: In a sector holding planet #1 and wormhole #2, `orb 2` — a pilot deliberately naming the wormhole they were just shown by `sca pl` — silently puts them in orbit around planet #1 and reports "Now in orbit around planet 1, <name>", instead of "You can't do that to a wormhole!!!". Likewise `orb 5` in a one-planet sector orbits planet 1 rather than answering "That would be foolish Sir!".

## social (4)


### [low] Open hails ignore the MSG_FILTER user option

- **Canon** (`GECMDS.C:1845 (outwar(FILTER,usrnum,0)); GEMAIN.C:2562-2567 outprfge`): `sen <A|B|C> <msg>` on a channel tuned to hail (freq 0) is delivered with `outwar(FILTER, usrnum, 0)`. FILTER is passed down to `outprfge`, which drops the message entirely for any recipient whose `options[MSG_FILTER]` is TRUE: `if (class == FILTER && (warusroff(shpno)->options[MSG_FILTER] == TRUE)) { clrprf(); return; }`. The two tuned tiers are sent with ALWAYS (GECMDS.C:1852 outsect, 1859 outwar) and correctly bypass the option — hail is the only tier canon filters.
- **Port**: backend/src/gateway/game.gateway.ts:1908-1913 handles the `hail` room with `this.emitToSockets(broadcast.event, broadcast.payload, undefined, excludeId, () => true)` — the accept predicate is unconditional and never consults `ship.msgFilter`. The port does read the option (`ship-state.service.ts:156`, `set-options.catalog.ts:40`) and does honour it on the kill feed (`game.gateway.ts:1360-1362`), so the plumbing exists and only this call site skips it. I grepped the whole backend for `msgFilter` and `MSG_FILTER`; the hail path is the only FILTER-class send that ignores it.
- **Player sees**: A pilot who has typed `set filter on` still receives every open hail broadcast galaxy-wide. In canon that setting silences them.

### [low] Planet distress mail is written even when the owner is logged in and flying

- **Canon** (`GEFUNCS.C:2231-2237 mailit(flag); called as mailit(1) at GECMDS.C:3779 and GECMDS.C:3943`): Both planet-attack resolutions send the owner's distress notice through `mailit(1)`, and mailit's flag-1 arm returns before writing anything when the owner is on the BBS and inside Galactic Empire: `if (flag == 1) { if (instat(mail.userid,gestt)) { if (othusp->substt >= FIGHTSUB) { return; } } }`. An online owner has already been told live by `call_4_help` (ATTACK6/ATTACK7, GECMDS.C:3952-3994); the mail exists only for the owner who was not there. Every other mail producer uses mailit(0) (GEPLANET.C:218, 254, 324, 374; GEMAIN.C:1163) and is never suppressed.
- **Port**: backend/src/game/planet/planet-attack.service.ts:147-154 (troop) and :279-286 (fighter) call `callForHelp(...)` — which emits the live ATTACK_OWNER_ALERT_EVENT — and then unconditionally call `insertDistressMail(ownerAtAttackTime, ...)` on the same tick, with no online/in-game test. `insertDistressMail` (:348-368) writes the MailStat row directly. I grepped backend/src for `mailit`, `FIGHTSUB`, `substt` and `instat`: the suppression rule appears nowhere, and docs/DECISIONS.md has no entry for it.
- **Player sees**: A player who is online and flying while their planet is raided gets the real-time "There is a distress message from <planet>..." alert AND a duplicate distress message sitting in `rea` afterwards. In canon the mailbox stays clean for anyone who was actually there to see the raid.

### [low] The MAXTEAMS cap on team creation is never enforced and TOOMANY never prints

- **Canon** (`GECMDS.C:5476-5490 (`if (numteams >= MAXTEAMS) { prfmsg(TOOMANY,MAXTEAMS); outprf(usrnum); return; }`); GEMAIN.H:240 `#define MAXTEAMS 50``): `tea start` counts the populated slots in teamtab before doing anything else and refuses outright once fifty teams exist, printing TOOMANY — "There are already a maximum of %d teams declared." The galaxy can hold at most 50 teams, ever.
- **Port**: backend/src/game/team/team.service.ts:73-113 `create()` checks only `already_on_team` and the unique-name index; it then does `getMaxTeamcode() + 1n` and inserts. No count of existing teams appears anywhere in the method. `MAXTEAMS = 50` is declared at backend/src/game/team/team.types.ts:33 and at midnight.constants.ts:95 but grepping `MAXTEAMS` across backend/src shows it is imported by nothing in the creation path — only midnight uses the constant-adjacent logic. The generated string exists (canon-messages.generated.ts:1019 `TOOMANY`) but no source file references it, so the message is dead code.
- **Player sees**: Players can keep declaring new teams forever; the 51st `tea create` succeeds where canon answers "There are already a maximum of 50 teams declared."

### [low] `tea leave` reports success when the player is not on a team

- **Canon** (`GECMDS.C:5429-5468 — the unjoin branch is wrapped in `if (waruptr->teamcode > 0) { ... } else { badfmt(TEAMNOT); return; }` (else at :5464-5468), and an unmatched teamcode also falls through to `badfmt(TEAMNOT)` at :5461`): `tea unjoin` from an unaffiliated pilot prints TEAMNOT and changes nothing. Only a pilot actually holding a live teamcode gets TEAMUNJN naming the team they left.
- **Port**: backend/src/game/commands/handlers/tea.handler.ts:124-138 `leaveTeam()` runs `prisma.user.update({ data: { teamcode: null } })` and returns "You have left your team." with no test of `ship.teamcode` at all — unlike every other sub-verb, which routes through TeamService and returns `not_on_team` → TEAMNOT (`adminErrorMessage`, :296). The TEAMNOT constant is imported in this same file and used for `members`/`kick`/`newpass`/`newname`, just not here.
- **Player sees**: Typing `tea leave` with no team answers "You have left your team." instead of canon's "You are not on a team" — and it also fires a spurious player.snapshot rebroadcast.
