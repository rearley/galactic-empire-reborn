# Fidelity Audit v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The four subsystem walks (Tasks 2–5) are marked **[P]** and may be dispatched in parallel.

**Goal:** Find fidelity & state-management bugs across four high-risk subsystems and pin the correct rules with an invariant harness so drift fails CI.

**Architecture:** Five-step C↔TS walk per subsystem with findings recorded in a shared table. A new `backend/src/game/invariants/` module hosts pure-function rules importable by Jest specs and invokable each physics tick when `INVARIANTS_RUNTIME=1`. HIGH-severity findings are fixed inline with TDD; MEDIUM/LOW are deferred.

**Tech Stack:** TypeScript (NestJS), Jest, existing TickService (no `@nestjs/schedule` involvement — raw setInterval), Prisma.

**Authoritative design:** [`docs/superpowers/specs/2026-05-11-fidelity-audit-v2-design.md`](../../docs/superpowers/specs/2026-05-11-fidelity-audit-v2-design.md)
**Findings table:** [`./findings.md`](./findings.md)

---

## Conventions

- All file paths in this plan are relative to repo root.
- Run commands from `backend/` unless prefixed `(repo-root)`.
- Test command: `npm test -- <pathOrPattern>`.
- Commit style: matches existing repo history (`feat:`, `fix:`, `docs:`, `test:`). **Do NOT add Co-Authored-By trailers** (per project memory).
- When a walk surfaces a HIGH finding, branch into the "Fix a HIGH finding" sub-procedure (Task 7) before continuing the walk — don't accumulate unfixed HIGHs.

---

## Task 1: Scaffold the invariant harness

**Files:**
- Create: `backend/src/game/invariants/harness.ts`
- Create: `backend/src/game/invariants/invariants.types.ts`
- Create: `backend/src/game/invariants/invariants.module.ts`
- Create: `backend/test/invariants/harness.spec.ts`
- Modify: `backend/src/game/tick/tick.service.ts` (add post-physics-tick invariant invocation behind env flag)
- Modify: `backend/src/app.module.ts` (register InvariantsModule)

- [ ] **Step 1.1: Write the failing harness type + registry test**

Create `backend/test/invariants/harness.spec.ts`:

```typescript
import { InvariantRegistry, Violation } from '../../src/game/invariants/harness';

describe('InvariantRegistry', () => {
  it('runs registered invariants and aggregates violations', () => {
    const registry = new InvariantRegistry();
    registry.register({
      name: 'always-fails',
      sourceRef: 'TEST',
      run: () => [{ rule: 'always-fails', sourceRef: 'TEST', severity: 'HIGH', detail: 'x' }],
    });
    registry.register({
      name: 'always-passes',
      sourceRef: 'TEST',
      run: () => [],
    });

    const result: Violation[] = registry.runAll({} as any);

    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('always-fails');
  });

  it('isolates a throwing invariant and reports it as a violation', () => {
    const registry = new InvariantRegistry();
    registry.register({
      name: 'throws',
      sourceRef: 'TEST',
      run: () => { throw new Error('boom'); },
    });

    const result = registry.runAll({} as any);

    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('throws');
    expect(result[0].detail).toContain('boom');
  });
});
```

- [ ] **Step 1.2: Run the test to confirm it fails**

Run: `cd backend && npm test -- test/invariants/harness.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 1.3: Implement the harness**

Create `backend/src/game/invariants/invariants.types.ts`:

```typescript
export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Violation {
  rule: string;
  sourceRef: string;
  severity: Severity;
  detail: string;
}

/**
 * A WorldSnapshot is whatever the registered invariants need to read.
 * Each invariant declares the slice it reads via its `run` signature.
 * Keep this loose for now; tighten as invariants are added.
 */
export interface WorldSnapshot {
  ships?: unknown;
  ai?: unknown;
  combatEvents?: unknown;
  scanResults?: unknown;
  dbShips?: unknown;
}

export interface Invariant {
  name: string;
  sourceRef: string;
  run: (world: WorldSnapshot) => Violation[];
}
```

Create `backend/src/game/invariants/harness.ts`:

```typescript
import { Invariant, Violation, WorldSnapshot } from './invariants.types';

export { Invariant, Violation, WorldSnapshot };

export class InvariantRegistry {
  private invariants: Invariant[] = [];

  register(inv: Invariant): void {
    this.invariants.push(inv);
  }

