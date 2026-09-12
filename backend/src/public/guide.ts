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
    'absolute, so a smaller map means you find people rather than drift past them. ' +
    'The Cybertron population is scaled down to match: the original put 24 of them ' +
    'in its larger galaxy and we run 9, so you meet one about as often as a pilot ' +
    'did in 1992. Left at 24 they would have been nine times thicker on the ground, ' +
    'and since a Cybertron is where the gold is, the run to a Dreadnought would have ' +
    'been nine times shorter than the original ever intended.',
  planets:
    'Colonists eat here. The original fed only troops, which let a colony grow ' +
    'forever on nothing — feed a planet or watch it starve.',
  rep:
    '`rep sys` calls the phaser inoperable until the bank holds enough charge ' +
    'to actually fire. The original called it operative the moment the bank was ' +
    'above zero, and then refused the shot anyway. Here the line answers the ' +
    'question you are really asking before a fight.',
  set:
    'Function keys are typed rather than pressed — `fset f1 pha 0 0`, then `f1` — ' +
    'because a browser will not give up F11 or F12.',
  new:
    'The original sold you a hull and dropped you back at the main menu, where ' +
    'your fleet was listed and you picked the new ship straight away. This port ' +
    'keeps you in the cockpit of the ship you flew in on, so a hull you have just ' +
    'bought is docked at Zygor and invisible until you ask for it: type `x` to ' +
    'come off the bridge and choose her from your fleet.',
  sca:
    'A port addition: `sca lo full` gives the full long-range view directly, ' +
    'without setting an option first. `set scanfull on` still works, on range scans, ' +
    'exactly as the original does it. ' +
    'Scanning is also the only way to find another pilot, as it was originally. ' +
    'This port adds a `who` roster and a players panel the original had no ' +
    'equivalent of; both name everyone in the galaxy, but show a position only ' +
    'for pilots in your own sector — where a scan would have found them anyway. ' +
    'Everyone else is a name on a list.',
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
  cybertrons:
    'Two claims on this page are contradicted by the original\'s own ship table ' +
    '(MBMGESHP.MSG), and this port follows the table. ' +
    'FIRST, "the top speed of a Cybertron is warp 8.0 so they can be out run with ' +
    'a faster ship" is true of the Cybertron Scout alone. The shipped maximum warp ' +
    'is 8 for the Scout and the Sarten Attack Drone, 10 for the Cybertron Battle ' +
    'Cruiser — the same as an Interceptor, so it can match your best speed and you ' +
    'cannot simply outrun it — and 15 for the Sarten Obliterator. So the advice ' +
    'holds only once you have upgraded: the starter Interceptor is warp 10 and the ' +
    'Heavy Freighter 8, and neither can escape an Obliterator, while a Freight ' +
    'Barge merely ties it at 15. Every combat hull above the Interceptor does ' +
    'outrun the whole Cybertron fleet — the Stealth Fighter makes warp 20, the ' +
    'Destroyer and Star Cruiser 25, the Battle Cruiser and Frigate 30, the ' +
    'Dreadnought 50. The Cybertron Base Star is warp 0: it cannot ' +
    'move at all, and it also carries no torpedoes and will not engage a player ' +
    'hull, so despite its taunts it is a fixture rather than a threat. ' +
    'SECOND, "Cybertrons will not attack smaller ships unless first provoked" is ' +
    'not what the code does. A Cybertron decides to be hostile if ANY of three ' +
    'things hold (GECYBS.C gebemean): it is a "cyberquad", or you have passed 30 ' +
    'kills, or a 1-in-3 roll comes up — and that roll is made afresh on every ' +
    'pass. Cyberquad means a toughness factor of 1, which the table gives to the ' +
    'Battle Cruiser, the Base Star and the Obliterator, so those three never ' +
    'consult your kill count at all. The Scout\'s "lowest class it will attack" ' +
    'is 0, meaning every class. A brand-new pilot in a starter Interceptor can ' +
    'therefore be attacked unprovoked, and regularly is.',
  buy:
    'This page describes buying "from one of your own planets or another players ' +
    'planet" and never mentions that those are two different prices. They are. ' +
    'The original\'s price routine branches on who owns the world: the OWNER pays ' +
    '`baseprice[item]`, the fixed galactic price, and everybody else pays that ' +
    'planet\'s own `markup2a` (GECMDS.C price(), the `sameas(plptr->userid, ' +
    'warsptr->userid)` test). So the price you set on your colony is the price ' +
    'other captains pay, never the price you pay — set missiles to 10 and you ' +
    'will still be charged the base 20 when you buy one yourself. It also means ' +
    'you can price a good BELOW what it costs you, which the original allows: an ' +
    'earlier version added the markup to the base price and the author commented ' +
    'that line out in favour of the markup alone.',
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
