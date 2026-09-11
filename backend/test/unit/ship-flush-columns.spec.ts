import { Prisma } from '@prisma/client';
import { stateToPrismaUpdate, IN_MEMORY_ONLY_SHIP_FIELDS } from '../../src/game/ship/ship-state.mappers';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../helpers/make-ship';

/**
 * Every key `stateToPrismaUpdate` returns must be a real Ship column.
 *
 * The function hands `...rest` straight to Prisma, so ONE in-memory-only field
 * left in scope makes every flush throw — and ShipStateService logs and
 * swallows it, so the only symptom is that the ship silently stops persisting.
 * The mapper's own comment warns about this, and it had already bitten the
 * port three times (maxTons, maxWarp, channel).
 *
 * It bit a fourth time with `lockKey`, which `loc` sets. Any pilot who locked
 * a target stopped being saved from that moment: a playtester bought 70
 * torpedoes, locked a Murdonian Transport, and lost the entire hold to the
 * next restart while the debited credits — stored on User, a different table —
 * stayed spent. The live log carried the proof, 34 times over:
 *
 *   Unknown argument `lockKey`. Did you mean `lock`?
 *
 * Enumerating the columns from Prisma itself turns that class of bug from a
 * silent runtime failure into a failing unit test.
 */
function fullState(): ShipState {
  return baseMakeShip({
    userid: 'usr_a',
    shipname: 'Probe',
    xcoord: 1.5,
    ycoord: 2.5,
    phasrtype: 1,
    shieldtype: 1,
    items: Array(NUMITEMS).fill(0n) as bigint[],
    // In-memory only — every one of these must be stripped.
    lockKey: 'usr_b:1',
    maxTons: 1000,
    maxWarp: 10,
    channel: 7,
    teamcode: 3n,
    isEphemeral: false,
    lastfiredBy: { channel: 9, name: 'Killer' },
    deathCause: { kind: 'gravity', what: 'Zygor' },
    userKills: 4,
  });
}

describe('stateToPrismaUpdate returns only real Ship columns', () => {
  const columns = new Set<string>(Object.values(Prisma.ShipScalarFieldEnum));

  it('emits nothing Prisma would reject', () => {
    const update = stateToPrismaUpdate(fullState());
    const unknown = Object.keys(update).filter((k) => !columns.has(k));
    expect(unknown).toEqual([]);
  });

  it('strips lockKey, which `loc` sets and which has no column', () => {
    expect(columns.has('lockKey')).toBe(false);
    expect(Object.keys(stateToPrismaUpdate(fullState()))).not.toContain('lockKey');
  });

  /**
   * The fixture above is hand-written, so it can only ever test the fields
   * someone remembered to add to it — which is exactly how lastfiredBy,
   * deathCause and userKills all shipped. This one is built FROM the strip
   * list, so it grows on its own. The list's own completeness is enforced at
   * compile time by `_everyInMemoryFieldIsListed` in the mapper.
   */
  it('strips every field on the in-memory-only list, however the list grows', () => {
    const state = fullState() as unknown as Record<string, unknown>;
    for (const key of IN_MEMORY_ONLY_SHIP_FIELDS) state[key] = 'set';
    const update = stateToPrismaUpdate(state as unknown as ShipState);
    expect(Object.keys(update).filter((k) => !columns.has(k))).toEqual([]);
    for (const key of IN_MEMORY_ONLY_SHIP_FIELDS) expect(update).not.toHaveProperty(key);
  });

  it('still carries the state that MUST persist', () => {
    const update = stateToPrismaUpdate(fullState()) as Record<string, unknown>;
    for (const key of ['xcoord', 'ycoord', 'energy', 'damage', 'items', 'heading', 'topspeed']) {
      expect(update).toHaveProperty(key);
    }
  });
});
