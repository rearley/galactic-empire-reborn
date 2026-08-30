/**
 * T039 — Balance-regression: pin all Droid AI constants so any drift fails CI.
 *
 * Every constant this feature depends on is imported and asserted to its exact
 * canonical value from GEMAIN.H / GEDROIDS.C. If any value drifts, this file
 * breaks loudly before the rest of the test suite runs.
 *
 * @see GEMAIN.H — CLASSTYPE_DROID, DROID_* constants
 * @see GEDROIDS.C — droid_init, per-class defaults, global config
 * @see specs/008-droid-ai/tasks.md T039
 */
import {
  CLASSTYPE_DROID,
  DROID_MAX_PER_CLASS,
  DROID_SPAWN_TICK_CADENCE,
  DROID_ANNOY_DENOM,
  DROID_USERID_PREFIX,
  DROID_CLASS_SCOW,
  DROID_CLASS_TRANSPORT,
  DROID_CLASS_VAKORY,
} from '../../../src/game/constants';
import {
  DROID_GLOBAL_DEFAULTS,
  DROID_CLASS_DEFAULTS,
} from '../../../src/game/droid/droid.config';

describe('T039 — Droid AI balance-regression constants', () => {

  // ─── Core numeric identifiers ────────────────────────────────────────────────

  it('CLASSTYPE_DROID is 3 (category code for all Droid ships)', () => {
    expect(CLASSTYPE_DROID).toBe(3);
  });

  it('DROID_CLASS_SCOW is 31 (Lydorian Garbage Scow)', () => {
    expect(DROID_CLASS_SCOW).toBe(31);
  });

  it('DROID_CLASS_TRANSPORT is 32 (Murdonian Transport)', () => {
    expect(DROID_CLASS_TRANSPORT).toBe(32);
  });

  it('DROID_CLASS_VAKORY is 33 (Vakory Survey Drone)', () => {
    expect(DROID_CLASS_VAKORY).toBe(33);
  });

  // ─── Spawn + population constants ────────────────────────────────────────────

  it('DROID_MAX_PER_CLASS is 2 (max live Droids per class type)', () => {
    expect(DROID_MAX_PER_CLASS).toBe(2);
  });

  it('DROID_SPAWN_TICK_CADENCE is 30 (ticktock2 rollover for spawn evaluation)', () => {
    expect(DROID_SPAWN_TICK_CADENCE).toBe(30);
  });

  // ─── Annoy roll ───────────────────────────────────────────────────────────────

  it('DROID_ANNOY_DENOM is 4 (gernd()%4 == 1 ≈ 25% hit rate)', () => {
    expect(DROID_ANNOY_DENOM).toBe(4);
  });

  // ─── userid prefix ────────────────────────────────────────────────────────────

  it("DROID_USERID_PREFIX is '@Droid-'", () => {
    expect(DROID_USERID_PREFIX).toBe('@Droid-');
  });

  // ─── DROID_GLOBAL_DEFAULTS ────────────────────────────────────────────────────

  it('DROID_GLOBAL_DEFAULTS.fightbackHyperspaceMaxDist is 30000', () => {
    expect(DROID_GLOBAL_DEFAULTS.fightbackHyperspaceMaxDist).toBe(30000);
  });

  it('DROID_GLOBAL_DEFAULTS.confuseDenom_class11 is 10', () => {
    expect(DROID_GLOBAL_DEFAULTS.confuseDenom_class11).toBe(10);
  });

  it('DROID_GLOBAL_DEFAULTS.alterVectorDenom_class12 is 20', () => {
    expect(DROID_GLOBAL_DEFAULTS.alterVectorDenom_class12).toBe(20);
  });

  it('DROID_GLOBAL_DEFAULTS.vakoryDamageThreshold is 75', () => {
    expect(DROID_GLOBAL_DEFAULTS.vakoryDamageThreshold).toBe(75);
  });

  // ─── DROID_CLASS_DEFAULTS scan ranges ────────────────────────────────────────

  it('DROID_CLASS_DEFAULTS[31].scanRange is 3750 (Scow — canon 25 000 x 0.15)', () => {
    expect(DROID_CLASS_DEFAULTS[31]).toBeDefined();
    expect(DROID_CLASS_DEFAULTS[31]!.scanRange).toBe(3750);
  });

  it('DROID_CLASS_DEFAULTS[32].scanRange is 3750 (Murdonian Transport — canon 25 000 x 0.15)', () => {
    expect(DROID_CLASS_DEFAULTS[32]).toBeDefined();
    expect(DROID_CLASS_DEFAULTS[32]!.scanRange).toBe(3750);
  });

  it('DROID_CLASS_DEFAULTS[33].scanRange is 3750 (Vakory Survey Drone — canon 25 000 x 0.15)', () => {
    expect(DROID_CLASS_DEFAULTS[33]).toBeDefined();
    expect(DROID_CLASS_DEFAULTS[33]!.scanRange).toBe(3750);
  });

  // ─── DROID_CLASS_DEFAULTS: all three classes present ────────────────────────

  it('all three Droid classes are present in DROID_CLASS_DEFAULTS', () => {
    expect(Object.keys(DROID_CLASS_DEFAULTS)).toEqual(
      expect.arrayContaining(['31', '32', '33']),
    );
  });

  // ─── Cross-check: class number constants match defaults keys ─────────────────

  it('DROID_CLASS_SCOW key exists in DROID_CLASS_DEFAULTS', () => {
    expect(DROID_CLASS_DEFAULTS[DROID_CLASS_SCOW]).toBeDefined();
  });

  it('DROID_CLASS_TRANSPORT key exists in DROID_CLASS_DEFAULTS', () => {
    expect(DROID_CLASS_DEFAULTS[DROID_CLASS_TRANSPORT]).toBeDefined();
  });

  it('DROID_CLASS_VAKORY key exists in DROID_CLASS_DEFAULTS', () => {
    expect(DROID_CLASS_DEFAULTS[DROID_CLASS_VAKORY]).toBeDefined();
  });
});
