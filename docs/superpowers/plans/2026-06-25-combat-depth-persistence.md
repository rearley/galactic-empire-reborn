# Combat Depth + Persistence Implementation Plan (Plan 3 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. TDD is RED-first and mandatory: write the failing test, RUN it, capture the failing output BEFORE writing production code.

**Goal:** Close four well-bounded fidelity gaps from the audit: mine-laying validation (C-004), shields drop while firing phasers (C-008), true hyperphaser separation (C-009), and the combat-disconnect kill (P-001).

**Architecture:** Four mostly-independent fixes against the C source. Subsystem damage (C-010) and midnight team staleness (P-016) are deferred to Plan 4 (they need new state fields / deeper investigation).

**Tech Stack:** NestJS + TypeScript (strict), Jest, Socket.io. No schema migration.

## Global Constants / Facts (verbatim)
- `HPMINFIR=6000`, `HPFIRAMT=5000`, `HPBEAMW=5`, `FIRETICKS=10`, `MINERANGE=10000`, `PHABIAS=2`, `TONFACT=15000`, `WARP_THRESHOLD=1000`, `SE100DAM=101` — all already in `constants.ts`.
- New tunable constants (config-derived in C; pin defaults like PDAMMAX): `HPDAMMAX=200` (`numopt(HPDAMMAX,1,200)`), `HPFIRDST=1` (`numopt(HPFIRDST,1,20)`), `USERMINES=200` (per-player live-mine cap, `numopt(USRMINES,...)`), `MINE_TIMER_MIN=1`, `MINE_TIMER_MAX=50`.
- C `firehp` (GECMDS.C:1020-1094): `energy>=HPMINFIR` else HNOFIRP; neutral→zaphim; `energy-=HPFIRAMT`; only hits victims with `where==1` (at warp); beam `smallest(...) < HPBEAMW`; hard range `ddistance < scanrange`; damage `pdamage(firer, dist, foc=0)` warp-branch × `phasrtype/(1+victim.maxTons/TONFACT)`; phasrtype 20 → 101.
- C `pdamage` warp branch (firer where==1, GEFUNCS.C:2069-2077): `dd=max(0,1-dist/40000); dp=dd^hpfirdst; dam=hpdammax*dp`.
- C `cmd_mine` (GECMDS.C:1722-1781): requires `shipclass.has_mine`; neutral-zone forbidden; cloak forbidden (PCLOKUP); `items[I_MINE]>0`; arg = timer `1..50`; per-player live-mine cap `usermines`; sets `cantexit=FIRETICKS`.
- C `firep` shield handling (GECMDS.C:930-933, 1013-1016): if shields up, `shielddn` BEFORE firing, `shieldup` AFTER — the firer is shield-down for the FIRETICKS window.
- P-001 (GEMAIN.C:1397 warhupa): if `cantexit > 0` on disconnect, `killem`. The gateway already captures `client.data.disconnectReason` (client-side drop vs server-side reload) — re-enable the kill only for client-side drops.

---

## File Structure
- `backend/src/game/constants.ts` — add HPDAMMAX, HPFIRDST, USERMINES, MINE_TIMER_MIN/MAX.
- `backend/src/game/combat/combat-math.ts` — add `hyperPhaserDamage(...)`; refactor `lineOfFire` to delegate to a `withinArc(firer, victim, degree, halfAngle)` core so hyper can pass `HPBEAMW`.
- `backend/src/game/commands/handlers/phaser.handler.ts` — real hyperphaser branch (C-009); shield drop/raise around fire (C-008).
- `backend/src/game/commands/handlers/mine.handler.ts` — full validations + timer arg (C-004).
- `backend/src/game/combat/mine.registry.ts` — add a per-deployer live-mine count if absent.
- `backend/src/game/droid/droid-tick.service.ts` — point the droid hyper-phaser site at `hyperPhaserDamage`.
- `backend/src/gateway/game.gateway.ts` — re-enable cantexit combat-kill on client-side disconnect (P-001).
- `backend/src/game/commands/messages.ts` — HP_NOPOW (hyper no power), MIN_* messages (no mine launcher / neutral / cloak / cap / timer format).
- Tests under `backend/test/...`.

---

### Task 1: C-004 — mine-laying validations + timer arg

**Files:**
- Modify: `backend/src/game/commands/handlers/mine.handler.ts`, `constants.ts`, `messages.ts`, possibly `mine.registry.ts`
- Test: `backend/test/game/commands/handlers/mine.handler.spec.ts` (extend/create)

**Interfaces:** Consumes `ShipClassCacheService` (`get(class).hasMine`), `isInNeutralZone`, `USERMINES`, `MINE_TIMER_MIN/MAX`, `SE100DAM`/`WPN_ZAP` (neutral self-zap — C `cmd_mine` forbids; use the same self-zap pattern as Plan 1 weapons OR a plain refusal — see step 3), `MineRegistry` live-count by deployer.

