import { ChangelogController } from '../../src/public/changelog.controller';
import { CHANGELOG, CATEGORY_LABELS } from '../../src/public/changelog';

/**
 * The route exists and serves the compiled entries. Built once at construction
 * like the guide's, because nothing short of a redeploy can change it.
 */
describe('ChangelogController', () => {
  it('serves the releases and the category labels the page renders', () => {
    const body = new ChangelogController().getChangelog();

    expect(body.releases).toEqual(CHANGELOG);
    expect(body.categories).toEqual(CATEGORY_LABELS);
  });

  it('returns the same object every call — no per-request rebuild', () => {
    const c = new ChangelogController();
    expect(c.getChangelog()).toBe(c.getChangelog());
  });
});

/**
 * The cache header is part of the contract, not decoration.
 *
 * The guide can sit in a browser cache for an hour because nothing short of a
 * redeploy changes it and nobody is waiting on it. The changelog is the page
 * that says what just shipped, and an hour-long cache outlives the deploy it is
 * describing — a player who read the page before a release is told for another
 * hour that the release does not exist. Seen in a browser, not in a test.
 */
describe('ChangelogController cache policy', () => {
  it('caches for a minute, not the guide’s hour', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(
      new URL('../../src/public/changelog.controller.ts', import.meta.url),
      'utf8',
    );
    expect(src).toContain("'Cache-Control', 'public, max-age=60'");
  });
});
