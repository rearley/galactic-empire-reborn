/**
 * Landing-page copy about the port itself.
 *
 * Sourced from docs/DECISIONS.md (119 entries, curated to these) and
 * GE/DOCS/GEREADME.DOC. Kept in one module so the claims can be reviewed as a
 * set rather than hunted through JSX — every line here is a promise to a player.
 *
 * Every line below was re-checked against docs/DECISIONS.md,
 * docs/GAME_MECHANICS.md and reference/ge-upstream/mbmgemp/GE/DOCS/GEREADME.DOC
 * as part of task 12 (2026-09-07) rather than transcribed from memory. See the
 * task report for the claim-by-claim verification.
 */

/** @see reference/ge-upstream/mbmgemp/GE/DOCS/GEREADME.DOC */
export const PORT_RELEASE = '3.2e';
export const PORT_RELEASE_DATE = '1994-08-06';

export const FAITHFUL: readonly string[] = Object.freeze([
  'Every balance constant is read from the original C source and pinned by a test that re-reads it.',
  'The ship class table is generated from MBMGESHP.MSG, the same file the 1994 server loaded at boot.',
  'Combat math — phaser falloff, tonnage division, shield absorption, torpedo bleed-through — is ported line for line.',
  'The 6-second physics tick and the 1-second movement tick are the original timings, including the quirk that shields regenerate on the slow one.',
  'Cybertrons escalate with your kill count exactly as GECYBS.C does, and go mean at 30 kills.',
  'The text you read in play is the original message file, not a rewrite.',
]);

export const CHANGED: readonly string[] = Object.freeze([
  'The galaxy is 201 sectors square rather than 601 — a smaller world so players can find each other.',
  'Colonists eat as well as troops, so a planet has to be fed to grow.',
  'Function keys are typed commands (fset f1 pha 0 0, then f1) because a browser cannot claim F11 or F12.',
  'You log in with an email address; the original used a BBS account.',
  'There is a web terminal instead of a modem, and the game runs continuously rather than while the BBS is up.',
  'A handful of messages the original never printed have been added where silence read as a bug; each is listed in the project decision log.',
]);
