# Restructure Phase 4 — Frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `frontend/src/App.tsx` from 388 lines to a wiring shell by moving its socket subscriptions into hooks and its narration decisions into pure functions — with zero change to what a player sees.

**Architecture:** Two patterns already exist in this codebase and this phase extends them rather than inventing anything. Subscription plumbing becomes a hook, following `src/hooks/useScanRender.ts` and `src/features/sector-roster/useSectorRoster.ts`. Narration *decisions* become pure functions under `src/features/<area>/`, following `src/features/combat/destructionLine.ts` — which already takes an event plus viewer context and returns a line **or nothing**.

**Tech Stack:** React 19, Vite 8, Vitest 5, TypeScript 6.0.3, Socket.io client, `@ge/wire` typed event contract.

**Spec:** `docs/superpowers/specs/2026-09-10-restructure-design.md` — the "Phase 4 — frontend restructure" section.

## A caveat about this plan's authority

**The spec does not state a goal for Phase 4.** Its entire content is:

> - [ ] 3,521 lines across 43 files. `App.tsx` at 388 is the largest.
>
> Runs in parallel with 2 and 3, any time after phase 1.

That is an observation. Every other phase names what to change and what done looks like; this one names a file size. **The scope below was derived by reading the code, not from the spec**, and it is deliberately smaller than Phases 2 and 3. Where this plan and the spec appear to disagree, there is nothing to disagree with — the spec is silent.

## Global Constraints

- **Zero behaviour change.** Not just "the tests pass" — the same events must produce the same lines, in the same order, with the same categories, and the handlers that deliberately produce NOTHING must continue to produce nothing.
- **`VERSION` is NOT bumped during the restructure phases.** The bump happens once, at merge.
- **Branch is `restructure`. Nothing goes to master.** Do not touch `.github/workflows/ci.yml`'s `on:` block or the `if: github.event_name == 'push'` image gate.
- **Pre-existing defects get a GitHub issue, not a fix.** If a task turns up something already broken on `master` and unrelated to the task, **flag it in the report and carry on.** The controller files the issue. Eleven have been filed during this restructure. A structural commit that also carries an unrelated fix is one whose zero-behaviour-change claim is no longer checkable.
- **Never pipe a test run through `tail`/`head`.** It discards the failing test's name and masks the exit code. Redirect to a file and grep it.
- **`npm run lint` must stay at exit 0** in `frontend/`.
- **No `any`, no non-null assertions in new code.**
- **The C source is authoritative and `/reference/` is READ ONLY.** Read `reference/CLAUDE.md` before opening anything there. Every `@see GECMDS.C:` / `GEFUNCS.C:` citation and every canon comment moves WITH the code it documents, unchanged. Do not re-derive or re-word one while relocating it.

  **CORRECTED 2026-09-11, during Task 1's review.** An earlier version of this
  constraint said `backend/test/balance/canon-citations.balance.spec.ts` "scans the
  whole repo" and that dropping a frontend citation would fail it. **That is false.**
  Its `SOURCE_FILES` walks only `backend/src` and `backend/test`. The 45 canon
  citations currently in `frontend/` are checked by **nothing** — not counted, not
  quote-verified against `/reference/ge-source/`. Filed as issue #22.

  So the rule stands on its own merit, not because a test enforces it: **move
  citations unchanged because they are the canon derivation, and nothing will catch
  you if you do not.**
- **TDD.** Failing test first, watch the red, then implement.

## Baseline — measure before you start

Recorded 2026-09-11 on `restructure` at `5cca74d`:

| | value |
|---|---|
| `frontend/src` | 42 files, 3,377 lines |
| `frontend/src/App.tsx` | 388 lines |
| hook calls inside its `Terminal` component | 15 |
| distinct socket events subscribed in `App.tsx` | 12 |
| `useEffect` blocks holding them | 6 |
| frontend suite | 39 files / 299 tests, ~17s, green |

Run `npm test` in `frontend/` before your first change and confirm those numbers. The frontend suite does NOT touch the backend's shared `ge_test` database, so it is safe to run at any time.

## What is actually in `App.tsx`

