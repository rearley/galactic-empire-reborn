import { onboardingUserUpdate } from '../../src/game/onboarding/onboarding-cash';
import { START_CASH } from '../../src/game/constants/onboarding';

/**
 * Losing your last ship wiped your bank balance to the 5,000-credit starting
 * stipend. The finalize path did an unconditional `data: { cash: START_CASH }`,
 * and that same path serves BOTH a brand-new account and the empty-fleet
 * rebuild — the code above it says so: "a wiped player with topshipno=5 must
 * get shipno 6". So a captain who had banked 150,000 credits and then died was
 * handed 5,000, while a captain who died broke was topped up to 5,000. A
 * refund for the poor and a wipe for the rich.
 *
 * C never touches cash here. `if (noships == 0) { initshp(...); gepdb(GEADD,
 * ...); prfmsg(FIRSTIME); }` — GEFUNCS.C:106-113 builds the free replacement
 * hull and leaves `waruptr->cash` exactly as it was loaded from the user
 * record.
 *
 * Reported independently by two personas in the same playtest.
 */
describe('onboardingUserUpdate', () => {
  it('funds a genuinely new account', () => {
    // topshipno 0 — this captain has never owned a hull.
    expect(onboardingUserUpdate(0, 1)).toEqual({
      cash: START_CASH,
      noships: 1,
      topshipno: 1,
    });
  });

  it('leaves a returning captain\'s bank alone', () => {
    const update = onboardingUserUpdate(5, 6);
    expect(update).not.toHaveProperty('cash');
    expect(update).toEqual({ noships: 1, topshipno: 6 });
  });

  it('does not top up a captain who died broke', () => {
    // Same path, opposite direction: no free 5,000 for losing a fleet.
    expect(onboardingUserUpdate(2, 3)).not.toHaveProperty('cash');
  });

  it('always records the new hull', () => {
    for (const [top, next] of [[0, 1], [1, 2], [9, 10]]) {
      const u = onboardingUserUpdate(top, next);
      expect(u.noships).toBe(1);
      expect(u.topshipno).toBe(next);
    }
  });
});
