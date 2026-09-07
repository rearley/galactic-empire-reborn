/**
 * Escapes Postgres LIKE/ILIKE metacharacters (`%`, `_`, and the escape
 * character `\` itself) so a value passed through Prisma's
 * `{ equals: value, mode: 'insensitive' }` filter — which renders as
 * `column ILIKE $1` with the value used verbatim AS THE PATTERN, not as an
 * escaped literal — is matched literally instead of as a wildcard pattern.
 *
 * Postgres' default LIKE/ILIKE escape character is a backslash, so prefixing
 * each metacharacter with one here is sufficient; no `ESCAPE` clause is
 * needed (and Prisma gives no way to add one to a generated `ILIKE`).
 *
 * Found via `auth.service.ts` `login()`, where an unescaped `%`/`_` in a
 * `mode: 'insensitive'` query let one request test a password against every
 * matching row. Any other `mode: 'insensitive'` query built from
 * user-supplied text (team name, ship name, ...) needs the same treatment
 * unless it can instead compare against an already-normalized stored value.
 */
export function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
