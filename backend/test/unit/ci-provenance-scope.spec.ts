import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The image attestation must not carry the GitHub event payload.
 *
 * `docker/build-push-action` defaults to `provenance: true` when it pushes to a
 * registry, and BuildKit's Actions integration writes the whole `push` payload
 * into the predicate at `invocation.environment.github_event_payload` —
 * `pusher.email` among it. That address comes from the account's email setting,
 * not from git, so rewriting the repository's history does not touch it: it was
 * still in the build log after the 2026-09-13 rewrite, and `exporting
 * attestation manifest` says the same predicate is attached to the image on
 * ghcr, which goes public with the repository.
 *
 * **`mode=min` does not fix this, and was tried first.** It trims the build
 * detail and leaves `invocation.environment` intact — verified by reading the
 * provenance out of the build log of b6691b4, the very commit that set it. Only
 * `false` removes the attestation, and with it the payload.
 *
 * The cost is the SLSA attestation itself, which is worth little here: the
 * commit is already baked into every image as the `GIT_SHA` build-arg, so what
 * is running stays traceable without it.
 *
 * A file test, like its neighbours: the workflow is the artifact under
 * inspection. @see ci-runs-wire-tests.spec.ts
 */
const REPO = join(__dirname, '../../..');
const workflow = readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8');

/** Directive lines only — a comment explaining the risk is not the control. */
const directives = workflow
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('#'))
  .join('\n');

describe('image provenance is scoped', () => {
  it('disables provenance so the event payload is not embedded', () => {
    expect(directives).toMatch(/provenance:\s*false/);
  });

  it('never leaves it at the action default', () => {
    expect(directives).not.toMatch(/provenance:\s*true/);
  });

  it('does not settle for mode=min, which leaves the payload in place', () => {
    expect(directives).not.toMatch(/provenance:\s*mode=min/);
  });
});
