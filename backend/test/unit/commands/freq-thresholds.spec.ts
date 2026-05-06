import { FREQ_HAIL, FREQ_SECTOR_MAX, FREQ_GALAXY_MIN } from '../../../src/game/commands/handlers/_freq-thresholds';

/**
 * Balance regression test — these values are constitutional.
 * Changing any of them MUST fail this test.
 * @see GECMDS.C:1834-1860 cmd_send frequency scope rules
 */
describe('freq-thresholds balance regression', () => {
  it('FREQ_HAIL is exactly 0', () => {
    expect(FREQ_HAIL).toBe(0);
  });

  it('FREQ_SECTOR_MAX is exactly 19999', () => {
    expect(FREQ_SECTOR_MAX).toBe(19999);
  });

  it('FREQ_GALAXY_MIN is exactly 20000', () => {
    expect(FREQ_GALAXY_MIN).toBe(20000);
  });

  it('sector range is contiguous with galaxy range (no gap)', () => {
    expect(FREQ_GALAXY_MIN).toBe(FREQ_SECTOR_MAX + 1);
  });
});
