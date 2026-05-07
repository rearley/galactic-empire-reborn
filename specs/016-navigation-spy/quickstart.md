# Quickstart — 016 Navigation, Spy, Help, Clear Screen

End-to-end manual smoke test, run after `/speckit-implement` lands and
all unit/integration tests pass. Requires the `ge_test` (or local dev)
DB with a seeded galaxy and a logged-in player ship.

## Prerequisites

```bash
docker compose up -d postgres
cd backend && npm run prisma:migrate:dev   # picks up nav_target_coords migration
cd backend && npm run start:dev
cd ../frontend && npm run dev
```

Open the frontend in a browser and log in as a test player whose ship
is at `(0, 0)` with full energy and at least one `I_SPY` item in cargo.

## 1 — Help

1. Type `hel` → expect a five-topic catalog with topic IDs `navigation`, `combat`, `trade`, `planet`, `ship`.
2. Type `hel navigation` → expect a body that mentions at least `nav`, `rot`, `imp`, `war`, `sca`.
3. Type `?` → output equivalent to `hel`.
4. Type `? combat` → body mentions `pha`, `tor`, `mis`.
5. Type `hel quokka` → expect `HEL_UNKNOWN` echoing `quokka` and listing valid topics.

## 2 — Clear screen

1. With a populated event log (any prior commands' output), type `cls`.
2. Verify the event log clears within a single frame; the input box still shows the connection status; no error toast.
3. Open a second browser tab as another player; their event log is unaffected.

## 3 — Navigation autopilot

1. Type `nav 5 5` → expect `NAV01` line acknowledging course, bearing, and distance.
2. Wait ~30 s (≈5 physics ticks). Run `rep` periodically; ship's heading converges on the bearing toward `(5,5)` and distance decreases.
3. Type `nav` (no args) → status line shows target `(5,5)`, decreasing distance, current bearing.
4. Wait until ship's `xsect/ysect` reaches `(5,5)` → expect `NAV_ARRIVED` line; subsequent `nav` shows `NAV_INACTIVE`.
5. Type `nav 99 99` → `NAVFMT` rejection (out of bounds; `UNIVMAX = 15`).
6. Type `nav 5 5` (already there) → `NAV_ALREADY_THERE`; no autopilot engaged.
7. Type `nav -10 -10` → engaged. Then type `rot 30` → autopilot disengages silently; manual rotate proceeds.
8. With autopilot active toward `(8, 8)`, type `nav -8 -8` → silent target replace; `NAV01` reflects the new target.
9. Orbit a planet (`orb`) then type `nav 0 0` → ship breaks orbit and engages autopilot toward `(0,0)`.

## 4 — Spy

Set up: orbit a non-self-owned planet outside the neutral zone with one `I_SPY` item in cargo.

1. Type `spy` → expect `SPYM1` confirmation; `I_SPY` count decremented by 1; planet's `spyowner` now equals your userid.
2. Type `sca pl <planet-name>` → output now includes per-item inventory (population, weapons, defenses) the same way it does for the planet's owner.
3. As a different test user without spy on that planet, run `sca pl <name>` → only aggregate descriptions ("Lightly populated", "Small missile force" etc.) appear.
4. Plant a second spy as a third user → that user becomes the new `spyowner`; the first user no longer sees inventory.

Negative cases (each must reject without state change):

5. In open space (not in orbit) → `SPY1`.
6. Orbiting your own planet → `SPY0`.
7. Orbiting a wormhole → `SPY0B`.
8. In neutral zone → `SPY0C`.
9. Cargo empty of `I_SPY` → `SPYM0`; counts unchanged.

## 5 — Regression checks

- All pre-existing manual movement still works without an active autopilot (`rot 90` then `imp 50` then `war 3`).
- `sca lo` and `sca lo full` continue to render correctly.
- Existing `set`, `cloak`, `maint`, etc. unaffected.

## Pass criteria

Every step's expected output is observed; no console errors in the
browser; backend logs free of unhandled exceptions across the run.
