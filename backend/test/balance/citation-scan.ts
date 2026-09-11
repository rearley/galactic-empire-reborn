/**
 * How this codebase writes a canon citation, in one place.
 *
 * `FILE.C:1198` is the long form. The shorthand — name the file once, then
 * continue with bare line numbers — is used 197 times across `backend/` and
 * appears in every separator the prose reaches for:
 *
 *   GECMDS.C:1198, :1313
 *   GEFUNCS.C:1595-1603 (TORP1) and :1680-1688 (MISSL1)
 *   GECMDS.C:2516 then :2521
 *   GECMDS.C:5614 / :5682 / :5724
 *
 * The rule that covers all of them is positional rather than syntactic: a bare
 * `:NNN` belongs to the most recent GE file named on the SAME line. Line-scoped
 * because a citation's file must be visible where the number is; carrying state
 * across lines would let an unrelated `:NNN` two paragraphs down inherit a file
 * nobody reading it would connect to the number.
 *
 * Both guards that consume this were previously scanning with the long form
 * only, so all 197 were uncounted by the citation totals, never bounds-checked
 * against the vendored original, and never eligible for quote verification.
 *
 * @see docs/DECISIONS.md 2026-09-11 — the citation scanner
 */

export interface Citation {
  /** Upper-cased canon filename, e.g. `GECMDS.C`. */
  file: string;
  /** The cited line number. A range (`:1595-1603`) reads as its first line. */
  line: number;
  /** The fragment backticked immediately after this number, if any. */
  quote: string | null;
}

/**
 * Either a full `FILE.C:NNN` citation or a bare `:NNN` continuation.
 *
 * The lookbehind on the continuation branch is what keeps the scanner off
 * ordinary code: it rejects any colon preceded by a word character or a dot,
 * which covers every object key (`speed:3`), every ratio (`12:30`) and every
 * property access. A continuation is only ever reached after a punctuation or
 * whitespace boundary — `(:945)`, `, :1313`, `and :1384`.
 */
const TOKEN = /\b(GE[A-Z]+\.[CH]):(\d+)|(?<![\w.]):(\d+)\b/g;

/** A backticked fragment sitting immediately after a citation. */
const TRAILING_QUOTE = /^\s*`([^`]+)`/;

/**
 * Every citation on one line of source, prose or code, in the order written.
 *
 * A bare continuation appearing before any file is named on the line is NOT a
 * citation and is dropped — without that, every object literal in the suite
 * would become one.
 */
export function scanLine(text: string): Citation[] {
  const out: Citation[] = [];
  let current: string | null = null;
  for (const m of text.matchAll(TOKEN)) {
    if (m[1]) current = m[1].toUpperCase();
    else if (current === null) continue;
    const line = Number(m[2] ?? m[3]);
    const after = text.slice(m.index! + m[0].length);
    const quoted = TRAILING_QUOTE.exec(after);
    out.push({ file: current!, line, quote: quoted ? quoted[1] : null });
  }
  return out;
}
