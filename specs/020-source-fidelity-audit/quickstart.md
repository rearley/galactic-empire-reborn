# Quickstart — Source Fidelity Audit

How to run, verify, and extend this feature.

## Run the audit's regression suite

```bash
cd backend
npm test                       # full default suite, includes new fidelity tests
npm test -- combat-math.spec   # randamage golden vector
npm test -- gemain-pins.spec   # GEMAIN.H ↔ TS constant enumeration
npm test -- scan-lo-full.spec  # scan ordering snapshot
npm test -- beacon.spec        # beacon socket emission integration test
```

## Run the manual smoke suite (T053, T043, T077)

```bash
cd backend
npm run test:manual            # runs *.manual.spec.ts only
```

Default `npm test` does **not** run these. They live in
`backend/tests/manual/` under a separate Jest config so CI stays fast
and developers can opt-in locally.

## Where findings live

```
docs/020-audit-findings.md     # one entry per finding, severity + disposition
```

Each fix's PR description must cite the finding id (`F-NNN`) and link
the regression test that pins the fix.

## Regenerating the `randamage` golden vector

The golden vector is generated once from the C source and committed.
Regeneration is **not** an automated build step (it would defeat the
purpose). To regenerate manually if the C reference is updated upstream:

1. Compile a small C harness against `GEFUNCS.C:randamage` driving a
   fixed PRNG seed sequence.
2. Emit `{ rngSeed, dmgMax, ton, expected }` rows to
   `backend/tests/fixtures/randamage.golden.json`.
3. Commit alongside the TS change. Each PR that regenerates the fixture
   must justify why in the PR description.

## Adding a new GEMAIN.H constant pin

1. Add the `#define` line to GEMAIN.H (or note it already exists).
2. Add the corresponding entry to the TS pin map in
   `backend/src/game/constants.ts`.
3. The enumeration test in `backend/tests/unit/gemain-pins.spec.ts` will
   pass automatically. Forgetting either side fails the test.

## Done criteria checklist (mirrors Success Criteria)

- [ ] All 8 named gaps triaged with HIGH/MEDIUM/LOW disposition (SC-001).
- [ ] Every HIGH/MEDIUM gap has a paired regression test (SC-002).
- [ ] `npm test` is green (SC-003).
- [ ] GEMAIN.H pin enumeration test passes (SC-004).
- [ ] `docs/020-audit-findings.md` exists and lists every finding (SC-005).
- [ ] `npm run test:manual` runs and reports pass/fail (SC-006).
- [ ] `git diff` introduces no new commands, mechanics, or UI (SC-007).
