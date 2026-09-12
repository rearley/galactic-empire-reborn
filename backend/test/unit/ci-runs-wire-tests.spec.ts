import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The shared wire contract's own suite has to run somewhere.
 *
 * `packages/wire` holds the Socket.io event names and payload types that the
 * backend and the browser both compile against — the one package where a
 * change breaks two applications at once. It ships a suite that asserts the
 * event-name table, and for the whole restructure no CI job invoked it: both
 * jobs ran `npm run build --workspace @ge/wire` and nothing else, so the
 * contract was built and never checked.
 *
 * A file test, like its neighbours: the workflow is the artifact under
 * inspection, and asserting on its text is the only way to pin a step that
 * exists at all. @see dockerfile-runtime-deps.spec.ts
 */
const REPO = join(__dirname, '../../..');
const workflow = readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8');

/** Directive lines only — a comment naming the package proves nothing. */
const directives = workflow
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('#'))
  .join('\n');

describe('CI runs the @ge/wire suite', () => {
  it('invokes the workspace test script', () => {
    expect(directives).toMatch(/npm test --workspace @ge\/wire/);
  });

  it('still builds it too — the build is what makes the import resolve', () => {
    expect(directives).toMatch(/npm run build --workspace @ge\/wire/);
  });
});
