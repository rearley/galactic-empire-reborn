/**
 * The `lastfiredBy` fallback must reproduce killem's own guards.
 *
 * `attackerNameFromLastFired` exists so a killer who logged off in the same
 * tick as the kill is still named in the ship-loss mail. But the live lookup it
 * falls back FROM (`findActiveAttackerByChannel`) refuses two cases on purpose,
 * and the fallback originally honoured neither:
 *
 *   • the victim's own channel — canon's `who != usrn` guard, whose comment is
 *     literally the 12/19/91 fix "to prevent a player from being awarded points
 *     for killing himself" (GEFUNCS.C:1103-1105);
 *   • a planet's ion cannons, which set `lastfired = -1` while the pilot who
 *     last shot you is still flying (GEFUNCS.C:1797).
 *
 * Both would put a name in the mail where canon names nobody — replacing "an
 * unknown assailant" with a specific, false accusation, which is worse.
 */
import { attackerNameFromLastFired } from '../../../src/game/combat/kill-resolution';

const NO_CHANNEL = -1;
const held = (live: number[]) => (c: number) => live.includes(c);

describe('attackerNameFromLastFired — killem\'s guards', () => {
  it('names a killer whose channel was scrubbed when they logged off', () => {
    // The case the whole mechanism exists for.
    expect(attackerNameFromLastFired(
      { lastfired: NO_CHANNEL, lastfiredBy: { channel: 7, name: 'Marauder' } },
      held([]),
    )).toBe('Marauder');
  });

  it('names nobody when the victim is their own last firer', () => {
    // Self-inflicted: a stray shot, a mine of your own. Canon credits no one.
    expect(attackerNameFromLastFired(
      { lastfired: 4, lastfiredBy: { channel: 4, name: 'Ouroboros' } },
      held([4]),
      4,
    )).toBeNull();
  });

  it('names nobody for a self-kill even after the channel is freed', () => {
    expect(attackerNameFromLastFired(
      { lastfired: NO_CHANNEL, lastfiredBy: { channel: 4, name: 'Ouroboros' } },
      held([]),
      4,
    )).toBeNull();
  });

  it('names nobody when a planet made the kill and the shooter is still flying', () => {
    // fireion sets lastfired = -1 with the shooter's channel still live.
    expect(attackerNameFromLastFired(
      { lastfired: NO_CHANNEL, lastfiredBy: { channel: 7, name: 'Marauder' } },
      held([7]),
    )).toBeNull();
  });

  it('names nobody when a planet made the kill after the shooter logged off', () => {
    // The residual the verifier found: shooter hits you, shooter logs off (so
    // their channel is free), THEN a colony's ion cannons finish you. The old
    // read-side guard could not tell this from the scrub case, so the mail
    // credited the pilot with a kill the planet made. The ion path now clears
    // the recorded name, which is the only place that knows.
    expect(attackerNameFromLastFired(
      { lastfired: NO_CHANNEL, lastfiredBy: undefined },
      held([]),
    )).toBeNull();
  });
});
