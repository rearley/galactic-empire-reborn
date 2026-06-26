# Multi-Ship Ownership — Design Spec (P-007)

**Branch:** `030-multi-ship`
**Created:** 2026-06-26
**Status:** Approved (brainstorming) — pending implementation plan
**Audit findings closed:** P-007 (death/respawn), P-008 (noships/topshipno wiring), P-009 (status transitions). P-005/P-013/P-014 partially touched (death path).

## Overview

Restore the original game's **fleet model**: a player can own multiple ships, each an individual record keyed by `(userid, shipno)`. Today the schema enforces `@@unique([userid])` (one ship per user), and death resets the single ship in place. This feature lifts that limit and makes ownership, purchase, selection, and death faithful to the C source — adapted for the 24/7 persistent web world per the decisions below.

Ground truth verified against the C source (`GEFUNCS.C:104-145 lookupshp`, `:264-267 initshp`, `:319-384 findships/selectship`, `:1270-1281 killem`; `GECMDS.C:4558-4583 new ship`; `GEMAIN.H:296-297 noships/topshipno`, `:550-556 SHPKEY`).

## Design decisions (locked)

1. **Switching = login-only (faithful).** Ship selection happens *only* at login. There is **no in-game switch command** (`boa` is explicitly out of scope). To fly a different owned ship, the player reconnects and re-picks. Matches the original (`CHOOSESH` runs only inside `lookupshp` at entry).
2. **Idle ships = dormant, DB-only (faithful).** Only the **active** ship is live in the world (ticked, scannable, attackable). Idle owned ships are **not** in the in-memory live map at all — they exist only as DB rows until boarded. Loaded into the live map on board; removed on logout/switch-away/death. AI ships (`status = GESTAT_AUTO`) are always live and unaffected.
3. **Death = delete + free-starter-if-empty (faithful).** Death permanently deletes the killed hull and decrements `noships` (never `topshipno`). Other ships survive. A player whose fleet is now empty is auto-granted a free `START_CLASS` ship on next login (reusing feature 021's onboarding grant). Cargo is looted by the killer (already implemented).
4. **`MAXSHIPS = 10`** — fleet cap. Tunable via env (`MAXSHIPS`), following the existing balance-constant pattern. (Original clamps 1–50; 10 is our chosen default.)

## Data model & migration

**Schema (`backend/prisma/schema.prisma`):**
- **Remove** `@@unique([userid])` from `Ship` (line ~186). Keep `@@id([userid, shipno])`.
- `User.noships` (Int) and `User.topshipno` (Int) already exist (currently dead — always 0). They become live:
  - `noships` = current count of the user's ship rows.
  - `topshipno` = highest `shipno` ever allocated to this user (monotonic; **never decremented**, so ship numbers are never reused).

**Migration (`prisma migrate dev --name multi_ship`):**
- Drops the unique index.
- **Data backfill** (in the migration or a one-shot): for every existing `User` that owns ≥1 ship, set `noships = <count of their ships>` and `topshipno = <max(shipno) of their ships>`. (Today everyone has exactly one ship `shipno=1`, so this is `noships=1, topshipno=1` for them.)

**Status semantics (`GESTAT_*`, already defined):** `AVAIL=0` (dormant/owned-but-not-flown), `USER=1` (active/in-play), `AUTO=2` (AI). Player ships transition `AVAIL ↔ USER` on board/unboard.

## Lifecycle flows

### Onboarding — brand-new player (0 ships)
Unchanged from feature 021: free `START_CLASS` (Interceptor, class 1), ship-name prompt, `START_CASH` (5000), `START_FLUX_PODS` (3). **Add:** set `User.noships = 1`, `User.topshipno = 1` on creation. Ship created with `status = GESTAT_USER` (immediately boarded).

### Login / connection — the one new UX (`game.gateway.ts handleConnection`)
Replace the current `findFirst({where:{userid}})` (assumes one ship) with a **count-branch** mirroring C `lookupshp`:
- **0 ships** → run the onboarding free-starter grant (above), then board it.
- **1 ship** → auto-board it (load into live map, `status = USER`, set `client.data.activeShipNo`).
- **>1 ships** → emit **`prompt:ship-select`** and enter a ship-select sub-state; do **not** board yet. The player replies with a selection; the chosen ship is boarded.

**`prompt:ship-select` payload:** `{ step: 'SHIP_SELECT', ships: [{ index, shipno, className, shipname, sector: {x,y} }] }` — a numbered fleet list (mirrors `findships`' table: #, sector, class, name).
**Reply:** reuse the existing `prompt:reply { value }` channel — `value` is the 1-based list index. Invalid index → re-emit `prompt:ship-select` (mirrors C `selectship` re-prompt). On valid selection → board that ship (load into live map, `status = USER`, `activeShipNo = chosen shipno`), emit the welcome + `player.snapshot`.

**Reconnect/hydrate path** must use the same count-branch (a returning player with >1 ship gets the selector).

### Buy — `new ship <class>` (`new-ship.handler.ts`)
Already faithful (Zygor neutral-zone + orbiting gate, cash check + deduct, computes `existingCount`). **Add:**
- **Fleet cap:** before creating, `if (user.noships >= MAXSHIPS)` → reject with a "fleet full" message (new `NEW_FLEET_FULL` message).
- **Counter wiring:** allocate `shipno = user.topshipno + 1`; after create, `topshipno = shipno` and `noships += 1` (single transaction with the cash decrement).
- The new ship is created **dormant** (`status = GESTAT_AVAIL`) — you do **not** auto-switch to it (faithful: you keep flying your current ship). 
- **Message fix:** replace the stale *"Board her with `boa <n>`."* with *"New {class} purchased and docked at Zygor. Reconnect to fly her. Credits remaining: {n}."*

### Death — `handleCombatShipDestroyed` + disconnect-kill (`game.gateway.ts`)
Change reset-in-place → **delete**:
- Loot transfer to killer: unchanged (already done in the combat layer).
- **Delete** the killed ship row (`prisma.ship.delete({ where: { userid_shipno } })`), remove it from the live map (`removeFromGame`), and **`User.noships -= 1`** (do not touch `topshipno`), in one transaction.
- Broadcast `COMBAT_SHIP_DESTROYED` (kill credit) as today.
- The dead player simply has no active ship until they reconnect; next login hits the count-branch (pick a survivor, or free starter if `noships == 0`).
- This applies to **both** the combat-tick death path and the P-001 client-disconnect combat-kill.

### Dormancy & status — the persistent-world rule
- **Boot hydration (`ShipStateService.onModuleInit`):** load **AI ships (`status = AUTO`) only** into the live map. Do **NOT** load player ships at boot (they're dormant until their owner connects). *(Today it loads all ships — this is the key change.)*
- **Board (login/onboarding):** load the chosen player ship into the live map, set `status = USER`.
- **Unboard (clean logout / `flushAndUnload`):** flush the ship, set `status = AVAIL`, remove from the live map. It becomes dormant (DB-only).
- **Tick / scan / combat:** already operate on the live map, so dormant player ships are automatically excluded. Verify no path queries the DB for player ships to tick/target.
- **Net effect:** a player's non-active ships are frozen at their last persisted state, invisible and invulnerable, until that player reconnects and boards one.

## Protocol additions
- **`prompt:ship-select`** (server→client): `{ step, ships: [...] }` as above.
- Reply via existing **`prompt:reply`** (client→server): `{ value: <1-based index> }`.
- No new in-game command. No `boa`.

## Constants
- **`MAXSHIPS = 10`** (env `MAXSHIPS`, tunable; clamp/validate 1–50 to match the original's bounds). Add to `constants.ts` with a `@see GEMAIN.C:462` reference.

## Error handling & edge cases
- **Logout while combat-locked (`cantexit > 0`):** the existing P-001 disconnect-kill fires first (client-side disconnect → ship deleted, kill credited). So you cannot dodge a kill by disconnecting to "switch ships." Confirm the death-delete path composes with P-001 (it should — same delete).
- **Invalid ship-select index / non-numeric:** re-emit `prompt:ship-select` (do not board, do not crash).
- **Fleet full on buy:** `NEW_FLEET_FULL`, no creation, no cash deducted.
- **Selecting a ship that was destroyed between login and selection** (race): re-emit the selector with the refreshed list.
- **Concurrency:** all counter mutations (`noships`/`topshipno`) and the death-delete run inside a transaction to avoid drift under the per-tick flush.

## Testing strategy
- **Unit:** `topshipno+1` allocation (never reuses after a delete); `noships` increment/decrement; fleet-cap rejection at MAXSHIPS; death-delete + decrement; free-starter granted only when `noships == 0`.
- **Login branch:** 0→starter, 1→auto-board, >1→`prompt:ship-select` emitted; valid reply boards the right ship; invalid reply re-prompts.
- **Dormancy:** a dormant (unboarded) player ship is NOT in the live map, NOT ticked, NOT in any other player's scan, NOT targetable; boarding makes it live; logout makes it dormant again.
- **Integration (gateway, full lifecycle):** buy a 2nd ship → reconnect → select → fly → die (deleted) → reconnect → pick the survivor; and: own 2 → lose both → reconnect → free starter.
- **Migration:** backfill sets `noships`/`topshipno` correctly for existing one-ship users; dropping the unique index doesn't break existing rows.
- **Regression:** full suite stays green; AI ships still boot-seed and tick (they're the only boot-loaded ships now).

## Out of scope (explicitly)
- In-game ship switching (`boa`) — login-only by decision.
- Selling / scrapping ships for credits.
- The abandon-ship command interaction — left as-is.
- Any frontend beyond consuming the `prompt:ship-select` event (the React client already handles `prompt:*`; a basic numbered-list render is enough).
- Per-ship "current ship" persistence on `User` — not in the original; session state (`activeShipNo`) suffices.

## Migration delta (from current code)
1. `schema.prisma`: drop `@@unique([userid])` + migration + backfill.
2. `constants.ts`: add `MAXSHIPS=10`.
3. `onboarding.service.ts`: set `noships=1, topshipno=1` on the free-starter create.
4. `game.gateway.ts handleConnection` + reconnect: count-branch + `prompt:ship-select` + selection handling.
5. `new-ship.handler.ts`: fleet-cap check, `topshipno+1` allocation, increment counters, create dormant (`AVAIL`), fix the `boa` message.
6. `game.gateway.ts` death paths (combat + disconnect-kill): delete row + `noships--` instead of reset-in-place.
7. `ship-state.service.ts onModuleInit`: boot-load AI ships only; board/unboard load/remove player ships with `status` transitions.
8. `messages.ts`: `NEW_FLEET_FULL`, updated purchase message, ship-select prompt strings.
