import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One parser for `userid:shipno`, not one per file that happens to need it.
 *
 * Every private narration line is addressed by splitting a ship key into the
 * captain's userid and routing to `user:<userid>`. That split had two
 * implementations — one in `game.gateway.ts`, one copied into `narration.ts`
 * with a comment saying the copy avoided a circular import with the gateway.
 * `ship-identity.ts` is a pure module that imports neither, exists for exactly
 * this, and says so in its own header: "A shared module keeps ONE copy of each
 * rather than a duplicate that can drift."
 *
 * Drift here is not hypothetical. A `userid#shipno` / `userid:shipno` mismatch
 * between two such parsers is what made every hit report read "ship ?" in a
 * live game. @see issue #44, src/gateway/ship-identity.ts
 */
const GATEWAY = join(__dirname, '../../src/gateway');

function sourcesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => join(dir, e.name));
}

describe('the ship-key parser is defined once', () => {
  it('declares useridOf and shipnoOf in ship-identity.ts only', () => {
    const declarers = sourcesIn(GATEWAY).filter((file) =>
      /(?:export\s+)?function\s+(?:useridOf|shipnoOf)\b/.test(readFileSync(file, 'utf8')),
    );

    expect(declarers.map((f) => f.replace(`${GATEWAY}/`, ''))).toEqual(['ship-identity.ts']);
  });

  it('exports both, so the other modules can import rather than copy', () => {
    const identity = readFileSync(join(GATEWAY, 'ship-identity.ts'), 'utf8');
    expect(identity).toMatch(/export function useridOf\b/);
    expect(identity).toMatch(/export function shipnoOf\b/);
  });
});
