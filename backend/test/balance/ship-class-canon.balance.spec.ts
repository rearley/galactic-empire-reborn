/**
 * Ship class table conformance to canon — the balance regression test for the
 * whole class table.
 *
 * This parses the ORIGINAL distribution's ship configuration table,
 * reference/ge-upstream/mbmgemp/GE/REL/MBMGESHP.MSG, at test time and asserts
 * that every field of every active class in our seed matches it exactly. It
 * deliberately re-implements the parse rather than importing
 * tools/extract-ship-classes.mjs, so a bug in the generator cannot hide behind
 * a test that shares it.
 *
 * HISTORY — why this replaced the previous tests.
 * Two earlier specs pinned scanRange to canon x 0.15, justified by the claim
 * that "the original C shipclass[] lived in a runtime-loaded .cnf file that is
 * not part of the published C source — so there is no C-canonical authority to
 * override anyway". That file is MBMGESHP.MSG, and we now have it, so the
 * premise is gone. The compression was never a deliberate balance decision that
 * survived scrutiny: projectRangeCell in src/game/constants.ts had ALREADY been
 * corrected to canon, dividing by 10_000 and documenting that "Interceptor
 * (scanRange=100000) covers a 10-sector radius". The seed was simply never
 * updated to match, so the starter ship projected a 1.5-sector radius through
 * code written for 10 — the same rule implemented twice, drifting apart.
 *
 * @see reference/ge-upstream/PROVENANCE.md — provenance, and source precedence
 * @see GEMAIN.C:835-875 — the read loop that binds these fields by ORDER
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SHIP_CLASSES } from '../../prisma/seed/ship-classes';

const MSG = resolve(
  __dirname,
  '../../../reference/ge-upstream/mbmgemp/GE/REL/MBMGESHP.MSG',
);

/**
 * Mnemonic -> [seed field, kind]. The ORDER is copied from GEMAIN.C:838-869;
 * the original binds options to struct fields by read order via ++classbase,
 * so order is load-bearing and is asserted per class below.
 */
const FIELDS: Array<[string, string, 'enum' | 'str' | 'num' | 'bool']> = [
  ['TYPE', 'category', 'enum'],
  ['NAME', 'typeName', 'str'],
  ['SNAME', 'shipNameTemplate', 'str'],
  ['SHLD', 'maxShields', 'num'],
  ['PHSR', 'maxPhaser', 'num'],
  ['TORP', 'hasTorpedo', 'bool'],
  ['MISL', 'hasMissile', 'bool'],
  ['DECY', 'hasDecoy', 'bool'],
  ['JAMMR', 'hasJammer', 'bool'],
  ['ZIPPR', 'hasZipper', 'bool'],
  ['MINE', 'hasMine', 'bool'],
  ['ATTK', 'canAttackPlanet', 'bool'],
  ['CLOK', 'hasCloak', 'bool'],
  ['ACCL', 'maxAcceleration', 'num'],
  ['WARP', 'maxWarp', 'num'],
  ['TONS', 'maxTons', 'num'],
  ['PRIC', 'maxPrice', 'num'],
  ['PNTS', 'points', 'num'],
  ['SRNG', 'scanRange', 'num'],
  ['CATK', 'cybCanAttack', 'bool'],
  ['NATK', 'noClaim', 'num'],
  ['LATK', 'cybLowestClassAttacks', 'num'],
  ['MAKE', 'make', 'num'],
  ['TOUGH', 'tough', 'num'],
  ['DAMF', 'damageFactor', 'num'],
  ['RES2', 'reserved2', 'num'],
  ['RES3', 'reserved3', 'num'],
  ['HELP', 'helpMessage', 'str'],
];

const CATEGORY: Record<string, string> = {
  USER: 'PLAYER',
  CYBORG: 'CPU_COMBATIVE',
  DROID: 'CPU_DROID',
};

/** The text before `: ` or `? ` is prose for the sysop; the tail is the value. */
function parseValue(raw: string, kind: string): string | number | boolean {
  let v = raw;
  const q = raw.lastIndexOf('? ');
  const c = raw.lastIndexOf(': ');
  const labelled = q !== -1 || c !== -1;
  if (q !== -1) v = raw.slice(q + 2);
  else if (c !== -1) v = raw.slice(c + 2);
  if (kind === 'bool') return v.trim() === 'YES';
  if (kind === 'num') return v.trim() === '' ? 0 : Number(v.trim());
  // Bare string options carry NO sysop label, and their whitespace is data:
  // SNAME is a prefix the original concatenates a number onto, so "Cyberquad "
  // must keep its trailing space or the ship becomes "Cyberquad223".
  return labelled ? v.trim() : v;
}

interface CanonClass {
  classNumber: number;
  order: string[];
  values: Record<string, string | number | boolean>;
}

function parseCanon(): CanonClass[] {
  const text = readFileSync(MSG, 'utf8');
  const byNum = new Map<number, CanonClass>();
  const re = /^S(\d{2})([A-Z0-9]+) \{([^}]*)\}/gm;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const n = Number(m[1]);
    let e = byNum.get(n);
    if (!e) byNum.set(n, (e = { classNumber: n, order: [], values: {} }));
    e.order.push(m[2]);
    const field = FIELDS.find((f) => f[0] === m![2]);
    if (field) e.values[field[1]] = parseValue(m[3], field[2]);
  }
  return [...byNum.values()].sort((a, b) => a.classNumber - b.classNumber);
}

