# Manual Smoke Tests

These specs are excluded from the default `npm test` run.

Run with: `npm run test:manual`

Each file encodes a manual validation scenario from a previous feature's QA checklist. They are opt-in to keep CI fast, but should be run before releasing significant updates.

| File | Encodes |
|------|---------|
| T053.manual.spec.ts | Set-options persistence round-trip validation |
| T043.manual.spec.ts | Beacon socket event smoke test |
| T077.manual.spec.ts | Manual smoke test from feature 077 |
