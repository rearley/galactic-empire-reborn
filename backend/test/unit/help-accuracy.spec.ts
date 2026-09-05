import { HELP_TOPICS, HELP_TOPIC_IDS } from '../../src/game/commands/help/help-topics';
import { formatMessage, MessageId } from '../../src/game/commands/messages';

/**
 * Help that documents the wrong argument order is worse than no help: a new
 * pilot types exactly what it says and the command refuses. `hel trade` listed
 * `buy <item> <qty>`, `sell <item> <qty>`, `transfer <item> <qty>` and
 * `jett <item> <qty>` — all four take the quantity FIRST.
 *
 * Found by following the help literally on a first run: `buy men 100` is
 * rejected, `buy 100 men` works.
 */
function body(topic: keyof typeof HELP_TOPICS): string {
  return HELP_TOPICS[topic].body.join('\n');
}

describe('help text matches the commands it documents', () => {
  it('trade verbs take the quantity before the item', () => {
    const trade = body('trade');
    expect(trade).toContain('buy <qty> <item>');
    expect(trade).toContain('sell <qty> <item>');
    expect(trade).not.toMatch(/buy <item>/);
    expect(trade).not.toMatch(/sell <item>/);
  });

  it('transfer documents its direction, which is not optional', () => {
    // The real form is `tra down <qty> <item>` / `tra up <qty> <item>`.
    const trade = body('trade');
    expect(trade).toMatch(/tra(nsfer)? (down|up)/);
    expect(trade).not.toMatch(/transfer <item> <qty>/);
  });

  it('jettison is documented under the name that actually works', () => {
    const trade = body('trade');
    expect(trade).not.toMatch(/jett <item> <qty>/);
    expect(trade).toMatch(/jet(tison)? <(qty|amt)/);
  });

  it('nav does not promise to fly the ship for you', () => {
    // C's cmd_navigate only reports bearing and distance (GECMDS.C); this port
    // additionally turns the ship, but nothing sets speed — calling it an
    // "autopilot" left new pilots sitting still waiting to arrive.
    const nav = body('navigation');
    expect(nav).not.toMatch(/autopilot/i);
  });

  /**
   * Every verb the help lists must be a verb the router answers to. Playing a
   * fresh pilot turned up `wthdr <qty>` — the documented way to collect your
   * planet's taxes — which is not a command at all ("Unknown command"); the
   * verb is `wit`. The router matches on the first three characters
   * (GECMDS.C:249 gesearch), so this compares prefixes.
   */
  it('every verb the help lists is one the router answers to', () => {
    const KNOWN_VERBS = new Set(
      [
        'abandon', 'abort', 'admin', 'att', 'buy', 'cloak', 'cls', 'dat', 'dec', 'del',
        'destruct', 'flux', 'fre', 'hel', 'impulse', 'jam', 'jettison', 'loc',
        'mai', 'maint', 'min', 'mis', 'nav', 'new', 'orbit', 'pha', 'pln', 'pri', 'rea',
        'rename', 'report', 'ros', 'rotate', 'scan', 'sell', 'sen', 'set', 'shi', 'spy',
        'sys', 'tea', 'tor', 'transfer', 'warp', 'who', 'withdraw', 'zip',
        // Port-original: canon kept function keys in the terminal. @see fkeys.ts
        'fset', 'x',
      ].map((v) => v.slice(0, 3)),
    );

    const unknown: string[] = [];
    for (const topic of Object.keys(HELP_TOPICS) as Array<keyof typeof HELP_TOPICS>) {
      for (const line of HELP_TOPICS[topic].body) {
        // Command lines are indented; the topic title is not.
        if (!line.startsWith('  ')) continue;
        // A command line names a VERB, and every verb in this game is
        // lowercase. Indented prose and the price tables added for
        // `hel newprice` / `hel class` start with a capital or a digit, so
        // this keeps the guard pointed at command definitions instead of
        // flagging "Your old unit is traded in..." as an unknown command.
        const first = line.trimStart()[0] ?? '';
        if (first < 'a' || first > 'z') continue;
        const verb = line.trim().split(/[\s<]/)[0].toLowerCase();
        if (!verb || !/^[a-z]+$/.test(verb)) continue;
        if (!KNOWN_VERBS.has(verb.slice(0, 3))) unknown.push(`${topic}: ${verb}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('combat help describes the arguments the commands actually take', () => {
    const combat = body('combat');
    // `shi` is up/down, not a percentage; `fre` needs a channel letter first;
    // `tor`/`mis` take a target name, not a slot number.
    expect(combat).not.toMatch(/shi <pct>/);
    expect(combat).not.toMatch(/freq <n>/);
    expect(combat).not.toMatch(/tor <slot>/);
    expect(combat).not.toMatch(/mis <slot>/);
    expect(combat).toMatch(/shi up\|dn/);
    expect(combat).toMatch(/fre <A\|B\|C>/);
  });

  it('planet help names the withdraw verb that exists', () => {
    const planet = body('planet');
    expect(planet).not.toMatch(/wthdr/);
    expect(planet).toMatch(/wit(hdraw)? /);
  });

  /**
   * `sca sh` reports on ONE ship and needs a target; `sca pl` lists and then
   * takes a number. Describing both as "ships/planets in sector" implied `sca sh`
   * would list them, and it answers with the scan help instead — which is what
   * happened mid-hunt during a playtest.
   */
  it('scan help distinguishes the modes that need a target', () => {
    const nav = body('navigation');
    expect(nav).toMatch(/sca sh <name>/);
    expect(nav).not.toMatch(/sh=ships/);
  });

  /**
   * The reverse of the check above: a command nobody documents is a command
   * nobody finds. Teams, the roster and the mail the midnight job sends you
   * were all reachable and all invisible — a pilot had no way to learn that
   * `tea create <name> <password>` existed, or that the production report for
   * their own colony was sitting in `mai`.
   */
  it('every command a pilot can type appears in some help topic', () => {
    const DOCUMENTED = new Set<string>();
    for (const topic of Object.keys(HELP_TOPICS) as Array<keyof typeof HELP_TOPICS>) {
      for (const line of HELP_TOPICS[topic].body) {
        if (!line.startsWith('  ')) continue;
        const verb = line.trim().split(/[\s<]/)[0].toLowerCase();
        if (/^[a-z]+$/.test(verb)) DOCUMENTED.add(verb.slice(0, 3));
      }
    }

    // Every keyword the command router registers. `adm` is the alias the help
    // uses for `admin`; prefixes make the two identical here.
    const REGISTERED = [
      'abandon', 'abort', 'admin', 'att', 'buy', 'cloak', 'cls', 'dat', 'dec', 'del',
      // `land` was removed — C has no such command; claiming lives in `adm`.
      'destruct', 'flux', 'fre', 'hel', 'impulse', 'jam', 'jettison', 'loc',
      'mai', 'maint', 'min', 'mis', 'nav', 'new', 'orbit', 'pha', 'pln', 'pri', 'rea',
      'rename', 'report', 'ros', 'rotate', 'scan', 'sell', 'sen', 'set', 'shi', 'spy',
      'sys', 'tea', 'tor', 'transfer', 'warp', 'who', 'withdraw', 'zip',
    ];

    const undocumented = REGISTERED.filter((v) => !DOCUMENTED.has(v.slice(0, 3)));
    expect(undocumented).toEqual([]);
  });

  /**
   * The topic index was a hardcoded sentence listing five topics. Adding a
   * sixth left `hel` advertising five and `hel <sixth>` working anyway —
   * discoverable only by guessing. Both strings now come from the catalog.
   */
  it('the topic index lists exactly the topics that exist', () => {
    const list = HELP_TOPIC_IDS.join(', ');
    expect(formatMessage(MessageId.HELFMT, list)).toContain(list);
    expect(formatMessage(MessageId.HEL_UNKNOWN, 'bogus', list)).toContain(list);
    for (const id of HELP_TOPIC_IDS) {
      expect(formatMessage(MessageId.HELFMT, list)).toContain(id);
    }
  });

  /**
   * `att troops` answers "Usage: att <amount> <troops|fighters>" — the count
   * comes first, exactly as it does for buy/sell/transfer. Combat help said
   * `att <troops|fighters>` and planet help invented `attack <planet>`, which
   * takes a planet name the command never reads.
   */
  it('attack documents the amount it requires, in both topics', () => {
    for (const topic of ['combat', 'planet'] as const) {
      expect(body(topic)).toContain('att <amount> <troops|fighters>');
      expect(body(topic)).not.toMatch(/att(ack)? <planet>/);
      expect(body(topic)).not.toMatch(/att <troops\|fighters>/);
    }
  });

  /**
   * C's `rot` takes both an absolute heading (`rot @<deg>`, GECMDS.C:653) and a
   * relative turn; only the relative one was documented or implemented.
   *
   * The help must also say which kind of number a scan gives you.
   * `cbearing(from, to, heading)` is always called with the observer's heading,
   * so every reported bearing is RELATIVE — a first draft of this help claimed
   * scans report compass headings, which sent a pilot who typed
   * `rot @<bearing>` off on their own former heading.
   */
  it('navigation documents both rotate forms and which one a bearing feeds', () => {
    const nav = body('navigation');
    expect(nav).toContain('rot @<deg>');
    expect(nav).toMatch(/rot <deg>/);
    expect(nav).toMatch(/RELATIVE/);
    // Must not claim a scan bearing is a compass heading.
    expect(nav).not.toMatch(/compass heading.*as scans report/);
  });
});
