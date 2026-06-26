# Multi-Ship Ownership Implementation Plan (P-007)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. TDD is RED-first and MANDATORY: write the failing test, RUN it, capture the failing output BEFORE writing production code.

**Goal:** Let a player own a fleet of ships (faithful to the original), with login-only selection, dormant idle ships, fleet-capped purchase, and delete-on-death.

**Architecture:** Lift the one-ship-per-user DB constraint; wire `User.noships`/`topshipno`; make only the *active* ship live in the in-memory map (boot loads AI ships only, players board on login); add a login ship-selection menu; change death to delete the hull. Spec: `docs/superpowers/specs/2026-06-26-multi-ship-design.md`.

**Tech Stack:** NestJS + TypeScript (strict), Prisma + PostgreSQL, Jest, Socket.io.

## Global Constraints
- **`MAXSHIPS = 10`** fleet cap (env `MAXSHIPS`, valid 1–50). @see GEMAIN.C:462
- Ship status: `GESTAT_AVAIL = 0` (dormant), `GESTAT_USER = 1` (active), `GESTAT_AUTO = 2` (AI) — already in `constants.ts`.
- `topshipno` is monotonic — **never decremented**; ship numbers are never reused.
- `START_CLASS = 1` (Interceptor), `START_CASH = 5000n`, `START_FLUX_PODS = 3` — the free-starter grant (feature 021), reused for the zero-fleet case.
- Prisma migrations: `prisma migrate dev --name <name>` ONLY — never `db push`. Migrations are committed artifacts.
- No in-game switch command (`boa` is out of scope). Selection is login-only.

## File Structure
- `backend/prisma/schema.prisma` — drop `@@unique([userid])` (line 79 of the Ship model).
- `backend/prisma/migrations/<ts>_multi_ship/migration.sql` — drop index + backfill counters.
- `backend/src/game/constants.ts` — add `MAXSHIPS`.
- `backend/src/game/commands/messages.ts` — `NEW_FLEET_FULL`, updated purchase message, ship-select prompt strings.
- `backend/src/game/onboarding/onboarding.service.ts` — set counters on the free-starter create.
- `backend/src/game/commands/handlers/new-ship.handler.ts` — fleet cap, `topshipno+1` allocation, counter increment, create dormant, message fix.
- `backend/src/gateway/game.gateway.ts` — login count-branch + `prompt:ship-select` + selection reply; death-delete; board/unboard status transitions.
- `backend/src/game/ship/ship-state.service.ts` — boot-load AI ships only; `board`/`unboard` helpers with status.
- Tests under `backend/test/`.

---

### Task 1: Schema migration — drop one-ship-per-user + backfill counters

**Files:**
- Modify: `backend/prisma/schema.prisma` (Ship model, remove `@@unique([userid])`)
- Create: `backend/prisma/migrations/<timestamp>_multi_ship/migration.sql` (generated)
- Test: `backend/test/prisma-schema/multi-ship-migration.spec.ts` (new)

**Interfaces:** Produces: a `Ship` table that allows multiple rows per `userid`; `User.noships`/`topshipno` backfilled for existing users.

- [ ] **Step 1 (RED): test that two ships can coexist for one user + counters backfilled**

`backend/test/prisma-schema/multi-ship-migration.spec.ts`:
```ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });

describe('multi-ship schema', () => {
  const uid = 'mship_test_user';
  afterAll(async () => { await prisma.ship.deleteMany({ where: { userid: uid } }); await prisma.user.deleteMany({ where: { userid: uid } }); await prisma.$disconnect(); });

  it('allows multiple ships per userid (no unique constraint)', async () => {
    await prisma.user.create({ data: { userid: uid, username: uid, cash: 0n } });
    await prisma.ship.create({ data: { userid: uid, shipno: 1, shipname: 'A', shpclass: 1, status: 1 } });
    await expect(
      prisma.ship.create({ data: { userid: uid, shipno: 2, shipname: 'B', shpclass: 1, status: 0 } }),
    ).resolves.toBeDefined(); // would throw P2002 under @@unique([userid])
    const count = await prisma.ship.count({ where: { userid: uid } });
    expect(count).toBe(2);
  });
});
```

