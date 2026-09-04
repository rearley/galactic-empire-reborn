/**
 * The generated message table must still match MBMGEMSG.MSG.
 *
 * `canon-messages.generated.ts` is produced by tools/extract-messages.mjs and
 * is what 94 of our player-facing strings now read from, so a silent
 * extraction hole becomes wrong text in the game.
 *
 * This extractor fooled me TWICE, and both times the output looked healthy:
 *
 *   • Anchoring the closing brace to the start of a line missed every INLINE
 *     entry (`SCAN11 {Environment:} T`), and each one then swallowed forward to
 *     its neighbour's terminator — SCAN11 ate SCAN12. 784 entries, plausible.
 *   • Requiring a newline after the type letter missed terminators carrying a
 *     trailing comment (`} T spy Wormhole Message`) — SPY0B ate SPY0C. 834
 *     entries, still plausible.
 *
 * The fix is to forbid braces inside a body, forcing the first closing brace to
 * terminate. 1,070 entries. A partial extraction reads exactly like a working
 * one, which is why this re-parses the original rather than trusting a count.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CANON_MESSAGES } from '../../src/game/commands/canon-messages.generated';

const MSG = resolve(__dirname, '../../..', 'reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG');

/** Re-implemented here so the test cannot inherit the extractor's bug. */
function parse(raw: string): Map<string, string> {
  const stripped = raw.replace(/\x1b?\[[0-9;]*[A-Za-z]/g, '');
  const out = new Map<string, string>();
  const re = /^([A-Z][A-Z0-9_]*)[ \t]*\{([^{}]*?)\}[ \t]*[A-Z]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    out.set(m[1], m[2].replace(/[ \t]+$/gm, '').replace(/\n+$/, ''));
  }
  return out;
}

const d = existsSync(MSG) ? describe : describe.skip;

d('generated messages match the shipped MBMGEMSG.MSG', () => {
  const fromFile = parse(readFileSync(MSG, 'latin1'));

  it('extracts the full table', () => {
    expect(fromFile.size).toBeGreaterThan(1000);
    expect(Object.keys(CANON_MESSAGES)).toHaveLength(fromFile.size);
  });

  it('every entry matches the original', () => {
    for (const [id, text] of fromFile) expect(CANON_MESSAGES[id]).toBe(text);
  });

  it('no entry swallowed its neighbour', () => {
    // The signature of the two extraction bugs: a terminator inside a body.
    for (const [id, text] of Object.entries(CANON_MESSAGES)) {
      expect(`${id}: ${text}`).not.toMatch(/\}\s*[A-Z]\s*\n/);
      expect(text).not.toMatch(/\{/);
    }
  });

  it('keeps the entries the two bugs destroyed', () => {
    expect(CANON_MESSAGES.SCAN11).toBe('Environment:');
    expect(CANON_MESSAGES.SCAN12).toBe('Poor');
    expect(CANON_MESSAGES.SPY0B).toBe("We can't spy on a wormhole!!!");
    expect(CANON_MESSAGES.SPY0C).toContain('Capital Offense');
  });

  it('carries no ANSI into the game', () => {
    for (const text of Object.values(CANON_MESSAGES)) {
      expect(text).not.toMatch(/\x1b/);
      expect(text).not.toMatch(/\[[0-9;]*m/);
    }
  });
});
