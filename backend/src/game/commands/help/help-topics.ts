/**
 * Help topic catalog for the `hel` / `?` command.
 *
 * @see GECMDS.C cmd_help
 */

export type HelpTopicId =
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
      '  (scan bearings are RELATIVE to your heading: rot <bearing> aims at it)',
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
      'Phasers need 60 charge to fire and gain 10 charge per 6-second tick, so',
      'a fired bank is cold for about 36 seconds.',
      'Firing DROPS YOUR OWN SHIELDS first - you are bare while you shoot.',
      'Shields deflect phaser fire completely: against a shielded target that',
      'out-tonnages you, you can burn a whole magazine and land no damage at',
      'all. Read the target first with "sca sh <letter>" - it reports shield',
      'state as well as hull damage - and do not start a fight you cannot',
      'finish.',
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
      '  dat <fragment>         — look up ship by name fragment',
    ],
  },
  ship: {
    title: 'Ship',
    body: [
      'Ship',
      '  rep <nav|sys|inv|cargo|wpns|acc>  — ship status report',
      '  clo on|off         — toggle cloak',
      '  mai [password]     — repair hull damage in orbit (see "hel maintenance")',
      '  set <auto-shield|auto-repair|scannames|scanhome> <on|off>',
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
      '  set auto-repair on — hire one automatically whenever you take damage',
      '  rep sys            — current hull damage and repair progress',
      '',
      'Hull damage never heals on its own. To clear it, orbit an inhabited',
      'planet (25,000 population or more) and type "mai". If the planet is not',
      'yours and its owner set a trade password, pass it: "mai <password>".',
      'Repairs cost 200 credits at an ordinary planet and 2,500 credits at',
      'Zygor in the neutral zone, which is the only repair depot there - the',
      'Enforcer planet has none.',
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
      '  dat <fragment>         — look up ship by name fragment',
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
});

export const HELP_TOPIC_IDS: ReadonlyArray<HelpTopicId> = Object.freeze(
  Object.keys(HELP_TOPICS) as HelpTopicId[],
);
