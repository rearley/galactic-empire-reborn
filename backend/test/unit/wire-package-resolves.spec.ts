import { WIRE_CONTRACT_VERSION } from '@ge/wire';

/**
 * The shared wire package must be importable from the CommonJS backend.
 *
 * The backend compiles to CommonJS and runs `dist/`, so the package has to
 * exist as real JavaScript at runtime — a source-only workspace package
 * type-checks and then fails to boot. The frontend is ESM. One declaration has
 * to serve both, which is why the package ships a dual build and why this
 * assertion exists on both sides rather than once.
 *
 * @see docs/superpowers/plans/2026-09-10-restructure-phase-1-wire-contract.md
 */
describe('@ge/wire from the backend', () => {
  it('resolves and exports the probe symbol', () => {
    expect(WIRE_CONTRACT_VERSION).toBe('1');
  });
});