  runAll(world: WorldSnapshot): Violation[] {
    const out: Violation[] = [];
    for (const inv of this.invariants) {
      try {
        out.push(...inv.run(world));
      } catch (err) {
        out.push({
          rule: inv.name,
          sourceRef: inv.sourceRef,
          severity: 'HIGH',
          detail: `invariant threw: ${(err as Error).message}`,
        });
      }
    }
    return out;
  }

  count(): number {
    return this.invariants.length;
  }
}
```

- [ ] **Step 1.4: Run the test to confirm pass**

Run: `cd backend && npm test -- test/invariants/harness.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 1.5: Wire the runtime hook into TickService**

Create `backend/src/game/invariants/invariants.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { InvariantRegistry } from './harness';

@Module({
  providers: [{ provide: InvariantRegistry, useValue: new InvariantRegistry() }],
  exports: [InvariantRegistry],
})
export class InvariantsModule {}
```

Add to `backend/src/app.module.ts` imports (locate the existing `imports: [...]` array and append):

```typescript
import { InvariantsModule } from './game/invariants/invariants.module';
// ...
imports: [
  // ...existing entries...
  InvariantsModule,
],
```

Modify `backend/src/game/tick/tick.service.ts`:

- Add constructor injection of `InvariantRegistry` from `../invariants/harness`.
- After the existing physics tick body, add:

```typescript
if (process.env.INVARIANTS_RUNTIME === '1') {
  const violations = this.invariants.runAll(this.snapshotForInvariants());
  if (violations.length > 0) {
    this.logger.warn(
      `invariant violations: ${violations
        .map((v) => `${v.rule}(${v.severity}):${v.detail}`)
        .join('; ')}`,
    );
  }
}
```

- Add a `private snapshotForInvariants(): WorldSnapshot` method that returns `{}` for now. Tasks 2–5 expand it.

- [ ] **Step 1.6: Run full backend test suite — confirm no regression**

Run: `cd backend && npm test`
Expected: all green.

- [ ] **Step 1.7: Commit**

```bash
git add backend/src/game/invariants backend/src/game/tick/tick.service.ts backend/src/app.module.ts backend/test/invariants
git commit -m "feat(invariants): scaffold harness + runtime tick hook behind INVARIANTS_RUNTIME flag"
```

---

## Task 2 [P]: Walk — Ship state persistence

> **Walk order:** Persistence first. Memory↔DB truth underpins every other walk.

**Files:**
- Read: `reference/ge-source/GEMAIN.H`, `GEMAIN.C`, `GEFUNCS.C` (find session save/restore + ghost-user logic)
- Read: `backend/src/game/ship/ship-state.types.ts`, `ship-state.service.ts`, `ship-state.mappers.ts`, `ship-tick.service.ts`, `maintenance.service.ts`, `auto-shield.ts`, `ship-overspeed.ts`
- Read: `backend/src/auth/` (JWT vs User row — recent fix `618c1dc` is the context)
- Write: `specs/022-fidelity-audit-v2/findings.md` — append `P-001`, `P-002`, … under the **Ship state persistence** table.

- [ ] **Step 2.1: C source inventory**

In a scratch section at the bottom of `findings.md` (or a local note — does not need to land in git), list every C function/global/file that touches:
- ship load on logon
- per-tick state mutation (energy regen, shield regen, repair)
- save on logoff / save on crash
- session-cleanup / ghost detection
- midnight job's interaction with active ships

Cite as `GEMAIN.C:1234`.

- [ ] **Step 2.2: TS surface inventory**

List every TS module that owns or mutates ship state. Anchor: `ShipStateService` is the in-memory truth per CLAUDE.md "State Management" section. Confirm by reading the file.

- [ ] **Step 2.3: Side-by-side walk**

For each persisted field on `ShipState`, answer:
- Is the field authoritative in memory, in DB, or both?
- When is it flushed? On what trigger?
- What happens on reconnect — read from DB or trust memory?
- What happens to in-memory state when the User row is missing (the `618c1dc` scenario)?
- Does midnight job operate on memory, DB, or both?

For each rule that has a C counterpart, record `match` / `drift` / `missing` / `extra`. File findings as `P-NNN` rows in `findings.md`.

- [ ] **Step 2.4: Record HIGH findings, branch to Task 7 for each fix**

For every HIGH finding, follow Task 7's TDD fix sub-procedure before continuing.

- [ ] **Step 2.5: Commit findings**

