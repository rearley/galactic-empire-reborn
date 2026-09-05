/**
 * `hel ship` must not answer with the SHIELD page.
 *
 * Canon matches commands on three characters (GECMDS.C:249 gesearch), so the
 * canon lookup falls back to a 3-char prefix — which is right for `hel torpedo`
 * reaching HLPTOR. Applied too early it is wrong: "ship" truncates to "shi",
 * canon's SHIELD command, and shadowed our own `ship` topic entirely. A player
 * asking about their ship got a page about shields.
 *
 * Order that resolves it:
 *   1. canon page on an EXACT match      (hel mine -> HLPMIN)
 *   2. our topic ids and aliases          (hel ship -> the ship topic)
 *   3. canon page on a 3-char prefix      (hel torp -> HLPTOR)
 */
import { HelpHandlerService } from '../../src/game/commands/handlers/help.handler';
import { ShipState } from '../../src/game/ship/ship-state.types';

const svc = new HelpHandlerService();
const ask = (q: string): string => {
  const r = svc.command.handler({} as ShipState, [q], {} as never) as { lines: { text: string }[] };
  return r.lines.map((l) => l.text).join('\n');
};

describe('help topic precedence', () => {
  it('hel ship gives the SHIP topic, not canon\'s shield page', () => {
    const out = ask('ship');
    expect(out).not.toMatch(/Shield command/i);
    expect(out.toLowerCase()).toMatch(/report|rename|cargo|ship/);
  });

  it('hel shi still reaches canon\'s shield page', () => {
    expect(ask('shi').toLowerCase()).toContain('shield');
  });

  it('exact canon commands still win', () => {
    expect(ask('mine')).toContain('neutron mine');
    expect(ask('orbit').toLowerCase()).toContain('orbit');
  });

  it('the 3-char fallback still works for abbreviations', () => {
    expect(ask('torpedo')).toContain('lock on the ship');
    expect(ask('torp')).toContain('lock on the ship');
  });

  it('our own topics are reachable by name', () => {
    for (const t of ['combat', 'navigation', 'trade', 'planet']) {
      expect(ask(t).length).toBeGreaterThan(20);
    }
  });
});
