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
  scoring:
    'A kill transfers the whole of the loser\'s score. The original transferred 35 ' +
    'percent. Deliberate, and recorded in the project decision log.',
  set:
    'Function keys are typed rather than pressed — `fset f1 pha 0 0`, then `f1` — ' +
    'because a browser will not give up F11 or F12.',
  sca:
    'A port addition: `sca lo full` gives the full long-range view directly, ' +
    'without setting an option first. `set scanfull on` still works, on range scans, ' +
    'exactly as the original does it.',
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
  return { slug, title, body: clean(CANON_HELP[id]), ...(deviation ? { deviation } : {}) };
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
