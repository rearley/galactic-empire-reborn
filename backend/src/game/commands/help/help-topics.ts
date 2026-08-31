/**
 * Help topic catalog for the `hel` / `?` command.
 *
 * @see GECMDS.C cmd_help
 */

export type HelpTopicId = 'navigation' | 'combat' | 'trade' | 'planet' | 'ship';

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
      '  rot <deg>      — set rotation delta (-180 to 180)',
      '  imp <pct>      — set impulse percentage (0-99)',
      '  war <warp>     — set warp factor',
      '  sca <mode>     — scan (sh=ships, pl=planets, ra=range, se=sector, lo=local)',
      '  lock <target>  — lock torpedoes/missiles on target',
      '  orb            — orbit nearest planet',
      '  land <name>    — land on planet',
    ],
  },
  combat: {
    title: 'Combat',
    body: [
      'Combat',
      '  pha <bearing> <pct> — fire phasers',
      '  tor <slot>         — fire torpedo',
      '  mis <slot>         — fire missile',
      '  mine               — drop mine',
      '  dec                — deploy decoy',
      '  jam                — toggle jammer',
      '  flux               — fire flux pod',
      '  shi <pct>          — set shield level',
      '  freq <n>           — set shield frequency',
      '  attack <planet>    — attack planet',
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
      '  land <name>            — land / claim / name planet',
      '  adm                    — planet inventory & admin',
      '  adm rate <item> <n>    — set production rate (0-100)',
      '  adm sellflag <item> on|off — open/close item to buyers',
      '  adm markup <item> <n>  — set selling price',
      '  adm tax <n>            — set tax rate',
      '  tra down <qty> <item>  — transfer ship cargo to planet',
      '  tra up <qty> <item>    — transfer planet stock to ship',
      '  wthdr <qty>            — withdraw taxes to your account',
      '  aba                    — give up the planet you are orbiting',
      '  attack <planet>        — attack enemy planet',
      '  dat <fragment>         — look up ship by name fragment',
    ],
  },
  ship: {
    title: 'Ship',
    body: [
      'Ship',
      '  rep                — ship status report',
      '  cloak on|off       — toggle cloak',
      '  maint              — toggle maintenance mode',
      '  set <option>       — toggle ship options',
      '  rename <name>      — rename ship',
      '  destruct           — initiate self-destruct',
      '  abort              — abort self-destruct',
      '  abandon ship       — abandon ship',
    ],
  },
});

export const HELP_TOPIC_IDS: ReadonlyArray<HelpTopicId> = Object.freeze(
  Object.keys(HELP_TOPICS) as HelpTopicId[],
);
