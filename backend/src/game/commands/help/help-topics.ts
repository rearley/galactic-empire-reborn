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
      '  nav <x> <y>    — engage autopilot to sector',
      '  rot <deg>      — set rotation delta (-180 to 180)',
      '  imp <pct>      — set impulse percentage (0-99)',
      '  war <warp>     — set warp factor',
      '  sca            — scan current sector',
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
      'Trade',
      '  buy <item> <qty>       — purchase items',
      '  sell <item> <qty>      — sell items',
      '  transfer <item> <qty>  — transfer to planet',
      '  jett <item> <qty>      — jettison items',
      '  price                  — show item prices',
      '  pln                    — show planet inventory',
    ],
  },
  planet: {
    title: 'Planet',
    body: [
      'Planet',
      '  orb                — orbit planet',
      '  land <name>        — land and name planet',
      '  attack <planet>    — attack enemy planet',
      '  spy                — plant spy on planet',
      '  admin <n> <type>   — set admin level',
      '  withdraw <item> <qty> — withdraw from planet',
      '  dat                — planet data report',
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
      '  abandon            — abandon ship',
    ],
  },
});

export const HELP_TOPIC_IDS: ReadonlyArray<HelpTopicId> = Object.freeze(
  Object.keys(HELP_TOPICS) as HelpTopicId[],
);
