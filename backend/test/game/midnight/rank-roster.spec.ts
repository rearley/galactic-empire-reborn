/**
 * T010 — Pure-unit tests for rankRoster helper.
 *
 * Rules from GEMAIN.C:1302-1332 (rospos assignment pass):
 *   - Ordered by score descending (qhibtv — high-key BTree walk)
 *   - Skip if score == 0
 *   - Skip if userid == KEY (first char of KEY)
 *   - Skip if userid starts with '@'
 *   - Assign rospos = i+1 (1-based, sequential)
 *   - Non-qualifiers keep rospos = 0
 *
 * @see GEMAIN.C:1302-1332 — rospos assignment
 * @see specs/009-midnight-job/tasks.md T010
 */

import { rankRoster, RosterUser } from '../../../src/game/midnight/rank-roster';

function user(userid: string, score: bigint): RosterUser {
  return { userid, score };
}

describe('rankRoster — pure ordering and skip rules (GEMAIN.C:1302-1332)', () => {
  it('returns an empty map for no users', () => {
    expect(rankRoster([])).toEqual(new Map());
  });

  it('assigns rospos 1 to a single qualifying user', () => {
    const result = rankRoster([user('alice', 1000n)]);
    expect(result.get('alice')).toBe(1);
  });

  it('assigns rospos 0 to a user with score = 0', () => {
    const result = rankRoster([user('alice', 0n)]);
    expect(result.get('alice')).toBe(0);
  });

  it('skips KEY — the KEY record is never ranked', () => {
    const result = rankRoster([user('KEY', 999_999n), user('alice', 1000n)]);
    expect(result.has('KEY')).toBe(false);
    expect(result.get('alice')).toBe(1);
  });

  it('skips @-prefixed userids (AI users)', () => {
    const result = rankRoster([user('@Droid-1', 500n), user('alice', 1000n)]);
    expect(result.has('@Droid-1')).toBe(false);
    expect(result.get('alice')).toBe(1);
  });

  it('sorts descending by score', () => {
    const users = [
      user('charlie', 100n),
      user('alice', 1000n),
      user('bob', 500n),
    ];
    const result = rankRoster(users);
    expect(result.get('alice')).toBe(1);
    expect(result.get('bob')).toBe(2);
    expect(result.get('charlie')).toBe(3);
  });

  it('breaks ties deterministically by userid (alphabetical)', () => {
    const users = [user('bob', 500n), user('alice', 500n)];
    const result = rankRoster(users);
    // 'alice' < 'bob' alphabetically → alice gets rank 1
    expect(result.get('alice')).toBe(1);
    expect(result.get('bob')).toBe(2);
  });

  it('non-qualifiers (score=0, KEY, @-prefix) get rospos=0 in the map', () => {
    const users = [
      user('KEY', 9999n),
      user('@bot', 500n),
      user('zero', 0n),
      user('alice', 1000n),
    ];
    const result = rankRoster(users);
    expect(result.get('zero')).toBe(0);
    expect(result.has('KEY')).toBe(false);
    expect(result.has('@bot')).toBe(false);
    expect(result.get('alice')).toBe(1);
  });

  it('handles a large roster correctly (100 users)', () => {
    const users: RosterUser[] = Array.from({ length: 100 }, (_, i) => ({
      userid: `user${String(i).padStart(3, '0')}`,
      score: BigInt(100 - i),
    }));
    const result = rankRoster(users);
    expect(result.get('user000')).toBe(1);
    expect(result.get('user099')).toBe(100);
  });
});
