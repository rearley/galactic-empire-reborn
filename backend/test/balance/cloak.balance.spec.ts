/**
 * Balance regression: CLOAK_ENERGY_USE default and ramp constants.
 * Fail this test to detect any change to canonical cloak tuning.
 * @see GEGLOBAL.H:150 CLENGUSE — default 50
 * @see GEFUNCS.C:1717-1722 cloak ramp values
 */
import {
  CLOAK_ENERGY_USE_DEFAULT,
  CLOAK_ENERGY_USE_MIN,
  CLOAK_ENERGY_USE_MAX,
  loadCloakEnergyUse,
} from '../../src/game/commands/cloak.config';
import {
  CLOAK_RAMP_INIT,
  CLOAK_RAMP_MID,
  CLOAK_RAMP_FULL,
} from '../../src/game/commands/_ship-management-constants';

describe('cloak balance constants', () => {
  it('CLOAK_ENERGY_USE default is canon CLENGUSE 7500, not the port\'s 50', () => {
    // The old title called 50 "the canonical CLENGUSE numopt default". It was
    // neither canonical nor a numopt default -- MBMGEMSG.MSG ships 7500, and
    // the numopt bounds are 1..32000. At 50 against a ship's ~50 000 energy a
    // cloak could be held indefinitely, and since cloaked ships cannot be
    // locked by torpedoes or missiles, cloak-capable classes were effectively
    // projectile-proof. @see test/balance/sysop-options-canon.balance.spec.ts
    expect(CLOAK_ENERGY_USE_DEFAULT).toBe(7500);
  });

  it('CLOAK_ENERGY_USE_MIN is 1 (canonical lower clamp)', () => {
    expect(CLOAK_ENERGY_USE_MIN).toBe(1);
  });

  it('CLOAK_ENERGY_USE_MAX is 32000 (canonical upper clamp — numopt range)', () => {
    expect(CLOAK_ENERGY_USE_MAX).toBe(32000);
  });

  it('CLOAK_RAMP_INIT is 1 (cmd_cloak sets cloak=1)', () => {
    expect(CLOAK_RAMP_INIT).toBe(1);
  });

  it('CLOAK_RAMP_MID is 2 (one tick after engagement)', () => {
    expect(CLOAK_RAMP_MID).toBe(2);
  });

  it('CLOAK_RAMP_FULL is 10 (fully cloaked sentinel, used by four call sites)', () => {
    expect(CLOAK_RAMP_FULL).toBe(10);
  });

  it('loadCloakEnergyUse() returns canon 7500 when env is empty', () => {
    expect(loadCloakEnergyUse({})).toBe(7500);
  });

  it('loadCloakEnergyUse() clamps to min 1', () => {
    expect(loadCloakEnergyUse({ CLOAK_ENERGY_USE: '0' })).toBe(1);
  });

  it('loadCloakEnergyUse() clamps to max 32000', () => {
    expect(loadCloakEnergyUse({ CLOAK_ENERGY_USE: '99999' })).toBe(32000);
  });

  it('loadCloakEnergyUse() parses valid env integer', () => {
    expect(loadCloakEnergyUse({ CLOAK_ENERGY_USE: '100' })).toBe(100);
  });
});
