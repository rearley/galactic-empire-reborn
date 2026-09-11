/**
 * Blank out the comments in a TypeScript source file without moving anything.
 *
 * `fixture-domains.spec.ts` finds out-of-domain fixture values with a text
 * regex, and had no notion of comments, so a value written in PROSE was
 * indistinguishable from a value written in a fixture. The guard exists because
 * a wrong fixture value hid the Cybertron movement bug for 339 commits, and the
 * best defence against a repeat is writing down why a value matters next to the
 * value — which requires naming the bad one. A guard that punishes the
 * explanation discourages exactly the documentation that prevents the
 * recurrence. @see issue #13
 *
 * Every comment character becomes a space; newlines are left alone. That makes
 * the result the SAME LENGTH and the same number of lines as the input, which
 * is not cosmetic: the caller reports line numbers and walks outward through
 * enclosing object literals by character offset. A masker that deleted text
 * would move every report it makes.
 *
 * Masking the braces inside comments is a second, quieter fix — a `{` in prose
 * used to be counted by that outward walk as if it opened a literal.
 *
 * STRINGS ARE NOT MASKED. A string is code: it is how a spec asserts on text,
 * and a fixture value written inside one is still a fixture value. The cost is
 * that a spec quoting a banned value in a string literal still trips the guard,
 * and declares itself with `domain-ok:` like any other deliberate use.
 *
 * KNOWN LIMIT: a template literal is opaque from its opening backtick to the
 * next unescaped one, so a comment inside a `${...}` substitution is not
 * masked. Nothing in this suite writes one, and treating the interpolation as
 * code would mean tracking brace depth through nested templates for no
 * measured benefit.
 */

/** Words after which a `/` opens a regex rather than dividing. */
const REGEX_PRECEDING_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'case', 'do', 'else', 'void',
  'delete', 'new', 'throw', 'await', 'yield',
]);

/**
 * Is the `/` at `i` the start of a regex literal, or a division sign?
 *
 * The standard heuristic: a regex cannot follow a value, so look back at the
 * last significant character. A word character, `)`, `]`, `}` or a closing
 * quote means a value just ended, so this is division — UNLESS the word is a
 * keyword, because `return /x/` is a regex and `return` ends in a word
 * character like any identifier.
 */
function startsRegex(src: string, i: number): boolean {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  if (j < 0) return true;
  const c = src[j];
  if (!/[\w)\]}'"`]/.test(c)) return true;
  if (/[)\]}'"`]/.test(c)) return false;
  let k = j;
  while (k >= 0 && /\w/.test(src[k])) k--;
  return REGEX_PRECEDING_KEYWORDS.has(src.slice(k + 1, j + 1));
}

/**
 * `src` with every comment character replaced by a space, same length, same
 * line count.
 */
export function maskComments(src: string): string {
  const out = src.split('');
  const blank = (i: number) => {
    if (out[i] !== '\n') out[i] = ' ';
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i];

    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') blank(i++);
      continue;
    }

    if (c === '/' && src[i + 1] === '*') {
      blank(i++);
      blank(i++);
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) blank(i++);
      if (i < src.length) {
        blank(i++);
        blank(i++);
      }
      continue;
    }

    if (c === "'" || c === '"' || c === '`') {
      // A quote or backtick is opaque until its unescaped partner. An
      // unterminated single- or double-quoted string ends at the newline
      // instead of running away through the rest of the file.
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === c) { i++; break; }
        if (src[i] === '\n' && c !== '`') break;
        i++;
      }
      continue;
    }

    if (c === '/' && startsRegex(src, i)) {
      i++;
      let inClass = false;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '/' && !inClass) { i++; break; }
        else if (src[i] === '\n') break;
        i++;
      }
      continue;
    }

    i++;
  }
  return out.join('');
}
