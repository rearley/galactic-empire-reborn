import { CANON_HELP } from '../game/commands/help/canon-help.generated';

/**
 * The public player's guide, generated from the same canon help the game
 * serves to `hel`.
 *
 * Generated, never written. Two hand-maintained descriptions of one game is
 * how a wiki ends up contradicting the game it documents — and this port
 * deviates from canon in declared ways, so a guide transcribed from the
 * community wiki would be wrong about the galaxy's size on its first page.
 * Building it from CANON_HELP means it cannot drift: it IS what the game says.
 *
 * What canon cannot know is where THIS port differs, so those notes are added
 * here, on the page each one belongs to.
 */

export interface GuideEntry {
  /** URL segment, e.g. `pha` or `getting-started`. */
  slug: string;
  title: string;
  body: readonly string[];
  /** How this port differs from canon on this topic, if it does. */
  deviation?: string;
  /**
   * Where canon's own help contradicts canon's own CODE, and the code wins.
   * Distinct from `deviation`: we changed nothing, the original was wrong
   * about itself. Conflating the two would either accuse the original of a
   * change we made, or claim credit for behaviour that was always canon.
   */
  correction?: string;
}

export interface GuideSection {
  title: string;
  blurb: string;
  entries: GuideEntry[];
}

export interface Guide {
  sections: GuideSection[];
}

/**
 * Where this port knowingly differs from the original, keyed by the page a
 * reader would be on when it matters.
 *
 * Kept short on purpose. Every entry is a declared deviation with a
 * docs/DECISIONS.md entry behind it; anything not deliberate is a bug, not a
 * footnote.
 */
export const GUIDE_DEVIATIONS: Readonly<Record<string, string>> = Object.freeze({
  'the-galaxy':
    'This galaxy is 201 sectors square. The original shipped 601. Scan ranges are ' +
    'absolute, so a smaller map means you find people rather than drift past them.',
  planets:
    'Colonists eat here. The original fed only troops, which let a colony grow ' +
    'forever on nothing — feed a planet or watch it starve.',
  set:
    'Function keys are typed rather than pressed — `fset f1 pha 0 0`, then `f1` — ' +
    'because a browser will not give up F11 or F12.',
  sca:
    'A port addition: `sca lo full` gives the full long-range view directly, ' +
    'without setting an option first. `set scanfull on` still works, on range scans, ' +
    'exactly as the original does it.',
});

/**
 * Where the original's help is wrong about the original's own behaviour.
 *
 * The project rule is that in-game help states INTENT and the C source states
 * truth; help is never authoritative. These are the places a player would
 * otherwise be actively misled, so the page says what the code does and cites
 * where to check.
 */
export const GUIDE_CORRECTIONS: Readonly<Record<string, string>> = Object.freeze({
  wormholes:
    'This page calls wormholes "fairly rare" and never mentions that the neutral ' +
    'zone has three permanent ones — Kayriez, Lydorian and Tryklon Portals, placed ' +
    'by the original\'s own sector-zero table rather than generated. So the first ' +
    'thing a new pilot sees is three of the rare thing, sitting together. Out in ' +
    'the galaxy the description holds: roughly one body in six is a wormhole, ' +
    'which is exactly what WORMODDS 6 asks for.',
  planets:
    'This page says anything you transfer to a planet "belongs to them, you cannot ' +
    'transfer it back". That is not what the original actually does. Its own ' +
    'TRANSFER page documents `transfer up`, and the code implements it (GECMDS.C ' +
    'trans_up), gated on a comment that reads "you must own this planet or NOBODY ' +
    'must own it to xfer up". So you can always retrieve items from a planet you ' +
    'own, or from one nobody has claimed. Buying applies to someone ELSE\'s planet. ' +
    'This port follows the code, not the help.',
});

/** Canon's concept pages, in the order a new player should meet them. */
const CONCEPTS: ReadonlyArray<readonly [slug: string, title: string, id: string]> = [
  ['getting-started', 'Getting started', 'HLPSTART'],
  ['the-galaxy', 'The galaxy', 'HLPGALXY'],
  ['sectors', 'Sectors', 'HLPSECTR'],
  ['navigation', 'Navigation', 'HLPNAVIG'],
  ['planets', 'Planets', 'HLPPLANT'],
  ['planets-2', 'Planets, continued', 'HLPPLAN2'],
  ['planets-3', 'Planets, part three', 'HLPPLAN3'],
  ['battle', 'Battle', 'HLPBATTL'],
  ['battle-2', 'Battle, continued', 'HLPBATT2'],
  ['battle-3', 'Battle, part three', 'HLPBATT3'],
  ['cybertrons', 'Cybertrons', 'HLPCYBER'],
  ['strategy', 'Strategy', 'HLPSTRAT'],
  ['scoring', 'Scoring', 'HLPSCORE'],
  ['wormholes', 'Wormholes', 'HLPWORM'],
  ['communications', 'Communications', 'HLPCOMMU'],
];

/** Canon's per-command pages. The slug is the command you actually type. */
const COMMANDS: Readonly<Record<string, string>> = Object.freeze({
  abandon: 'HLPABA', abort: 'HLPABO', att: 'HLPATT', buy: 'HLPBUY',
  cloak: 'HLPCLO', dec: 'HLPDEC', destruct: 'HLPDES', flu: 'HLPFLU',
  fre: 'HLPFRE', hyp: 'HLPHYP', imp: 'HLPIMP', jam: 'HLPJAM',
  jettison: 'HLPJET', loc: 'HLPLOC', mai: 'HLPMAI', min: 'HLPMIN',
  mis: 'HLPMIS', nav: 'HLPNAV', new: 'HLPNEW', orb: 'HLPORB',
  pha: 'HLPPHA', pln: 'HLPPLA', pri: 'HLPPRI', ren: 'HLPREN',
  rep: 'HLPREP', ros: 'HLPROS', rot: 'HLPROT', sca: 'HLPSCA',
  sel: 'HLPSEL', sen: 'HLPSEN', set: 'HLPSET', shi: 'HLPSHI',
  spy: 'HLPSPY', tea: 'HLPTEA', tor: 'HLPTOR', tra: 'HLPTRA',
  war: 'HLPWAR', zip: 'HLPZIP',
});

/**
 * `***` is canon's separator for a terminal that scrolls. On a page with real
 * headings it is line noise, so it goes — and a test asserts it stays gone.
 */
function clean(body: readonly string[] | undefined): string[] {
  return (body ?? []).filter((line) => line.trim() !== '***');
}

function entry(slug: string, title: string, id: string): GuideEntry {
  const deviation = GUIDE_DEVIATIONS[slug];
  const correction = GUIDE_CORRECTIONS[slug];
  return {
    slug,
    title,
    body: clean(CANON_HELP[id]),
    ...(deviation ? { deviation } : {}),
    ...(correction ? { correction } : {}),
  };
}

export function buildGuide(): Guide {
  return {
    sections: [
      {
        title: 'Start here',
        blurb: 'What the game is and how to survive your first hour.',
        entries: CONCEPTS.slice(0, 4).map(([s, t, id]) => entry(s, t, id)),
      },
      {
        title: 'How it works',
        blurb: 'Planets, combat, the machines that hunt you, and how score is kept.',
        entries: CONCEPTS.slice(4).map(([s, t, id]) => entry(s, t, id)),
      },
      {
        title: 'Every command',
        blurb: 'The original\'s own help, for each command you can type.',
        entries: Object.entries(COMMANDS).map(([slug, id]) => entry(slug, slug, id)),
      },
    ],
  };
}
