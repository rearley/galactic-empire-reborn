/**
 * `cyb_annoy` band selection — release 3.2e per-class taunt families.
 *
 * Pre-3.2d the game had one flat CYBMSG1..19 set. 3.2e replaced it with
 * thirteen 16-message families, one per class slot 21..33, and split each
 * family into four bands of four that track what the Cybertron is doing:
 *
 *   cyb_annoy(ptr, low_ship, 60,  1,  4)   GECYBS.C:769   approaching
 *   cyb_annoy(ptr, low_ship, 30,  5,  8)   GECYBS.C:782   braking to engage
 *   cyb_annoy(ptr, low_ship, 30,  5,  8)   GECYBS.C:801   braking to engage
 *   cyb_annoy(ptr, zothusn,  20,  9, 12)   GECYBS.C:300   in range, no attack
 *   cyb_annoy(ptr, zothusn,  20, 13, 16)   GECYBS.C:295   attacking
 *
 * The port previously had a single hand-written pool of thirteen invented
 * lines, drawn at one fixed 1-in-20 rate regardless of what was happening.
 */

import {
  pickTaunt,
  bandName,
  CYB_ANNOY_BANDS,
} from '../../../src/game/cybertron/taunt-pool';
import { CYB_TAUNTS } from '../../../src/game/cybertron/cyb-taunt-catalog.generated';
import type { Random } from '../../../src/game/combat/random.port';

/** A Random whose next() returns a fixed value — picks a known bucket. */
const fixed = (v: number) => ({ next: () => v }) as Random;

const SCOUT = 21; // Cybertron Scout — CYB1M*
const CRUISER = 22; // Cybertron Battle Cruiser — CYB2M*

describe('CYB_ANNOY_BANDS mirrors the five call sites', () => {
  it('APPROACH is 1-in-60 over messages 1..4', () => {
    expect(CYB_ANNOY_BANDS.APPROACH).toEqual({ odds: 60, first: 1, last: 4 });
  });
  it('BRAKE is 1-in-30 over messages 5..8', () => {
    expect(CYB_ANNOY_BANDS.BRAKE).toEqual({ odds: 30, first: 5, last: 8 });
  });
  it('DECLINE is 1-in-20 over messages 9..12', () => {
    expect(CYB_ANNOY_BANDS.DECLINE).toEqual({ odds: 20, first: 9, last: 12 });
  });
  it('ATTACK is 1-in-20 over messages 13..16', () => {
    expect(CYB_ANNOY_BANDS.ATTACK).toEqual({ odds: 20, first: 13, last: 16 });
  });
});

describe('pickTaunt selects within the band', () => {
  it('draws the first message of the band on bucket 0', () => {
    // sel = first + gernd()%(last-first+1)  @see GECYBS.C:396
    expect(pickTaunt(fixed(0), SCOUT, CYB_ANNOY_BANDS.ATTACK, 'X'))
      .toBe(CYB_TAUNTS[SCOUT]![12]!.replace('%s', 'X')); // M13
  });

  it('draws the last message of the band on bucket 3', () => {
    expect(pickTaunt(fixed(3.5 / 4), SCOUT, CYB_ANNOY_BANDS.ATTACK, 'X'))
      .toBe(CYB_TAUNTS[SCOUT]![15]!.replace('%s', 'X')); // M16
  });

  it('never leaves its band, over the whole roll space', () => {
    const inBand = CYB_TAUNTS[SCOUT]!.slice(8, 12).map((m) => m.replace('%s', 'X'));
    for (let i = 0; i < 400; i += 1) {
      const msg = pickTaunt(fixed(i / 400), SCOUT, CYB_ANNOY_BANDS.DECLINE, 'X');
      expect(inBand).toContain(msg);
    }
  });

  it('is band-specific — the attack lines are not the approach lines', () => {
    const approach = pickTaunt(fixed(0), SCOUT, CYB_ANNOY_BANDS.APPROACH, 'X');
    const attack = pickTaunt(fixed(0), SCOUT, CYB_ANNOY_BANDS.ATTACK, 'X');
    expect(approach).not.toBe(attack);
  });
});

describe('pickTaunt selects the class own family', () => {
  it('gives a Scout a CYB1M line and a Battle Cruiser a CYB2M line', () => {
    const scout = pickTaunt(fixed(0), SCOUT, CYB_ANNOY_BANDS.ATTACK, 'X');
    const cruiser = pickTaunt(fixed(0), CRUISER, CYB_ANNOY_BANDS.ATTACK, 'X');
    expect(scout).toBe(CYB_TAUNTS[SCOUT]![12]!.replace('%s', 'X'));
    expect(cruiser).toBe(CYB_TAUNTS[CRUISER]![12]!.replace('%s', 'X'));
    expect(scout).not.toBe(cruiser);
  });

  it('covers every class slot 21..33 the stride-of-16 block provides', () => {
    for (let cls = 21; cls <= 33; cls += 1) {
      expect(pickTaunt(fixed(0), cls, CYB_ANNOY_BANDS.APPROACH, 'X')).not.toBeNull();
    }
  });

  it('returns null for a class with no family — C\'s sel < CYBLASTM guard', () => {
    expect(pickTaunt(fixed(0), 1, CYB_ANNOY_BANDS.ATTACK, 'X')).toBeNull();
    expect(pickTaunt(fixed(0), 99, CYB_ANNOY_BANDS.ATTACK, 'X')).toBeNull();
  });
});

describe('pickTaunt fills the shipname slot', () => {
  it('substitutes %s with the taunting ship name', () => {
    const msg = pickTaunt(fixed(0), SCOUT, CYB_ANNOY_BANDS.ATTACK, 'Cybertron-3')!;
    expect(msg).toContain('Cybertron-3');
    expect(msg).not.toContain('%s');
  });
});

describe('bandName labels the payload', () => {
  it('round-trips every band', () => {
    for (const [name, band] of Object.entries(CYB_ANNOY_BANDS)) {
      expect(bandName(band)).toBe(name);
    }
  });
});
