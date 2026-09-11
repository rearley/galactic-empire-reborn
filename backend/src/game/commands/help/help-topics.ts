/**
 * Help topic catalog for the `hel` / `?` command.
 *
 * @see GECMDS.C cmd_help
 */
import { PHASER_PRICE, SHIELD_PRICE, FIRST_CPU_CLASS } from '../handlers/new-ship.handler';
import { SHIP_CLASSES } from '../../../../prisma/seed/ship-classes';
import { CANON_HELP } from './canon-help.generated';

/**
 * Canon's per-command help pages, mapped to the verb a player types.
 *
 * 45 of canon's 61 entries document exactly one command, which is why MINFMT
 * says "Type HELP MINE for the correct usage". The text is GENERATED from
 * MBMGEHLP.MSG by tools/extract-help.mjs rather than paraphrased — canon's
 * pages carry detail no summary keeps, like WHY you would use a narrow phaser
 * spread or what happens to a lock as ship letters shuffle.
 *
 * Numbers in these pages are NOT authoritative: canon's help states design
 * intent and MBMGEMSG.MSG is the source of truth. HLPNEW2 gets the Mark-19
 * shield price wrong, which is why `newprice` is computed instead.
 *
 * Commands the port does not implement are simply absent from this map.
 */
const CANON_COMMAND_PAGES: Readonly<Record<string, string>> = Object.freeze({
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
 * Canon's concept pages — the topics HELP INDEX lists separately from commands.
 *
 * Each numbered section is its OWN topic, exactly as canon registers them:
 *
 *   {"planets", HLPPLANT}, {"planets2", HLPPLAN2}, {"planets3", HLPPLAN3},
 *   {"battle",  HLPBATTL}, {"battle2",  HLPBATT2}, {"battle3",  HLPBATT3},
 *   -- GECMDS.C:229-241
 *
 * `cmd_gehelp` prints exactly one message per lookup (GECMDS.C:461-470).
 *
 * CORRECTION 2026-09-07. This table used to map `planets` to all three ids at
 * once and register no numbered entries, so `hel planets` dumped ~60 lines and
 * `hel planets2` answered "Unknown help topic". The reasoning was that wiring
 * only the first page would hide the rest — right worry, wrong fix. Canon does
 * not hide the later sections, it PAGINATES them, and each page carries its own
 * navigation: HLPPLANT ends "Type HELP PLANETS2 for more information on
 * planets". Concatenating while leaving those topics unregistered made the
 * game print an instruction its own parser rejected. Reported from play.
 *
 * @see test/unit/help-paginates-multipage-topics.spec.ts — re-reads every
 *      "Type HELP <topic>" line in canon and fails on any that is unreachable.
 */
const CANON_CONCEPT_PAGES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  starting: ['HLPSTART'], galaxy: ['HLPGALXY'], sector: ['HLPSECTR'],
  communicate: ['HLPCOMMU'], moving: ['HLPNAVIG'],
  planets: ['HLPPLANT'], planets2: ['HLPPLAN2'], planets3: ['HLPPLAN3'],
  strategy: ['HLPSTRAT'],
  battle: ['HLPBATTL'], battle2: ['HLPBATT2'], battle3: ['HLPBATT3'],
  cybertron: ['HLPCYBER'], scoring: ['HLPSCORE'], wormholes: ['HLPWORM'],
});

export type HelpTopicId =
  | 'fkeys'
  | 'newprice'
  | 'class'
  | 'navigation'
  | 'combat'
  | 'trade'
  | 'planet'
  | 'ship'
  | 'maintenance'
  | 'mail'
  | 'comms';

/**
 * Words a pilot is likely to type that are not topic ids. `hel mai` answering
 * "Unknown help topic" is how the repair command stayed undiscoverable.
 */
