import { cybWon, CYB_WON_SPEED } from '../../../src/game/cybertron/cyb-won';

/**
 * What a Cybertron does AFTER it kills you.
 *
 *   void FUNC cyb_won(ptr, usrn, wptr)
 *     ptr->cybmine   = (byte)255;   // release the claim
 *     ptr->speed2b   = 2000.0;      // settle to warp 2
 *     ptr->cybupdate = 0;           // force a DB update
 *   — GECYBS.C
 *
 * The port incremented the killer's kill count and nothing else. The claim
 * cleared eventually, but only incidentally: on the NEXT tick the
 * "target left the game" branch fires and sets a RANDOM speed. So canon's
 * Cybertron settles deliberately to warp 2 after a kill, while ours picked
 * anything up to its top speed.
 *
 * Invisible from the cockpit, which is why play never found it — you are dead
 * at the moment it happens.
 */
describe('cybWon', () => {
  const base = { cybmine: 7, speed2b: 9000, cybupdate: 42 };

  it('releases the claim on the pilot it just killed', () => {
    // Holding a claim on a dead player suppresses other Cybertrons from
    // taking it, because notclaimed() counts AI whose cybmine is that pilot.
    expect(cybWon(base).cybmine).toBe(255);
  });

  it('settles to warp 2 rather than a random speed', () => {
    expect(CYB_WON_SPEED).toBe(2000);
    expect(cybWon(base).speed2b).toBe(2000);
  });

  it('forces the next persistence pass', () => {
    // cybupdate = 0 makes the repository flush rather than wait its turn; a
    // kill is exactly the state you do not want to lose to a restart.
    expect(cybWon(base).cybupdate).toBe(0);
  });

  it('changes nothing else about the ship', () => {
    const result = cybWon({ ...base, damage: 12, kills: 3 } as never) as Record<string, unknown>;
    expect(result.damage).toBe(12);
    expect(result.kills).toBe(3);
  });
});
