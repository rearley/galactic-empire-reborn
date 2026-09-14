import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../../..');

const WORKSPACES = ['backend', 'frontend', 'packages/wire'] as const;

/** tsconfig allows comments, so strip them before parsing. */
function readTsconfig(ws: string): { compilerOptions?: { types?: string[] } } | null {
  const p = join(REPO, ws, 'tsconfig.json');
  if (!existsSync(p)) return null;
  const stripped = readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(stripped);
}

function declaredDeps(ws: string): Set<string> {
  const pkg = JSON.parse(readFileSync(join(REPO, ws, 'package.json'), 'utf8'));
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
}

/**
 * The package a `types` entry actually needs installed.
 *
 * Three shapes appear here. A bare name like `node` is shorthand for
 * `@types/node`. An entry with a slash, like `vitest/globals`, is a subpath of
 * a REAL package, so the package itself is what must be present — reading it
 * as `@types/vitest/globals` invents a dependency that does not exist. A
 * scoped name is already a package.
 */
function required(entry: string): string {
  if (entry.startsWith('@')) return entry.split('/').slice(0, 2).join('/');
  if (entry.includes('/')) return entry.split('/')[0];
  return `@types/${entry}`;
}

/**
 * A workspace that asks for a `@types` package must declare it itself.
 *
 * The frontend's tsconfig has always carried `"types": ["node"]` while only the
 * BACKEND declared `@types/node`. Locally that works — npm hoists the backend's
 * devDependencies to the workspace root, where the frontend's `tsc` finds them.
 * The frontend image does not: `frontend/Dockerfile` installs
 * `--workspace=frontend --workspace=packages/wire` and nothing else.
 *
 * It survived on a second accident. `packages/wire` depended on Jest, Jest
 * depends on `@types/node`, and wire IS installed in the frontend image. Moving
 * wire to Vitest (#47) removed that path, and the frontend image build failed
 * with `TS2688: Cannot find type definition file for 'node'` — after a local
 * `npm run build`, a local `tsc --noEmit` and the whole CI suite had passed,
 * because every one of them runs against the hoisted root tree.
 *
 * Only the image install scope can see this, so the rule is checked directly:
 * whatever a workspace's tsconfig names in `types`, that workspace declares.
 */
describe('workspace @types dependencies', () => {
  WORKSPACES.forEach((ws) => {
    const tsconfig = readTsconfig(ws);
    const types = tsconfig?.compilerOptions?.types;
    if (!types?.length) return;

    types.forEach((t) => {
      const pkg = required(t);
      it(`${ws} declares ${pkg}, which its tsconfig requires`, () => {
        expect([ws, pkg, declaredDeps(ws).has(pkg)]).toEqual([ws, pkg, true]);
      });
    });
  });

  it('checks at least one workspace, so a parsing failure cannot pass silently', () => {
    const withTypes = WORKSPACES.filter((ws) => readTsconfig(ws)?.compilerOptions?.types?.length);
    expect(withTypes.length).toBeGreaterThan(0);
  });
});