- [ ] **Step 1 (RED): Write failing tests**

In `mine.handler.spec.ts`, cover (match the suite's harness):
```ts
// 1. ship class without hasMine → MIN_NOMINE, no mine created
// 2. cloaked (ship.cloak > 0) → MIN_CLOAK, no mine
// 3. in neutral zone (0,0) → MIN_NEUTRAL refusal, no mine
// 4. timer arg parsing: `min 45` deploys with timer 45; `min 0` and `min 51` → MIN_TIMER NUMOOR(1,50)
// 5. default `min` (no arg) → timer 30 (keep current default when arg omitted)
// 6. per-player live-mine cap: with USERMINES mines already live for this deployer → MIN_FULL, no new mine
// 7. happy path: deploys, items[I_MINE] -= 1, ship.cantexit === FIRETICKS
```

- [ ] **Step 2 (RED run):** `npx jest test/game/commands/handlers/mine.handler.spec.ts` → FAIL (validations absent). Capture output.

- [ ] **Step 3: Implement**

Add constants: `USERMINES=200`, `MINE_TIMER_MIN=1`, `MINE_TIMER_MAX=50` (with `@see GECMDS.C:1722` refs). Add messages `MIN_NOMINE` ('No mine launcher mounted.'), `MIN_CLOAK` ('Cannot lay mines while cloaked.'), `MIN_NEUTRAL` ('Cannot lay mines in the neutral zone.'), `MIN_FULL` ('Your mine limit is deployed.'), `MIN_TIMER` (reuse NUMOOR(1,50)).

In `mine.handler.ts`, before creating the mine, add in order:
1. `if (!shipClassCache.get(ship.shpclass)?.hasMine) → MIN_NOMINE` (inject `ShipClassCacheService`).
2. `if (ship.cloak > 0) → MIN_CLOAK`.
3. `if (isInNeutralZone(ship)) → MIN_NEUTRAL` (C forbids mining in NZ; a plain refusal, not a self-zap — `cmd_mine` returns without zaphim for the neutral case).
4. ammo check (existing).
5. timer: change `minArgs` to allow an optional arg; parse `args[0]` if present — must be integer in `[MINE_TIMER_MIN, MINE_TIMER_MAX]`, else `NUMOOR(1,50)`; if absent default to 30 (the existing `MINE_INITIAL_TIMER`).
6. per-player cap: count live mines deployed by `ship.userid` via `MineRegistry` (add `countByDeployer(userid)` if not present); `if (count >= USERMINES) → MIN_FULL`.
7. On success: create the mine with the parsed timer; set `ship.cantexit = FIRETICKS` in the mutate.

- [ ] **Step 4 (GREEN):** `npx jest test/game/commands/handlers/mine.handler.spec.ts` → PASS. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit** — `git commit -m "fix(combat): mine-laying validations + timer arg (Plan 3 T1, C-004)"`

---

### Task 2: C-008 — shields drop while firing phasers

**Files:**
- Modify: `backend/src/game/commands/handlers/phaser.handler.ts`
- Test: extend `backend/test/game/commands/handlers/phaser.spec.ts`

**Interfaces:** none new — toggles `ship.shieldstat` around fire.

- [ ] **Step 1 (RED):** Add a test: a firer with `shieldstat=1` (shields up) firing `pha 0 0` ends with `shieldstat=0` (shields dropped) and `cantexit=FIRETICKS` (so it stays down for the battle-lock window). A firer already shields-down stays down. Assert the firer is recorded shield-down after firing. Run → FAIL.

- [ ] **Step 2 (RED run):** capture failing output.

- [ ] **Step 3: Implement**

In `phaser.handler.ts`, in the firer-debit mutate at the end (the `s.phasr = 0; s.cantexit = FIRETICKS;` block), also set `s.shieldstat = 0` (shields drop on fire, mirroring C `shielddn` before fire). The existing auto-shield tick (`recentlySelfFiredTorp`-style) will re-raise after the window if auto-shield is on — confirm whether phaser fire should also trigger the auto-raise transient; if an equivalent flag exists for phaser, set it; otherwise leave re-raise to the player. Keep it minimal: the C behavior is shields-down during FIRETICKS. Do NOT block firing on shield state.

- [ ] **Step 4 (GREEN):** `npx jest test/game/commands/handlers/phaser.spec.ts` → PASS; `npx tsc --noEmit` → 0. Update any phaser test that asserted `shieldstat` unchanged after fire.

- [ ] **Step 5: Commit** — `git commit -m "fix(combat): phaser fire drops shields for the battle-lock window (Plan 3 T2, C-008)"`

---

### Task 3: C-009 — true hyperphaser separation

**Files:**
- Modify: `combat-math.ts` (add `hyperPhaserDamage`, refactor `lineOfFire`→`withinArc`), `constants.ts` (HPDAMMAX, HPFIRDST), `phaser.handler.ts` (hyper branch), `droid-tick.service.ts` (hyper site), `messages.ts` (HP_NOPOW)
- Test: `backend/test/game/combat/hyper-phaser-damage.spec.ts` (new); extend `phaser.spec.ts`

**Interfaces:**
- `withinArc(firer, victim, degree, halfAngleDeg): boolean` — core of `lineOfFire`; `lineOfFire(firer, victim, degree, focus)` = `withinArc(firer, victim, degree, focus + PHABIAS)`.
- `hyperPhaserDamage({ phasrtype, distRaw, victimMaxTons }): number` — C `pdamage` warp branch × firep-hp scaling: `dd=max(0,1-distRaw/40000); dp=dd^HPFIRDST; dam=HPDAMMAX*dp; factor=dam*phasrtype/(1+victimMaxTons/TONFACT)`; `phasrtype===20 → 101`; `floor`.

- [ ] **Step 1 (RED): tests**

`hyper-phaser-damage.spec.ts`:
```ts
// point-blank (dist 0): dd=1, dp=1, dam=HPDAMMAX=200, factor=200*phasrtype/(1+0)=200*phasrtype → floor
// at 40000 raw and beyond → 0 (dd clamped)
// heavier victim (maxTons 15000) → tonfact 2 → half
// sysop phasrtype 20 → 101
```
Extend `phaser.spec.ts`: a firer at warp (`speed >= WARP_THRESHOLD`) with `energy < HPMINFIR` → HP_NOPOW, no fire, no energy debit; with `energy >= HPMINFIR` firing at a victim ALSO at warp in-arc within scanRange → hit + `energy -= HPFIRAMT`; a NON-warp victim is NOT hit (hyper only hits warp targets); firing hyper inside the neutral zone → self-zap (WPN_ZAP, damage += SE100DAM). Run → FAIL.

- [ ] **Step 2 (RED run):** capture output.

- [ ] **Step 3: Implement**

`constants.ts`: add `HPDAMMAX=200`, `HPFIRDST=1` (`@see GEMAIN.C:491-492`).

`combat-math.ts`: extract `withinArc(firer, victim, degree, halfAngleDeg)` from the current `lineOfFire` body (the atan2/firingAngle/diff logic, returning `diff < halfAngleDeg`); make `lineOfFire(firer, victim, degree, focus)` call `withinArc(firer, victim, degree, focus + PHABIAS)`. Add `hyperPhaserDamage` per the interface above.

`phaser.handler.ts`: replace the Plan-1 "normal beam at warp" note with a real hyper branch. When `ship.speed >= WARP_THRESHOLD`:
- gate `if (ship.energy < HPMINFIR) → HP_NOPOW` (no fire);
- neutral self-zap (same as normal path) applies;
- emit fired event; debit `ship.energy -= HPFIRAMT` (instead of phasr discharge); set `cantexit`;
- victim loop: include only candidates with `candidate.speed >= WARP_THRESHOLD` (at warp); arc via `withinArc(ship, candidate, degree, HPBEAMW)`; hard range `inScanRange(ship, candidate, scanRange)`; damage `hyperPhaserDamage({ phasrtype: ship.phasrtype, distRaw: cdistance*10000, victimMaxTons: getMaxTons(candidate.shpclass) })`; `if (damage < 1) continue`; apply via shieldhit/hull like the normal path.
- The normal (sub-warp) path stays exactly as Plan 1 built it (focus cone, pdamage, full discharge).

`messages.ts`: add `HP_NOPOW = 'HP_NOPOW'` → 'Insufficient flux energy for hyper-phaser.'

`droid-tick.service.ts`: at the hyper-phaser site (the `weapon: 'hyper-phaser'` branch), call `hyperPhaserDamage({ phasrtype: droid.phasrtype, distRaw: dist*10000, victimMaxTons: getMaxTons(target.shpclass) })` instead of the normal `phaserDamage`, and remove the C-009-deferral comment. (Keep its existing target/arc logic; only swap the damage function.)

- [ ] **Step 4 (GREEN):** `npx jest test/game/combat/hyper-phaser-damage.spec.ts test/game/commands/handlers/phaser.spec.ts test/game/combat/line-of-fire.spec.ts test/game/droid` → PASS; `npx tsc --noEmit` → 0. Update any line-of-fire test affected by the `withinArc` refactor (behavior must be identical for the focus path).

- [ ] **Step 5: Commit** — `git commit -m "feat(combat): true hyperphaser separation — warp-only, flux-gated, hpdamage falloff (Plan 3 T3, C-009)"`

---

### Task 4: P-001 — combat-disconnect kill

**Files:**
- Modify: `backend/src/gateway/game.gateway.ts` (`handleDisconnect`)
- Test: `backend/test/integration/...` gateway disconnect test (extend the existing gateway/disconnect suite)

**Interfaces:** uses the already-captured `client.data.disconnectReason` and `ship.cantexit`.

- [ ] **Step 1 (RED): test**

Add a gateway test (match the existing gateway test harness): a player with `cantexit > 0` (combat-locked) whose socket emits a CLIENT-SIDE disconnect reason (e.g. `'transport close'` / `'ping timeout'`) → on `handleDisconnect`, the ship is killed (the combat-kill path runs — assert the kill effect the codebase uses, e.g. `handleCombatShipDestroyed`/row reset or a `killem`-equivalent). A player with `cantexit === 0` → NOT killed (normal flush). A SERVER-SIDE reason (e.g. `'server namespace disconnect'` / hot-reload) → NOT killed even if `cantexit > 0`. Run → FAIL (kill currently disabled by TODO).

- [ ] **Step 2 (RED run):** capture output.

- [ ] **Step 3: Implement**

In `handleDisconnect`, replace the disabled TODO block. Determine client-side vs server-side from `client.data.disconnectReason` (the capture already exists at connection: client-side reasons include `'transport close'`, `'transport error'`, `'ping timeout'`, `'client namespace disconnect'`; server-side include `'server namespace disconnect'`, `'server shutting down'`). Only when the reason is client-side AND `ship.cantexit > 0`, invoke the existing combat-kill path (the same one `handleCombatShipDestroyed` uses) BEFORE `flushAndUnload`. Otherwise just `flushAndUnload` as today. Add a `NODE_ENV !== 'production'` extra-safety note is NOT required since the reason gate already excludes hot-reload (`server.disconnect()` produces a server-side reason) — but if the existing reason set is incomplete, prefer to ALSO require `process.env.NODE_ENV === 'production'` for the kill, to be conservative; document the choice in the code comment.

- [ ] **Step 4 (GREEN):** run the gateway disconnect test + `npx tsc --noEmit`. Ensure existing disconnect/reconnect tests still pass (a normal logout has `cantexit===0` so is unaffected).

- [ ] **Step 5: Commit** — `git commit -m "fix(persistence): kill combat-locked ship on client-side disconnect (Plan 3 T4, P-001)"`

---

### Task 5: Full regression + docs

- [ ] **Step 1:** `npx tsc --noEmit` (0) and full `npx jest`. Confirm failing count ≤ the 66 pre-existing baseline and NO combat/gateway suite newly failing. Fix regressions (adapt tests to correct new behavior; don't weaken). Note: weapons now drop shields / debit flux — recompute any affected expected values.
- [ ] **Step 2:** Update `docs/PROGRESS.md` (new 2026-06-25 entry for `025-combat-depth-persistence`: C-004, C-008, C-009, P-001; tests; decisions — HPDAMMAX/USERMINES tunable defaults, P-001 client-side-reason gate; Next: Plan 4 = subsystem damage C-010 + midnight staleness P-016; Known issues: same 66 baseline + no Docker). Update `docs/GAME_MECHANICS.md` (mines, hyperphaser, shield-drop-to-fire). Flip C-004, C-008, C-009, P-001 to `fixed` in `specs/022-fidelity-audit-v2/findings.md` with testRefs.
- [ ] **Step 3: Commit** — `git commit -m "docs: Plan 3 complete — mines, shield-drop, hyperphaser, combat-disconnect (Plan 3 T5)"`

---

## Self-Review

**Spec coverage:** C-004 mines → T1. C-008 shield-drop → T2. C-009 hyperphaser → T3. P-001 combat-disconnect → T4. Verify+docs → T5. (C-010 subsystem damage + P-016 midnight staleness → Plan 4, intentional.)

**Type consistency:** `withinArc` (T3) underlies `lineOfFire`; `hyperPhaserDamage` (T3) consumed by phaser handler + droid hyper site. `USERMINES`/`MINE_TIMER_*` (T1). HPDAMMAX/HPFIRDST (T3).

**Flagged checks:**
- T1: confirm `MineRegistry` can count live mines by deployer; add `countByDeployer` if missing. Decide neutral-zone mining = plain refusal (C `cmd_mine` returns, no zaphim) vs self-zap — spec says refusal.
- T2: verify whether an auto-shield re-raise transient exists for phaser (like torpedo's); if not, leave re-raise to the player and only drop on fire.
- T3: the `withinArc` refactor must keep the focus-path behavior byte-identical (re-run line-of-fire tests). Hyper damage uses `*phasrtype` (NOT `*(1+phasrtype)/2.5` — that's the normal path).
- T4: confirm the exact client-side vs server-side reason strings the codebase/Socket.io emits; if uncertain, also gate on `NODE_ENV==='production'` and document.
