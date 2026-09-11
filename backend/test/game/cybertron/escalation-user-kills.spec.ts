/**
 * Cybertron escalation counts the CAPTAIN's kills, not the current hull's.
 *
 * Canon reads the user record on both escalation gates:
 *
 *     if (warusroff(usrn)->kills > CYB_BE_NICE) return(1);          GECYBS.C:441
 *     if (!isquad(ptr) && warusroff(zothusn)->kills < CYB_BE_EASY)  GECYBS.C:524
 *
 * `warusroff` is the WARUSR block (GEMAIN.H:288, kills at :298); `warshpoff`
 * is WARSHP (kills at :339). They are different counters, and the port passed
 * the SHIP's.
 *
 * `Ship.kills` starts at zero on every new hull. Dying is routine — round 4's
 * hunter lost three ships in seventy minutes — so a per-hull counter is reset
 * long before it approaches CYB_BE_NICE 30, let alone CYB_BE_EASY 60. The
 * escalation curve the whole Cybertron design rests on could therefore never
 * engage, which is the third layer of this subsystem found broken in two days:
 * they could not move, then could not acquire, and now would never get harder.
 *
 * `User.kills` is the cumulative counter and is already maintained
 * (player-score.repository.ts:78-82, citing GEFUNCS.C:1118 acctm). It is
 * denormalised onto ShipState at hydration exactly as `teamcode` is.
 */
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { escalationKills } from '../../../src/game/cybertron/cyb-decisions';

const ship = (over: Partial<ShipState>): ShipState => ({ kills: 0, ...over } as ShipState);

describe('which kill counter drives escalation', () => {
  it('uses the captain\'s cumulative kills', () => {
    expect(escalationKills(ship({ kills: 2, userKills: 47 }))).toBe(47);
  });

  it('does not fall back to the hull when the captain has none', () => {
    // A brand-new captain in a hull that somehow carries kills is still new.
    expect(escalationKills(ship({ kills: 9, userKills: 0 }))).toBe(0);
  });

  it('falls back to the hull only when the captain count is absent', () => {
    // AI ships have no User row; their Ship.kills is the only counter there is.
    expect(escalationKills(ship({ kills: 5 }))).toBe(5);
  });

  it('a captain past CYB_BE_NICE keeps that standing through a new hull', () => {
    // The bug in one line: fresh hull, veteran pilot.
    expect(escalationKills(ship({ kills: 0, userKills: 31 }))).toBe(31);
  });
});

/**
 * The counter has to REACH the tick service, not merely exist.
 *
 * A denormalised field is only as good as its hydration. `teamcode` — the
 * precedent this follows — is populated in two places, boot hydration and
 * boarding, and missing either would leave the field undefined for exactly the
 * captains it matters for.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('userKills is hydrated everywhere teamcode is', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf8');

  it.each([
    ['src/game/ship/ship-state.service.ts', 'boot hydration'],
    ['src/gateway/connection-lifecycle.service.ts', 'boarding a ship'],
  ])('%s populates it (%s)', (path) => {
    expect(src(path)).toMatch(/state\.userKills = /);
  });

  it('the boot-hydration include still carries kills', () => {
    // This half did NOT move. `ship-state.service.ts` joins the User row onto
    // every ship it loads at boot; trim `kills: true` out of that include and
    // every returning captain hydrates with userKills 0, so Cybertron
    // escalation resets for exactly the veterans it is meant to punish.
    expect(src('src/game/ship/ship-state.service.ts')).toMatch(/kills: true/);
  });

  it('the session-profile read carries kills alongside teamcode', () => {
    // The `select` itself moved behind `UserRepository` when the persistence
    // boundary went in; the invariant did not. Wherever the User row is read
    // for teamcode on boarding, kills must come with it.
    expect(src('src/game/player/user.repository.ts')).toMatch(
      /teamcode: true, options: true, kills: true/,
    );
  });

  it('the escalation gates read it rather than the hull count', () => {
    const text = src('src/game/cybertron/cybertron-tick.service.ts');
    expect(text).not.toMatch(/\btarget\.kills\b/);
    expect(text).toMatch(/escalationKills\(target\)/);
  });
});