- [ ] **Step 2 (RED run):** `DATABASE_URL=$TEST_DATABASE_URL npx jest test/prisma-schema/multi-ship-migration.spec.ts` → FAIL: the 2nd `ship.create` throws a P2002 unique-constraint error. Capture it.

- [ ] **Step 3: Drop the constraint + author the migration with backfill**

In `schema.prisma`, delete the line `@@unique([userid])` from the `Ship` model (keep `@@id([userid, shipno])`). Then:
```bash
cd backend && npx prisma migrate dev --name multi_ship
```
This generates a migration with `DROP INDEX "Ship_userid_key";`. **Append the counter backfill** to that migration's `migration.sql`:
```sql
-- Backfill fleet counters for existing users (all currently own exactly one ship).
UPDATE "User" u SET
  "noships"   = (SELECT COUNT(*)              FROM "Ship" s WHERE s."userid" = u."userid"),
  "topshipno" = COALESCE((SELECT MAX(s."shipno") FROM "Ship" s WHERE s."userid" = u."userid"), 0);
```
Re-apply against the test DB: `DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy`.

- [ ] **Step 4 (GREEN):** re-run the test → PASS (2 ships coexist). Run `npx tsc --noEmit` → 0 (Prisma client regenerated).

- [ ] **Step 5: Commit**
```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/test/prisma-schema/multi-ship-migration.spec.ts
git commit -m "feat(schema): multi-ship — drop one-ship-per-user constraint + backfill counters (P-007 T1)"
```

---

### Task 2: `MAXSHIPS` constant + new messages

**Files:**
- Modify: `backend/src/game/constants.ts`
- Modify: `backend/src/game/commands/messages.ts`
- Test: `backend/test/unit/gemain-pins.spec.ts` (append)

**Interfaces:** Produces: `MAXSHIPS` (number) from `../constants`; `MessageId.NEW_FLEET_FULL`, updated `NEW3`/purchase message, and ship-select strings.

