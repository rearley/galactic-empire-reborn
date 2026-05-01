/**
 * Balance-regression constants for feature 002 — tick cadences and galaxy dimensions.
 * Any change to these values MUST break this file.
 * @see reference/ge-source/GEMAIN.H
 */
import { MAXX, MAXY, TICKTIME, TICKTIME2 } from '../../src/game/constants';

describe('GEMAIN.H tick + galaxy constants (regression)', () => {
  it('MAXX = 30', () => expect(MAXX).toBe(30));
  it('MAXY = 15', () => expect(MAXY).toBe(15));
  it('TICKTIME = 6 (physics tick seconds)', () => expect(TICKTIME).toBe(6));
  it('TICKTIME2 = 1 (ship update tick seconds)', () => expect(TICKTIME2).toBe(1));
  it('TICKTIME / TICKTIME2 ratio = 6 (10 physics per 60 ship updates)', () => {
    expect(TICKTIME / TICKTIME2).toBe(6);
  });
});
