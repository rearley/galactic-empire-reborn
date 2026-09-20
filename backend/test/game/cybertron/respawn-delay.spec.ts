/**
 * PORT-ORIGINAL: a killed Cybertron's class stays empty for a while, and the
 * rarer canon makes the hull, the longer.
 *
 * Canon has no respawn delay of any kind. `autortia` examines one ship slot
 * every 30 seconds and refills whatever it finds free —
 * GEMAIN.C:2321 `if (ticktock2 >= 30 && ticktock1 < nships)` — so the
 * wait is an accident of where the walk pointer happens to be. Canon expresses
 * "this hull is special" ONLY as rarity — `tot_to_create` 2 for an Obliterator
 * against 10 for a Scout.
 *
 * That lever loses its force at our galaxy size. `scaleAiPopulation` rounds
 * canon's two Obliterators down to ONE at UNIVMAX 100, so killing it empties
 * the galaxy of the class — and the port refilled it within three minutes,
 * guaranteed. Reported from play: "killing one and then not too long after
 * have it flying back towards yeah can take the wind out."
 *
 * Chosen by the owner over two canon-grounded alternatives, both recorded as
 * rejected. @see docs/DECISIONS.md 2026-09-20
 */
import { CANON_TOT_TO_CREATE, CYB_RESPAWN_BASE_MS, respawnDelayMs } from '../../../src/game/cybertron/cyb-population';

describe('respawnDelayMs — rarity in canon becomes time here', () => {
  it('leaves the most common hull at the base delay', () => {
    // The Scout is canon's commonest Cybertron at 10, and it is the yardstick:
    // nothing respawns FASTER than the port already did, so this only ever
    // takes hulls away for longer.
    expect(respawnDelayMs(CANON_TOT_TO_CREATE[21])).toBe(CYB_RESPAWN_BASE_MS);
  });

  it('keeps an Obliterator dead five times as long as a Scout', () => {
    // tot_to_create 2 against the Scout's 10.
    expect(respawnDelayMs(CANON_TOT_TO_CREATE[25])).toBe(CYB_RESPAWN_BASE_MS * 5);
  });

  it('keeps the Base Star dead longest of all', () => {
    // Canon's single boss hull, tot_to_create 1.
    expect(respawnDelayMs(CANON_TOT_TO_CREATE[23])).toBe(CYB_RESPAWN_BASE_MS * 10);
  });

  it('orders every class by canon rarity, without naming any of them', () => {
    const byRarity = [21, 24, 22, 25, 23];
    const delays = byRarity.map((c) => respawnDelayMs(CANON_TOT_TO_CREATE[c]));
    // Checked pairwise rather than against a sorted copy: `toSorted` is not in
    // this project's TS lib, and `sort` on a spread trips the lint rule that
    // exists to catch sorting in place.
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
  });

  it('never returns a delay shorter than the base, whatever it is handed', () => {
    // A class configured with a nonsense count must not become a faster
    // respawn than the port had before this existed.
    expect(respawnDelayMs(0)).toBe(CYB_RESPAWN_BASE_MS);
    expect(respawnDelayMs(-5)).toBe(CYB_RESPAWN_BASE_MS);
    expect(respawnDelayMs(9999)).toBe(CYB_RESPAWN_BASE_MS);
  });
});
