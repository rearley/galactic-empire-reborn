/**
 * Every room the gateway emits to must be a room something joins.
 *
 * `handleDroidAnnoy` addressed `to:<userid>:<shipno>` for the life of the droid
 * AI. Sockets join `user:<userid>` and `sector:<x>:<y>` and nothing else, so
 * that delivery went nowhere — and no test noticed, because they all assert
 * WHAT is emitted, never WHERE.
 *
 * This compares the room-name PREFIXES the gateway builds against the ones it
 * joins. It cannot catch a wrong userid, but it catches an entire address space
 * that does not exist, which is the failure that actually happened.
 *
 * It scans every `\`prefix:...\`` template in the file rather than only the ones
 * written inline in a `.to(...)` call. The first version did the latter and
 * missed the very bug it was written for, because the dead room was assigned to
 * a `const targetRoom` first.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../../src/gateway/game.gateway.ts'),
  'utf8',
);

/** `foo:${...}` / `foo:` template-literal room names, reduced to their prefix. */
function roomPrefixes(re: RegExp): Set<string> {
  const out = new Set<string>();
  for (const m of SRC.matchAll(re)) {
    const prefix = /^([a-z][a-zA-Z-]*):/.exec(m[1]);
    if (prefix) out.add(prefix[1]);
  }
  return out;
}

describe('gateway room names', () => {
  const joined = roomPrefixes(/\.join\(\s*`([^`]+)`/g);
  // Any `prefix:${...}` template in the file is a candidate room name.
  const built = roomPrefixes(/`([a-z][a-zA-Z-]*:[^`]*\$\{[^`]*)`/g);

  it('finds both sets (guards the scanner itself)', () => {
    expect([...joined].sort()).toEqual(['sector', 'user']);
    expect(built.size).toBeGreaterThan(0);
  });

  it('builds only room names in a namespace something joins', () => {
    expect([...built].filter((p) => !joined.has(p)).sort()).toEqual([]);
  });
});
