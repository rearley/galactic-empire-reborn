# Quickstart — 006b Ship-to-Ship Combat

Manual verification recipe. Run after implementation lands and
`npm test` passes in `backend/`.

## Setup

1. Reset the dev database:
   ```bash
   docker compose up -d postgres
   cd backend
   npx prisma migrate reset --force
   npm run seed       # loads ShipClass catalogue and a few test players
   ```

2. Start the backend:
   ```bash
   npm run start:dev
   ```

3. Open two terminal sessions to the WebSocket. Either use the
   feature 003 e2e harness or a `wscat` connection to the gateway
   with two seeded users (`alice`, `bob`).

## Scenario A — phaser exchange (US1)

1. Both ships warp into the same sector and stop. Confirm via
   `report` on each.
2. **alice**: `pha 90 50` (fire 50% of charge, bearing 90°).
3. Expect:
   - Both terminals log a sector-scoped `combat.phaser-fired` event.
   - If bob is in the firing arc and range, bob's `report` shows
     `shield` reduced by `SHHITENG`-derived amount and `damage`
     incremented; both terminals see `combat.hit`.
   - alice's `phasr` charge drops by ~50% and recovers `+= PRELOAD`
     each subsequent 6-second tick up to her class's `maxPhaser`.

## Scenario B — torpedo + decoy intercept (US2 + US3)

1. Both ships in the same sector at impulse speed.
2. **alice**: `loc bob`, then `tor @`.
3. Expect:
   - One torpedo consumed from alice's cargo; her `shieldstat`
     auto-lowers; bob sees an inbound torpedo warning.
   - Each tick the locked torpedo's distance decrements by `torpsped`.
4. **bob**: `dec` while the torpedo is closing.
5. With a seeded PRNG (test mode) verify deterministic intercept; in
   manual mode the intercept happens probabilistically — repeat until
   you see `combat.decoy-intercept`. Both terminals see the event;
   bob's hull is undamaged; alice's torpedo lock slot clears.

## Scenario C — mine + zipper (US3)

1. **alice**: warp to sector (5,5), stop, `min`. The mine row appears
   in the `Mine` table.
2. Restart the backend (`Ctrl+C`, `npm run start:dev`). Confirm the
   mine row survives and is loaded into the in-memory registry on
   boot (boot logs report `N active mines hydrated`).
3. **bob**: warp toward (5,5). On non-sweep ticks within `MINERANGE`,
   bob sees an `MINE6` proximity warning; on the sweep tick where
   `timer === 0`, the mine detonates: bob takes cubic-falloff damage,
   `combat.mine-detonation` fires, the mine row is deleted.
4. Variant: place two mines, drive alice within zipper range, type
   `zip`. All mines in range delete without damaging alice;
   `combat.mine-detonation` fires for each (attacker = self,
   victim = none).

## Scenario D — flux + shield control (US4)

1. **alice**: drain energy by extended phaser fire and warp travel.
2. **alice**: `flux` — confirm one flux pod consumed and `energy` set
   to `ENGYMAX`.
3. **alice**: `shi dn`, `shi up`, confirm `shieldstat` toggles.
4. **alice**: fire a torpedo; confirm `shieldstat` auto-lowers and
   stays lowered on the next tick (FR-020 — no auto-raise).

## Scenario E — kill broadcast (US5)

1. Reduce bob's hull to ~95 via combat.
2. **alice**: `pha 0 100` aimed to land the killing hit.
3. Expect:
   - bob's `damage` reaches `>= 100`.
   - alice's `kills` increments.
   - `combat.ship-destroyed` is emitted and broadcast **galaxy-wide**
     — every connected client sees the death log entry, not just
     ships in the sector.
   - Any in-flight torpedoes or missiles targeting bob are cleared
     (FR-027). Verify by inspecting the `ltorpsChannel` /
     `lmisslChannel` arrays of any other attacker that had locked
     bob.

## Scenario F — planet revolt (US5 / SC-007)

1. Use the test fixture to seed a planet with
   `(taxrate / 120) × 0.35 × men > troops` and a deterministic
   `gernd()` that returns 0 (test PRNG seed).
2. Trigger the economy tick (advance time / call the test endpoint).
3. Expect:
   - `troops` reduced to `troops / ((rand % 8) + 2)`.
   - A `MAIL_CLASS_DISTRESS` mail row queued for the previous owner.
   - Planet `ownerUserId` reset to `null` (the `**Free**` state).
   - **No** ship damage; no `combat.*` events emitted (revolt is a
     planet-state event only).

## Pass criteria

All six scenarios complete as described. Backend logs show no
`ship X fault on tick Y` entries during normal play (per-ship fault
isolation works without being exercised). All 754 prior backend tests
plus the new combat suite pass green in CI.