export const HELP_TOPIC_ALIASES: Readonly<Record<string, HelpTopicId>> = Object.freeze({
  // Canon's HLPNEW signposts both of these by name: "For pricing on ships type
  // HELP CLASS, for phasers and shields type HELP NEWPRICE."
  // Canon's help is per-COMMAND (HLPTOR, HLPPHA, HLPMIN, HLPLOC, HLPROT ...):
  // 45 of its 61 entries are one command each, which is why MINFMT tells a
  // player "Type HELP MINE for the correct usage". Ours is thematic, so a
  // pilot following the game's own instruction hit "Unknown help topic".
  // Until the per-command topics are written, every gameplay verb at least
  // reaches the topic that documents it. @see MBMGEHLP.MSG
  att: 'combat',
  cloak: 'combat',
  dec: 'combat',
  decoy: 'combat',
  destruct: 'combat',
  abort: 'combat',
  jam: 'combat',
  loc: 'combat',
  lock: 'combat',
  min: 'combat',
  mine: 'combat',
  mines: 'combat',
  mis: 'combat',
  missile: 'combat',
  tor: 'combat',
  torp: 'combat',
  torpedo: 'combat',
  zip: 'combat',
  zipper: 'combat',
  spy: 'combat',
  shi: 'combat',
  flu: 'combat',
  flux: 'combat',
  imp: 'navigation',
  impulse: 'navigation',
  orb: 'navigation',
  orbit: 'navigation',
  rot: 'navigation',
  rotate: 'navigation',
  sca: 'navigation',
  scan: 'navigation',
  war: 'navigation',
  warp: 'navigation',
  buy: 'trade',
  sel: 'trade',
  sell: 'trade',
  pri: 'trade',
  jet: 'trade',
  jettison: 'trade',
  tra: 'trade',
  transfer: 'trade',
  wit: 'trade',
  withdraw: 'trade',
  pln: 'planet',
  pla: 'planet',
  rep: 'ship',
  report: 'ship',
  ren: 'ship',
  rename: 'ship',
  aba: 'ship',
  abandon: 'ship',
  set: 'ship',
  new: 'newprice',
  cls: 'class',
  sen: 'comms',
  send: 'comms',
  tea: 'comms',
  team: 'comms',
  ros: 'comms',
  roster: 'comms',
  who: 'comms',
  fre: 'comms',
  freq: 'comms',
  fset: 'fkeys',
  fkey: 'fkeys',
  functionkeys: 'fkeys',
  macro: 'fkeys',
  macros: 'fkeys',
  prices: 'newprice',
  price: 'newprice',
  newprices: 'newprice',
  phaserprice: 'newprice',
  shieldprice: 'newprice',
  classes: 'class',
  ships: 'class',
  shipclass: 'class',
  mai: 'maintenance',
  maint: 'maintenance',
  repair: 'maintenance',
  damage: 'maintenance',
  rea: 'mail',
  del: 'mail',
  nav: 'navigation',
  pha: 'combat',
  phaser: 'combat',
  phasers: 'combat',
  fight: 'combat',
  shield: 'combat',
  shields: 'combat',
});


/**
 * Canon ships two price tables a player can read in-game, and signposts them
 * from HELP NEW itself:
 *
 *   "For pricing on ships type HELP CLASS, for phasers and shields type
 *    HELP NEWPRICE."   -- MBMGEHLP.MSG:788
 *
 * HLPNEW2 is the phaser/shield table. It is TRANSCRIBED here from neither that
 * file nor from memory: it is GENERATED from PHASER_PRICE / SHIELD_PRICE, which
 * are the values the shipyard actually charges and are pinned field-by-field
 * against MBMGEMSG.MSG's PHSRPR01-19 / SHLDPR01-19.
 *
 * That distinction is not pedantry. `HLPNEW2` says a Mark-19 shield costs
 * 250.0m; `SHLDPR19` says 200000000. The help text and the shipped
 * configuration disagree, and per the project's precedence rules the option
 * file wins — in-game help states design intent and is never authoritative for
 * a number. Copying the table by hand would have imported a known-wrong price
 * into the one place a player goes to check.
 */
