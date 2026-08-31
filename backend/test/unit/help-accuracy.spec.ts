import { HELP_TOPICS } from '../../src/game/commands/help/help-topics';

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
});
