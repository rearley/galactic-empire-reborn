/**
 * The help must name the planet you actually orbit to buy a ship.
 *
 * `new ship` and `new phaser` are gated on canon's
 * `neutral(&warsptr->coord) && plnum == 1` (GECMDS.C:4557) — the neutral zone
 * AND planet ONE. Canon names that planet "Zygor":
 *
 *   S00P1NM {Zygor}              -- MBMGEMSG.MSG:559
 *   S00P2NM {Tahanian Station}   -- :611
 *   S00P3NM {Enforcer Planet}
 *
 * The help said "Buy at Zygor-3", which is wrong twice over: no planet is
 * called that, and the "-3" points at planet THREE — the Enforcer Planet, a
 * different world entirely, where `new ship` refuses. A player following the
 * help would type `orb 3` and be told no.
 *
 * Reported from play by a pilot who had bought a ship from `orb 1` and noticed
 * the help disagreed with what had actually worked.
 */

import { HELP_TOPICS } from '../../src/game/commands/help/help-topics';

const ALL_HELP = Object.values(HELP_TOPICS)
  .flatMap((t) => t.body)
  .join('\n');

describe('help names the neutral-zone planets as canon names them', () => {
  it('never calls the shipyard planet "Zygor-3"', () => {
    expect(ALL_HELP).not.toContain('Zygor-3');
  });

  it('names Zygor, and says which planet number to orbit', () => {
    // Canon gates on plnum 1, so the help has to say 1 — naming the planet
    // without its number is what made the original line guessable-but-wrong.
    expect(ALL_HELP).toContain('Zygor');
    expect(ALL_HELP).toMatch(/Zygor \(planet 1\)/);
  });
});
