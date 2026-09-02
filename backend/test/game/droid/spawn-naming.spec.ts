/**
 * Automaton display names come from canon's SNAME column.
 *
 * Both AI spawners build a ship's visible name the way the original does:
 *
 *     sprintf(ptr->shipname, "%s%u", shipclass[class].shipname,
 *             usrn*usrn + gernd()%100);          GEDROIDS.C:129, GECYBS.C:155
 *
 * The prefix is SNAME (MBMGESHP.MSG SxxSNAME), which differs per class --
 * "Cybertron ", "Cyberquad ", "Cyber Base-", "SADx3", "SOBx9", "NCC Lx4",
 * "Trans-Gal #2", "Vakory SD-82". It is NOT the typeName, which GEDROIDS.C
 * uses only to dispatch behaviour.
 *
 * The port ignored SNAME entirely: every Cybertron was named "Cybrg-nnnn" from
 * a single literal, and droids leaked their internal type name. A new pilot
 * therefore could not tell a Scout from a Cyberquad from a Base Star, when in
 * canon the name is exactly what announces the threat class -- the mechanism
 * by which you learn what to run from. The seed already carried the right
 * strings, verbatim including significant trailing spaces; only the consumer
 * was missing.
 *
 * `Cybrg-` remains the USERID prefix used for repository lookups. This is the
 * separate, player-visible ship name.
 */

import { SHIP_CLASSES } from '../../../prisma/seed/ship-classes';

describe('canon SNAME prefixes are available to the spawners', () => {
  const bySclass = new Map(SHIP_CLASSES.map((c) => [c.classNumber, c]));

  it.each([
    [21, 'Cybertron '],
    [22, 'Cyberquad '],
    [23, 'Cyber Base-'],
    [24, 'SADx3'],
    [25, 'SOBx9'],
    [31, 'NCC Lx4'],
    [32, 'Trans-Gal #2'],
    [33, 'Vakory SD-82'],
  ])('class %s uses the prefix %p', (classNumber, prefix) => {
    expect(bySclass.get(classNumber)!.shipNameTemplate).toBe(prefix);
  });

  it('every combative and droid class has a prefix, and no player class does', () => {
    for (const c of SHIP_CLASSES) {
      if (c.category === 'PLAYER') {
        // Players name their own ship, so canon leaves SNAME empty.
        expect(c.shipNameTemplate).toBe('');
      } else {
        expect(c.shipNameTemplate.length).toBeGreaterThan(0);
      }
    }
  });

  it('distinguishes the five combative classes from one another', () => {
    // The property that actually matters to a player under fire: two different
    // hostiles must not read the same. A single shared literal fails this.
    const prefixes = [21, 22, 23, 24, 25].map((n) => bySclass.get(n)!.shipNameTemplate);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('keeps the trailing space where canon has one', () => {
    // "Cybertron " + 223 is "Cybertron 223"; trimming gives "Cybertron223".
    expect(bySclass.get(21)!.shipNameTemplate.endsWith(' ')).toBe(true);
    expect(bySclass.get(22)!.shipNameTemplate.endsWith(' ')).toBe(true);
    expect(bySclass.get(23)!.shipNameTemplate.endsWith(' ')).toBe(false);
  });
});
