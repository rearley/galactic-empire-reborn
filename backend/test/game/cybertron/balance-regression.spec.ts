/**
 * T068 — Balance-regression: pin all Cybertron constants so drift fails CI.
 *
 * @see GEMAIN.H — CYB_* constants
 * @see specs/007-cybertron-ai/tasks.md T068
 */
import {
  CYBTICKTIME,
  CYBSLO,
  CYB_ALLOW,
  CYB_MAXCASH,
  CYB_BE_NICE,
  CYB_BE_EASY,
  CYB_BREAKOFF,
  CYB_MINDAM,
  CYBMAXPERTICK,
  CYB_TOUGH_0,
  CYB_TOUGH_1,
  CLASSTYPE_CYBORG,
} from '../../../src/game/constants';

describe('T068 — Cybertron balance-regression constants', () => {
  it('CYBTICKTIME is 6 (physics-tick period)', () => expect(CYBTICKTIME).toBe(6));
  it('CYBSLO is 3 (1-in-3 gebemean chance for ordinary Cybertron)', () => expect(CYBSLO).toBe(3));
  it('CYB_ALLOW is 35 (gold allowance per tick)', () => expect(CYB_ALLOW).toBe(35));
  it('CYB_MAXCASH is 2_000_000 (gold cap)', () => expect(CYB_MAXCASH).toBe(2_000_000));
  it('CYB_BE_NICE is 30 (kill threshold — Cybertrons get tougher)', () => expect(CYB_BE_NICE).toBe(30));
  it('CYB_BE_EASY is 60 (kill threshold — Cybertrons get really mean)', () => expect(CYB_BE_EASY).toBe(60));
  it('CYB_BREAKOFF is 500 (1-in-500 chance of non-quad breaking off)', () => expect(CYB_BREAKOFF).toBe(500));
  it('CYB_MINDAM is 75 (damage threshold for defensive behavior)', () => expect(CYB_MINDAM).toBe(75));
  it('CYBMAXPERTICK is 2 (max AI activations per physics tick)', () => expect(CYBMAXPERTICK).toBe(2));
  it('CYB_TOUGH_0 is 0 (ordinary Cybertron tough value)', () => expect(CYB_TOUGH_0).toBe(0));
  it('CYB_TOUGH_1 is 1 (Cyberquad tough value)', () => expect(CYB_TOUGH_1).toBe(1));
  it('CLASSTYPE_CYBORG is 2 (ship category code)', () => expect(CLASSTYPE_CYBORG).toBe(2));
});
