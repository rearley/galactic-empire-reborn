/**
 * Help topic catalog for the `hel` / `?` command.
 *
 * @see GECMDS.C cmd_help
 */

export type HelpTopicId = 'navigation' | 'combat' | 'trade' | 'planet' | 'ship' | 'comms';

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
      'Combat  (nothing may fire inside the neutral zone)',
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
      '  fre <A|B|C> <n|hail>   — tune a radio channel',
      '  sen <A|B|C> <message>  — transmit on a channel',
      '  att <amount> <troops|fighters> — attack the planet you orbit',
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
      '  maint <password>   — repair at the planet you orbit (costs credits)',
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
      '  mai                    — list your mail (reports, attack notices)',
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
