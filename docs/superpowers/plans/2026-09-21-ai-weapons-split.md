# AI Tick Split and Shared Weapons — Plan

> Executed inline (superpowers:executing-plans). Spec: `docs/superpowers/specs/2026-09-21-ai-weapons-split-design.md`.

**Constraints:**
- Stage 1 must not change behaviour. The golden event fingerprint must match
  after every task.
- Run on Node 24. Run lint AND vitest before every commit.
- No `VERSION` bump in Stage 1, because nothing a player sees changes. Stage 2
  gets a patch bump and a changelog entry.

### Task 0 — Golden fingerprint
Fix the sim's epoch in `GalaxySim.installClock` (`now: Date.UTC(2026, 8, 21)`),
so `tickAt` stamps are deterministic. Write a throwaway spec (not committed)
that runs seed 1 for 3,600 s with three `fightBack` pilots and writes
sha256(JSON of every event + the final state of every ship) to the scratchpad.
Record the hash.

### Task 1 — `AiWeapons` for the Cybertron's weapons
Create `cybertron/ai-weapons.ts` (to move under `game/ai/` in Stage 2). Move
`cybFirePhaser`, `cybFireHyperPhaser`, `cybLaunchTorpedo`, `layMine` and the
jammer deploy into it verbatim. It takes `{ shipState, classes, events, random,
combatTick?, mineRegistry?, mineRepo?, trace? }`. The tick builds it in its
constructor. Re-point the tests that call these privately. The fingerprint
must match.

### Task 2 — `CybertronBrain`
Move `cybLives` and its callees (`runEngagementScan`, `cybCheckLockon`,
`applyBand`, `cybAttack`, `applyEvasion`, `sweepMines`, `cybAnnoy`,
`cybLayDecoys`, `cybCheckDamage`, `tx`, `isInNeutralZone`, `countClaims`,
`findPlayerByChannel`) into `cybertron/cybertron-brain.ts`. The scheduler
keeps `onAiTick`, the spawn path, the allowance and the handlers. Re-point the
tests. The fingerprint must match, and the invariant `cyb-claim-writes` must
still pass.

### Task 3 — Stage 1 wrap
Full suite, lint, PROGRESS note, commit.

### Task 4 — Droids through `AiWeapons` (Stage 2)
Write failing tests first, citing GEDROIDS.C:361-366 and :352-354, for:
- the arc sweep
- `degrees = 0` / `percent = 2`
- the provoke
- the hyper aim

Then re-point `DroidTickService`'s five weapon methods to `AiWeapons`. Where
Droid and Cybertron differ in a canon line, canon decides, citing both. Add
`randamage` to `firehp`. Run the suites, the simulation, lint. Then DECISIONS,
changelog, `VERSION` patch, PROGRESS, and `Closes #62`.