The 12 events are **not** twelve formatters. Read this before planning your own approach:

| shape | events | note |
|---|---|---|
| deliberate no-op | `combat.phaser-fired` | body is `{}`, with ~8 lines of canon explaining that a bystander is shown nothing |
| conditional, viewer-dependent | `combat.hit` | returns early for the victim, early again for phaser/hyper-phaser, and narrates only non-phaser ordnance the LOCAL ship fired |
| already extracted | `combat.ship-destroyed` | delegates to `features/combat/destructionLine.ts`, which may return nothing |
| trivial pass-through | `event.log`, `message.send` | text straight onto the log |
| trivial formatting | `sector:ship-entered`, `sector:ship-left` | one template string each |
| AI narration | `cybertron.taunt`, `droid.annoy` | |
| state, not narration | `scan:render`, `fkeys.snapshot` | feed `ScanMap` and the function-key bar |

**Seven places in the file deliberately produce nothing.** Those are the highest-risk lines in this phase: a refactor that makes one of them emit a line is a visible regression that no existing test necessarily catches, because "nothing happened" is what the current tests assert by omission.

---

### Task 1: `useScanMap`

**Why first:** it is the smallest extraction, it carries no decision logic, and it proves the hook pattern before anything riskier. It also removes the one piece of genuinely duplicated plumbing in the file.

**Files:**
- Create: `frontend/src/hooks/useScanMap.ts`
- Create: `frontend/test/useScanMap.spec.ts`
- Modify: `frontend/src/App.tsx` — remove the `scanCells`/`scanKind` state and its two effects

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `useScanMap(shipId?: string | null): { cells: ScanCell[] | null; kind: ScanRenderEvent['kind'] | null }`. Later tasks do not depend on it.

**Context you need.** `scan:render` currently has TWO subscriptions and that is correct, not a bug:
- `App.tsx:112-119` keeps the **latest** grid, feeding `<ScanMap>`.
- `src/hooks/useScanRender.ts:76` keeps an ordered **history of cards**, feeding `<ScanPanel>`.

Two consumers, two different derived states, one event. **Do not merge them.** This task extracts App's half into a hook so the two sit side by side as peers.

- [ ] **Step 1: Read the two existing hooks**

```bash
cd /home/rick/dev/galactic-empire-reborn/frontend
cat src/hooks/useScanRender.ts
sed -n '86,120p' src/App.tsx
```

`useScanRender` is your template — same file, same shape, same reset-on-ship-change behaviour.

- [ ] **Step 2: Write the failing test**

Create `frontend/test/useScanMap.spec.ts`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { useScanMap } from '../src/hooks/useScanMap';
import { socket } from '../src/socket/socketClient';

describe('useScanMap', () => {
  it('starts with no grid', () => {
    const { result } = renderHook(() => useScanMap('rick:1'));
    expect(result.current.cells).toBeNull();
    expect(result.current.kind).toBeNull();
  });

  it('keeps only the latest grid, replacing the previous one', () => {
    const { result } = renderHook(() => useScanMap('rick:1'));
    act(() => {
      socket.emit('scan:render', { kind: 'lo', cells: [{ x: 1, y: 1, type: 'self', char: '*' }] } as never);
    });
    act(() => {
      socket.emit('scan:render', { kind: 'se', cells: [{ x: 2, y: 2, type: 'planet', char: '3' }] } as never);
    });
    expect(result.current.kind).toBe('se');
    expect(result.current.cells).toHaveLength(1);
    expect(result.current.cells?.[0].x).toBe(2);
  });

  it('discards the grid when the hull changes, because the map belongs to the hull that drew it', () => {
    const { result, rerender } = renderHook(({ id }) => useScanMap(id), {
      initialProps: { id: 'rick:1' },
    });
    act(() => {
      socket.emit('scan:render', { kind: 'lo', cells: [{ x: 1, y: 1, type: 'self', char: '*' }] } as never);
    });
    rerender({ id: 'rick:2' });
    expect(result.current.cells).toBeNull();
    expect(result.current.kind).toBeNull();
  });

  it('unsubscribes on unmount, so a second mount does not double-handle', () => {
    const off = vi.spyOn(socket, 'off');
    const { unmount } = renderHook(() => useScanMap('rick:1'));
    unmount();
    expect(off).toHaveBeenCalledWith('scan:render', expect.any(Function));
  });
});
```

**Check how the existing frontend specs drive socket events before writing these** — look at `frontend/test/` for a spec that already exercises a socket handler, and use the same mechanism. If `socket.emit` is not how this suite delivers a server event to a client handler, use whatever it does use; the assertions above are the point, not the delivery mechanism.

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /home/rick/dev/galactic-empire-reborn/frontend
npm test -- useScanMap > /tmp/red.txt 2>&1; echo "exit=$?"
grep -E "Cannot find module|FAIL|✕" /tmp/red.txt
```

