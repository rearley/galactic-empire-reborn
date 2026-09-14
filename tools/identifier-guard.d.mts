/**
 * Types for the identifier guard, which is plain ESM JavaScript.
 *
 * It is `.mjs` rather than TypeScript on purpose: the git hooks run it with
 * bare `node`, before any build step exists and without a toolchain on the
 * path. This declaration is what lets the spec import it under `tsc`.
 */

/** One hit, reported without the matched text — printing it would be the leak. */
export interface IdentifierHit {
  line: number;
  /** First 12 hex characters of the term's digest, enough to tell two apart. */
  hash: string;
}

/** SHA-256 of a term, normalised the same way candidate tokens are. */
export function hashTerm(term: string): string;

/** Hits in one blob of text, as 1-based line numbers. Never returns the match. */
export function scanText(text: string, hashes: Set<string>): IdentifierHit[];

/** The digest vocabulary, read from `tools/forbidden-identifiers.sha256`. */
export function loadHashes(repo: string): Set<string>;
