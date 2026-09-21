# AI tick split and shared weapons — design

**Issue:** #62, under #58. **Status:** approved in conversation 2026-09-21. The
owner chose two stages.

## Canon, which decides the shape

Both AI kinds fire through the PLAYER's weapon functions in GECMDS.C:

| | Cybertron | Droid |
|---|---|---|
| `firep` | GECYBS.C:519 | GEDROIDS.C:366, 473 |
| `firehp` | GECYBS.C:278 | GEDROIDS.C:354, 461 |
| `torp` | GECYBS.C:538 | GEDROIDS.C:482 |
| `laymine` | GECYBS.C:315, 632 | GEDROIDS.C:512 |
| `jam` | GECYBS.C:637 | GEDROIDS.C:515 |

So the shared actuator already exists in canon. The port grew three copies of
it: the player's, the Cybertron's and the Droid's. The Droid's copy departs
furthest. It aims at its target and hits only that ship, where canon sets
`degrees = 0`, `percent = 2` (GEDROIDS.C:361-362) and sweeps the arc.

## Stage 1 — split, no behaviour change

- `CybertronTickService` becomes the **scheduler**: subscriptions, countdown,
  `CYBMAXPERTICK`, spawn slots and holds, allowance, and death and kill
  handlers. Its constructor is unchanged.
- `CybertronBrain` holds the **decisions**: `cybLives` and everything it calls.
  Claims change only through `cyb-transitions`. It calls weapons directly;
  there are no intent objects, because they would add a layer where the order
  of `Random` draws could drift.
- `AiWeapons` is the **actuator**: `firep`, `firehp`, `torp`, `laymine`, `jam`.
  It is built on the shared `selectPhaserVictims` / `selectHyperVictims`
  helpers and holds no state.
- The scheduler constructs the brain and the weapons from its own
  dependencies, so no modules or providers change.

**Proof of no behaviour change:** a golden fingerprint of the simulation's full
event stream, recorded before the first change (seed 1, one hour, with
pilots firing back), must match after every step. The 55 Cybertron test files
and the simulation's properties must also pass.

## Stage 2 — Droids through `AiWeapons` (a canon correction)

- **Phasers:** `degrees = 0`, `percent = 2`, then `firep`: an arc sweep that
  provokes any AI it hits.
- **Hyper-phaser:** aim with `cbearing`, then `firehp`, sweeping the arc.
- **Torpedoes, mines and jammers:** through the same methods.
- **The Cybertron's `firehp`** gains the `randamage` roll canon makes at
  GECMDS.C:1082.

Tests that pinned the port-only Droid behaviour are rewritten against canon,
with a changelog entry (`corrected-to-canon`), a patch version, and a
DECISIONS entry.
