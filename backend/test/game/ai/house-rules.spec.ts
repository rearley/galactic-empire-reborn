/**
 * Every AI behaviour that is the port's rather than canon's is a named house
 * rule, switchable, with the DECISIONS entry that justifies it.
 *
 * Two directions, like the `@divergence` guard: a rule must be READ somewhere
 * (a switch nothing consults is a lie), and every `PORT-ORIGINAL` marker in the
 * AI code must name its rule (a deviation nobody declared is the thing this
 * exists to stop). @see issue #63, src/game/ai/house-rules.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CANON_RULES, HOUSE_RULE_DECISIONS, PORT_RULES, type AiHouseRules } from '../../../src/game/ai/house-rules';

const ROOT = join(__dirname, '../../..');
const SRC = join(ROOT, 'src');
const AI_DIRS = ['game/ai', 'game/cybertron', 'game/droid', 'game/combat'].map((d) => join(SRC, d));
const RULES = Object.keys(PORT_RULES) as (keyof AiHouseRules)[];

function sources(): Array<{ file: string; text: string }> {
  return AI_DIRS.flatMap((dir) => readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map((f) => ({ file: relative(SRC, join(dir, f)), text: readFileSync(join(dir, f), 'utf8') })));
}

describe('AI house rules', () => {
  it('production runs every rule; canon runs none', () => {
    expect(Object.values(PORT_RULES).every((v) => v === true)).toBe(true);
    expect(Object.values(CANON_RULES).every((v) => v === false)).toBe(true);
    expect(Object.keys(CANON_RULES).sort()).toEqual([...RULES].sort());
  });

  it.each(RULES)('%s names a DECISIONS entry that exists', (rule) => {
    const decisions = readFileSync(join(ROOT, '../docs/DECISIONS.md'), 'utf8');
    expect(decisions).toContain(`## ${HOUSE_RULE_DECISIONS[rule]}`);
  });

  it.each(RULES)('%s is consulted somewhere in the AI code', (rule) => {
    const readers = sources().filter(({ text }) => new RegExp(`\\brules\\.${rule}\\b`).test(text));
    expect(readers.map((r) => r.file)).not.toEqual([]);
  });

  it('every PORT-ORIGINAL marker in the AI code names its house rule, or says why it is not one', () => {
    const bad: string[] = [];
    for (const { file, text } of sources()) {
      text.split('\n').forEach((line, i) => {
        // A marker, not a mention: the registry's own docs quote the word.
        if (!/(?<!`)PORT-ORIGINAL(?!`)/.test(line)) return;
        const named = /@house-rule (\w+)/.exec(line);
        if (named && RULES.includes(named[1] as keyof AiHouseRules)) return;
        if (/@not-a-house-rule\b/.test(line)) return;
        bad.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
