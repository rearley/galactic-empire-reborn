/**
 * The compiled output must not `require` a `.ts` file.
 *
 * Prisma 7 generates the client as TypeScript source, and it writes relative
 * imports with an EXPLICIT `.ts` extension:
 *
 *   import * as $Class from "./internal/class.ts"
 *
 * TypeScript does not rewrite an extension on its own, so without
 * `rewriteRelativeImportExtensions` that compiles to
 * `require("./internal/class.ts")` — a path that does not exist beside the
 * emitted `class.js`. The result is an image that builds clean, a suite that is
 * entirely green, and a container that dies on its first require of the Prisma
 * client.
 *
 * It hid twice over: Vitest resolves `.ts` specifiers natively, so no test
 * could see it, and every generated file opens with `// @ts-nocheck`, which
 * suppressed the compiler error that would have said "An import path can only
 * end with a '.ts' extension when 'allowImportingTsExtensions' is enabled". It
 * was found by running the built image, and confirmed by mutation: removing the
 * option and rebuilding reproduced the broken container exactly.
 *
 * HONEST LIMIT, and the reason this is a file test: the backend CI job does not
 * build, so there is no `dist/` here to inspect, and CI has no Docker daemon.
 * This guards the DIRECTIVE; a human verifies the image boots — the same split
 * `node-runtime-version.spec.ts` and `dockerfile-nonroot.spec.ts` use.
 *
 * @see docs/DECISIONS.md 2026-09-11
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BACKEND = resolve(__dirname, '../..');

describe('the built client requires no .ts path', () => {
  it('keeps rewriteRelativeImportExtensions on', () => {
    const tsconfig = JSON.parse(readFileSync(join(BACKEND, 'tsconfig.json'), 'utf8')) as {
      compilerOptions?: Record<string, unknown>;
    };
    // Turning this off produces a container that dies on its first require of
    // the Prisma client, with a clean build and a green suite either side.
    expect(tsconfig.compilerOptions?.['rewriteRelativeImportExtensions']).toBe(true);
  });

  it('still generates a client whose imports carry the .ts extension', () => {
    // The premise of the option above. If Prisma ever stops emitting `.ts`
    // specifiers, this fails — and a failure here is not a defect, it means the
    // reason can be retired rather than left as unexplained configuration.
    const client = readFileSync(join(BACKEND, 'generated/prisma/client.ts'), 'utf8');
    expect(client).toMatch(/from "\.\/[^"]+\.ts"/);
  });
});