```bash
git add specs/022-fidelity-audit-v2/findings.md
git commit -m "audit(022): persistence walk — P-NNN findings"
```

---

## Task 3 [P]: Walk — Combat ranges & weapons

**Files:**
- Read: `reference/ge-source/GEMAIN.H` (weapon constants), `GEFUNCS.C` (phasor/torp/missile math, `cdistance`), `GECMDS.C` (`pha`, `tor`, `mis`, `min` handlers)
- Read: `backend/src/game/combat/combat-math.ts`, `combat-tick.service.ts`, `mine.registry.ts`, `mine.repository.ts`, `random.port.ts`
- Read: `backend/src/game/commands/handlers/phaser.handler.ts`, `torpedo.handler.ts`, `mine.handler.ts`, plus any missile handler
- Read: `backend/src/game/constants.ts` (verify weapon range/falloff pins match `GEMAIN.H`)
- Write: `findings.md` — append `C-NNN` rows.

- [ ] **Step 3.1: C source inventory**

List every weapon: phasor, torpedo, missile, mine. For each: max range, damage formula, damage falloff with distance, lock-acquisition rules, energy cost.

- [ ] **Step 3.2: TS surface inventory** — corresponding TS implementation per weapon.

- [ ] **Step 3.3: Side-by-side walk** — record `match`/`drift`/`missing`/`extra` per rule.

- [ ] **Step 3.4: File `C-NNN` findings, branch to Task 7 for each HIGH**

- [ ] **Step 3.5: Commit findings**

```bash
git add specs/022-fidelity-audit-v2/findings.md
git commit -m "audit(022): combat ranges walk — C-NNN findings"
```

---

## Task 4 [P]: Walk — AI targeting & engagement

> **Depends on:** Task 3 (combat-range truth informs AI fire decisions).

**Files:**
- Read: `reference/ge-source/GECYBS.C`, `GEDROIDS.C`, `GEMAIN.H` (`CYB_BE_NICE`, `CYB_BE_EASY`, neutral zone extents)
- Read: `backend/src/game/cybertron/cybertron-tick.service.ts`, `cyb-decisions.ts`, `cybertron.config.ts`, `cybertron.repository.ts`
- Read: `backend/src/game/droid/droid-tick.service.ts`, `droid-decisions.ts`, `droid-act-class-10.ts`, `droid-act-class-11.ts`, `droid-act-class-12.ts`, `droid.config.ts`
- Write: `findings.md` — append `A-NNN` rows.

- [ ] **Step 4.1: C source inventory**

For each AI archetype (Cybertron, Droid classes 10/11/12, Murdonian Transport):
- target acquisition range
- which weapons each can fire and their ranges
- visibility/sector gating — when does the AI consider a player a candidate?
- neutral-zone behavior
- escalation thresholds (`CYB_BE_NICE`, `CYB_BE_EASY`)
- fleeing/retreat conditions

- [ ] **Step 4.2: TS surface inventory**

- [ ] **Step 4.3: Side-by-side walk** — record `match`/`drift`/`missing`/`extra` per rule, **paying special attention to the symptom that motivated this audit: AI firing across the map**. Confirm whether the C-source visibility gate is correctly applied in TS.

- [ ] **Step 4.4: File `A-NNN` findings, branch to Task 7 for each HIGH**

- [ ] **Step 4.5: Commit findings**

```bash
git add specs/022-fidelity-audit-v2/findings.md
git commit -m "audit(022): AI targeting walk — A-NNN findings"
```

---

## Task 5 [P]: Walk — Scanners & visibility

**Files:**
- Read: `reference/ge-source/GECMDS.C` (scan command variants, `printmapfull`), `GEFUNCS.C` (`cdistance`, beacon emission), `GEMAIN.H` (scanner-range constants, `MAXX`/`MAXY`)
- Read: `backend/src/game/commands/handlers/scan.handler.ts` and any scanner-related types (`backend/src/game/galaxy/galaxy.types.ts` for `GalaxyWormholeView` per F-003)
- Write: `findings.md` — append `S-NNN` rows.

- [ ] **Step 5.1: C source inventory**

Each scan variant (`sca`, `sca lo`, `sca full`, side-panel data, beacons on entry):
- visibility range
- what fields are revealed (ship name, hull, energy, position, heading, cloaking?)
- target filter (only ships? planets? wormholes?)
- cost / cooldown

