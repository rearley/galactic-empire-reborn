# AI State Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every change to a Cybertron's claim goes through one named function per canon transition, and each function writes that transition's complete field set.

**Architecture:** A new pure module `cybertron/cyb-transitions.ts` holds one function per transition. Each mutates the ship it is given in place, which matches how every call site already works (`ship.x = …` inside the tick, or inside `shipState.mutate(…, (v) => …)`), and each cites the canon block it mirrors. Every current writer of `cybmine` / `cybupdate` is re-pointed at it, and a source-scan invariant fails if a direct write comes back. `cyb-won.ts` is absorbed.

**Tech Stack:** TypeScript strict, Vitest, NestJS services unchanged.

**Spec:** GitHub issue #59 (parent #58).

## Global Constraints

- **Zero gameplay change.** Every transition writes exactly the fields, values and `Random` draw ORDER the current code writes. The existing cybertron suites (52 files) must pass unmodified, except for import paths.
- Where the port's current field set differs from canon's, keep the PORT's and say so in the JSDoc. Fixing it is separate work with its own DECISIONS entry.
- Every exported function has JSDoc citing its canon lines (`@see GECYBS.C:…`), per CLAUDE.md.
- `255` is written through `CYBMINE_NONE` from `ship/ship-channel.registry.ts`, never as a literal.
- Backend specs need `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` (the harness force-resets `ge_test`). Ask the owner for consent before the first run.
- Commit to `master` directly. VERSION patch bump plus a `SILENT_RELEASES` entry in the final commit.

## The transitions

Derived from reading every write site against canon, 2026-09-21:

| Function | Canon | Fields written | Current site(s) |
|---|---|---|---|
| `provoke(ai, attackerChannel)` | GECMDS.C:980-981, 1071-1072, 1373-1374 | `cybmine` (only if `status === GESTAT_AUTO`) | phaser.handler.ts:258-262 and :484, cybertron-tick.service.ts:563, :662 |
| `acquire(ai, channel)` | GECYBS.C:740 | `cybmine` | cybertron-tick.service.ts:1048 |
| `releaseTargetLeft(ai, topSpeed, rng)` | GECYBS.C:684-688 | `cybmine`, `speed2b = rndm(top)` | :940 |
| `releaseTargetCloaked(ai, topSpeed, rng)` | GECYBS.C:692-704 | `holdcourse`, `speed2b`, then 1-in-10 `cybmine` | :981-985 |
| `releaseZoneEntry(ai, topSpeed, rng)` | PORT-ORIGINAL, re-roll from GECYBS.C:473-474 | `cybmine`, `speed2b`, `head2b` | :956-975 |
| `releaseBreakOff(ai, topSpeed)` | GECYBS.C:259-261 | `cybmine`, `speed2b = top` | :433-434 |
| `releaseNoTarget(ai)` | GECYBS.C:733-737 | `tick = 255`, `cybmine` | :1068-1071 |
| `releaseStale(ai)` | GECYBS.C:678-681 | `cybmine` | :1043, :1070 |
| `releaseWon(ai)` | GECYBS.C:817-819 `cyb_won` | `cybmine`, `speed2b = 2000`, `cybupdate = 0` | :1257-1263 via cyb-won.ts |
| `releaseDeadTarget(ai)` | PORT-ORIGINAL; canon's `killem` calls only the killer's `won_func` (GEFUNCS.C:1110-1113) | `cybmine` | combat-tick.service.ts:400 |
| `idleCadence(ai, topSpeed, rng)` | GECYBS.C:463-476 `db_update` | `cybupdate`; when unclaimed, `speed2b`, `head2b` | :356-368 `cybUpdateDb` |
| `hydrate(ai)` | GECYBS.C:131-137 | `status`, `cybmine`, `holdcourse`, `speed2b = topspeed*1000` | cybertron.repository.ts:144-169 |

**Out of scope, on purpose:** the jammed drift, `cybCheckDamage` and `applyEvasion` write only steering (`speed2b` / `head2b` / `holdcourse`) and never the claim. The defect class in #59 is the claim changing without its companions, and these three cannot cause it. `hydrate` keeps not writing canon's `phasr`, `cybupdate` and `tick`, as the existing DECISIONS entry records.

---

### Task 1: `cyb-transitions.ts` with a unit test per transition

**Files:**
- Create: `backend/src/game/cybertron/cyb-transitions.ts`
- Create: `backend/test/game/cybertron/cyb-transitions.spec.ts`
- Delete: `backend/src/game/cybertron/cyb-won.ts` (its constant and doc move into the new module)
- Modify: `backend/test/game/cybertron/cyb-won.spec.ts`: point it at `releaseWon`

