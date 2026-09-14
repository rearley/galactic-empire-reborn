/**
 * Where the "help pay for the server" link points, or nothing at all.
 *
 * This is a build-time value rather than a constant in the source for one
 * reason: the repo is public and AGPL, so anyone may run their own galaxy from
 * this code. A hardcoded sponsor link would follow every fork, and their
 * players would be funding someone else's server without either side noticing.
 * Unset is therefore the correct default, and the only default — a fork gets no
 * button until its operator sets `DONATE_URL` for their own build.
 *
 * Injected the same way the build identity is: a Docker build arg, exposed to
 * the bundle as VITE_DONATE_URL, baked in at build time. @see version.ts
 */

/**
 * The configured link, or null when there is nothing to show.
 *
 * Pure so the rules are testable without a build. The https requirement is a
 * guardrail rather than a security boundary — the value comes from whoever ran
 * the build, not from a player — but it is rendered into an href, and no
 * legitimate configuration is `javascript:` or plain http.
 */
export function parseSupportUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('https://') ? trimmed : null;
}

/**
 * Read at call time, not at module load, so a test can stub the environment
 * without reimporting the module.
 */
export function supportUrl(): string | null {
  return parseSupportUrl(import.meta.env.VITE_DONATE_URL);
}