- [ ] **Step 5.2: TS surface inventory**

- [ ] **Step 5.3: Side-by-side walk** — **the symptom here is basic scanners revealing the whole map**. Confirm whether the TS scan handler correctly bounds visibility per scan type / sensor strength.

- [ ] **Step 5.4: File `S-NNN` findings, branch to Task 7 for each HIGH**

- [ ] **Step 5.5: Commit findings**

```bash
git add specs/022-fidelity-audit-v2/findings.md
git commit -m "audit(022): scanners walk — S-NNN findings"
```

---

## Task 6: Author seed invariants

For each invariant below, follow the same micro-loop: write failing spec → implement → run → commit. Pattern shown for the first one; the others follow the same pattern with paths/code adjusted.

**Files (one module per subsystem):**
- Create: `backend/src/game/invariants/ship-persistence.invariants.ts`
- Create: `backend/src/game/invariants/combat-ranges.invariants.ts`
- Create: `backend/src/game/invariants/ai-targeting.invariants.ts`
- Create: `backend/src/game/invariants/scanners.invariants.ts`
- Create: `backend/test/invariants/ship-persistence.spec.ts`
- Create: `backend/test/invariants/combat-ranges.spec.ts`
- Create: `backend/test/invariants/ai-targeting.spec.ts`
- Create: `backend/test/invariants/scanners.spec.ts`
- Modify: `backend/src/game/invariants/invariants.module.ts` (register each invariant with the registry on module init)
- Modify: `backend/src/game/tick/tick.service.ts` — flesh out `snapshotForInvariants()` to include the slices needed (ships, AI, recent combat events, dbShips loader if needed).

### 6a: `weaponFireRangeRespected` — combat-ranges

- [ ] **Step 6a.1: Write the failing test**

Create `backend/test/invariants/combat-ranges.spec.ts`:

```typescript
import { weaponFireRangeRespected } from '../../src/game/invariants/combat-ranges.invariants';

describe('weaponFireRangeRespected', () => {
  it('flags a combat event fired outside the weapon max range', () => {
    const world = {
      combatEvents: [
        {
          weapon: 'phasor',
          shooter: { x: 0, y: 0 },
          target: { x: 99, y: 99 },
          maxRange: 5,
        },
      ],
    };

    const violations = weaponFireRangeRespected.run(world as any);

    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('HIGH');
  });

  it('passes when shooter is within range', () => {
    const world = {
      combatEvents: [
        {
          weapon: 'phasor',
          shooter: { x: 0, y: 0 },
          target: { x: 1, y: 1 },
          maxRange: 5,
        },
      ],
    };

    expect(weaponFireRangeRespected.run(world as any)).toEqual([]);
  });
});
```

- [ ] **Step 6a.2: Run — confirm fails**

Run: `cd backend && npm test -- test/invariants/combat-ranges.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 6a.3: Implement**

Create `backend/src/game/invariants/combat-ranges.invariants.ts`:

```typescript
import { Invariant } from './invariants.types';