const canon = parseCanon();
const active = canon.filter((c) => c.values.category !== '<NONE>');
const inactive = canon.filter((c) => c.values.category === '<NONE>');
const seedByNumber = new Map(SHIP_CLASSES.map((c) => [c.classNumber, c]));

describe('MBMGESHP.MSG parses as the original reads it', () => {
  it('finds the expected class slots', () => {
    expect(canon.map((c) => c.classNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 41,
    ]);
  });

  it.each(canon.map((c) => c.classNumber))(
    'class %s presents its options in GEMAIN.C read order',
    (n) => {
      const c = canon.find((x) => x.classNumber === n)!;
      expect(c.order).toEqual(FIELDS.map((f) => f[0]));
    },
  );

  it('treats slots 10-20 and 26-30 as unused <NONE>', () => {
    expect(inactive.map((c) => c.classNumber)).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 26, 27, 28, 29, 30,
    ]);
  });

  it('does not mistake the stale leftover names on unused slots 26-30 for real classes', () => {
    // 26-30 all read "Cybertron Battle Cruiser" but are <NONE>. Treating a name
    // as evidence of a class would invent five Cybertrons that never existed.
    for (const c of inactive.filter((x) => x.classNumber >= 26)) {
      expect(c.values.typeName).toBe('Cybertron Battle Cruiser');
      expect(c.values.category).toBe('<NONE>');
    }
  });
});

describe('seed roster matches canon exactly', () => {
  it('seeds every active class and nothing else', () => {
    expect(SHIP_CLASSES.map((c) => c.classNumber).sort((a, b) => a - b)).toEqual(
      active.map((c) => c.classNumber),
    );
  });

  it('seeds the Sysopian Death Star as class 41, not 34', () => {
    // The wiki table listed it tenth in a list of player ships, which is how it
    // acquired 34. Canon numbers it S41, and class NUMBER is not cosmetic: it
    // is the value compared in canPursue(lta, victimClass).
    expect(seedByNumber.has(41)).toBe(true);
    expect(seedByNumber.has(34)).toBe(false);
    expect(seedByNumber.get(41)!.typeName).toBe('Sysopian Death Star');
  });
});

describe.each(active.map((c) => [c.classNumber, c.values.typeName as string] as const))(
  'class %s %s matches canon field for field',
  (classNumber, _typeName) => {
    const c = active.find((x) => x.classNumber === classNumber)!;
    const seed = seedByNumber.get(classNumber);

    it('is present in the seed', () => {
      expect(seed).toBeDefined();
    });

    const compared = FIELDS.filter(
      ([, f]) => !['helpMessage', 'reserved2', 'reserved3'].includes(f),
    );

    it.each(compared.map(([, f]) => f))('%s', (field) => {
      const expected =
        field === 'category'
          ? CATEGORY[c.values.category as string]
          : c.values[field];
      const actual = seed![field as keyof typeof seed];
      // maxPrice is a bigint in the seed; canon is a plain number.
      expect(typeof actual === 'bigint' ? Number(actual) : actual).toBe(expected);
    });
  },
);

describe('canon values the port depends on elsewhere', () => {
  it('Interceptor scans 100_000, the radius projectRangeCell is written for', () => {
    // src/game/constants.ts projectRangeCell divides by 10_000 and documents
    // "Interceptor (scanRange=100000) covers a 10-sector radius". If this ever
    // disagrees again, the projection silently shrinks.
    expect(seedByNumber.get(1)!.scanRange).toBe(100_000);
    expect(seedByNumber.get(1)!.scanRange / 10_000).toBe(10);
  });

  it('class 23 Cybertron Base Star is immobile', () => {
    // accel 0 and warp 0 — a stationary fortress, not a pursuer.
    expect(seedByNumber.get(23)!.maxAcceleration).toBe(0);
    expect(seedByNumber.get(23)!.maxWarp).toBe(0);
  });

  it('class 22 is the Cyberquad by ship title', () => {
    // gebemean() special-cases Cyberquads as always mean; the title comes from
    // SNAME, not typeName, which reads "Cybertron Battle Cruiser".
    expect(seedByNumber.get(22)!.shipNameTemplate).toBe('Cyberquad ');
  });

  it('only classes 23 and 25 decline to hunt the smallest ships', () => {
    // canPursue(lta, victim) === (lta - 1 <= victim). The in-game help claims
    // twice that Cybertrons spare Interceptors and Freighters unprovoked, but
    // the shipped configuration does not implement that: LATK is 0 for 21, 22
    // and 24. Help text states intent; this table is what actually ran.
    const pursuesInterceptor = (n: number) =>
      seedByNumber.get(n)!.cybLowestClassAttacks - 1 <= 1;
    expect([21, 22, 24].every(pursuesInterceptor)).toBe(true);
    expect([23, 25].some(pursuesInterceptor)).toBe(false);
  });
});
