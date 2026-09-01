import { scanDistanceUnits } from '../../src/game/commands/handlers/helpers/scan-distance';

/**
 * `sca pl <n>` printed "Distance: 0.03" — sector units to two decimals, so
 * one printed digit covers a 100-unit band. Orbit is refused beyond 250 units
 * (GECMDS.C cmd_orbit), which means "0.03" could be inside the gate or a
 * third of the way outside it and the pilot cannot tell. Closing on a planet
 * became guesswork against a threshold the display could not resolve.
 *
 * C prints raw units: `ddistance = cdistance(...)*10000;
 * prfmsg(SCAN10, bearing, spr("%ld",(long)ddistance))` (GECMDS.C:2325). That
 * also matches `nav`, which already reports distance on the same scale.
 */
describe('scanDistanceUnits', () => {
  it('reports raw units, as C does', () => {
    expect(scanDistanceUnits(0.03)).toBe(300);
    expect(scanDistanceUnits(0.45)).toBe(4500);
    expect(scanDistanceUnits(1)).toBe(10000);
  });

  it('truncates rather than rounds, matching C\'s (long) cast', () => {
    expect(scanDistanceUnits(0.024999)).toBe(249);
    expect(scanDistanceUnits(0.02599)).toBe(259);
  });

  it('resolves the orbit threshold, which two decimals could not', () => {
    // 249 is inside the gate and 251 is outside; both printed as "0.02".
    expect(scanDistanceUnits(0.0249)).toBeLessThanOrEqual(250);
    expect(scanDistanceUnits(0.0251)).toBeGreaterThan(250);
  });

  it('is zero at zero', () => {
    expect(scanDistanceUnits(0)).toBe(0);
  });
});