**Interfaces:**
- Consumes: `Random` (`combat/random.port`), `CYBMINE_NONE` (`ship/ship-channel.registry`), `GESTAT_AUTO` (`constants`)
- Produces: every function in the table above, plus `CYB_WON_SPEED = 2000` and the type

```ts
export interface CybClaimState {
  cybmine: number; speed2b: number; head2b: number;
  holdcourse: number; cybupdate: number; tick: number;
}
```

- [ ] **Step 1: Write the failing spec.** One `describe` per function. Each asserts the COMPLETE field set, and asserts that fields outside it are untouched. Seed a scripted `Random` so the draw order is pinned:

```ts
const seq = (...xs: number[]): Random => { let i = 0; return { next: () => xs[i++] } };
const base = (): CybClaimState & { status: number; topspeed: number } =>
  ({ cybmine: 7, speed2b: 284, head2b: 90, holdcourse: 3, cybupdate: 40, tick: 12, status: 2, topspeed: 4 });

it('releaseTargetCloaked: holdcourse, then speed, then the 1-in-10 give-up, in that order', () => {
  const s = base();
  releaseTargetCloaked(s, 4000, seq(0.5, 0.25, 0.05));
  expect(s).toEqual({ ...base(), holdcourse: 7, speed2b: 1000, cybmine: CYBMINE_NONE });
});
it('releaseTargetCloaked keeps the claim on a 9-in-10 roll', () => {
  const s = base();
  releaseTargetCloaked(s, 4000, seq(0.5, 0.25, 0.5));
  expect(s.cybmine).toBe(7);
});
it('provoke leaves a player ship alone', () => {
  const s = { ...base(), status: 1 };
  provoke(s, 18);
  expect(s.cybmine).toBe(7);
});
it('releaseNoTarget writes tick 255 and the claim, and leaves the course', () => {
  const s = base();
  releaseNoTarget(s);
  expect(s).toEqual({ ...base(), tick: 255, cybmine: CYBMINE_NONE });
});
it('hydrate restores cruise unconditionally, including a Base Star at 0', () => {
  const s = { ...base(), topspeed: 0, status: 0 };
  hydrate(s);
  expect(s).toEqual({ ...base(), topspeed: 0, status: 2, cybmine: CYBMINE_NONE, holdcourse: 0, speed2b: 0 });
});
it('idleCadence: counts down without touching the course', () => {
  const s = base(); idleCadence(s, 4000, seq());
  expect(s).toEqual({ ...base(), cybupdate: 39 });
});
it('idleCadence at 1: re-rolls course only when unclaimed', () => {
  const claimed = { ...base(), cybupdate: 1 };
  idleCadence(claimed, 4000, seq(0.5));
  expect(claimed).toEqual({ ...base(), cybupdate: 150 });
  const free = { ...base(), cybupdate: 1, cybmine: CYBMINE_NONE };
  idleCadence(free, 4000, seq(0.5, 0.5, 0.5));
  expect(free).toEqual({ ...base(), cybmine: CYBMINE_NONE, speed2b: 2000, head2b: 179.95, cybupdate: 150 });
});
```

…plus the matching complete-field-set assertions for `acquire`, `releaseTargetLeft`, `releaseZoneEntry` (draws: speed, then heading), `releaseBreakOff`, `releaseStale`, `releaseWon`, `releaseDeadTarget`, and `provoke` on an AI.

- [ ] **Step 2: Run it and watch it fail.**
`cd backend && PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="…" npx vitest run test/game/cybertron/cyb-transitions.spec.ts`. Expected: fails to import `cyb-transitions`.

- [ ] **Step 3: Implement.** The bodies are copied from the current sites with no change. For example:

```ts
/** @see GECYBS.C:692-704 — target cloaked: hold, cruise, and maybe give up */
export function releaseTargetCloaked(ai: CybClaimState, topSpeed: number, rng: Random): void {
  ai.holdcourse = Math.floor(rng.next() * 5) + 5;
  ai.speed2b = rng.next() * topSpeed;
  if (Math.floor(rng.next() * 10) === 0) ai.cybmine = CYBMINE_NONE;
}

/** @see GECYBS.C:463-476 db_update */
export function idleCadence(ai: CybClaimState, topSpeed: number, rng: Random): void {
  if (ai.cybupdate > 1) { ai.cybupdate--; return; }
  if (ai.cybupdate === 1) {
    if (ai.cybmine === CYBMINE_NONE) {
      ai.speed2b = rng.next() * topSpeed;
      ai.head2b = rng.next() * 359.9;
    }
    ai.cybupdate = 100 + Math.floor(rng.next() * 100);
  }
}
```