Expected: FAIL — cannot resolve `../src/hooks/useScanMap`.

- [ ] **Step 4: Write the hook**

Create `frontend/src/hooks/useScanMap.ts`, moving the logic from `App.tsx` verbatim. **The comment at `App.tsx:105-106` — "The sector map belongs to the hull that drew it, for the same reason the SCAN DATA cards do" — moves with it, unchanged.**

- [ ] **Step 5: Reduce `App.tsx`**

Replace the two `useState` declarations and the two `useEffect` blocks with one call:

```typescript
const { cells: scanCells, kind: scanKind } = useScanMap(localShipId);
```

The `<ScanMap cells={scanCells} shipId={localShipId} kind={scanKind} />` render stays exactly as it is.

- [ ] **Step 6: Run the suite and commit**

```bash
cd /home/rick/dev/galactic-empire-reborn/frontend
npx tsc --noEmit; echo "tsc=$?"
npm run lint > /tmp/lint.txt 2>&1; echo "lint=$?"
npm test > /tmp/full.txt 2>&1; echo "test=$?"
grep -E "Test Files|Tests " /tmp/full.txt
```

Expected: 39 files / 299 tests plus your new ones, all passing.

```bash
git add src/hooks/useScanMap.ts test/useScanMap.spec.ts src/App.tsx
git commit -m "refactor(frontend): the scan map gets its own hook

App held the latest scan grid and useScanRender held the card history — two
consumers of one event, correct but with the subscription written twice. They
are peers now."
```

---

### Task 2: Combat narration becomes pure decisions

**Why this is the risky task:** these handlers decide whether to say anything at all, and three of them usually decide not to. Their comments are dense canon derivations explaining why silence is correct — that a bystander is shown nothing about someone else's weapons fire, that the server already narrates a hit to its victim, that canon reports hull damage as a number nowhere.

**A refactor that makes any of these emit a line is a visible regression.** The current tests assert much of this by omission, so the suite may not catch it.

**Files:**
- Create: `frontend/src/features/combat/combatNarration.ts`
- Create: `frontend/test/combatNarration.spec.ts`
- Modify: `frontend/src/App.tsx` — the combat/AI `useEffect` block
- Do NOT modify: `frontend/src/features/combat/destructionLine.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `interface NarrationContext { localShipId: string | null; shipName(shipId: string): string }`
  - `combatHitLine(event: CombatHitPayload, ctx: NarrationContext): EventLogLine | null`
  - `phaserFiredLine(event: { shipId: string }, ctx: NarrationContext): EventLogLine | null`
  Task 3 consumes `NarrationContext`.

- [ ] **Step 1: Read the template and the handlers you are moving**

```bash
cd /home/rick/dev/galactic-empire-reborn/frontend
cat src/features/combat/destructionLine.ts
sed -n '170,250p' src/App.tsx
```

`destructionLine.ts` already does exactly what you are doing: takes an event plus viewer context, returns a line or nothing, and carries its canon rationale in the file. Follow it.

- [ ] **Step 2: Enumerate the silences before writing anything**

List every code path in those handlers that produces NO line, and the condition that reaches it. There are at least four: the bystander case for `combat.phaser-fired`; the victim case for `combat.hit`; the phaser/hyper-phaser case for `combat.hit`; and third-party fire for `combat.hit`.

**Put that list in your report.** It is the specification your tests must cover, and it is what a reviewer will check your tests against.

- [ ] **Step 3: Write the failing test**

Create `frontend/test/combatNarration.spec.ts`. **Every silence gets its own case**, because a silence that becomes a line is this task's failure mode:

```typescript
import { combatHitLine, phaserFiredLine } from '../src/features/combat/combatNarration';

