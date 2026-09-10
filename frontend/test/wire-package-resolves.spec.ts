import { describe, expect, it } from 'vitest';
import { WIRE_CONTRACT_VERSION } from '@ge/wire';

/**
 * The shared wire package must be importable from the ESM frontend.
 *
 * Counterpart to `backend/test/unit/wire-package-resolves.spec.ts`. Both exist
 * because the package serves a CommonJS consumer and an ESM one, and a dual
 * build that works for one and not the other is the failure this phase most
 * needs to catch early.
 */
describe('@ge/wire from the frontend', () => {
  it('resolves and exports the probe symbol', () => {
    expect(WIRE_CONTRACT_VERSION).toBe('1');
  });
});
