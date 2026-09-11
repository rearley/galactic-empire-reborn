import { readFileSync } from 'fs';
import { join } from 'path';
import { readdirSync } from 'node:fs';

/**
 * Every keyword in canon's command table must be typeable here.
 *
 * `flu` and `ren` were not. They are implemented — as `flux` and `rename` —
 * but shipped with empty `aliases` arrays, so a player typing the keyword the
 * ORIGINAL uses got nothing back. Every other command carries its three-letter
 * form. Nothing caught it because both commands work perfectly under the names
 * we happened to choose.
 *
 * This reads canon's table rather than restating it, so a command added to the
 * port under a new name fails here until the canon keyword resolves too.
 *
 * @see GECMDS.C:111-225 cmdtab
 */
const GECMDS = join(__dirname, '../../../reference/ge-source/GECMDS.C');
const HANDLERS = join(__dirname, '../../src/game/commands/handlers');

function canonKeywords(): string[] {
  const src = readFileSync(GECMDS, 'utf8');
  return [...new Set(
    [...src.matchAll(/\{\s*"([a-z]+)"\s*,\s*cmd_/g)].map((m) => m[1]),
  )].sort();
}

function ourKeywords(): Set<string> {
  const words = new Set<string>();
  for (const f of readdirSync(HANDLERS).filter((n: string) => n.endsWith('.ts'))) {
    const src = readFileSync(join(HANDLERS, f), 'utf8');
    for (const m of src.matchAll(/keyword:\s*'([a-z]+)'/g)) words.add(m[1]);
    for (const m of src.matchAll(/aliases:\s*\[([^\]]*)\]/g)) {
      for (const a of m[1].matchAll(/'([a-z]+)'/g)) words.add(a[1]);
    }
  }
  return words;
}

describe('canon command coverage', () => {
  it('reads a substantial command table, so a broken regex fails loudly', () => {
    expect(canonKeywords().length).toBeGreaterThan(35);
  });

  it('every canon keyword is typeable in this port', () => {
    const ours = ourKeywords();
    const missing = canonKeywords().filter((k) => !ours.has(k));
    expect(missing).toEqual([]);
  });
});
