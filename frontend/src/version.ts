/**
 * The build identity shown in the UI.
 *
 * Deploys here are hands-off — push, Actions builds, ghcr receives, watchtower
 * rolls the containers within five minutes — so without this there is no way to
 * tell whether the page in front of you is the change you just pushed or the
 * one before it. Refreshing and squinting at behaviour is not an answer.
 *
 * It is the git SHA rather than a semver on purpose: Actions tags every image
 * with `:${{ github.sha }}` alongside `:latest`, so a version on screen maps
 * straight to a commit AND to a pullable image, with no changelog in between.
 * That is what makes it useful for rolling back, not just for reassurance.
 *
 * Injected at image build time via a GIT_SHA build arg; `dev` when running
 * locally, where there is no build to identify.
 */

/** Seven characters is git's own abbreviation, and enough to be unambiguous. */
const SHORT_SHA_LENGTH = 7;

export function shortVersion(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return 'dev';
  return trimmed.slice(0, SHORT_SHA_LENGTH);
}

/** The release number from the repo's VERSION file. Hand-maintained. */
export function releaseVersion(raw: string | undefined): string {
  const trimmed = raw?.trim();
  return trimmed ? `v${trimmed}` : 'v?';
}

/**
 * What the header shows: the release, then the exact build.
 *
 * Two values because they fail differently. VERSION is meaningful but
 * hand-maintained, so it goes stale the moment someone forgets — this repo's
 * package.json sat at 0.0.1 for fifty commits. The SHA is derived, so it cannot
 * be forgotten, but it says nothing about what the release IS. Together, the
 * first tells you which release you are on and the second tells you precisely
 * which build, and disagreement between two browsers is immediately visible.
 */
export const BUILD_VERSION: string =
  `${releaseVersion(import.meta.env.VITE_APP_VERSION)} · ${shortVersion(import.meta.env.VITE_GIT_SHA)}`;
