import { describe, it, expect } from 'vitest';
import { shortVersion, releaseVersion, BUILD_VERSION } from '../src/version';

/**
 * A deploy is invisible without this. The pipeline is push -> Actions -> ghcr
 * -> watchtower, with nobody touching the server, so "did my change land?" has
 * no answer beyond refreshing and squinting at behaviour.
 *
 * The value is the git SHA, not a semver: it maps exactly to the image tag
 * Actions pushes (:${{ github.sha }}), so a version on screen can be traced to
 * a commit and to an image without a changelog in between.
 */
describe('shortVersion', () => {
  it('shortens a full git SHA to something readable', () => {
    expect(shortVersion('6ea46d9b3c2f1a0e5d4c3b2a1908f7e6d5c4b3a2')).toBe('6ea46d9');
  });

  it('says "dev" when nothing was injected, rather than showing a blank', () => {
    // Local `npm run dev` has no build arg. An empty gap in the header reads as
    // a broken build; "dev" reads as what it is.
    expect(shortVersion(undefined)).toBe('dev');
    expect(shortVersion('')).toBe('dev');
  });

  it('leaves an already-short value alone', () => {
    expect(shortVersion('abc1234')).toBe('abc1234');
  });

  it('trims whitespace, which a shell build arg can easily carry in', () => {
    expect(shortVersion('  6ea46d9b3c2f  ')).toBe('6ea46d9');
  });

  it('composes the header string as release then build', () => {
    // What a player actually sees. The separator matters: two bare tokens read
    // as one confusing identifier.
    expect(`${releaseVersion('0.1.0')} · ${shortVersion('6ea46d9b3c2f')}`).toBe('v0.1.0 · 6ea46d9');
  });

  it('degrades to something legible when neither was injected', () => {
    expect(`${releaseVersion(undefined)} · ${shortVersion(undefined)}`).toBe('v? · dev');
  });

  it('exports a usable constant for the UI', () => {
    expect(typeof BUILD_VERSION).toBe('string');
    expect(BUILD_VERSION.length).toBeGreaterThan(0);
  });
});
