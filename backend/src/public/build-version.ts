/**
 * What build this backend is.
 *
 * The UI header shows the FRONTEND's build. Both images come from one workflow
 * but are pushed and rolled independently — `fail-fast: false` means one can
 * succeed while the other fails, and watchtower updates them seconds apart. A
 * header claiming a version the game engine is not running would be worse than
 * showing none, so the backend reports its own and `/public/stats` carries it.
 *
 * Injected as build args, exactly as the frontend's are, so the two are
 * directly comparable.
 */

/** git's own abbreviation length; matches frontend/src/version.ts. */
const SHORT_SHA_LENGTH = 7;

export function buildVersion(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string {
  const sha = env['GIT_SHA']?.trim();
  return sha ? sha.slice(0, SHORT_SHA_LENGTH) : 'dev';
}

export function releaseVersion(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string {
  const v = env['APP_VERSION']?.trim();
  return v ? `v${v}` : 'v?';
}
