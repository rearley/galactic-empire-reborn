/**
 * The masker is what lets `fixture-domains.spec.ts` tell a fixture from prose
 * about a fixture, so it gets its own test.
 *
 * It must be LENGTH-PRESERVING. `fixture-domains` reports line numbers and
 * walks outward through enclosing object literals by character offset, so a
 * masker that deleted text would move every report and every brace it counts.
 * Comment characters are replaced with spaces; newlines survive untouched.
 *
 * @see docs/DECISIONS.md 2026-09-11 — masking comments in the fixture guard
 */
import { maskComments } from './mask-comments';

/** Every masked file must line up with the original, character for character. */
const sameShape = (src: string) => {
  const out = maskComments(src);
  expect(out).toHaveLength(src.length);
  expect(out.split('\n')).toHaveLength(src.split('\n').length);
  return out;
};

describe('maskComments', () => {
  it('blanks a line comment and keeps the code before it', () => {
    // domain-ok: prose about a banned value, not a fixture
    const out = sameShape("const s = { shpclass: 1 }; // topspeed: 8000 once hid a bug");
    expect(out).toContain('const s = { shpclass: 1 }; ');
    expect(out).not.toContain('8000');
  });

  it('blanks a block comment across lines but keeps the line breaks', () => {
    // domain-ok: the same prose, in a docblock
    const out = sameShape('/**\n * topspeed: 8000 hid it for 339 commits\n */\nconst a = 1;');
    expect(out.split('\n')[1]).not.toContain('8000');
    expect(out.split('\n')[3]).toBe('const a = 1;');
  });

  it('leaves a string literal alone, even one that looks like a comment', () => {
    // A string is code. It is how a spec asserts on text that contains `//`,
    // and masking it would hide a fixture written inside one.
    const out = sameShape(`const url = 'https://example.com/x'; const t = "// not a comment";`);
    expect(out).toBe(`const url = 'https://example.com/x'; const t = "// not a comment";`);
  });

  it('leaves a template literal alone', () => {
    const out = sameShape('const t = `a // b ${x} c`;');
    expect(out).toBe('const t = `a // b ${x} c`;');
  });

  it('does not mistake a regex literal containing a slash for a comment', () => {
    // `/domain-ok:/` and `/\/\//` both appear in this suite.
    const out = sameShape('if (/\\/\\//.test(line)) { const n = 1; }');
    expect(out).toBe('if (/\\/\\//.test(line)) { const n = 1; }');
  });

  it('does not mistake division for the start of a regex', () => {
    // domain-ok: the banned value below sits in a string, as the thing to mask
    const out = sameShape('const half = total / 2; const q = count / 4; // topspeed: 8000');
    expect(out).toContain('const half = total / 2; const q = count / 4; ');
    expect(out).not.toContain('8000');
  });

  it('does not treat an apostrophe inside a comment as opening a string', () => {
    // The killer case: a comment with one quote character would otherwise
    // swallow everything after it as a string literal.
    const out = sameShape("// it's fine\nconst s = { shpclass: 2 };");
    expect(out.split('\n')[1]).toBe('const s = { shpclass: 2 };');
  });

  it('keeps an escaped quote from ending a string early', () => {
    // domain-ok: the banned value below sits in a string, as the thing to mask
    const out = sameShape("const s = 'it\\'s'; // topspeed: 8000");
    expect(out).toContain("const s = 'it\\'s'; ");
    expect(out).not.toContain('8000');
  });

  it('handles a block comment opener inside a string', () => {
    const out = sameShape(`const s = '/*'; const n = 1;`);
    expect(out).toBe(`const s = '/*'; const n = 1;`);
  });
});
