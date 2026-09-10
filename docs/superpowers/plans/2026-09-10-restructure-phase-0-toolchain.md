# Restructure Phase 0 — Toolchain and Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move both apps onto a supported Node runtime and a modern, behaviour-neutral toolchain, and add a linter, without changing a single thing the game does.

**Architecture:** Five independent tasks, each ending in a green suite and its own commit. Every change in this phase is either a base-image bump, a devDependency bump, or a new lint config. None of them can alter game behaviour, which is why they go first: they can land before the structural work without muddying a later `git bisect`. Two new repo-invariant tests pin the runtime version and the lint gate so they cannot silently drift back.

**Tech Stack:** Node 24 LTS, TypeScript 6.0.3, Jest 30 + ts-jest, Vitest 5, Vite 8, React 19, Tailwind 4, oxlint with type-aware rules.

**Spec:** `docs/superpowers/specs/2026-09-10-restructure-design.md`

## Global Constraints

- **Branch is `restructure`.** Never commit this work to `master`. Nothing here reaches production until Rick tests the whole branch on the dev server.
- **Zero gameplay change.** If a canon value or a player-visible string moves, that is a bug in this phase, not a decision.
- **The backend suite must report exactly `605 passed` suites and `6141 total` tests** at every commit, with `2 skipped` when `CI_LOW_PERF=1`. A changed count means something was lost.
- **The frontend suite must report `39` test files and `310` tests** at every commit.
- **TypeScript is pinned to `6.0.3`, NOT 7.x.** `ts-jest` peers on `typescript: ">=4.3 <7"`. TypeScript 7 is phase 5 work, after Jest is replaced by Vitest.
- **Node is `24`**, not 22. Active LTS to 2028-04-30 and the version NestJS 12 targets.
- **Do not touch** `backend/src/**`, `frontend/src/**`, `backend/prisma/**`, or `reference/**` in this phase, except where a task explicitly names the file.
- **Do not bump** `@nestjs/*`, `prisma`, `@prisma/client`, or `socket.io`. Those are phase 5.
- Repo-invariant tests follow the existing pattern in `backend/test/unit/dockerfile-nonroot.spec.ts`: read the file from disk, assert on its text, explain in the docblock why the invariant exists.
- Every commit message ends with the two attribution trailers used in this repo.

---

### Task 1: Pin the Node runtime

**Files:**
- Modify: `backend/Dockerfile:1`, `backend/Dockerfile:20` (already changed to `node:24-alpine`)
- Modify: `frontend/Dockerfile:1` (already changed to `node:24-alpine`)
- Modify: `.github/workflows/ci.yml:119`, `.github/workflows/ci.yml:158` (already changed to `node-version: 24`)
- Modify: `backend/package.json`, `frontend/package.json` — add `engines`
- Test: `backend/test/unit/node-runtime-version.spec.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing importable. Establishes `EXPECTED_MAJOR = 24` in the new spec as the single place the runtime version is asserted.

**Context an engineer needs:** Node 20 reached end of life on 2026-04-30 and stops receiving security patches. Both Dockerfiles and both CI jobs were pinned to it. The risk this test guards is drift: the Dockerfile and the CI runner can disagree, and if CI runs a different major than production, a green suite proves less than it appears to. The base image bumps and the CI edits were already applied and verified by hand on 2026-09-10 — both images build, and the backend image reports `v24.21.0` and loads `dist/src/main.js`. This task adds the test that keeps it true, plus the `engines` declaration.

- [ ] **Step 1: Write the failing test**

Create `backend/test/unit/node-runtime-version.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Production, CI and the declared engine must agree on one Node major.
 *
 * Node 20 reached end of life on 2026-04-30 and no longer receives security
 * patches, and this repo shipped it in both images for four months after that.
 * The subtler failure is disagreement: if CI runs a different major than the
 * image does, a green suite is evidence about a runtime nobody deploys.
 *
 * A file test rather than a container test — CI has no Docker daemon — so this
 * guards the directives and the human verifies the boot, the same split used by
 * `dockerfile-nonroot.spec.ts`.
 *
 * @see docs/superpowers/specs/2026-09-10-restructure-design.md
 */
