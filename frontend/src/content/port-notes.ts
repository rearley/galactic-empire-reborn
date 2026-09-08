/**
 * Landing-page copy.
 *
 * Written for a visitor deciding whether to play, not for someone auditing the
 * port. An earlier draft cited C filenames and message-file names: that was
 * evidence for the claim "this is faithful", not a reason to sign up, and it
 * read like a changelog. The evidence still exists — docs/DECISIONS.md,
 * docs/GAME_MECHANICS.md and the balance tests — it just does not belong on the
 * front door.
 *
 * Every claim below is still checked against that record. Say less, and mean
 * all of it: a page advertising fidelity is the worst place to overstate.
 */

/** @see reference/ge-upstream/mbmgemp/GE/DOCS/GEREADME.DOC */
export const PORT_RELEASE = '3.2e';
export const PORT_RELEASE_DATE = '1994-08-06';

/**
 * The hooks. Specific, concrete, and each one true — these are the details
 * people remember about this game twenty years later, and the reason a
 * stranger keeps reading.
 */
export const HOOKS: readonly string[] = Object.freeze([
  'The galaxy runs whether you are watching or not. Set a course, close the tab, come back to find yourself somewhere else entirely.',
  'You cannot rage quit. Drop the connection while someone has a lock on you and your ship dies with you in it.',
  'Cloaking drains energy the whole time it is up, so it is a decision, not a hiding place. Run dry at the wrong moment and you simply appear.',
  'Hyperspace drops your shields on the way in and scatters every torpedo you had locked. It is an escape and a gamble at once.',
  'Tax a colony too hard and the colonists revolt, take the planet, and keep your troops.',
  'Cybertrons get meaner the better you are. Pass thirty kills and they stop being polite.',
]);

export const FAITHFUL: readonly string[] = Object.freeze([
  'The same numbers. Damage, energy, prices, ranges, repair rates — all of them the values the original shipped, not a modern rebalance.',
  'The same ships. Every hull from the Interceptor you start in to the Dreadnought you save up for, with the stats they had in 1994.',
  'The same combat. Phasers weaken with range and shields swallow them whole; torpedoes bleed through anyway. That is the original math, not an approximation of it.',
  // Was an unqualified "the text on your screen is the text the game printed
  // thirty years ago". It is very nearly true and getting truer, but the port
  // does add lines where the original printed nothing (see CHANGED), and an
  // absolute claim that a player can falsify in one session costs more
  // credibility than the word "wherever" saves. @see docs/DECISIONS.md 2026-09-05
  'The same words. Wherever the original had a line for something, that is the line you get — typos and all.',
  'The same six-second heartbeat the whole galaxy has always moved to.',
]);

export const CHANGED: readonly string[] = Object.freeze([
  'The galaxy is smaller — 201 sectors square instead of 601 — so you will actually run into people.',
  'It lives in a browser and it never closes. No dialling in, no waiting for the line to be free.',
  'You sign in with an email address instead of a BBS account.',
  'Colonists eat. Feed a planet or watch it starve, which the original only ever asked of troops.',
  'Function keys are typed rather than pressed: set one with fset f1 pha 0 0, then just type f1.',
  'A few messages were added where the original said nothing and the silence read as a bug.',
]);