const ctx = { localShipId: 'rick:1', shipName: (id: string) => id.split(':')[0] };

describe('phaserFiredLine', () => {
  it('says nothing — canon shows a bystander nothing about another ship\'s weapons fire', () => {
    // PFIRED goes outprfge(FILTER, usrn) — to the firer alone. @see GECMDS.C:943-944
    expect(phaserFiredLine({ shipId: 'someone:1' }, ctx)).toBeNull();
  });
});

describe('combatHitLine', () => {
  const hit = (over: Partial<Parameters<typeof combatHitLine>[0]> = {}) => ({
    attackerId: 'enemy:1', victimId: 'victim:1', weapon: 'torpedo',
    damageHull: 10, damageShield: 0, ...over,
  });

  it('says nothing to the victim — the gateway already relays canon\'s own text', () => {
    expect(combatHitLine(hit({ victimId: 'rick:1' }), ctx)).toBeNull();
  });

  it('says nothing about a phaser the local ship fired — canon narrates that to the firer itself', () => {
    // PHITHIM / PDEFLECT, GECMDS.C:985-995, relayed by the gateway.
    expect(combatHitLine(hit({ attackerId: 'rick:1', weapon: 'phaser' }), ctx)).toBeNull();
    expect(combatHitLine(hit({ attackerId: 'rick:1', weapon: 'hyper-phaser' }), ctx)).toBeNull();
  });

  it('says nothing about a fight between two other ships', () => {
    expect(combatHitLine(hit(), ctx)).toBeNull();
  });

  it('confirms a strike for ordnance the local ship fired', () => {
    expect(combatHitLine(hit({ attackerId: 'rick:1', victimName: 'Marauder' }), ctx))
      .toEqual({ text: 'Sensors confirm a torpedo strike on Marauder.', category: 'combat' });
  });

  it('prefers the server-resolved victim name, because the roster excludes AI', () => {
    // Falling back to the key would print a userid ("Cybrg-222") that no command
    // accepts — `sca sh` wants the ship name.
    expect(combatHitLine(hit({ attackerId: 'rick:1', victimId: 'Cybrg-222:1' }), ctx)?.text)
      .toContain('Cybrg-222');
  });
});
```

Derive each expected string from the CURRENT code in `App.tsx`, not from the block above — if they disagree, the current code wins and the block above is wrong.

- [ ] **Step 4: Run it and watch it fail**

```bash
cd /home/rick/dev/galactic-empire-reborn/frontend
npm test -- combatNarration > /tmp/red.txt 2>&1; echo "exit=$?"
grep -E "Cannot find module|FAIL|✕" /tmp/red.txt
```

- [ ] **Step 5: Move the decisions**

Create `frontend/src/features/combat/combatNarration.ts`. **Every canon comment moves verbatim** — the `PFIRED`/`outprfge` explanation, the hull-damage-is-never-a-number derivation, the note on why phaser is excluded and why it would arrive first. Those comments are the most valuable thing in this diff and the citation ratchet has no headroom.

`combat.ship-destroyed` keeps delegating to `destructionLine.ts`. Do not fold that in.

- [ ] **Step 6: Reduce the handlers in `App.tsx`**

Each becomes a call plus an append:

```typescript
const handleCombatHit = (event: CombatHitPayload) => {
  const line = combatHitLine(event, { localShipId, shipName });
  if (line) appendLines([line]);
};
```

- [ ] **Step 7: Full suite and commit**

```bash
cd /home/rick/dev/galactic-empire-reborn/frontend
npx tsc --noEmit; echo "tsc=$?"
npm run lint > /tmp/lint.txt 2>&1; echo "lint=$?"
npm test > /tmp/full.txt 2>&1; echo "test=$?"
grep -E "Test Files|Tests |FAIL" /tmp/full.txt
```

```bash
git add src/features/combat/combatNarration.ts test/combatNarration.spec.ts src/App.tsx
git commit -m "refactor(frontend): combat narration decisions become pure functions

