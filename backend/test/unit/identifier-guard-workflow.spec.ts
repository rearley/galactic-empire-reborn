import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../../..');
const read = (p: string): string => readFileSync(join(REPO, p), 'utf8');

/**
 * The identifier guard has to run on the pushes that actually carried the leaks.
 *
 * `ci.yml` filters out documentation — deliberately, so prose does not spend a
 * CI run or restart a live game. But three of the four identifier leaks this
 * guard exists to stop were in `docs/PROGRESS.md`, which means the guard, wired
 * only into that workflow, would not have fired on any of them.
 *
 * So it gets its own workflow with no path filter. These tests pin that,
 * because the failure mode is silent: a guard that is never invoked reports
 * nothing and looks exactly like a guard that found nothing.
 */
describe('the identifier guard runs on every push', () => {
  const wf = read('.github/workflows/identifier-guard.yml');

  it('has no path filter — documentation is where the leaks were', () => {
    expect(wf).not.toMatch(/paths-ignore/);
    expect(wf).not.toMatch(/^\s+paths:/m);
  });

  it('runs on push and pull_request, not only on demand', () => {
    expect(wf).toMatch(/^\s+push:/m);
    expect(wf).toMatch(/^\s+pull_request:/m);
  });

  it('actually invokes the guard', () => {
    expect(wf).toMatch(/node tools\/identifier-guard\.mjs/);
  });

  it('checks commit messages too, the surface that reached a build log', () => {
    expect(wf).toMatch(/--check-message/);
    // needs real history to read messages from
    expect(wf).toMatch(/fetch-depth:\s*0/);
  });

  it('is not gated behind the build-needed job that skips on docs', () => {
    expect(wf).not.toMatch(/needs:/);
  });

  it('leaves ci.yml free to keep ignoring documentation', () => {
    // The split is the point: this guard is cheap and always runs; ci.yml is
    // expensive and should not run for prose.
    expect(read('.github/workflows/ci.yml')).toMatch(/paths-ignore/);
  });
});
