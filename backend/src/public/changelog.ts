/**
 * What changed, written for the people who play the game.
 *
 * A FILE, not a table: entries are written by whoever writes the code, in the
 * same commit, and reviewed with it. No admin surface and no migration —
 * moving a file to a table later is easier than the reverse.
 *
 * Keyed by `VERSION`, which the rule in the root CLAUDE.md already requires
 * every deployed change to bump, so one bump is one entry. A release with
 * nothing to tell a player goes in `SILENT_RELEASES` instead, because silence
 * by omission is indistinguishable from forgetting.
 *
 * @see docs/DECISIONS.md 2026-09-18 — the changelog
 * @see test/public/changelog.spec.ts
 */

/**
 * The four kinds of change, and keeping them apart is the point of the page.
 *
 * `backend/src/public/guide.ts` already splits `GUIDE_DEVIATIONS` from
 * `GUIDE_CORRECTIONS` for exactly this reason: collapsing them either accuses
 * the original of a change we made, or claims credit for behaviour that was
 * always canon. A three-bucket changelog would re-make that conflation on the
 * most public page this port has, and the landing page explicitly promises
 * honesty about where we differ.
 */
export const CHANGELOG_CATEGORIES = [
  /** We broke it, we fixed it. Nothing to do with the original. */
  'port-bug',
  /** We had drifted from the original and now match it again. */
  'corrected-to-canon',
  /** We knowingly differ, and the original's value is stated. */
  'deliberate-deviation',
  /** The original's help contradicts the original's shipped code; we follow the code. */
  'canon-was-wrong',
  /**
   * Something the original never had at all — the guide, the calculators, this
   * page, the f-key bindings.
   *
   * The fifth category, added when the changelog's own release could not be
   * filed under any of the first four: a new page is not a bug, not a drift
   * back to canon, not a knowing difference in how the GAME behaves, and not
   * canon contradicting itself. This is not a re-opening of the
   * deviation/correction split those four exist to protect — it is the class
   * this codebase already names `PORT-ORIGINAL` in fifteen places, finally
   * given somewhere to be said out loud.
   */
  'port-original',
] as const;

export type ChangelogCategory = (typeof CHANGELOG_CATEGORIES)[number];

/** How each category introduces itself to a reader who has never seen the list. */
export const CATEGORY_LABELS: Record<ChangelogCategory, { title: string; blurb: string }> = {
  'port-bug': {
    title: 'Fixed',
    blurb: 'Something this port broke, now working.',
  },
  'corrected-to-canon': {
    title: 'Corrected to the original',
    blurb: 'We had drifted from the 1988 game. This matches it again.',
  },
  'deliberate-deviation': {
    title: 'Deliberately different',
    blurb: 'We chose to differ from the original, and say what it did instead.',
  },
  'canon-was-wrong': {
    title: 'The original disagreed with itself',
    blurb: "Where the original's manual contradicts its own code, we follow the code.",
  },
  'port-original': {
    title: 'New here',
    blurb: 'Something the 1988 game never had. Ours, and our fault if it is wrong.',
  },
};

export interface ChangelogEntry {
  category: ChangelogCategory;
  text: string;
}

export interface ChangelogRelease {
  /** Bare version, matching the repo's VERSION file — e.g. `0.22.2`. */
  version: string;
  /** ISO date, the day it was deployed. */
  date: string;
  entries: ChangelogEntry[];
}

/**
 * Releases with nothing to tell a player, and why.
 *
 * A dependency upgrade genuinely has no player-facing news, and inventing some
 * would be worse than silence. What is not acceptable is a release nobody
 * accounted for, so the test treats a version that is in neither list as an
 * oversight and fails.
 */
