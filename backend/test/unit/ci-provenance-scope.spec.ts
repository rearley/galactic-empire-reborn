import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The image attestation must not carry the GitHub event payload.
 *
 * `docker/build-push-action` defaults to `provenance: true` when it pushes to a
 * registry, and the full-mode predicate embeds the workflow's build context —
 * which on a `push` event includes the whole payload, `pusher.email` among it.
 * That address comes from the account's email setting, not from git, so
 * rewriting the repository's history does not touch it: it was still in the
 * build log after the 2026-09-13 rewrite, inside the `buildx.build.provenance`
 * block, and `exporting attestation manifest` says the same predicate is
 * attached to the image on ghcr.
 *
 * `mode=min` keeps the useful half — what was built, from which commit — and
 * drops the context. This matters because the packages go public with the
 * repository, and an attestation is not something anyone thinks to read before
 * publishing.
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
  it('pins provenance to mode=min so the event payload is not embedded', () => {
    expect(directives).toMatch(/provenance:\s*mode=min/);
  });

  it('never leaves it at the action default', () => {
    expect(directives).not.toMatch(/provenance:\s*true/);
  });
});