function money(v: bigint): string {
  const n = Number(v);
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(1) : m.toFixed(1)}m`;
  }
  return `${n / 1000}k`;
}

function priceTableBody(): string[] {
  const rows: string[] = [
    'Phaser and Shield Prices',
    '',
    '  Mark    Shields      Phasers',
    '  ----    -------      -------',
  ];
  for (let i = 0; i < SHIELD_PRICE.length; i++) {
    const mark = String(i + 1).padEnd(4);
    rows.push(`  ${mark}  ${money(SHIELD_PRICE[i]).padStart(8)}  ${money(PHASER_PRICE[i]).padStart(11)}`);
  }
  rows.push(
    '',
    '  Buy in orbit of Zygor (planet 1) in sector 0 0:  new phaser <mark>',
    '                                          new shield <mark>',
    '  Your old unit is traded in for two thirds of what it lists at,',
    '  So an upgrade costs far less than the sticker price.',
    '  Type `new phaser` or `new shield` with no mark to see YOUR net cost.',
  );
  return rows;
}

/**
 * The ship table canon's HELP CLASS shows, generated from the seed rather than
 * transcribed. `SHIP_CLASSES` is produced by tools/extract-ship-classes.mjs
 * from MBMGESHP.MSG and verified field-by-field by
 * test/balance/ship-class-canon.balance.spec.ts, so this cannot drift from the
 * hulls the shipyard actually sells.
 *
 * Only hulls `new ship` will actually SELL appear, using the same bound the
 * handler uses: `type < cyb_class && max_type == CLASSTYPE_USER`
 * (GECMDS.C:4564). Category alone is not enough — the Sysopian Death Star is
 * category PLAYER at class 41 and had already leaked into the purchase list
 * once before that bound was added.
 */
const CLASS_TABLE_BODY: string[] = (() => {
  /**
   * Canon's own width rules, from the sprintf block above the row
   * (GECMDS.C:381-409). Each is integer division, so 1_250_000 credits prints
   * as "1m" — canon's own lossiness, kept rather than "improved", because the
   * columns are fixed width and inventing a decimal here would be a silent
   * divergence in the one table a buyer reads before spending a million.
   */
  const wide = (v: number, w: number): string =>
    v > 999_999 ? `${Math.floor(v / 1_000_000)}m`.padStart(w)
    : v > 999   ? `${Math.floor(v / 1_000)}k`.padStart(w)
    :             `${v}`.padStart(w);
  const flag = (b: boolean): string => (b ? '1' : '0');

  const rows: string[] = [
    'Ship Classes',
    '',
    // HLPCLS1's stacked header, letter for letter.
    '                       S  P  T M D J Z M A C',
    '                       h  h  o i e a i i t l',
    '                       l  s  r s c m p n t o',
    '## --Class Name---     d--r--p-l-y-r-r-e-k-k-Acc-Warp-Tons----Price--Scan--Pts',
  ];
  for (const c of SHIP_CLASSES) {
    if (c.category !== 'PLAYER' || c.classNumber >= FIRST_CPU_CLASS) continue;
    rows.push(
      `${String(c.classNumber).padStart(2)} ${c.typeName.padEnd(20)}` +
      `${String(c.maxShields).padEnd(3)}${String(c.maxPhaser).padEnd(3)}` +
      `${flag(c.hasTorpedo)} ${flag(c.hasMissile)} ${flag(c.hasDecoy)} ` +
      `${flag(c.hasJammer)} ${flag(c.hasZipper)} ${flag(c.hasMine)} ` +
      `${flag(c.canAttackPlanet)} ${flag(c.hasCloak)} ` +
      `${wide(c.maxAcceleration, 4)} ${String(c.maxWarp).padStart(4)} ` +
      `${wide(c.maxTons, 6)} ${wide(Number(c.maxPrice), 7)} ` +
      `${wide(c.scanRange, 5)} ${String(c.points).padStart(5)}`,
    );
  }
  rows.push(
    '',
    '  Buy in orbit of Zygor (planet 1) in sector 0 0:  new ship <#>',
    '  Shld/Phsr are the highest marks that hull will mount — see HEL NEWPRICE.',
    '',
    // HLPCLS2 — canon prints the legend under the table, in its own words.
    'Shld - Maximum Shield type (0 = No shields available)',
    'Phsr - Maximum Phaser type',
    'Torp - 0 = Has no Torpedo System / 1 = Has Torpedo System',
    'Misl - 0 = Has no Missile System / 1 = Has Missile System',
    'Decy - 0 = Has no Decoy Launching system / 1 = Has Decoy Launcher',
    'Jamr - 0 = Has no Jammer Launching system / 1 = Has Jammer Launcher',
    'Zipr - 0 = Has no Zipper Launching system / 1 = Has Zipper Launcher',
    'Mine - 0 = Has no Mine Launching system / 1 = Has Mine Launcher',
    'Attk - Has Planetary Attack Capability',
    'Clok - 0 = Has no Cloaking System / 1 = Has Cloaking System',
    'Acc  - Maximum Acceleration rate',
    'Warp - 0 = Has no Warp Drive / >0 = Maximum Warp drive capable of',
    'Tons - Maximum Tonnage ship can transport',
    'Price- Price for a ship of this class',
    'Scan - Maximum Scanner Range',
    'Pts  - Points for killing a ship in this class',
    '',
    // HLPCLS2's closing note, now that the command it advertises exists.
    '*NOTE* For more details on a class of ship use the "HELP CLASS nn" command',
    'where nn is the class number from the table above.',
  );
  return rows;
})();

export interface HelpTopic {
  readonly title: string;
  readonly body: ReadonlyArray<string>;
}

export const HELP_TOPICS: Readonly<Record<HelpTopicId, HelpTopic>> = Object.freeze({
  navigation: {
    title: 'Navigation',
    body: [
      'Navigation',
      '  nav <x> <y>    — course + range to a sector (then set speed)',
      '  rot <deg>      — turn, relative to your heading (-180 to 180)',
      '  rot @<deg>     — turn to an absolute compass heading (0-359)',
      '  (scan and nav bearings are RELATIVE to your heading: rot <bearing>',
      '   aims at it, and the number shrinks to 0 as you come onto course)',
      '  imp <pct> [deg] — impulse 0-99, optional relative course',
      '  war <warp> [deg] — warp factor, optional relative course',
      '  sca pl [n]     — planets here, or detail on one',
      '  sca sh <name>  — detail on one ship',
      '  sca lo [full]  — local scan; se = sector, ra <1-9> = range',
      '  who            — who is in the galaxy',
      '  orb            — orbit nearest planet',
      '  (imp or war breaks orbit and puts you back in flight)',
    ],
  },
  combat: {
    title: 'Combat',
    body: [
      'Combat',
      '  pha <deg> [focus]      — fire phasers along a relative bearing',
      '  loc <target>           — lock on a ship by name',
      '  tor <target>           — fire a torpedo at a locked target',
      '  mis <target> <charge>  — fire a missile',
      '  min                    — lay a mine',
      '  dec                    — release a decoy',
      '  jam                    — jam nearby locks',
      '  zip                    — zipper',
      '  flu                    — burn a flux pod to refill energy',
      '  shi up|dn              — raise or lower shields',
      '  sca sh <letter>        — read a target: hull damage AND shield state',
      '                           (needs both ships out of warp)',
      '  fre <A|B|C> <n|hail>   — tune a radio channel',
      '  sen <A|B|C> <message>  — transmit on a channel',
      '  att <amount> <troops|fighters> — attack the planet you orbit',
      '',
      'PHASERS',
      'focus is 0-5; bare "pha <deg>" fires at focus 1. Focus widens the beam',
      'and thins it: the beam covers focus+2 degrees either side of your',
      'bearing, and each hit lands (1 - focus/11) squared of full damage.',
      'Focus 0 is the tight, hardest-hitting shot; focus 5 sprays 7 degrees',
      'for about a third of the damage.',
      'Phasers need 60 charge to fire and recharge by (phaser mark x 10) per',
      '6-second tick, so a Mark-1 bank is cold for about 36 seconds and a',
      'Mark-5 for about 12.',
      'Firing DROPS YOUR OWN SHIELDS first - you are bare while you shoot.',
      'Shields absorb phaser fire completely - while they hold. A hit on a',
      'raised shield takes nothing off the hull; it drains the shield, and only',
      'once that is beaten down does damage land. Shields also recharge between',
      'your shots, so against a target that out-tonnages you it is entirely',
      'possible to drain less per shot than it regenerates and never get',
      'through at all. Read the target first with "sca sh <letter>" - it reports',
      'shield state as well as hull damage, when neither of you is at warp -',
      'and do not start a fight you cannot finish.',
      '',
      'YOUR FIRST FIGHT',
      'Weight is armour. A heavy hull soaks up a beam before it reaches the',
      'plating, so the shot that guts a survey drone barely marks a freighter -',
      'and the freighter puts its shields back up between your shots.',
      'A stock Mark-1 phaser can crack the little Vakory survey drone. It will',
      'never get through a Lydorian garbage scow, however long you fire: you',
      'strip less off its shields each shot than it recharges before your bank',
      'is hot again. That is arithmetic, not luck, and patience will not fix',
      'it - you will simply run out of hull first.',
      'One phaser upgrade turns that fight around. "new phaser" at Zygor quotes',
      'the price, and the trade-in on your old bank makes it cheaper than the',
      'list price looks.',
      'Leave the Murdonian transports alone until you are properly armed. They',
      'are heavier again, and they shoot back harder than anything else you',
      'will meet this early.',
      '',
      'WHERE YOU MAY FIGHT',
      'Nothing may fire inside the neutral zone, which is sector 0,0 - and',
      'sector 0,0 is exactly where the Zygor shipyard and the trading posts',
      'sit. A shot fired there never reaches the target: the Enforcer zaps YOU',
      'for 10% damage, every time.',
      'Leave sector 0,0 before you pick a fight. Everywhere else is fair game.',
    ],
  },
  trade: {
    title: 'Trade',
    body: [
      'Trade  (quantity first, then the item — e.g. "buy 100 men")',
      '  buy <qty> <item>       — purchase items (from orbit)',
      '  sell <qty> <item>      — sell items',
      '  tra down <qty> <item>  — move cargo down to your planet',
      '  tra up <qty> <item>    — load cargo from your planet',
      '  tra <qty> <item> <ship> — hand cargo to another ship in your sector',
      '  jet <qty|ALL> <item>   — jettison items',
      '  pri                    — show item prices',
      '  pln                    — show planet inventory',
    ],
  },
  planet: {
    title: 'Planet',
    body: [
      'Planet',
      '  orb                    — orbit nearest planet',
      '  adm                    — claim an unclaimed world, or administer your own',
      '  adm rate <item> <n>    — set production rate (0-100)',
      '  adm sellflag <item> on|off — open/close item to buyers',
      '  adm markup <item> <n>  — set selling price',
      '  adm tax <n>            — set tax rate',
      '  tra down <qty> <item>  — transfer ship cargo to planet',
      '  tra up <qty> <item>    — transfer planet stock to ship',
      '  wit [qty]              — withdraw taxes to your account',
      '  aba                    — give up the planet you orbit (asks first)',
      '  att <amount> <troops|fighters> — attack the planet you orbit',
      '  spy                    — land a spy on the planet you orbit',
      '  dat                    — full data on your own ship',
      '',
      'WHAT TO LEAVE ON A COLONY',
      'A world is not held by claiming it. What you leave there decides whether',
      'it is still yours when you come back:',
      'FOOD - without it your men and troops are dead when you return. About',
      'one case per ten of them.',
      'TROOPS - mercenaries. They produce nothing, but they defend the planet',
      'from attack AND prevent domestic revolts.',
      'FIGHTERS - the primary defence against ground invasion and fighter',
      'attack. Your troops are not called on until the fighters are gone.',
      'ION CANNON - fires on any hostile ship in orbit, every few seconds, and',
      'can destroy one in a few blasts. Several may be stocked, but only one',
      'is active at a time.',
    ],
  },
  ship: {
    title: 'Ship',
    body: [
      'Ship',
      '  rep <nav|sys|inv|cargo|wpns|acc>  — ship status report',
      '  clo on|off         — toggle cloak',
      '  mai [password]     — repair hull damage in orbit (see "hel maintenance")',
      '  set <scannames|scanhome|scanfull|filter> <on|off>',
      '  new ship <class>   — buy a hull at Zygor (from orbit)',
      '  new phaser <type>  — upgrade phasers',
      '  new shield <type>  — upgrade shields',
      '  ren <name>         — rename ship',
      '  des                — initiate self-destruct',
      '  abo                — abort self-destruct',
      '  aba ship           — scuttle your hull, asks first (aba alone gives up a planet)',
      '  sys unjam          — clear a jammer stuck on your ship',
    ],
  },
  maintenance: {
    title: 'Maintenance & Repair',
    body: [
      'Maintenance & Repair',
      '  mai [password]     — hire a repair crew at the planet you are orbiting',
      '  rep sys            — current hull damage and repair progress',
      '',
      'A damaged hull mends very slowly on its own - 0.6 damage a minute, so a',
      'wreck at 100% takes the better part of three hours to fly clean. To do',
      'it properly, orbit an inhabited planet (25,000 population or more) and',
      'type "mai". If the planet is not yours and its owner set a trade',
      'password, pass it: "mai <password>".',
      'Repairs cost 200 credits at an ordinary planet and 2,500 credits in the',
      'neutral zone, where only Zygor and Tahanian Station will take the work -',
      'the Enforcer planet turns you away.',
      'One visit queues a repair of roughly a third of your damage, so heavy',
      'damage takes a few visits.',
      'No crew will board a ship still locked in combat - break off first.',
    ],
  },
  mail: {
    title: 'Mail',
    body: [
      'Mail',
      '  rea                — list your messages (reports, attack notices)',
      '  rea <n>            — read message n',
      '  del <n>            — delete message n',
      '',
      'Note that "mai" is NOT mail: it is the maintenance and repair command.',
    ],
  },
  comms: {
    title: 'Comms & Fleet',
    body: [
      'Comms & Fleet',
      '  hel [topic]            — this help; bare "hel" lists every topic',
      '  who                    — who is in the galaxy',
      '  dat                    — full data on your own ship',
      '  ros [all]              — score roster (only pilots who have scored)',
      '  fre <A|B|C> <n|hail>   — tune a radio channel',
      '  sen <A|B|C> <message>  — transmit on a channel',
      '  rea                    — list your mail (reports, attack notices)',
      '  rea <n>                — read message n',
      '  del <n>                — delete message n',
      '  tea                    — show the team you are on',
      '  tea list               — list all teams',
      '  tea create <name> <password> — found a team',
      '  tea <name> <password>  — join an existing team',
      '  tea leave              — leave your team',
      '  cls                    — clear the event log',
    ],
  },
  newprice: {
    title: 'Phaser and Shield Prices',
    body: priceTableBody(),
  },
  class: {
    title: 'Ship Classes',
    body: CLASS_TABLE_BODY,
  },
  fkeys: {
    title: 'Function Keys',
    body: [
      'Function Keys',
      '  fset f1 <command>  — bind f1 to a command',
      '  fset f1            — clear f1',
      '  fset               — list what is bound',
      '  f1 .. f12          — run the bound command',
      '',
      'Examples:',
      '  fset f1 pha 0 0        fire dead ahead, tightest focus',
      '  fset f2 tor @          torpedo the locked target',
      '  fset f3 sca lo full    scan with the contact table',
      '  fset f4 shi up',
      '',
      'Bindings belong to YOU, not the ship, so they follow you when you',
      'switch hulls with `x`. What you have bound is shown in the F Key Map',
      'panel.',
      '',
      'This is not part of the original game. On a BBS you bound function',
      'keys in your terminal program and it transmitted the text for you; a',
      'browser cannot reliably claim F1-F12, so here you type the name',
      'instead. A binding cannot point at another binding.',
    ],
  },
});

/**
 * Canon's page for a typed word, or null.
 *
 * Checked BEFORE the thematic topics, because canon's per-command page is the
 * better answer: a player who typed `hel mine` while being hunted got our
 * entire combat topic and had to find the one relevant line in it. Canon hands
 * them the mine page, fuse range included.
 *
 * Three-character prefixes, because that is how the router matches commands
 * (GECMDS.C:249 gesearch) — `hel torpedo`, `hel torp` and `hel tor` are the
 * same question.
 */
/**
 * Lines appended AFTER a canon help page, for commands this port extended.
 *
 * Canon's pages are not ours to edit — CLAUDE.md is explicit that the shipped
 * text is authoritative for the original game's design intent, and rewriting it
 * would erase the record of what the original actually said. But a page that is
 * silent about a leg the port ships leaves a player concluding the feature does
 * not exist.
 *
 * So: canon verbatim, then our addition, marked as ours.
 *
 * `transfer` is the only entry today. Canon's HLPTRA (MBMGEHLP.MSG:1095)
 * documents ship-to-planet and planet-to-ship because that is all
 * `cmd_transfer` had; ship-to-ship is this port's addition, recorded as
 * deviation D1 in docs/DECISIONS.md.
 */
const PORT_HELP_ADDENDA: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
  transfer: Object.freeze([
    '',
    'ADDED BY THIS PORT',
    '  tra <qty> <item> <ship>  — hand cargo to another ship in your sector.',
    '',
    '  The original game moved cargo only between a ship and the planet it',
    '  orbits; the line above is not part of it. Name the receiving ship, and',
    '  both ships must be in the same sector.',
  ]),
});

export function canonHelpPage(
  query: string,
  opts: { prefix?: boolean } = { prefix: true },
): ReadonlyArray<string> | null {
  const q = query.toLowerCase();

  // One page per lookup, as canon does — the page tells the player how to reach
  // the next one, and that instruction now resolves.
  const addendum = PORT_HELP_ADDENDA[q] ?? [];

  const concept = CANON_CONCEPT_PAGES[q] ?? CANON_CONCEPT_PAGES[`${q}s`];
  if (concept) {
    const pages = concept.flatMap((id) => CANON_HELP[id] ?? []);
    if (pages.length) return [...pages, ...addendum];
  }

  const id =
    CANON_COMMAND_PAGES[q] ??
    (opts.prefix === false ? undefined : CANON_COMMAND_PAGES[q.slice(0, 3)]);
  if (!id) return null;
  const page = CANON_HELP[id];
  if (!page) return null;
  return addendum.length ? [...page, ...addendum] : page;
}

export const HELP_TOPIC_IDS: ReadonlyArray<HelpTopicId> = Object.freeze(
  Object.keys(HELP_TOPICS) as HelpTopicId[],
);