Three of these decide to say nothing, and the reasons are canon derivations
worth testing directly rather than by omission."
```

---

### Task 3: The remaining subscriptions become hooks

**Files:**
- Create: `frontend/src/hooks/useEventLog.ts`
- Create: `frontend/src/hooks/useFkeys.ts`
- Create: `frontend/test/useEventLog.spec.ts`, `frontend/test/useFkeys.spec.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `NarrationContext` from Task 2.
- Produces: `useEventLog(ctx: NarrationContext): { lines: LogEntry[]; append(lines: EventLogLine[]): void }` and `useFkeys(): string[]`.

- [ ] **Step 1: Establish what the log hook must own**

```bash
cd /home/rick/dev/galactic-empire-reborn/frontend
grep -n "appendLines\|MAX_LOG_ENTRIES\|setLogLines" src/App.tsx
```

`MAX_LOG_ENTRIES` (currently 500) is a cap on retained lines. It moves with the log state. **Preserve the exact value and the exact trimming behaviour** — whether it keeps the newest 500 or the oldest, and whether the id counter continues or resets.

- [ ] **Step 2: Write the failing tests**

Create `frontend/test/useFkeys.spec.ts`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { useFkeys } from '../src/hooks/useFkeys';
import { socket } from '../src/socket/socketClient';

