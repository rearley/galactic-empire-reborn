import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Each image installs the workspaces it builds, and no others.
 *
 * Both Dockerfiles take the repo root as their build context — they have to,
 * because `@ge/wire` resolves through the root lockfile. The cost of that
 * wider context is that a bare `npm ci` installs EVERY workspace: the frontend
 * image was pulling Nest, Prisma, the Prisma CLI and Vitest in order to run
 * `tsc && vite build` over a static bundle. The backend image had already
 * scoped its install for the same reason and measured it, roughly doubling
 * node_modules when tried unscoped.
 *
 * Runtime size is unaffected either way — the frontend ships nginx and a `dist`
 * — so this guards build time and the dependency surface of the build, not the
 * image. A file test, like its neighbours: CI has no Docker daemon.
 * @see dockerfile-runtime-deps.spec.ts
 */
const REPO = join(__dirname, '../../..');

/** Directive lines only — a comment naming a workspace proves nothing. */
function directivesOf(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');
}

describe('each image installs only the workspaces it builds', () => {
  it('the frontend image installs frontend and wire, not the backend', () => {
    const directives = directivesOf('frontend/Dockerfile');
    expect(directives).toMatch(/npm ci --workspace=frontend --workspace=packages\/wire/);
    expect(directives).not.toMatch(/^RUN npm ci$/m);
  });

  it('the backend image installs backend and wire, not the frontend', () => {
    const directives = directivesOf('backend/Dockerfile');
    expect(directives).toMatch(/npm ci --workspace=backend --workspace=packages\/wire/);
    expect(directives).not.toMatch(/^RUN npm ci$/m);
  });

  it('neither copies a manifest for a workspace it does not install', () => {
    expect(directivesOf('frontend/Dockerfile')).not.toMatch(/COPY backend\/package\.json/);
    expect(directivesOf('backend/Dockerfile')).not.toMatch(/COPY frontend\/package\.json/);
  });
});
