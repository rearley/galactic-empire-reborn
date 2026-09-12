# Manual Smoke Tests

Excluded from `npm test` on purpose: these specs run against a LIVE stack and
write to `DATABASE_URL`, which is the database a running game is using.

    npm run test:manual

They are not in CI for the same reason — CI has no live stack, and pointing
these at `ge_test` would test the wrong thing. `vitest.manual.config.ts`
deliberately loads no global setup: the main suite's setup resets `ge_test`, and
resetting a database underneath the stack you are smoke-testing is the opposite
of what these are for. It does load `.env`, which is how the specs find the
database at all.

Run them before releasing anything significant. Every spec here states its
prerequisites in its own docblock, and
`test/unit/manual-suite-contract.spec.ts` — which DOES run in CI — checks that
this file, the script and the config still agree.

| File | Encodes |
|------|---------|
| T053.manual.spec.ts | Set-options persistence round-trip against a live database |

Two specs left this directory rather than being fixed in place:

- **T043** was a beacon-event wiring check with no live dependency at all. It is
  `test/gateway/beacon-event.spec.ts` now, in the suite that actually runs.
- **T077** gated the disposition table in `docs/020-audit-findings.md`. That
  document was consolidated away once all eight findings closed, and the
  dispositions live in `docs/PROGRESS.md`. A gate over a retired document is not
  a test, so it was deleted rather than repointed.
