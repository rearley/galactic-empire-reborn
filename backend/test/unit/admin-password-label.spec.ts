import { describeTradeAccess } from '../../src/game/commands/handlers/helpers/trade-access-label';

/**
 * The planet password gates TRADING, not landing. It is checked inside the buy
 * path and C's own message ids say so — BUYPAS3 (refused) and BUYPAS4
 * (welcomed), GECMDS.C:4232-4246. Buying requires orbit; `land` is the
 * separate command that claims and names an unowned world.
 *
 * Both the admin screen and the `adm` usage line called it "who may land",
 * which describes a restriction that does not exist: nothing stops another
 * captain orbiting your colony, and landing is not what the password controls.
 */
describe('describeTradeAccess', () => {
  it('says anyone when no password is set', () => {
    expect(describeTradeAccess('', 0n)).toMatch(/anyone/i);
    expect(describeTradeAccess('none', 0n)).toMatch(/anyone/i);
    expect(describeTradeAccess('NONE', 0n)).toMatch(/anyone/i);
  });

  it('says team members when the planet is team-locked', () => {
    expect(describeTradeAccess('team', 42n)).toMatch(/team/i);
  });

  it('quotes the password when one is set', () => {
    expect(describeTradeAccess('hunter2', 0n)).toContain('hunter2');
  });

  it('describes trading, never landing', () => {
    const cases: Array<[string, bigint]> = [['', 0n], ['team', 42n], ['hunter2', 0n]];
    for (const [pw, tc] of cases) {
      expect(describeTradeAccess(pw, tc).toLowerCase()).not.toContain('land');
    }
  });
});
