/**
 * Copy for /provenance — what this port took from the original and what it did
 * not.
 *
 * This page is the opposite of the landing page. Landing copy is written for a
 * stranger deciding whether to play, and a test keeps source filenames off it.
 * This page is written for someone asking where the game came from and who owns
 * it, so naming files is the point.
 *
 * Every claim here is checkable against the repository: the licence headers are
 * in `reference/ge-source/*.C`, the extraction is in `tools/`, and the
 * attribution is in NOTICE at the repository root. Do not add a claim here that
 * a reader cannot verify that way.
 *
 * @see NOTICE
 * @see docs/DECISIONS.md 2026-09-09 — licensing and provenance
 */

/** @see reference/ge-upstream/mbmgemp/GE/DOCS/GEREADME.DOC */
export const PORT_RELEASE = '3.2e';
export const PORT_RELEASE_DATE = '1994-08-06';

export const ORIGINAL_AUTHOR = 'Michael B. Murdock';
export const ORIGINAL_YEARS = '1988-1992';

/** Murdock's own note, verbatim from the header of every C file he released. */
export const AUTHORS_NOTE =
  'The source code to this program is being made available to the general public in the hopes that it will continue to live on and evolve.';

/**
 * Taken from the original, and where each thing lives. Written so a reader can
 * go and check.
 */
export const PORTED: readonly { what: string; detail: string }[] = Object.freeze([
  {
    what: 'The message text',
    detail:
      'All 1,070 player-facing strings are lifted verbatim out of the original message file, colour codes stripped and nothing reworded. When the game tells you the helm is damaged, those are its words from 1994.',
  },
  {
    what: 'The ship table',
    detail:
      'Thirty-four hulls, twenty-eight fields each, extracted field by field from the configuration file the original game itself read at boot. Shields, phasers, warp, tonnage, price, points, scan range and the pursuit fields the Cybertrons use.',
  },
  {
    what: 'The in-game help',
    detail:
      'Sixty-one help entries and the per-class specification pages, as the original wrote them. Where that help contradicts the original’s own code, we follow the code and say so on the page rather than editing what it said.',
  },
  {
    what: 'The balance constants',
    detail:
      'Energy costs, reload rates, tick periods, the Cybertron difficulty thresholds. Each one cites the C file and line it came from, and a test fails if a value drifts away from the original.',
  },
  {
    what: 'The combat and economy maths',
    detail:
      'Reimplemented from the C source function by function, not approximated. Phaser falloff by tonnage, shield absorption, planet production and revolt, the midnight scoring pass.',
  },
]);

/**
 * NOT taken. The Elwynor entry is first because it is the one people actually
 * ask about, and getting it wrong would credit the wrong project.
 */
export const NOT_PORTED: readonly { what: string; detail: string }[] = Object.freeze([
  {
    what: 'Elwynor Technologies’ 32-bit port',
    detail:
      'Elwynor maintain a separate port of Galactic Empire to 32-bit Worldgroup and The Major BBS V10, released publicly in 2021 and licensed under the AGPL. It is a different codebase from this one. No code, data or bug fix from it is used here. What this port reads is Murdock’s original DOS-era C source.',
  },
  {
    what: 'The BBS platform',
    detail:
      'The original ran as a module inside The Major BBS, and a good deal of its source is plumbing for that host: terminal escape codes, function-key handling, the lobby you entered the game from. None of that is here. Connecting to this server is entering the game.',
  },
  {
    what: 'The original save files',
    detail:
      'The galaxy is generated procedurally on first boot. No Btrieve data file from any historical board was converted, so no board’s ships, planets or scores carried over. Everyone started at zero.',
  },
  {
    what: 'The wiki’s numbers',
    detail:
      'A community wiki transcribes much of this game and is genuinely useful, but it has been caught disagreeing with the source. It is used for orientation and never cited against the code.',
  },
  {
    what: 'A modern rebalance',
    detail:
      'Where this port differs from the original it is written down, with the original’s value beside it, on the guide page where a player meets it. The galaxy size is the largest of those deliberate changes.',
  },
]);

export const LICENCE_NAME = 'GNU Affero General Public License, version 3 or later';

/**
 * The licence chain, as plain sentences. The chosen-because clause matters: the
 * AGPL is a stronger obligation than the inbound licence required, and saying
 * why avoids it reading as an accident.
 */
export const LICENCE_NOTES: readonly string[] = Object.freeze([
  `Murdock released the original source publicly under the GNU General Public License, version 2 or any later version, keeping his copyright (${ORIGINAL_YEARS}).`,
  'This port embeds his text and data and was written by reading his code, so it is offered under a compatible copyleft licence rather than a permissive one.',
  'The Affero variant was chosen over the plain GPL deliberately. The plain GPL asks nothing of someone who only runs a public service, and a public service is exactly what this is.',
  'That means anyone who plays here is entitled to the source of what they are playing.',
]);

export const NOT_AFFILIATED =
  'This project is not affiliated with, endorsed by, or supported by Michael B. Murdock, M.B. Murdock & Associates, Elwynor Technologies, or any board running either version. "Galactic Empire" is used here to identify the game this is a port of.';

/**
 * Where the source lives. AGPL section 13 makes this the load-bearing part of
 * the page: a player is entitled to the source of the service they are using,
 * and a notice without a working link is worse than no notice, because it
 * looks like compliance.
 *
 * KEEP THIS TRUE. If the repository is not reachable at this URL, this page
 * must not be deployed.
 */
export const SOURCE_URL = 'https://github.com/rearley/galactic-empire-reborn';

export const SOURCE_NOTE =
  'That includes the extraction tools, the database migrations and the container build, not just the parts you can see from the browser.';
