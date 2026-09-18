import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHANGELOG,
  CHANGELOG_CATEGORIES,
  SILENT_RELEASES,
  buildChangelog,
} from '../../src/public/changelog';

/**
 * The changelog is the most public claim this port makes about its own honesty,
 * so the things that would quietly make it a lie are asserted rather than
 * trusted.
 *
 * The four categories are the point of it, and they are the same four the guide
 * already keeps apart in `GUIDE_DEVIATIONS` / `GUIDE_CORRECTIONS`. Collapsing
 * them either accuses the original of a change we made or claims credit for
 * behaviour that was always canon — on the most public page we have.
 *
 * The staleness guard is the second half. `VERSION` is bumped by the rule in
 * CLAUDE.md on anything that deploys, so a release with neither an entry nor a
 * recorded reason for silence is an oversight, and this fails on it. A
 * dependency bump genuinely has nothing to tell a player; `SILENT_RELEASES`
 * is where we say so, once, in writing.
 */
const REPO = join(__dirname, '../../..');
const VERSION = readFileSync(join(REPO, 'VERSION'), 'utf8').trim();

describe('the player-facing changelog', () => {
  it('uses only the four categories, which are kept apart on purpose', () => {
    for (const release of CHANGELOG) {
      for (const entry of release.entries) {
        expect(CHANGELOG_CATEGORIES).toContain(entry.category);
      }
    }
  });

  it('names a version once, newest first', () => {
    const versions = CHANGELOG.map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);

    const rank = (v: string) => v.split('.').map(Number);
    for (let i = 1; i < versions.length; i++) {
      const [aMaj, aMin, aPat] = rank(versions[i - 1]);
      const [bMaj, bMin, bPat] = rank(versions[i]);
      const newer = aMaj !== bMaj ? aMaj > bMaj : aMin !== bMin ? aMin > bMin : aPat > bPat;
      expect(newer, `${versions[i - 1]} must sort above ${versions[i]}`).toBe(true);
    }
  });

  it('accounts for the version this repo is about to deploy', () => {
    // The whole point: a release that says nothing to players must SAY that it
    // says nothing. Silence by omission is indistinguishable from forgetting.
    const documented = CHANGELOG.some((r) => r.version === VERSION);
    const silent = Object.prototype.hasOwnProperty.call(SILENT_RELEASES, VERSION);
    expect(
      documented || silent,
      `VERSION ${VERSION} has no changelog entry and no SILENT_RELEASES reason`,
    ).toBe(true);
  });

  it('gives every silent release a reason someone could disagree with', () => {
    for (const [version, reason] of Object.entries(SILENT_RELEASES)) {
      expect(reason.length, `${version} needs a real reason`).toBeGreaterThan(15);
      expect(CHANGELOG.some((r) => r.version === version)).toBe(false);
    }
  });

  it('writes entries a player could act on, not commit messages', () => {
    for (const release of CHANGELOG) {
      expect(release.entries.length, `${release.version} has no entries`).toBeGreaterThan(0);
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const entry of release.entries) {
        expect(entry.text.length).toBeGreaterThan(20);
        // A player never has to care which file changed.
        expect(entry.text).not.toMatch(/\.ts\b|\bcommit\b|\brefactor/i);
        // The page renders plain text, so markup arrives as literal punctuation.
        // A backtick reached the browser once and read as a typo.
        expect(entry.text).not.toContain('`');
        expect(entry.text).not.toMatch(/\*\*|\[.+\]\(/);
      }
    }
  });

  it('serves the same data it holds', () => {
    expect(buildChangelog().releases).toEqual(CHANGELOG);
  });
});