- [ ] **Step 1 (RED):** append to `gemain-pins.spec.ts`:
```ts
import { MAXSHIPS } from '../../src/game/constants';
it('pins MAXSHIPS default (P-007)', () => { expect(MAXSHIPS).toBe(10); });
```
- [ ] **Step 2 (RED run):** `npx jest test/unit/gemain-pins.spec.ts -t MAXSHIPS` → FAIL (undefined).
- [ ] **Step 3: Implement.** In `constants.ts`:
```ts
/** Max ships a player may own (env MAXSHIPS, 1–50). @see GEMAIN.C:462 numopt(MAXSHIPS,1,50) */
export const MAXSHIPS = Math.min(50, Math.max(1, Number(process.env.MAXSHIPS ?? 10))) as number;
```
In `messages.ts` add to the enum + string table:
```ts
NEW_FLEET_FULL = 'NEW_FLEET_FULL',
SHIP_SELECT_HEADER = 'SHIP_SELECT_HEADER',
```
```ts
[MessageId.NEW_FLEET_FULL]: 'Your fleet is full — you cannot own more ships.',
[MessageId.SHIP_SELECT_HEADER]: 'Choose your ship:',
```
- [ ] **Step 4 (GREEN):** `npx jest test/unit/gemain-pins.spec.ts -t MAXSHIPS` → PASS; `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit** — `git commit -m "feat(multi-ship): MAXSHIPS constant + fleet/select messages (P-007 T2)"`

---

### Task 3: Onboarding sets fleet counters

**Files:**
- Modify: `backend/src/game/onboarding/onboarding.service.ts` (the `finalize`/create block, ~line 110-139)
- Test: `backend/test/integration/onboarding/*` (extend the onboarding finalize test) or a focused unit test.

**Interfaces:** Consumes nothing new. Produces: a new player has `User.noships = 1`, `User.topshipno = 1`, and the ship `status = GESTAT_USER`.

- [ ] **Step 1 (RED):** test that after onboarding finalize, the User row has `noships === 1` and `topshipno === 1`. (Use the onboarding service's existing test harness / Prisma; assert the User update includes these.)
- [ ] **Step 2 (RED run):** FAIL — finalize currently only sets `cash`.
- [ ] **Step 3: Implement.** In `onboarding.service.ts`, the `prisma.user.update({ where:{userid}, data:{ cash: START_CASH } })` (~line 138) becomes:
```ts
await this.prisma.user.update({
  where: { userid },
  data: { cash: START_CASH, noships: 1, topshipno: 1 },
});
```
The `ship.create` already sets `shipno: 1`; ensure it also sets `status: GESTAT_USER` (1) — it defaults to 1, so explicit is optional but add `status: GESTAT_USER` for clarity (import from `../constants`).
- [ ] **Step 4 (GREEN):** test passes; `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit** — `git commit -m "feat(onboarding): set fleet counters for the starter ship (P-007 T3)"`

---

### Task 4: `new ship` — fleet cap, counter allocation, dormant create, message fix

**Files:**
- Modify: `backend/src/game/commands/handlers/new-ship.handler.ts` (buy block, ~line 99-193)
- Test: `backend/test/game/commands/handlers/new-ship.handler.spec.ts` (extend)

**Interfaces:** Consumes `MAXSHIPS` (T2), `GESTAT_AVAIL`. Produces: buying allocates `shipno = user.topshipno + 1`, increments `noships`, sets `topshipno`, creates the ship `status = GESTAT_AVAIL` (dormant), rejects at the cap.

- [ ] **Step 1 (RED): tests**
```ts
// (using the handler's existing harness; firer at Zygor orbit, enough cash)
it('rejects purchase when fleet is at MAXSHIPS', () => {
  // user.noships = MAXSHIPS → NEW_FLEET_FULL, no ship created, no cash deducted
});
it('allocates shipno = topshipno + 1 and bumps counters (never reuses)', () => {
  // user.topshipno = 3, noships = 1 → new ship gets shipno 4; topshipno → 4; noships → 2
});
it('creates the new ship dormant (status AVAIL) — does not auto-switch', () => {
  // created ship.status === GESTAT_AVAIL (0)
});
```
- [ ] **Step 2 (RED run):** FAIL — no cap, no counter wiring, current create uses `existingCount+1` and default status.
- [ ] **Step 3: Implement.** Read the current buy block. Replace the `existingCount`/create logic:
```ts
const user = await this.prisma.user.findUnique({ where: { userid: ship.userid }, select: { cash: true, noships: true, topshipno: true } });
const cash = user?.cash ?? 0n;
const noships = user?.noships ?? 0;
const topshipno = user?.topshipno ?? 0;
if (noships >= MAXSHIPS) {
  return { lines: [{ text: formatMessage(MessageId.NEW_FLEET_FULL), category: 'system' }] };
}
if (cash < shipClass.maxPrice) { /* existing insufficient-credits branch — keep */ }
const newShipno = topshipno + 1;
await this.prisma.$transaction([
  this.prisma.ship.create({ data: { userid: ship.userid, shipno: newShipno, shipname: `${shipClass.typeName} #${newShipno}`, shpclass: classNumber, status: GESTAT_AVAIL, /* + the existing default-loadout fields the current create sets */ } }),
  this.prisma.user.update({ where: { userid: ship.userid }, data: { cash: { decrement: shipClass.maxPrice }, noships: { increment: 1 }, topshipno: newShipno } }),
]);
const remaining = cash - shipClass.maxPrice;
return { lines: [{ text: `New ${shipClass.typeName} purchased and docked at Zygor. Reconnect to fly her. Credits remaining: ${remaining.toLocaleString()}.`, category: 'system' }] };
```
Preserve the existing Zygor-orbit + cash gates above this. The dormant ship is NOT added to the in-memory map (it's DB-only until boarded). Import `MAXSHIPS`, `GESTAT_AVAIL`.
- [ ] **Step 4 (GREEN):** handler tests pass; `npx tsc --noEmit` → 0. Update any existing new-ship test that asserted the old `boa` message or default status.
- [ ] **Step 5: Commit** — `git commit -m "feat(multi-ship): new ship enforces cap, allocates topshipno+1, creates dormant (P-007 T4, P-008)"`

---

### Task 5: Death deletes the hull + decrements `noships`

**Files:**
- Modify: `backend/src/gateway/game.gateway.ts` (`handleCombatShipDestroyed` ~line 613-636; the disconnect-kill path ~line 272-280 already emits COMBAT_SHIP_DESTROYED → routes here)
- Test: `backend/test/gateway/*` (extend the death/disconnect suites)

**Interfaces:** Consumes nothing new. Produces: on death, the ship row is DELETED, `User.noships` decremented, ship removed from the live map.

- [ ] **Step 1 (RED): tests**
```ts
it('death DELETES the ship row and decrements noships', () => {
  // emit COMBAT_SHIP_DESTROYED for victim → prisma.ship.delete called for (userid,shipno); user.noships decremented; removeFromGame called
});
it('other ships of the victim are untouched', () => {
  // victim owns shipno 1 (active) + 2 (dormant); killing #1 leaves #2 intact
});
```
- [ ] **Step 2 (RED run):** FAIL — current `handleCombatShipDestroyed` does `updateMany(... reset fields ...)`, not delete; noships untouched.
- [ ] **Step 3: Implement.** Replace the reset-in-place `updateMany` (~line 621-627) with a delete + decrement transaction:
```ts
await this.prisma.$transaction([
  this.prisma.ship.delete({ where: { userid_shipno: { userid: event.victimUserid, shipno: victimShipno } } }),
  this.prisma.user.update({ where: { userid: event.victimUserid }, data: { noships: { decrement: 1 } } }),
]);
this.shipStateService.removeFromGame({ userid: event.victimUserid, shipno: victimShipno });
```
Keep the kill-credit/broadcast logic. Guard the `user.update` decrement so `noships` never goes below 0 (the C source clamps the unsigned underflow — mirror with a conditional or a raw `GREATEST(noships-1,0)`; simplest: read noships, `decrement: noships > 0 ? 1 : 0`). The disconnect-kill path already emits COMBAT_SHIP_DESTROYED, so it inherits this delete automatically — verify no separate reset remains there.
- [ ] **Step 4 (GREEN):** death/disconnect tests pass; `npx tsc --noEmit` → 0. Update any test asserting the old reset-in-place behavior to expect delete.
- [ ] **Step 5: Commit** — `git commit -m "feat(multi-ship): death deletes the hull + decrements noships (P-007 T5, P-013/P-014)"`

---

### Task 6: Dormancy — boot-load AI ships only + board/unboard with status

**Files:**
- Modify: `backend/src/game/ship/ship-state.service.ts` (`onModuleInit` findMany ~line 39; add `board`/`unboard` helpers)
- Modify: `backend/src/gateway/game.gateway.ts` (connect → board; disconnect → unboard)
- Test: `backend/test/game/ship/ship-state.dormancy.spec.ts` (new) + gateway connect/disconnect tests

**Interfaces:**
- Produces: `ShipStateService.board(state: ShipState)` — sets `status = GESTAT_USER`, loads into the live map. `ShipStateService.unboard(userid, shipno)` — sets `status = GESTAT_AVAIL`, flushes, removes from the live map. Boot loads only `status = GESTAT_AUTO` ships.

- [ ] **Step 1 (RED): tests**
```ts
// ship-state.dormancy.spec.ts
it('onModuleInit loads only AI (status AUTO) ships — not player ships', async () => {
  // seed an AUTO ship + a USER ship in the (mock) DB; after onModuleInit, map has the AUTO one, not the player one
});
it('board() makes a player ship live (status USER, in map); unboard() makes it dormant (status AVAIL, out of map)', () => {});
```
- [ ] **Step 2 (RED run):** FAIL — onModuleInit loads all; no board/unboard.
- [ ] **Step 3: Implement.**
  - In `onModuleInit`, scope the findMany to AI ships: `this.prisma.ship.findMany({ where: { status: GESTAT_AUTO }, include: { ... } })`. (Player ships are dormant until boarded.) Import `GESTAT_AUTO`.
  - Add:
```ts
/** Board a player ship: mark active and load into the live world. */
board(state: ShipState): void {
  state.status = GESTAT_USER;
  state.dirty = true;
  this.map.set(shipKey(state.userid, state.shipno), state);
}
/** Unboard a player ship: persist as dormant and remove from the live world. */
async unboard(userid: string, shipno: number): Promise<void> {
  const state = this.map.get(shipKey(userid, shipno));
  if (state) { state.status = GESTAT_AVAIL; state.dirty = true; }
  await this.flushAndUnload(userid, shipno); // flush (persists AVAIL) + delete from map
}
```
  - In `game.gateway.ts`: where `handleConnection` currently hydrates the ship and sets `activeShipNo`, route it through `board(state)` (after building the ShipState from the DB row). Where `handleDisconnect` calls `flushAndUnload`, call `unboard(userid, activeShipNo)` instead (so status flips to AVAIL). The P-001 combat-disconnect kill path still deletes (T5) — unboard only applies to the non-kill clean-disconnect branch.
- [ ] **Step 4 (GREEN):** dormancy + connect/disconnect tests pass; `npx tsc --noEmit` → 0. Confirm AI boot-seed still works (Cybertrons load — they're AUTO).
- [ ] **Step 5: Commit** — `git commit -m "feat(multi-ship): dormant idle ships — boot-load AI only, board/unboard status (P-007 T6, P-009)"`

---

### Task 7: Login ship-selection menu (`prompt:ship-select`)

**Files:**
- Modify: `backend/src/gateway/game.gateway.ts` (`handleConnection` count-branch ~line 155-219; `handlePromptReply` ~line 405-494; reconnect path)
- Test: `backend/test/integration/onboarding/ship-select.spec.ts` (new)

**Interfaces:** Consumes `board` (T6). Produces: connection with >1 ship emits `prompt:ship-select { step: 'SHIP_SELECT', ships: [{ index, shipno, className, shipname, sector }] }`; reply via `prompt:reply { value: <1-based index> }` boards the chosen ship.

- [ ] **Step 1 (RED): tests**
```ts
it('0 ships → onboarding free starter (existing path)', () => {});
it('1 ship → auto-boards it (no select prompt)', () => {});
it('>1 ships → emits prompt:ship-select with the fleet list; does not board yet', () => {});
it('valid prompt:reply index boards that ship (activeShipNo set, status USER); invalid index re-emits prompt:ship-select', () => {});
```
- [ ] **Step 2 (RED run):** FAIL — current `findFirst` auto-boards one ship; no selection.
- [ ] **Step 3: Implement.** Replace the `findFirst` ship lookup with a count-branch:
```ts
const ships = await this.prisma.ship.findMany({ where: { userid }, orderBy: { shipno: 'asc' } });
if (ships.length === 0) { /* existing onboarding free-starter path */ }
else if (ships.length === 1) { /* board ships[0] via board(...) + set activeShipNo (existing single-ship flow) */ }
else {
  client.data.pendingShipSelect = ships.map((s, i) => ({ index: i + 1, shipno: s.shipno, shpclass: s.shpclass }));
  client.emit('prompt:ship-select', {
    step: 'SHIP_SELECT',
    ships: ships.map((s, i) => ({ index: i + 1, shipno: s.shipno, className: this.shipClassCache.getTypeName?.(s.shpclass) ?? `class ${s.shpclass}`, shipname: s.shipname, sector: { x: Math.floor(s.xcoord), y: Math.floor(s.ycoord) } })),
  });
  return; // wait for prompt:reply
}
```
In `handlePromptReply`, add a branch for `client.data.pendingShipSelect`: parse `value` as a 1-based index; if valid → load that ship's row, build ShipState, `board(state)`, set `client.data.activeShipNo`, clear `pendingShipSelect`, emit the welcome + `player.snapshot`; if invalid → re-emit `prompt:ship-select` with the same list. (Mirror the existing ship-name prompt-reply structure.)
- [ ] **Step 4 (GREEN):** ship-select tests pass; `npx tsc --noEmit` → 0. Confirm the single-ship and brand-new flows still pass their existing tests.
- [ ] **Step 5: Commit** — `git commit -m "feat(multi-ship): login ship-selection menu for multi-ship players (P-007 T7)"`

---

### Task 8: Full lifecycle integration + regression + docs

- [ ] **Step 1: Integration test** — `backend/test/integration/multi-ship-lifecycle.spec.ts`: a player buys a 2nd ship (dormant) → reconnects → gets `prompt:ship-select` → boards #2 → #2 is killed (deleted, noships→1) → reconnects → auto-boards the survivor #1. And: owns 1 → killed → reconnect → free starter granted (noships back to 1). Assert via the gateway + DB.
- [ ] **Step 2: Full regression** — `npx tsc --noEmit` (0) + full `npx jest`. The suite was 2743/2743 green before this feature; it must end green. Fix any test that assumed one-ship-per-user, reset-on-death, or boot-loads-all-ships (adapt to the new correct behavior; don't weaken). Re-seed `ge_test` if the migration needs applying: `DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy`.
- [ ] **Step 3: Docs** — `docs/PROGRESS.md` (new entry: P-007 multi-ship complete — fleet model, login selection, dormancy, death-delete; closes P-007/P-008/P-009; tests; decisions: MAXSHIPS=10, DB-only dormancy, login-only switching). `docs/DATA_MODEL.md` (Ship is now many-per-user; noships/topshipno live). `docs/GAME_MECHANICS.md` (fleet ownership, buy/select/death). `specs/022-fidelity-audit-v2/findings.md`: flip P-007, P-008, P-009 to `fixed` (and note P-013/P-014 advanced by the death-delete). Commit.

---

## Self-Review

**Spec coverage:** drop unique + backfill → T1 ✓. MAXSHIPS + messages → T2 ✓. onboarding counters → T3 ✓. buy cap/counters/dormant → T4 ✓. death delete + noships-- → T5 ✓. dormancy boot-load-AI + board/unboard → T6 ✓. login selection + prompt:ship-select → T7 ✓. integration + docs → T8 ✓. (Out-of-scope items — `boa`, selling, abandon — correctly absent.)

**Type consistency:** `board(state)`/`unboard(userid,shipno)` (T6) consumed by gateway connect/disconnect (T6) and the selection reply (T7). `MAXSHIPS`/`GESTAT_*` constants used in T2/T4/T6. `prompt:ship-select` payload shape (T7) matches `pendingShipSelect`. `noships`/`topshipno` written in T3/T4/T5, read in T4/T7.

**Flagged checks (verify during execution, not placeholders):**
- T4: copy the EXISTING default-loadout fields the current `ship.create` sets (energy, flux pods, ltorps arrays, etc.) into the new dormant-create — don't drop fields. Read the current create block.
- T5: confirm the disconnect-kill path (P-001) routes through `COMBAT_SHIP_DESTROYED` so it inherits the delete (no separate reset left).
- T6: `flushAndUnload` persists the `status = AVAIL` set in `unboard` (it flushes dirty state before deleting from the map — verify the flush includes `status`; `stateToPrismaUpdate` historically stripped `status` per P-009/P-010 — this must now persist `status` on unboard, or set it via a direct `prisma.ship.update` in `unboard`). **If `status` is stripped from flush updates, set it with an explicit `prisma.ship.update({where, data:{status: GESTAT_AVAIL}})` in `unboard` before `flushAndUnload`.**
- T7: reuse the existing prompt-reply plumbing shape (the ship-name prompt) for `pendingShipSelect`; match how `client.data` and `prompt:reply` are handled today.
- T8: the migration must be applied to `ge_test` for DB-backed suites; the `db:reset` script already runs `migrate deploy` + seed.
