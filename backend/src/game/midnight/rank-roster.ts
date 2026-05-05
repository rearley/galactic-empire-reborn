/**
 * Pure helper: assign roster positions to qualifying users.
 *
 * Rules from GEMAIN.C:1302-1332 (rospos assignment pass):
 *   - Walk users ordered by score descending (ties broken by userid alphabetically)
 *   - Skip if userid == 'KEY'
 *   - Skip if userid starts with '@'
 *   - Skip if score == 0
 *   - Assign rospos = i+1 (1-based, sequential) to qualifiers
 *   - Non-qualifiers (score=0, zero-score) get rospos=0 in the returned map
 *   - KEY and @-prefixed users are excluded from the map entirely
 *
 * @see GEMAIN.C:1302-1332 — rospos assignment pass
 */
export interface RosterUser {
  userid: string;
  score: bigint;
}

export function rankRoster(users: RosterUser[]): Map<string, number> {
  const result = new Map<string, number>();

  const qualifiers = users.filter(
    (u) => u.userid !== 'KEY' && !u.userid.startsWith('@') && u.score > 0n,
  );

  qualifiers.sort((a, b) => {
    if (b.score !== a.score) return b.score > a.score ? 1 : -1;
    return a.userid < b.userid ? -1 : a.userid > b.userid ? 1 : 0;
  });

  qualifiers.forEach((u, i) => result.set(u.userid, i + 1));

  // Score=0 non-KEY non-@ users get rospos=0
  users.forEach((u) => {
    if (u.userid !== 'KEY' && !u.userid.startsWith('@') && u.score === 0n) {
      result.set(u.userid, 0);
    }
  });

  return result;
}