const REPO = join(__dirname, '../../..');
const EXPECTED_MAJOR = 24;

function read(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8');
}

describe('Node runtime version', () => {
  const dockerfiles = ['backend/Dockerfile', 'frontend/Dockerfile'];

  it.each(dockerfiles)('%s builds on the expected Node major', (rel) => {
    const froms = read(rel)
      .split('\n')
      .filter((l) => l.trim().startsWith('FROM node:'));

    expect(froms).not.toHaveLength(0);
    for (const line of froms) {
      expect(line).toMatch(new RegExp(`FROM node:${EXPECTED_MAJOR}-alpine\\b`));
    }
  });

  it('CI runs the same major the images do', () => {
    const versions = read('.github/workflows/ci.yml')
      .split('\n')
      .filter((l) => l.includes('node-version:'))
      .map((l) => l.split('node-version:')[1].trim());

    expect(versions).not.toHaveLength(0);
    expect(new Set(versions)).toEqual(new Set([String(EXPECTED_MAJOR)]));
  });

  it.each(['backend/package.json', 'frontend/package.json'])(
    '%s declares the engine it needs',
    (rel) => {
      const pkg = JSON.parse(read(rel)) as { engines?: { node?: string } };

      expect(pkg.engines?.node).toBe(`>=${EXPECTED_MAJOR}`);
    },
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && npx jest test/unit/node-runtime-version.spec.ts
```

Expected: the two Dockerfile cases and the CI case PASS (those edits already landed). The two `engines` cases FAIL with `expected ">=24", received undefined`.

- [ ] **Step 3: Add the engines declaration**

In `backend/package.json` and `frontend/package.json`, add a top-level key after `"version"`:

```json
  "engines": {
    "node": ">=24"
  },
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && npx jest test/unit/node-runtime-version.spec.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Run both full suites**

```bash
cd backend && npm test 2>&1 | tail -5
cd ../frontend && npm test 2>&1 | tail -5
```

Expected: backend `Test Suites: 606 passed, 606 total` and `Tests: 6146 passed, 6146 total` — the new spec adds one suite and five tests to the 605/6141 baseline. Frontend unchanged at 39 files / 310 tests.

- [ ] **Step 6: Verify both images still build on Node 24**

```bash
cd /home/rick/dev/galactic-empire-reborn
docker build -t ge-backend:p0 -f backend/Dockerfile backend/ 2>&1 | tail -3
docker build -t ge-frontend:p0 -f frontend/Dockerfile frontend/ 2>&1 | tail -3
docker run --rm --entrypoint node ge-backend:p0 -v
```

Expected: both builds finish, and `node -v` reports `v24.x`.

- [ ] **Step 7: Commit**

```bash
git add backend/Dockerfile frontend/Dockerfile .github/workflows/ci.yml \
        backend/package.json frontend/package.json \
        backend/test/unit/node-runtime-version.spec.ts
git commit -m "chore(runtime): Node 20 to 24, pinned by test

Node 20 reached end of life 2026-04-30 and both images shipped it for four
months after. Bumps both Dockerfiles and both CI jobs to 24 (Active LTS to
2028-04-30, and the version NestJS 12 targets), declares engines.node on both
packages, and adds a repo-invariant test so the image, CI and the declaration
cannot drift apart."
```

---

### Task 2: Backend TypeScript 6 and Jest 30

**Files:**
- Modify: `backend/package.json` (devDependencies), `backend/package-lock.json`
- Test: the existing backend suite is the test.

**Interfaces:**
- Consumes: Task 1's Node 24.
- Produces: TypeScript 6.0.3 available to every later task. `tsc --noEmit` remains the CI type gate.

**Context an engineer needs:** TypeScript 6 is a major, so it can introduce type errors that 5.7 did not report. That is the whole risk of this task and it is a compile-time risk, not a runtime one. Jest 30 is a major too but ts-jest 29.4.12 already peers on `jest: "^29.0.0 || ^30.0.0"`, so they are compatible. **Do not reach for TypeScript 7**: ts-jest peers on `>=4.3 <7` and npm will refuse or, worse, resolve something surprising.

- [ ] **Step 1: Record the baseline so a regression is visible**

```bash
cd backend && npx tsc --noEmit && echo "TYPECHECK CLEAN AT 5.7"
```

Expected: no output from tsc, then the echo. If this is already dirty, stop and report it — the rest of the task cannot distinguish new errors from old ones.

- [ ] **Step 2: Install the new versions**

```bash
cd backend
npm install --save-dev typescript@6.0.3 jest@30 ts-jest@latest @types/jest@30
```

- [ ] **Step 3: Run the type check and expect it to reveal any TS 6 breakage**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean. If TypeScript 6 reports errors, fix them **as type-level changes only** — annotations, narrowings, assertions. Do not change a runtime expression to satisfy the compiler; that is a gameplay change wearing a type change's clothes. If a fix would alter runtime behaviour, stop and report it.

- [ ] **Step 4: Run the full backend suite**

```bash
cd backend && npm test 2>&1 | tail -6
```

Expected: `Test Suites: 606 passed, 606 total`, `Tests: 6146 passed, 6146 total`. Any change in the counts means a suite failed to load, most likely a Jest 30 config incompatibility rather than a real failure — read the error before assuming.

- [ ] **Step 5: Verify the production build still compiles**

```bash
cd backend && npm run build && ls dist/src/main.js
```

Expected: `dist/src/main.js` exists.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(backend): TypeScript 6.0.3 and Jest 30

Behaviour-neutral toolchain bump. TypeScript stops at 6 deliberately: ts-jest
peers on >=4.3 <7, so TypeScript 7 and its 8-12x faster builds wait for phase 5,
when Nest 12 replaces Jest with Vitest and ts-jest leaves with it."
```

---

### Task 3: Frontend dependency batch

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json`
- Modify: `frontend/tailwind.config.ts`, `frontend/postcss.config.cjs`, and the CSS entry that holds the Tailwind directives
- Test: the existing frontend suite is the test.

**Interfaces:**
- Consumes: Task 1's Node 24.
- Produces: React 19, Vite 8, Vitest 5, Tailwind 4 for the phase 4 frontend restructure.

**Context an engineer needs:** This is one batch because the frontend is only 3,521 lines across 43 files and the packages are interdependent — Vitest 5 wants Vite 8, and `@vitejs/plugin-react` 6 wants both. It also closes the one **critical** Dependabot alert in the repo (Vitest, fixed in 3.2.6; we are on 2.1.8) and the high-severity Vite one (fixed in 6.4.3).

Tailwind 4 is the only part that is not a version number change. Tailwind 4 moved configuration from `tailwind.config.ts` into CSS and replaced the PostCSS plugin with `@tailwindcss/postcss`. Our config is small — one `content` glob and one custom colour, `accent: '#4ade80'` — so the migration is genuinely short, but it is a real edit and the accent colour must survive it. `npx @tailwindcss/upgrade` performs most of it.

- [ ] **Step 1: Record the baseline**

```bash
cd frontend && npm test 2>&1 | tail -4 && npm run build 2>&1 | tail -3
```

Expected: `Test Files 39 passed (39)`, `Tests 310 passed (310)`, and a successful build. Note the exact numbers.

- [ ] **Step 2: Upgrade everything except Tailwind**

```bash
cd frontend
npm install react@19 react-dom@19
npm install --save-dev typescript@6.0.3 vite@8 vitest@5 @vitest/coverage-v8@5 \
  @vitejs/plugin-react@latest @types/react@19 @types/react-dom@19 \
  jsdom@latest @testing-library/react@latest
```

- [ ] **Step 3: Run the suite and the build, and fix what breaks**

```bash
cd frontend && npm test 2>&1 | tail -6 && npm run build 2>&1 | tail -5
```

Expected: 39 files / 310 tests passing. React 19 removed some legacy APIs and changed `react-dom` client rendering imports; if a test fails on `ReactDOM.render` or on `act`, that is the known migration and the fix is the documented replacement, not a test change.

- [ ] **Step 4: Migrate Tailwind 3 to 4**

```bash
cd frontend && npx @tailwindcss/upgrade
```

Then verify by hand: the `accent` colour `#4ade80` must still resolve, and `postcss.config.cjs` must reference `@tailwindcss/postcss` rather than `tailwindcss`.

- [ ] **Step 5: Verify the built CSS still contains the accent colour**

```bash
cd frontend && npm run build && grep -rl '4ade80\|#4ade80' dist/assets/*.css
```

Expected: at least one CSS file matches. If nothing matches, the theme migration dropped the custom colour and the UI accent is gone — fix before continuing.

- [ ] **Step 6: Run the full suite once more**

```bash
cd frontend && npm test 2>&1 | tail -6
```

Expected: `Test Files 39 passed (39)`, `Tests 310 passed (310)`.

- [ ] **Step 7: Verify the frontend image still builds**

```bash
cd /home/rick/dev/galactic-empire-reborn
docker build -t ge-frontend:p0 -f frontend/Dockerfile frontend/ 2>&1 | tail -3
```

Expected: build succeeds. If `tailwind.config.ts` or `postcss.config.cjs` was renamed or removed by the upgrade, `frontend/Dockerfile:8` copies them by name and will fail — update that COPY line to match reality.

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/tailwind.config.ts \
        frontend/postcss.config.cjs frontend/src frontend/Dockerfile
git commit -m "chore(frontend): React 19, Vite 8, Vitest 5, Tailwind 4, TypeScript 6

One batch because the packages are interdependent and the frontend is 3,521
lines. Closes the repo's only critical Dependabot alert (vitest, fixed 3.2.6)
and the high-severity vite one (6.4.3). Tailwind 4 moves config into CSS; the
accent colour #4ade80 is verified present in the built stylesheet."
```

---

### Task 4: oxlint with type-aware rules

**Files:**
- Create: `.oxlintrc.json` at the repo root
- Modify: `backend/package.json`, `frontend/package.json` — add a `lint` script
- Modify: `.github/workflows/ci.yml` — add a lint step to both jobs
- Test: `backend/test/unit/lint-gate.spec.ts` (create)

**Interfaces:**
- Consumes: Task 2's and Task 3's TypeScript 6.
- Produces: `npm run lint` in both apps, and a CI gate that fails on a lint error.

**Context an engineer needs:** The backend has no linter at all today. Strict TypeScript has been holding the line — only 4 uses of `any` across 41,826 lines — but nothing mechanical enforces anything else, and a public repo with no lint config invites the exact "AI slop" reading Rick wants to avoid.

oxlint over ESLint for three reasons: its type-aware linting went stable in July 2026 and covers 59 of typescript-eslint's 61 type-aware rules; it runs 20-40x faster than ESLint plus typescript-eslint, which matters on 137,000 lines in CI; and it is where NestJS 12's own toolchain is heading, so phase 5 does not have to redo this.

**Start permissive.** The goal of this task is a gate that passes, not a clean-code crusade. Turning on a rule that produces 400 findings and then hand-fixing them is a different task, it is not behaviour-neutral, and it does not belong in phase 0. Enable the correctness rules, get to zero, commit. Style rules can be argued about later.

- [ ] **Step 1: Write the failing test**

Create `backend/test/unit/lint-gate.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A linter that is not wired into CI is a linter nobody runs.
 *
 * The backend had no lint config at all until 2026-09-10. Strict TypeScript was
 * doing the work — 4 uses of `any` in 41,826 lines — but nothing enforced the
 * rest, and a public repository with no lint configuration reads badly however
 * good the code is.
 *
 * This asserts the config exists, both packages expose the script, and CI
 * actually calls it. The last clause is the one that matters: the first two
 * without it are decoration.
 *
 * @see docs/superpowers/specs/2026-09-10-restructure-design.md
 */
const REPO = join(__dirname, '../../..');

function read(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8');
}

describe('lint gate', () => {
  it('has a config at the repo root', () => {
    expect(() => read('.oxlintrc.json')).not.toThrow();
    expect(JSON.parse(read('.oxlintrc.json'))).toHaveProperty('rules');
  });

  it.each(['backend/package.json', 'frontend/package.json'])(
    '%s exposes a lint script',
    (rel) => {
      const pkg = JSON.parse(read(rel)) as { scripts?: Record<string, string> };

      expect(pkg.scripts?.lint).toMatch(/oxlint/);
    },
  );

  it('CI runs the linter in both jobs', () => {
    const runs = read('.github/workflows/ci.yml')
      .split('\n')
      .filter((l) => l.includes('run: npm run lint'));

    expect(runs).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && npx jest test/unit/lint-gate.spec.ts
```

Expected: all four cases FAIL — no config file, no scripts, no CI steps.

- [ ] **Step 3: Install oxlint and create the config**

```bash
cd backend && npm install --save-dev oxlint oxlint-tsgolint
cd ../frontend && npm install --save-dev oxlint oxlint-tsgolint
```

Create `.oxlintrc.json` at the repo root:

```json
{
  "$schema": "https://raw.githubusercontent.com/oxc-project/oxc/main/npm/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn", "oxc"],
  "categories": {
    "correctness": "error",
    "suspicious": "warn",
    "perf": "warn"
  },
  "ignorePatterns": [
    "**/dist/**",
    "**/node_modules/**",
    "reference/**",
    "**/*.generated.ts",
    "backend/prisma/seed/**"
  ],
  "rules": {}
}
```

`reference/` is excluded because it is read-only vendored C-era material. The
`*.generated.ts` files and the Prisma seeds are machine-written from canon and
are verified by their own balance tests, not by style rules.

- [ ] **Step 4: Run the linter and drive it to zero errors**

```bash
npx oxlint --type-aware 2>&1 | tail -20
```

If a correctness rule produces a large number of findings, **turn that rule off in `rules`** with a one-line comment in the commit message saying why, rather than hand-editing source. Source edits are not behaviour-neutral and do not belong in phase 0. The bar for this task is: the gate runs and reports zero errors.

- [ ] **Step 5: Add the scripts and the CI steps**

In both `backend/package.json` and `frontend/package.json`:

```json
    "lint": "oxlint --type-aware -c ../.oxlintrc.json ."
```

In `.github/workflows/ci.yml`, add to the `backend` job after the `npx tsc --noEmit` step, and to the `frontend` job after `npm ci`:

```yaml
      - name: Lint
        run: npm run lint
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd backend && npx jest test/unit/lint-gate.spec.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 7: Run both full suites and both linters**

```bash
cd backend && npm run lint && npm test 2>&1 | tail -5
cd ../frontend && npm run lint && npm test 2>&1 | tail -5
```

Expected: both linters exit 0. Backend `607 passed` suites / `6150 total` tests. Frontend 39 files / 310 tests.

- [ ] **Step 8: Commit**

```bash
git add .oxlintrc.json backend/package.json backend/package-lock.json \
        frontend/package.json frontend/package-lock.json \
        .github/workflows/ci.yml backend/test/unit/lint-gate.spec.ts
git commit -m "chore(lint): oxlint with type-aware rules, gated in CI

The backend had no linter. oxlint over ESLint: type-aware linting went stable
in July 2026 covering 59 of typescript-eslint's 61 type-aware rules, it runs
20-40x faster on 137k lines, and it is where NestJS 12's toolchain is heading,
so phase 5 does not redo this. Correctness rules only for now — a rule that
produces hundreds of findings gets disabled rather than hand-fixed, because
source edits are not behaviour-neutral and do not belong in this phase."
```

---

### Task 5: Close out the phase

**Files:**
- Modify: `docs/superpowers/specs/2026-09-10-restructure-design.md` — tick phase 0
- Modify: `docs/PROGRESS.md` — append a dated entry
- Modify: `docs/DECISIONS.md` — record the three decisions that will be questioned later

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: the written record the next session reads.

**Context an engineer needs:** `docs/CLAUDE.md` requires living docs to be updated in the same session as the change, `PROGRESS.md` is append-only with newest at the bottom and an `<!-- INDEX -->` block at the top that must be updated, and `DECISIONS.md` holds anything a future reader would otherwise re-litigate.

- [ ] **Step 1: Tick the phase 0 checkboxes in the spec**

Mark every phase 0 item `- [x]` in `docs/superpowers/specs/2026-09-10-restructure-design.md` and change the status line at the top to `phase 1 next`.

- [ ] **Step 2: Record the decisions**

Append three entries to `docs/DECISIONS.md`, dated 2026-09-10, each with its reasoning:

1. **TypeScript pinned at 6, not 7.** ts-jest peers on `>=4.3 <7`. TypeScript 7's 8-12x faster builds are real and wanted, and they arrive in phase 5 when Vitest replaces Jest. Recorded so nobody "helpfully" bumps it and breaks the test runner.
2. **oxlint, not ESLint.** Type-aware linting stable since July 2026 with 59 of 61 rules, 20-40x faster, and NestJS 12's toolchain is moving there.
3. **Node 24, not 22.** Active LTS to 2028-04-30 versus Maintenance-only to 2027-04-30, and 24 is what NestJS 12 targets.

- [ ] **Step 3: Append the progress entry**

Add a dated entry at the bottom of `docs/PROGRESS.md` covering what phase 0 changed, and update the `<!-- INDEX -->` block at the top.

- [ ] **Step 4: Run both suites one final time**

```bash
cd backend && npm test 2>&1 | tail -5
cd ../frontend && npm test 2>&1 | tail -5
```

Expected: backend `607 passed` / `6150 total`, frontend 39 / 310.

- [ ] **Step 5: Commit and push**

```bash
git add docs/
git commit -m "docs: close out restructure phase 0"
git push
```

- [ ] **Step 6: Open the draft pull request, if one is not open yet**

```bash
gh pr create --draft --base master --head restructure \
  --title "Restructure: architecture, toolchain and contract cleanup" \
  --body "Tracking PR for the restructure branch. Draft on purpose — this exists to run CI on every push. See docs/superpowers/specs/2026-09-10-restructure-design.md."
```

This gives full CI on every push to the branch. The `build` job requires `github.event_name == 'push'`, so a pull request runs both suites and never builds an image. Nothing reaches ghcr and nothing reaches the watchtower on the <panel> host.

---

## Phase exit criteria

- Both images build on Node 24 and the backend image boots.
- `npx tsc --noEmit` is clean on TypeScript 6.
- `npm run lint` exits 0 in both apps and CI runs it in both jobs.
- Backend suite: 607 suites, 6,150 tests, all passing.
- Frontend suite: 39 files, 310 tests, all passing.
- No file under `backend/src/`, `frontend/src/`, `backend/prisma/` or `reference/` changed, except React 19 API migrations in `frontend/src/` if Task 3 required them.
- The draft PR is open and its CI run is green.
