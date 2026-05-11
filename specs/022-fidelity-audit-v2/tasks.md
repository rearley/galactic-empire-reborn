# 022 Fidelity Audit v2 — Tasks

Dependency-ordered checklist. Tasks marked **[P]** are parallelizable
(no shared file mutations, independent C↔TS reads). Detailed steps for
each task live in [`plan.md`](./plan.md).

## Phase 0 — Scaffold

- [ ] **T1** Scaffold invariant harness + runtime tick hook
      (`backend/src/game/invariants/`, `tick.service.ts`, `app.module.ts`,
      `test/invariants/harness.spec.ts`).

## Phase 1 — Subsystem walks (parallelizable)

The four walks each append to a different table in `findings.md`.
Dispatch in parallel via subagent-driven-development. Each subagent
commits its own walk independently.

- [ ] **T2 [P]** Walk: Ship state persistence → `P-NNN` findings.
      (Recommended first — its truth underpins T3/T4.)
- [ ] **T3 [P]** Walk: Combat ranges & weapons → `C-NNN` findings.
      (Recommended before T4 — defines weapon-range truth.)
- [ ] **T4 [P]** Walk: AI targeting & engagement → `A-NNN` findings.
      Depends on T3 truth.
- [ ] **T5 [P]** Walk: Scanners & visibility → `S-NNN` findings.

## Phase 2 — Seed invariants (TDD)

After walks land, author the invariants the walks have shown to be needed.

- [ ] **T6a** Invariant: `weaponFireRangeRespected`.
- [ ] **T6b** Invariant: `aiCannotFireAcrossMap`
      (visibility clause may defer behind a `findings.md` row if T4
      hasn't documented the C-source visibility rule yet).
- [ ] **T6c** Invariant: `aiRespectsNeutralZone`.
- [ ] **T6d** Invariant: `scanRangeMatchesScanType`.
- [ ] **T6e** Invariant: `inMemoryShipMatchesDb`
      (gate runtime mode behind `INVARIANTS_DB_CHECK=1`).
- [ ] **T6f** Invariant: `noOrphanShipState`.

## Phase 3 — HIGH-finding fixes (interleaved with Phase 1)

- [ ] **T7** Sub-procedure invoked from each HIGH row in `findings.md`.
      TDD: failing test → fix → update finding row → commit. **Do not
      defer HIGH findings to the end of the audit.**

## Phase 4 — Runtime wiring + validation

- [ ] **T8** Populate `TickService.snapshotForInvariants()` from
      `ShipStateService`, `CombatTickService`, AI tick services.
- [ ] **T9** Dev-playtest with `INVARIANTS_RUNTIME=1` until a clean
      15-min session produces zero unexplained violations. Update
      `docs/PROGRESS.md`.

## Phase 5 — Close out

- [ ] **T10** Confirm `findings.md` complete, cross-link from
      `docs/020-audit-findings.md`, update `docs/ARCHITECTURE.md` if
      module map changed.

---

## Parallel dispatch summary

| Group | Tasks | Notes |
|-------|-------|-------|
| Walks | T2, T3, T5 | True parallel — different findings tables, different TS modules. |
| Walks | T4 | Best dispatched after T3 lands (uses C-NNN truth). |
| Invariants | T6a–T6f | Sequential per file edit (`invariants.module.ts` is shared) — can parallelize the test-file authoring but serialize the registration edits. |
| HIGH fixes (T7) | per finding | Serial within a subsystem (same TS module); parallel across subsystems is fine. |
