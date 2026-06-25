# Combat Feel Smoke-Test Checklist (Plan 1 — branch 023-combat-feel)

Use this checklist during the first live playtest session after merging branch 023-combat-feel.
Each item lists the exact command to type, the expected result, and a pass/fail checkbox.

---

## How to run the stack locally

There is currently no Docker setup. Run services directly:

### 1. Postgres

Postgres must be running and the `ge` database must exist. If you already have a `ge` database
from a previous session, skip to step 2. Otherwise:

```bash
# Assumes Postgres 16 is installed and the `ge` role/user exists
cd backend
npm run db:reset
```

`db:reset` drops and recreates both `ge` and `ge_test` databases, runs all migrations via
`prisma migrate deploy`, and seeds ship-class data via `npx prisma db seed`.

> **Note:** `db:reset` requires Postgres to be listening on `localhost` with a `ge` role.
> The exact connection string is in `backend/.env` (`DATABASE_URL`).

### 2. Backend

```bash
cd backend
npm run start:dev
```

NestJS starts in watch mode on port 3000 (default). The game gateway is at `ws://localhost:3000`.

### 3. Frontend

```bash
cd frontend
npm run dev
```

Vite starts on `http://localhost:5173` (default). Open it in a browser.

### Docker gap

`CLAUDE.md` mandates `docker-compose` for both development and production, but no `Dockerfile`
or `docker-compose.yml` currently exists in the repository. Before any production deploy,
create them as a separate task. The manual start procedure above is the only supported
local-dev path for now.

---

## Smoke Tests

### Test 1 — Tight phaser arc: on-axis hit, off-axis miss

**Setup:** Two player ships in the same sector. Ship A is at heading 0° (north). Ship B is
positioned dead ahead (~1 sector away, bearing 0°). Ship C is ~20° off-axis from Ship A
(bearing 20°, also ~1 sector away).

**Command (Ship A):** `pha 0`  (default focus = 1, half-angle = 3°)

**Expected result:**
- Ship B is hit — `COMBAT_HIT` event arrives; damage applied.
- Ship C is NOT hit — no hit event for Ship C.
- `COMBAT_PHASER_FIRED` event fires.

- [ ] PASS  / [ ] FAIL

---

### Test 2 — Wide phaser arc: focus 5

**Setup:** Same two ships as Test 1 (B dead ahead, C ~20° off-axis).

**Command (Ship A):** `pha 0 5`  (focus = 5, half-angle = 7°)

**Expected result:**
- Ship B is hit.
- Ship C may or may not be hit depending on exact bearing (7° half-angle vs 20° off-axis — 20°
  is outside 7°, so C should still NOT be hit).
- Damage to Ship B should be **less** than in Test 1 (focus term `fd = 1 - 5/11 ≈ 0.545`
  vs `fd = 1 - 1/11 ≈ 0.909` at focus=1).

- [ ] PASS  / [ ] FAIL

---

### Test 3 — Phaser falloff: no damage beyond ~2.4 sectors

**Setup:** Two ships in the same sector. Ship A fires at Ship D which is ~5 sectors away
(place D in an adjacent sector, warped there, or use `sca sh D` to confirm distance ≥ 3).

**Command (Ship A):** `pha 0`

**Expected result:**
- No `COMBAT_HIT` event for Ship D.
- `COMBAT_MISS` event fires (arc resolved but damage formula produces zero at ≥ disfact).
- Alternatively the candidate ship may not appear in the arc scan if fully outside `scanRange`
  (range gate still applies as a first-pass filter).

- [ ] PASS  / [ ] FAIL

---

### Test 4 — Torpedo lock fails at long range

**Setup:** Two ships in the same galaxy but far apart. Confirm distance > 5 sectors
(e.g. use `sca sh <name>` — distance in the output should show ≥ 5 sectors).

**Command:** `tor <shipname>`

**Expected result:** Lock fails. Message indicates cannot acquire lock (LOCK_FAIL or similar).
No torpedo slot allocated on the target.

- [ ] PASS  / [ ] FAIL

---

### Test 5 — Torpedo lock succeeds at close range

**Setup:** Two ships ~1 sector apart (same or adjacent sector, both sub-warp).

**Command:** `tor <shipname>`

**Expected result:** Lock acquired. Torpedo slot allocated. Torpedo begins travelling toward target.
`COMBAT_HIT` arrives when it reaches distance 0.

- [ ] PASS  / [ ] FAIL

---

### Test 6 — Missile lock fails at long range

**Setup:** Same long-range setup as Test 4 (distance ≥ 5 sectors).

**Command:** `mis <shipname> 5000`

**Expected result:** Lock fails. No missile slot allocated.

- [ ] PASS  / [ ] FAIL

---

### Test 7 — Missile lock succeeds at close range

**Setup:** Two ships ~1 sector apart.

**Command:** `mis <shipname> 5000`

**Expected result:** Lock acquired. Missile allocated with specified charge. Energy debited from
firer (`charge / MISENGFC` energy consumed). Missile travels toward target.

- [ ] PASS  / [ ] FAIL

---

### Test 8 — Cloak then fire is refused

**Setup:** One player ship with a cloaking device. Cloak the ship.

**Commands:**
```
cloak on
pha 0
```

**Expected result:**
- `cloak on` succeeds; cloak ramps to 10 over two physics ticks.
- `pha 0` is refused while cloaked. Appropriate error message returned. No `COMBAT_PHASER_FIRED` event.

Repeat for missile:
```
mis <shipname> 1000
```
- [ ] Phaser PASS  / [ ] Phaser FAIL
- [ ] Missile PASS / [ ] Missile FAIL

---

### Test 9 — Neutral-zone fire causes self-zap

**Setup:** Move a player ship into sector (0, 0) — Zygor-3 / the neutral zone. Confirm position
with `rep nav` (xcoord ≈ 0.5, ycoord ≈ 0.5, sector 0,0). Have a second ship nearby as a target.

**Command:** `pha 0`

**Expected result:**
- The firing ship takes `SE100DAM = 101` hull damage — instant kill (damage ≥ 100 threshold).
- `COMBAT_SHIP_DESTROYED` event fires for the firer.
- The intended target takes NO damage.

Repeat for torpedo and missile from the same neutral-zone position.

- [ ] Phaser self-zap PASS  / [ ] FAIL
- [ ] Torpedo self-zap PASS / [ ] FAIL
- [ ] Missile self-zap PASS / [ ] FAIL

---

## Notes for tuning after playtest

- If phasers feel too weak at 1 sector: increase `PDAMMAX` (default 200).
- If phasers feel too weak at 1.5+ sectors: decrease `PFIRDST` closer to 0 (shallower falloff).
- If torpedoes/missiles lock too easily at 4 sectors: increase `TORFACT`/`MISFACT`.
- If torpedoes/missiles lock too rarely at 2 sectors: decrease `TORFACT`/`MISFACT`.
- All six constants are in `backend/src/game/constants.ts` and can be overridden via environment
  variables at startup.