export const SILENT_RELEASES: Record<string, string> = {
  '0.27.1':
    'A corrected code comment. The sysop Reports page was fixed the same day, but in the web server’s configuration rather than in this release, so there is nothing here a player could see.',
  '0.24.4':
    'Sysop-only: the kill log now records what the killer took and what a full hold dropped. Nothing about a kill changes for a player.',
  '0.24.2':
    'Sysop-only: the reports gate now reads the account name from the database rather than a 30-day-old token claim. No player can see any difference.',
  '0.21.0': 'Framework upgrade (NestJS 10 to 11). No change a player can see.',
  '0.22.0':
    'Shipped alongside 0.22.1 within the hour; both are described under 0.22.1 so the page does not split one change across two versions.',
};

/**
 * Newest first. The page starts at public launch on 2026-09-18 rather than
 * reconstructing two hundred commits of pre-launch history: player-facing notes
 * recovered from engineer-facing commit messages are a guess dressed as a
 * record, and nobody was playing yet to have noticed.
 */
export const CHANGELOG: ChangelogRelease[] = [
  {
    version: '0.27.4',
    date: '2026-09-20',
    entries: [
      {
        category: 'port-bug',
        text: 'Cybertrons could get stuck in the neutral zone at sector (0,0) and mill around it indefinitely, which looked a great deal like one camping the trading posts. A Cybertron in the zone had been made blind \u2014 it could not see a target anywhere in the galaxy \u2014 so it never had anywhere to go, and it re-rolled its heading every few seconds on top of that. It can see again now, so it picks somebody and leaves. It still cannot fire from inside the zone, which is how the original worked.',
      },
      {
        category: 'deliberate-deviation',
        text: 'Staying put: a ship sitting inside the neutral zone is still invisible to Cybertrons, so the trading posts remain a genuine refuge. The original was harsher \u2014 a Cybertron there would lock on to you, fly over and shadow you at matching speed until you left.',
      },
    ],
  },
  {
    version: '0.27.3',
    date: '2026-09-20',
    entries: [
      {
        category: 'port-original',
        text: 'The restart warning is now a banner across the top of the screen with a live countdown, instead of a line in the event log. The log scrolls, and the first time the warning went out one of the two players on at the time missed it completely. The banner cannot be scrolled past, and a glance at it tells you how long you have. You can dismiss it, and it clears itself once you are reconnected.',
      },
    ],
  },
  {
    version: '0.27.2',
    date: '2026-09-20',
    entries: [
      {
        category: 'port-bug',
        text: 'The event log could be left showing an older line than the newest one. It happened whenever something changed the log\u2019s height \u2014 most visibly the \u201Cdisconnected\u201D banner appearing, which pushed the last line you were sent just out of sight. The log now follows the newest line when it is resized, not only when a new line arrives.',
      },
    ],
  },
  {
    version: '0.27.0',
    date: '2026-09-20',
    entries: [
      {
        category: 'port-original',
        text: 'The game now warns you before it restarts for an update. You get a heads-up when a new build is on its way, and a 45-second countdown just before the server actually goes down. Your ship, your cargo and your position are saved either way — you will come back where you left off, so there is no need to dock or land first.',
      },
    ],
  },
  {
    version: '0.26.2',
    date: '2026-09-20',
    entries: [
      {
        category: 'port-bug',
        text: 'On a phone the site header ran the game’s name straight into the menu beside it, with no space between them. The menu now drops to its own line when there is not room for both.',
      },
    ],
  },
  {
    version: '0.26.1',
    date: '2026-09-20',
    entries: [
      {
        category: 'port-bug',
        text: 'The shortcut buttons on a phone only showed the first few — the rest ran off the side of the screen with nothing to say so. They now wrap onto as many rows as they need, with longer commands shortened to fit. The full command is still listed under Players & shortcuts.',
      },
    ],
  },
  {
    version: '0.26.0',
    date: '2026-09-20',
    entries: [
      {
        category: 'port-original',
        text: 'On a phone, every shortcut you have bound with fset now sits as a button under the command line — tap f1 instead of typing pha 0. Bind them at a desk, tap them on the move. The desktop terminal is unchanged; its f-key list is in the side panel as before.',
      },
    ],
  },
  {
    version: '0.25.1',
    date: '2026-09-20',
    entries: [
      {
        category: 'port-bug',
        text: 'On a phone the event log was squeezed off the side of the screen — you had to turn the handset sideways to read it. Narrow screens now get a single column: the command line on top where the keyboard cannot cover it, the log filling the rest, and the scan, player list and your f-key shortcuts folded away until you tap them.',
      },
    ],
  },
  {
    version: '0.25.0',
    date: '2026-09-19',
    entries: [
      {
        category: 'port-original',
        text: 'Signed in, the colony calculator now has a dropdown of your own planets, by name and sector. Pick one and its figures fill the form; change anything you like to plan, and Reset to planet puts them back. Nothing you do there changes the colony in the game.',
      },
    ],
  },
  {
    version: '0.24.3',
    date: '2026-09-19',
    entries: [
      {
        category: 'deliberate-deviation',
        text: 'A message sent with sen can now be up to 500 characters, up from 200. The original set no limit of its own beyond the length of a BBS input line.',
      },
    ],
  },
  {
    version: '0.24.1',
    date: '2026-09-18',
    entries: [
      {
        category: 'port-bug',
        text: 'The sysop can reach the reports from inside the game now, instead of having to edit the address bar. The link sits in the top bar, on the ship-select screen and in flight.',
      },
    ],
  },
  {
    version: '0.24.0',
    date: '2026-09-18',
    entries: [
      {
        category: 'port-original',
        text: 'Type bug followed by what went wrong, and it goes straight to the sysop without leaving the game. Your ship, sector, damage and the build you are on are attached automatically, so "it killed me" is enough to act on. Try hel bug.',
      },
    ],
  },
  {
    version: '0.23.1',
    date: '2026-09-18',
    entries: [
      {
        category: 'port-original',
        text: 'Found a bug, or something the original did differently? Every page now has a link to the issue tracker at the bottom. Reports from players are the fastest way this gets better.',
      },
      {
        category: 'port-bug',
        text: 'The menu no longer runs off the side of a phone screen. On a narrow display the last few links, including Log out, sat past the right edge where nothing could reach them.',
      },
    ],
  },
  {
    version: '0.23.0',
    date: '2026-09-18',
    entries: [
      {
        category: 'port-original',
        text: 'This page. The game is live and still being worked on, and every release from here says what changed and which of five kinds of change it was.',
      },
    ],
  },
  {
    version: '0.22.2',
    date: '2026-09-18',
    entries: [
      {
        category: 'port-bug',
        text: 'Ship losses now say what killed you. A ship lost to a planet\'s gravity, the galaxy\'s edge, a wormhole, an engine break or the neutral-zone backfire used to be recorded as an unknown cause.',
      },
    ],
  },
  {
    version: '0.22.1',
    date: '2026-09-18',
    entries: [
      {
        category: 'port-bug',
        text: 'Choosing a ship is now its own screen. The event log, scanner and roster used to stay on display behind the menu, still updating, for a captain who was no longer in the game.',
      },
      {
        category: 'port-bug',
        text: 'Boarding a ship starts a clean log, so leaving and re-entering no longer stacks three identical welcome messages. The original dropped you to a menu that cleared the screen; this is the same effect.',
      },
    ],
  },
  {
    version: '0.21.2',
    date: '2026-09-18',
    entries: [
      {
        category: 'port-bug',
        text: 'Leaving your ship with the x command now actually takes you out of the sector. You used to keep receiving the sector\'s combat traffic and radio while sitting at the ship-selection menu.',
      },
      {
        category: 'port-bug',
        text: 'The original never told a departing pilot that their own ship had vanished from the scanners. Now it does not either — that notice goes to the sector you left, not to you.',
      },
    ],
  },
  {
    version: '0.21.1',
    date: '2026-09-18',
    entries: [
      {
        category: 'port-bug',
        text: 'Switching ships no longer leaves a ghost of your old hull on everyone else\'s player list.',
      },
    ],
  },
];

export interface Changelog {
  releases: ChangelogRelease[];
  categories: typeof CATEGORY_LABELS;
}

export function buildChangelog(): Changelog {
  return { releases: CHANGELOG, categories: CATEGORY_LABELS };
}