describe('useFkeys', () => {
  it('starts empty', () => {
    expect(renderHook(() => useFkeys()).result.current).toEqual([]);
  });

  it('replaces the whole set on each snapshot, because the server sends the full list', () => {
    const { result } = renderHook(() => useFkeys());
    act(() => { socket.emit('fkeys.snapshot', { fkeys: ['sca lo', 'rep'] } as never); });
    act(() => { socket.emit('fkeys.snapshot', { fkeys: ['pha 75'] } as never); });
    expect(result.current).toEqual(['pha 75']);
  });
});
```

And `frontend/test/useEventLog.spec.ts`, covering: a plain `event.log` line lands with its category; a `message.send` renders as `channel + from: text`; a missing category defaults to `system`; and the cap retains exactly `MAX_LOG_ENTRIES` entries.

Derive the exact `message.send` format from `App.tsx` rather than the description above.

- [ ] **Step 3: Run them and watch them fail**

```bash
cd /home/rick/dev/galactic-empire-reborn/frontend
npm test -- useFkeys useEventLog > /tmp/red.txt 2>&1; echo "exit=$?"
grep -E "Cannot find module|FAIL|✕" /tmp/red.txt
```

- [ ] **Step 4: Write both hooks and reduce `App.tsx`**

Move the subscriptions for `event.log`, `message.send`, `sector:ship-entered`, `sector:ship-left`, `cybertron.taunt`, `droid.annoy` into `useEventLog`, and `fkeys.snapshot` into `useFkeys`. Comments and citations move unchanged.

**Preserve subscription ORDER within each effect.** Two handlers on one event, or two events appended in one effect, deliver in registration order — and that order is what a player sees in the log.

- [ ] **Step 5: Full suite and commit**

```bash
cd /home/rick/dev/galactic-empire-reborn/frontend
npx tsc --noEmit; echo "tsc=$?"
npm run lint > /tmp/lint.txt 2>&1; echo "lint=$?"
npm test > /tmp/full.txt 2>&1; echo "test=$?"
grep -E "Test Files|Tests |FAIL" /tmp/full.txt
```

```bash
git add src/hooks/useEventLog.ts src/hooks/useFkeys.ts test/useEventLog.spec.ts test/useFkeys.spec.ts src/App.tsx
git commit -m "refactor(frontend): the event log and function keys get their own hooks"
```

---

### Task 4: Close out the phase

**Files:**
- Modify: `docs/superpowers/specs/2026-09-10-restructure-design.md` — tick Phase 4, mark it complete with the date, set the status line to phase 5 next
- Modify: `docs/PROGRESS.md` — append
- Modify: `docs/DECISIONS.md` — append, only if a ruling was made

- [ ] **Step 1: Measure against the baseline**

```bash
cd /home/rick/dev/galactic-empire-reborn/frontend
wc -l src/App.tsx                                   # was 388
grep -c "socket.on" src/App.tsx                     # was 12
grep -cE "useState|useEffect|useCallback|useMemo|useRef" src/App.tsx   # was 15
find src -name '*.ts' -o -name '*.tsx' | wc -l      # was 42
```

**Record the honest result.** If `App.tsx` did not shrink much, say so rather than presenting the file count as the win.

- [ ] **Step 2: Verify the deploy gate, using THIS phase's range**

```bash
cd /home/rick/dev/galactic-empire-reborn
git diff --name-only <PHASE_4_BASE>..HEAD -- .github/
grep -n "branches:\|github.event_name" .github/workflows/ci.yml
git diff master -- VERSION
```

Replace `<PHASE_4_BASE>` with the commit this phase started from — the controller gives it to you. **Do NOT compare `.github/` against master**: Phases 0, 1 and 2 legitimately changed `ci.yml`, so a master comparison reports reviewed work as a finding. The greps check the gate's CONTENT. **If this phase's diff touches either, STOP and report.**

- [ ] **Step 3: Verify both Docker images build**

Phase 1 shipped without this check and both images were broken for a day.

```bash
cd /home/rick/dev/galactic-empire-reborn
docker build -f backend/Dockerfile -t ge-backend-p4 .
docker build -f frontend/Dockerfile -t ge-frontend-p4 .
```

- [ ] **Step 4: Run BOTH suites**

Run both. The frontend suite is the one this phase changed. The backend suite is run
as a regression check only — **not** because the citation ratchet covers `frontend/`,
which it does not (see the corrected constraint above, and issue #22).

```bash
npm test > /tmp/fe.txt 2>&1; echo "fe=$?"; grep -E "Test Files|Tests " /tmp/fe.txt
cd ../backend && npx jest > /tmp/be.txt 2>&1; echo "be=$?"; grep -cE "Ran all test suites" /tmp/be.txt; grep -E "^Tests:|^Test Suites:|FAIL" /tmp/be.txt
```

Run the backend suite in ONE tracked process — never background it with a shell `&`. Two concurrent jest runs race the shared `ge_test` database, which happened once already in Phase 3 and produced two interleaved, disagreeing summaries in one file.

- [ ] **Step 5: Append to the living docs**

`docs/DECISIONS.md` and `docs/PROGRESS.md` are **APPEND-ONLY** — annotate in place with CORRECTION/AMENDED, never rewrite. Read `docs/CLAUDE.md` for the format.

Record the before/after numbers and **the fact that this phase's scope was derived from the code because the spec stated none.** That is worth knowing if anyone later asks why Phase 4 was smaller than its neighbours.

- [ ] **Step 6: Commit**

```bash
git add -A docs/
git commit -m "docs(restructure): close out phase 4 — the frontend"
```

---

## Self-review

**Spec coverage.** The spec states no goal, only a line count, so there is no requirement list to check against. The scope here was derived from reading `App.tsx`: the 12 subscriptions and 15 hooks in one component. Tasks 1-3 address that; Task 4 verifies. **This is the one plan in the restructure whose scope is mine rather than the spec's, and the caveat section says so.**

**Ordering rationale.** Task 1 is smallest and carries no decision logic, so it proves the hook pattern first. Task 2 is the risky one — three handlers deliberately produce nothing and the reasons are canon derivations. Task 3 is volume.

**Known risk.** Task 2. The failure mode is a silence becoming a line, which the current suite asserts largely by omission. That is why Step 2 requires enumerating every silence before any code moves, and why every silence gets its own test.

**Deliberately not in this plan.** The two `scan:render` subscriptions stay two — they serve different consumers with different derived state. The three test directory conventions (`test/`, `tests/`, `src/**/__tests__/`) stay as they are: all three are collected by Vitest's default include, so this is cosmetic and not worth the churn. The frontend is already ESM and needs nothing from Phase 5.
