/**
 * Every gameplay command must answer `hel <verb>` with something.
 *
 * Canon's help is per-COMMAND: 45 of its 61 entries document exactly one
 * command (HLPTOR, HLPPHA, HLPMIN, HLPLOC, HLPROT, HLPSCA, HLPSHI, HLPWAR ...).
 * That is why MINFMT tells a player "Type HELP MINE for the correct usage" —
 * canon assumes `hel min` exists.
 *
 * Ours is thematic, which is a reasonable structure, but it left 39 of 47 verbs
 * with no entry at all: a pilot who followed the game's OWN instruction after a
 * malformed `min` got "Unknown help topic 'mine'". Observed in live play.
 *
 * Until the per-command topics are written, every gameplay verb at least routes
 * to the topic that documents it. This test is what stops a new command from
 * shipping undiscoverable again.
 *
 * The excluded few are not gameplay: `hel` itself, the screen/utility verbs,
 * and the sysop commands, which canon documents outside the player help.
 */
import { HELP_TOPICS, HELP_TOPIC_ALIASES, HelpTopicId } from '../../src/game/commands/help/help-topics';

/** Every verb the router answers to. @see command-router.service.ts */
const ALL_VERBS = [
  'abandon', 'abort', 'admin', 'att', 'buy', 'cloak', 'cls', 'dat', 'dec', 'del',
  'destruct', 'flux', 'fre', 'hel', 'impulse', 'jam', 'jettison', 'loc',
  'mai', 'maint', 'min', 'mis', 'nav', 'new', 'orbit', 'pha', 'pln', 'pri', 'rea',
  'rename', 'report', 'ros', 'rotate', 'scan', 'sell', 'sen', 'set', 'shi', 'spy',
  'sys', 'tea', 'tor', 'transfer', 'warp', 'who', 'withdraw', 'zip',
];

/** Not player gameplay: the help verb itself, screen utilities, sysop tools. */
const NOT_GAMEPLAY = new Set(['hel', 'cls', 'dat', 'sys', 'admin']);

const resolve = (verb: string): HelpTopicId | undefined => {
  const id = (HELP_TOPIC_ALIASES[verb] ?? verb) as HelpTopicId;
  return HELP_TOPICS[id] ? id : undefined;
};

describe('hel <command> answers for every gameplay verb', () => {
  it.each(ALL_VERBS.filter((v) => !NOT_GAMEPLAY.has(v)))('hel %s resolves', (verb) => {
    expect(resolve(verb)).toBeDefined();
  });

  it('answers the three a player actually tried in play', () => {
    // `hel mine` returned "Unknown help topic 'mine'" while the pilot was
    // being hunted; `tor` and `pha` were the other two.
    for (const q of ['mine', 'min', 'tor', 'torpedo', 'pha', 'phaser']) {
      expect(resolve(q)).toBe('combat');
    }
  });

  it('routes weapons to combat and helm verbs to navigation', () => {
    for (const q of ['loc', 'jam', 'dec', 'zip', 'shi', 'mis']) expect(resolve(q)).toBe('combat');
    for (const q of ['rot', 'imp', 'war', 'sca', 'orb']) expect(resolve(q)).toBe('navigation');
  });

  it('sends `new` to the price table it needs', () => {
    expect(resolve('new')).toBe('newprice');
    expect(resolve('cls')).toBe('class');
  });

  it('never routes a verb to a topic that does not exist', () => {
    for (const target of Object.values(HELP_TOPIC_ALIASES)) {
      expect(HELP_TOPICS[target]).toBeDefined();
    }
  });
});
