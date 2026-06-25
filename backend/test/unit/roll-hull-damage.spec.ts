/**
 * T011 — rollHullDamage golden-vector regression.
 *
 * Loads the checked-in fixture and asserts every row against the
 * deterministic Mulberry32 PRNG.  If the formula or the PRNG ever drift,
 * this test fails loudly.
 *
 * @see GEFUNCS.C:randamage — C source uses a separate subsystem-damage
 *   routine; the hull-damage roll (floor(rand * dmgMax * damageScale(damageFactor)))
 *   is the TS-side projectile-hit formula now named rollHullDamage.
 */

import * as path from 'path';
import * as fs from 'fs';
import { rollHullDamage } from '../../src/game/combat/combat-math';
import { Mulberry32Adapter } from '../../src/game/combat/random.port';

interface GoldenRow {
  rngSeed: number;
  dmgMax: number;
  damageFactor: number;
  expected: number;
}

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/randamage.golden.json');

describe('T011 — rollHullDamage golden vectors', () => {
  let rows: GoldenRow[];

  beforeAll(() => {
    rows = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8')) as GoldenRow[];
    expect(rows.length).toBeGreaterThan(0);
  });

  it('matches every golden row', () => {
    for (const { rngSeed, dmgMax, damageFactor, expected } of rows) {
      const rand = new Mulberry32Adapter(rngSeed);
      const actual = rollHullDamage(rand, dmgMax, damageFactor);
      expect(actual).toBe(expected);
    }
  });
});
