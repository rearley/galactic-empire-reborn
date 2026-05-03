# Quickstart: Cybertron AI

Manual verification recipe for feature 007. Assumes 006a (physics) and
006b (combat) are merged, the test database is reachable, and a player
ship can be created via the existing dev tooling.

## Prerequisites

- `docker compose up -d db` — Postgres 16 running.
- `npm run db:reset` — fresh schema, seeded with `ship-classes.ts`
  including new Sartern rows (classes 24, 25).
- `npm run start:dev` — backend running on the default port.
- A player ship of class ≥ `CYB_MINCLASS` (3) created and bound to a
  Socket.io session (use the existing 003 dev tooling).

## Recipe

### 1. Spawn-fill (US1)

1. Boot the server with no humans logged in.
2. Hit `GET /debug/cybertron-stats` (added by this feature) and observe
   the per-class population grow to each class's configured
   `tot_to_create` over ~15 minutes (or ~accelerated runs in tests via
   the seeded PRNG and modulo-30 spawn-tick counter).
3. Confirm `User` rows with `userid LIKE 'Cybrg-%'` and matching
   `Ship` rows exist in Postgres after spawn-fill completes.

### 2. Target acquisition (US1)

1. Log a player ship into a sector outside the neutral zone, within
   `ShipClass.scanRange` of an existing Cybertron.
2. Wait at most one Cybertron tick (≤ 6 s).
3. Observe in the server log: `cybertron.target-acquired` event with
   the attacker's and target's ship keys.
4. Inspect the Cybertron's `Ship.cybmine` — it now equals the player
   ship's `shipno`.

### 3. Hyperwarp pursuit (US1)

1. Place the player ship ≥ 25 sectors away from the Cybertron (above
   the configured `hyperdist1`).
2. On the next Cybertron tick, observe `Ship.where` flip to `1` and
   `Ship.shield` drop to `0`.
3. Observe the Cybertron's coordinates close on the player at roughly
   20× normal top speed across subsequent physics ticks.
4. When distance falls below `hyperdist2` (~10 sectors), observe
   `Ship.where` flip back to `0` and `Ship.shield` restored to
   `ShipClass.maxShields`.

### 4. Engagement (US2)

1. Place the player ship adjacent to the Cybertron (within `tooclose`).
2. Within a small number of physics ticks, observe:
   - A `combat.phaser-fired` event from the Cybertron in the server log.
   - At least one `combat.hit` or `combat.miss` event.
   - For an ordinary Cybertron facing a player with lifetime
     `kills < CYB_BE_EASY` (60), torpedo volleys of 0–1.
   - For the same Cybertron facing a player with lifetime
     `kills ≥ CYB_BE_EASY`, torpedo volleys of 0–5.

### 5. Taunt (US2 / FR-006a)

1. Trigger a `cyb_annoy` branch (e.g., a target outside `tooclose` but
   inside scan range; the AI may roll into the taunt-only path).
2. Observe a `cybertron.taunt` event in the server log carrying a
   message string from `taunt-pool.ts`.
3. In the player's connected Socket.io session, observe the taunt
   appearing in the personal event log.
4. From a second player session in the same sector, observe the taunt
   broadcast as a sector event.

### 6. Damage response (US4)

1. Damage a Cybertron above `CYB_MINDAM` (75) using the player's
   weapons (006b).
2. Within a few Cybertron ticks, observe:
   - A `combat.mine-detonation` (eventually) or a fresh `Mine` row in
     Postgres (from `mine.repository.ts`) attributed to the Cybertron.
   - A jammer deployment (`combat.*` event of the jammer kind from 006b).
   - The Cybertron's `Ship.heading` randomized.

### 7. Jammed evasion (US4)

1. Hit the Cybertron with a player jammer (006b `jam` command).
2. On the next Cybertron tick, observe:
   - `Ship.holdcourse > 0`.
   - A new `Mine` row deployed near the Cybertron's current position.
   - `Ship.heading` randomized.
3. Confirm no `cybertron.target-acquired` event fires while the
   Cybertron's `jammer != 0`.

### 8. Break-off and "lucky day" (US2 / FR-007)

1. With a player engaged by a Cybertron, observe (with low probability
   per tick) a `cybertron.broke-off` event.
2. The Cybertron's `Ship.cybmine` resets to `255`; its `Ship.speed`
   resets to top.
3. The player's session receives a "lucky day" event-log line.

### 9. Gold transfer on kill (US1 / FR-005a)

1. Pre-condition: the target Cybertron has accumulated some
   `User.cash` (it ticks +`CYB_ALLOW` per tick).
2. Kill the Cybertron via player weapons.
3. In the same tick that `combat.ship-destroyed` fires, observe:
   - The killing player's `User.cash` increase by the Cybertron's
     pre-kill balance (clamped to `CYB_MAXCASH`).
   - The Cybertron's `User.cash` zeroed.
4. Both rows are flushed to Postgres immediately (per FR-019).

### 10. Persistence across restart (US5)

1. With a populated universe, snapshot the `Cybrg-*` `User` and `Ship`
   rows.
2. Stop and restart the backend.
3. After boot, confirm:
   - The same `Cybrg-*` rows exist with the same coordinates,
     loadouts, gold (now clamped to `CYB_MAXCASH`), and `cybskill`.
   - No duplicate spawns of any class while population is at cap.
4. Manually reduce a class's count below `tot_to_create` (e.g.,
   delete one Cybertron of class N from the DB before boot). After
   boot, confirm the spawn slot creates exactly the missing count over
   the spawn-tick cadence.

### 11. Sarterns (US6)

1. Confirm classes 24, 25 have `tot_to_create > 0` in
   `cybertron.config.ts`.
2. Confirm Sarterns spawn through the same path with the shared
   `User.userid` prefix `Cybrg-` (verified against `GECYBS.C:104-105`;
   all `CLASSTYPE_CYBORG` ships use the same prefix — there is no
   separate `Sartn-` prefix).
3. Confirm a Sartern executes the same `cyb_lives` flow — verifiable by
   observing its `Ship.cybmine` field changing in response to player
   movement.

### 12. Neutral-zone safety (SC-007)

1. Move a player into the neutral zone.
2. Confirm no `cybertron.target-acquired` event names this player and
   no `combat.phaser-fired` event from any Cybertron names this player
   over a sustained observation period.

### 13. Pile-on prevention (SC-006)

1. Place a single player in a sector with multiple Cybertrons of the
   same class.
2. Confirm at most `ShipClass.noClaim` Cybertrons of that class set
   `cybmine` to the player's `shipno` at any time.

## Tear-down

```bash
docker compose down
```