Move the canon-quoting comments from the call sites (the zone-entry crawl story, the no-target random-walk story, the hydrate story) onto the function JSDoc, so the reasoning stays with the only code that can repeat the mistake.

- [ ] **Step 4: Run it and watch it pass.** Same command. Expected: PASS.

- [ ] **Step 5: Re-point `cyb-won.spec.ts`** at `releaseWon`, keeping its assertions. Note that `releaseWon` mutates in place where `cybWon` returned a copy. Run it and expect a PASS.

- [ ] **Step 6: Commit.** `refactor(ai): one function per Cybertron claim transition (#59)`

### Task 2: Route the Cybertron tick through the transitions

**Files:**
- Modify: `backend/src/game/cybertron/cybertron-tick.service.ts`: lines 356-368, 433-434, 563, 662, 940, 956-975, 981-985, 1043, 1048, 1068-1071, 1257-1263

**Interfaces:**
- Consumes: all of Task 1

- [ ] **Step 1: Replace each site with its call.** `cybUpdateDb` becomes a single line, `idleCadence(ship, topSpeed, this.random)`: inline it and delete the method. For example, the cloak branch:

```ts
} else if (current.cloak === 10) {
  releaseTargetCloaked(ship, topSpeed, this.random);
  return;
}
```

Keep the `return`s, the event emission and the flush where they are. Only the field writes move.

- [ ] **Step 2: Run the cybertron suites.** `npx vitest run test/game/cybertron test/invariants`. Expected: every test passes UNMODIFIED. A failure means the draw order or a field changed. Fix the transition, not the test.

- [ ] **Step 3: Commit.** `refactor(ai): Cybertron tick writes its claim only through transitions (#59)`

### Task 3: Route the outside writers through the transitions

**Files:**
- Modify: `backend/src/game/commands/handlers/phaser.handler.ts:252-262, 478-486`
- Modify: `backend/src/game/combat/combat-tick.service.ts:394-402`
- Modify: `backend/src/game/cybertron/cybertron.repository.ts:143-169`

- [ ] **Step 1: phaser.handler.** The sweep loop provokes TWICE per victim: the first `mutate` at :258, then again inside the damage `mutate` at :261. Nothing reads `cybmine` between the two. Delete the first block, keep its comment, and call `provoke(v, ship.channel ?? NO_CHANNEL)` in the second. Do the same at :484.
- [ ] **Step 2: combat-tick.** `if (s.status === 2 && …) releaseDeadTarget(s)`. Replace the literal `2` with `GESTAT_AUTO` while there. It is the same value.
- [ ] **Step 3: repository.** Replace the four field writes with `hydrate(state)`, and move the long comment to `hydrate`'s JSDoc.
- [ ] **Step 4: Run** `npx vitest run test/game test/invariants`. Expected: PASS, unmodified.
- [ ] **Step 5: Commit.** `refactor(ai): player fire, kills and hydrate change a claim only through transitions (#59)`

### Task 4: The guard, the docs and the release

**Files:**
- Create: `backend/test/invariants/cyb-claim-writes.spec.ts`
- Modify: `docs/DECISIONS.md`, `docs/PROGRESS.md`, `VERSION`, `backend/src/public/changelog.ts` (`SILENT_RELEASES`)

- [ ] **Step 1: Write the guard.** Walk `src/` recursively and fail on any assignment to `.cybmine` or `.cybupdate` outside `cyb-transitions.ts`:

```ts
const WRITE = /\.(cybmine|cybupdate)\s*(?:[+-]?=(?!=)|\+\+|--)/;
```

Object literals (`cybmine: 255` in spawners and mappers) are construction, not transition, and do not match. The spec's header explains why the guard exists, citing the four v0.27.4-v0.27.8 defects.

- [ ] **Step 2: Prove the guard can fail.** Temporarily add `ship.cybmine = 3;` to `cybertron-tick.service.ts`, run the spec and see it FAIL naming the file. Then revert.
- [ ] **Step 3: Run the full backend suite.** `npx vitest run`. Expected: PASS, with the suite and test counts recorded for PROGRESS.
- [ ] **Step 4: Docs.** DECISIONS gets a dated entry that turns the 2026-09-20 "canon writes fields together" rule into a mechanism: the table above, the two port-original transitions, and the out-of-scope steering. PROGRESS gets a session entry. Bump VERSION by a patch and add a `SILENT_RELEASES` entry: no player-visible change.
- [ ] **Step 5: Commit** with the version in the subject, then comment on #59 and close it.