interface CombatEventLike {
  weapon: string;
  shooter: { x: number; y: number };
  target: { x: number; y: number };
  maxRange: number;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export const weaponFireRangeRespected: Invariant = {
  name: 'weaponFireRangeRespected',
  sourceRef: 'GEFUNCS.C:cdistance + GEMAIN.H weapon range constants',
  run: (world) => {
    const events = (world.combatEvents as CombatEventLike[] | undefined) ?? [];
    const violations = [];
    for (const e of events) {
      if (distance(e.shooter, e.target) > e.maxRange) {
        violations.push({
          rule: 'weaponFireRangeRespected',
          sourceRef: 'GEFUNCS.C',
          severity: 'HIGH' as const,
          detail: `${e.weapon} fired at distance ${distance(e.shooter, e.target).toFixed(2)} > maxRange ${e.maxRange}`,
        });
      }
    }
    return violations;
  },
};
```

- [ ] **Step 6a.4: Run — confirm pass**

- [ ] **Step 6a.5: Register in module**

Edit `backend/src/game/invariants/invariants.module.ts` to register on construction:

```typescript
import { Module, OnModuleInit } from '@nestjs/common';
import { InvariantRegistry } from './harness';
import { weaponFireRangeRespected } from './combat-ranges.invariants';

@Module({
  providers: [
    {
      provide: InvariantRegistry,
      useFactory: () => {
        const r = new InvariantRegistry();
        r.register(weaponFireRangeRespected);
        return r;
      },
    },
  ],
  exports: [InvariantRegistry],
})
export class InvariantsModule {}
```

- [ ] **Step 6a.6: Commit**

```bash
git add backend/src/game/invariants/combat-ranges.invariants.ts backend/src/game/invariants/invariants.module.ts backend/test/invariants/combat-ranges.spec.ts
git commit -m "test(invariants): add weaponFireRangeRespected"
```

### 6b: `aiCannotFireAcrossMap` — ai-targeting

Same pattern as 6a. The invariant takes the world's recent AI fire events and asserts:
1. Distance shooter→target ≤ the weapon's maxRange (re-uses the same distance check)
2. The target was in the AI ship's visibility set at the firing tick

Visibility-set definition comes from the Task 4 walk findings. If the C-source visibility rule is not yet documented at the time this invariant is authored, defer 6b's visibility clause and ship only the range clause — file a deferred MEDIUM in `findings.md` to add the visibility clause once Task 4 is complete.

Create `backend/src/game/invariants/ai-targeting.invariants.ts` and `backend/test/invariants/ai-targeting.spec.ts` following the 6a pattern. Register in the module factory. Commit:

```bash
git commit -m "test(invariants): add aiCannotFireAcrossMap"
```

### 6c: `aiRespectsNeutralZone` — ai-targeting

Invariant: no AI fire event resolves with the target inside the neutral-zone box defined in `GEMAIN.H`. Fixture-driven test in `backend/test/invariants/ai-targeting.spec.ts` (append to the file).

### 6d: `scanRangeMatchesScanType` — scanners

Invariant: for each entry in `world.scanResults`, every revealed sector lies within the C-source-defined range for that scan type. Range constants come from the Task 5 walk; pin them in `backend/src/game/constants.ts` if not already pinned.

Create `backend/src/game/invariants/scanners.invariants.ts` and `backend/test/invariants/scanners.spec.ts`.

### 6e: `inMemoryShipMatchesDb` — ship-persistence

Invariant: for every ship in `world.ships` that has a `lastFlushedAt` ≤ now-Δ, every persisted field equals the corresponding row in `world.dbShips`. Requires the harness snapshot to load DB rows — implement this as an async-prep step before invariant invocation (load DB rows into the snapshot, then run sync invariants). Add this prep to `TickService.snapshotForInvariants()`.

If async snapshot prep adds nontrivial cost, gate it behind a second flag `INVARIANTS_DB_CHECK=1` rather than running every physics tick.

### 6f: `noOrphanShipState` — ship-persistence

Invariant: for every entry in `world.ships`, a matching User row exists (the `618c1dc` scenario must fail the test). Fixture test for the rule itself; runtime check uses the same `dbShips` slice.

After 6f passes, commit:

```bash
git add backend/src/game/invariants backend/test/invariants
git commit -m "test(invariants): add seed invariants for scanners, AI targeting, persistence"
```

---

## Task 7: HIGH-finding fix sub-procedure (invoked from walks)

This is not a single task — it's a procedure to run **for each HIGH finding** surfaced during Tasks 2–5.

- [ ] **Step 7.1: Reproduce as a failing unit test**

In the test folder matching the TS module under audit, add a test asserting the *correct* (C-source) behavior. Run it — it must FAIL on current code, confirming the finding.

- [ ] **Step 7.2: Fix the TS module**

Make the minimal change to restore fidelity to the C source. Cite the C source location in a code comment **only** if the rule is non-obvious to a future reader (per CLAUDE.md commenting rules).

- [ ] **Step 7.3: Run the new test + the surrounding suite**

Run: `cd backend && npm test -- <relevant pattern>`
Expected: PASS, no regressions.

- [ ] **Step 7.4: Update the finding row**

In `findings.md`, set `disposition: fixed` and fill in `testRef`.

- [ ] **Step 7.5: Commit the fix**

```bash
git add <changed-files> specs/022-fidelity-audit-v2/findings.md
git commit -m "fix(022): <one-line description of the finding>"
```

---

## Task 8: Wire the runtime snapshot

By this point the snapshot keys consumed by invariants are known. Update `TickService.snapshotForInvariants()` to populate them from the existing services (`ShipStateService`, `CombatTickService`'s recent-events buffer, `CybertronTickService` / `DroidTickService` for AI fire events, `ScanHandler` results — instrument as needed).

**Files:**
- Modify: `backend/src/game/tick/tick.service.ts`
- Modify: relevant services if a small accessor is needed (e.g. `getRecentCombatEvents()`)

- [ ] **Step 8.1: Identify required snapshot slices**

Cross-reference the registered invariants. Slices needed (initial set):
- `ships`: `ShipStateService.getAllActive()`
- `combatEvents`: recent buffer from `CombatTickService` (add a small ring buffer if one doesn't exist)
- `aiFireEvents`: similar, from cybertron/droid tick services
- `scanResults`: recent scans — only needed if `scanRangeMatchesScanType` is run at runtime (it's primarily a Jest invariant; runtime is optional)
- `dbShips`: gated behind `INVARIANTS_DB_CHECK=1`

- [ ] **Step 8.2: Add ring-buffer accessors where missing**

For each missing accessor, add a minimal `getRecent<X>Events(): ReadonlyArray<X>` returning the last ~50 events. Pure TS, no DI changes beyond what's already there.

- [ ] **Step 8.3: Populate `snapshotForInvariants()`**

```typescript
private snapshotForInvariants(): WorldSnapshot {
  return {
    ships: this.shipState.getAllActive(),
    combatEvents: this.combatTick.getRecentEvents(),
    // ...etc per registered invariants
  };
}
```

- [ ] **Step 8.4: Run full test suite**

Run: `cd backend && npm test`
Expected: all green.

- [ ] **Step 8.5: Commit**

```bash
git add backend/src
git commit -m "feat(invariants): wire runtime snapshot from tick services"
```

---

## Task 9: Dev-playtest validation run

- [ ] **Step 9.1: Start backend with invariants on**

Run (from `backend/`): `INVARIANTS_RUNTIME=1 npm run start:dev`

- [ ] **Step 9.2: Drive a 15-minute playtest**

Cover: logon, warp around the map, scan from multiple positions, take fire from a Cybertron, dock at a planet, logoff, reconnect, get killed once. Watch the server log for `invariant violations:` warn lines.

- [ ] **Step 9.3: Triage any violations**

For every violation observed:
- If it's a legitimate fidelity bug → file a finding, fix per Task 7.
- If it's a false positive (invariant defined on an unstable observation point) → fix the invariant, not the gameplay code. Add a comment **only** if the stable-observation-point requirement is non-obvious.

- [ ] **Step 9.4: Re-run until a clean 15-minute session produces zero unexplained violations**

- [ ] **Step 9.5: Record the validation in PROGRESS**

Add an entry to `docs/PROGRESS.md` per the format in CLAUDE.md.

```bash
git add docs/PROGRESS.md
git commit -m "docs(022): record fidelity audit v2 completion"
```

---

## Task 10: Final docs sweep

- [ ] **Step 10.1: Confirm `findings.md` is complete**

Every HIGH has `disposition: fixed` + `testRef`. MEDIUM/LOW are either `fixed`, `deferred`, or `n/a` with notes.

- [ ] **Step 10.2: Cross-link from existing audit doc**

Add a one-line pointer at the bottom of `docs/020-audit-findings.md`:

```markdown
> Subsequent audit: see [specs/022-fidelity-audit-v2/findings.md](../specs/022-fidelity-audit-v2/findings.md).
```

- [ ] **Step 10.3: Update `docs/ARCHITECTURE.md` if any module structure changed**

Only if Task 7 fixes restructured anything. Likely a small addition for the new `game/invariants/` module.

- [ ] **Step 10.4: Commit**

```bash
git add docs/ specs/022-fidelity-audit-v2/findings.md
git commit -m "docs(022): close out fidelity audit v2"
```

---

## Self-Review Notes

- **Spec coverage:** Tasks 2–5 cover all four scoped subsystems. Task 6 implements the seed invariants from the design. Task 7 covers HIGH-fix discipline. Task 9 covers the dev-playtest acceptance gate. Task 10 + Step 9.5 cover the docs/PROGRESS acceptance criterion.
- **Type consistency:** `Violation`, `Invariant`, `WorldSnapshot` are defined in Task 1 and used identically in Task 6.
- **Placeholders:** None — every code step shows the code; walk tasks are inherently exploratory but each has the citation format and findings-row destination spelled out.
- **Deferred-by-design ambiguity:** Task 6b's visibility clause is intentionally conditional on Task 4's walk completing. That conditional is explicit in the plan, not a TBD.
