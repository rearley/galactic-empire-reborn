import { Prisma } from '@prisma/client';
import { stateToPrismaUpdate, IN_MEMORY_ONLY_SHIP_FIELDS } from '../../src/game/ship/ship-state.mappers';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../src/game/constants/items';

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
  return {
    userid: 'usr_a', shipno: 1, shipname: 'Probe', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 1.5, ycoord: 2.5, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(NUMITEMS).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
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
  } as ShipState;
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
