/**
 * T046 — AdminHandlerService unit tests.
 */
import { AdminHandlerService } from '../../../src/game/commands/handlers/admin.handler';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'owner', shipno: 1, shipname: 'Ship1', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 3.5, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 15, // plnum = 5, xsect = 5, ysect = 3
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeService(
  planetState: { userid: string; items?: Array<{ qty: bigint; rate: number; sell: boolean }> } | null = { userid: 'owner' },
  adminChangeResult: { ok: boolean } = { ok: true },
) {
  // ADM_MENU iterates planet.items[] looking for non-zero rate/qty entries.
  // Provide a default empty items[] so the menu renders an empty list rather
  // than crashing on `state.items[i]`.
  const fullState = planetState ? {
    items: Array.from({ length: 14 }, () => ({ qty: 0n, rate: 0, sell: false })),
    ...planetState,
  } : null;
  const applyAdminChangeMock = jest.fn().mockResolvedValue(adminChangeResult);
  const getMock = jest.fn().mockReturnValue(fullState);
  const planetMock = {
    get: getMock,
    applyAdminChange: applyAdminChangeMock,
  };
  const svc = new AdminHandlerService(planetMock as unknown as PlanetStateService);
  return { svc, applyAdminChangeMock, getMock };
}

describe('AdminHandlerService', () => {
  it('not landed returns ADM_NOT_LANDED', async () => {
    const { svc } = makeService();
    const result = await svc.command.handler(makeShip({ where: 0 }), [], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ADM_NOT_LANDED));
  });

  it('not owner returns ADM_NOT_OWNER', async () => {
    const { svc } = makeService({ userid: 'other' });
    const result = await svc.command.handler(makeShip({ userid: 'owner' }), [], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ADM_NOT_OWNER));
  });

  it('no planet state returns ADM_NOT_OWNER', async () => {
    const { svc } = makeService(null);
    const result = await svc.command.handler(makeShip(), [], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ADM_NOT_OWNER));
  });

  it('no sub-command renders the planet inventory status', async () => {
    const { svc } = makeService();
    const result = await svc.command.handler(makeShip(), [], {});
    // Bare `adm` now lists the owned planet's inventory/admin status rather than
    // a static ADM_MENU. (Header reads "<planet name> — Inventory".)
    expect(result.lines[0].text).toMatch(/Inventory/);
    expect(result.lines[0].category).toBe('system');
  });

  /**
   * Playtest: the footer listed sub-command *names* only, so there was no way
   * to learn that rate/markup/reserve take `<item> <value>` in that order.
   * `adm rate 20 men` just said "Invalid value." with no correction.
   */
  it('the bare-adm footer spells out each sub-command\'s arguments', async () => {
    const { svc } = makeService();
    const result = await svc.command.handler(makeShip(), [], {});
    const footer = result.lines.map((l) => l.text).join('\n');
    expect(footer).toContain('adm rate <item> <0-100>');
    expect(footer).toContain('adm markup <item> <value>');
    expect(footer).toContain('adm sellflag <item> on|off');
    expect(footer).toContain('adm reserve <item> <value>');
    expect(footer).toContain('adm tax <0-100>');
    expect(footer).toContain('adm beacon <message>');
    expect(footer).toContain('adm password <word|none|team>');
  });

  it('a malformed sub-command shows the usage rather than only "Invalid value."', async () => {
    const { svc } = makeService();
    // Arguments the wrong way round — the common mistake the old message hid.
    const result = await svc.command.handler(makeShip(), ['rate', '20', 'men'], {});
    const text = result.lines.map((l) => l.text).join('\n');
    expect(text).toContain('adm rate <item> <0-100>');
  });

  it('unknown sub-command returns ADM_INVALID', async () => {
    const { svc } = makeService();
    const result = await svc.command.handler(makeShip(), ['bogus'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ADM_INVALID));
  });

  it('rate with valid args calls applyAdminChange and returns ADM_OK', async () => {
    const { svc, applyAdminChangeMock } = makeService();
    const result = await svc.command.handler(makeShip(), ['rate', 'food', '10'], {});
    expect(applyAdminChangeMock).toHaveBeenCalledTimes(1);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ADM_OK));
    expect(result.lines[0].category).toBe('success');
  });

  it('rate with bad item keyword returns ADM_INVALID', async () => {
    const { svc, applyAdminChangeMock } = makeService();
    const result = await svc.command.handler(makeShip(), ['rate', 'xyzzy', '10'], {});
    expect(applyAdminChangeMock).not.toHaveBeenCalled();
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ADM_INVALID));
  });

  it('markup with valid args dispatches markup change', async () => {
    const { svc, applyAdminChangeMock } = makeService();
    const result = await svc.command.handler(makeShip(), ['markup', 'food', '15'], {});
    expect(applyAdminChangeMock).toHaveBeenCalledWith(
      expect.any(String), 'owner', { type: 'markup', itemIndex: expect.any(Number), value: 15 },
    );
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ADM_OK));
  });

  it('selfflag on dispatches sellflag=true', async () => {
    const { svc, applyAdminChangeMock } = makeService();
    const result = await svc.command.handler(makeShip(), ['sellflag', 'food', 'on'], {});
    expect(applyAdminChangeMock).toHaveBeenCalledWith(
      expect.any(String), 'owner', { type: 'sellflag', itemIndex: expect.any(Number), value: true },
    );
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ADM_OK));
  });

  it('sellflag off dispatches sellflag=false', async () => {
    const { svc, applyAdminChangeMock } = makeService();
    const result = await svc.command.handler(makeShip(), ['sellflag', 'food', 'off'], {});
    expect(applyAdminChangeMock).toHaveBeenCalledWith(
      expect.any(String), 'owner', { type: 'sellflag', itemIndex: expect.any(Number), value: false },
    );
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ADM_OK));
  });

  it('sellflag with invalid on/off returns ADM_INVALID', async () => {
    const { svc } = makeService();
    const result = await svc.command.handler(makeShip(), ['sellflag', 'food', 'maybe'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ADM_INVALID));
  });

  it('reserve with valid args dispatches reserve change', async () => {
    const { svc, applyAdminChangeMock } = makeService();
    await svc.command.handler(makeShip(), ['reserve', 'food', '50'], {});
    expect(applyAdminChangeMock).toHaveBeenCalledWith(
      expect.any(String), 'owner', { type: 'reserve', itemIndex: expect.any(Number), value: 50 },
    );
  });

  /**
   * Out-of-range tax is REFUSED, not clamped. Clamping let the command answer
   * "Setting saved." for a value it had not saved — and every sibling setter
   * refuses. C's ceiling is 100 and it re-prompts above that
   * (GEMAIN.C:3224). This previously asserted the clamp to 119.
   */
  it('tax above the ceiling is refused, not silently clamped', async () => {
    const { svc, applyAdminChangeMock } = makeService();
    const result = await svc.command.handler(makeShip(), ['tax', '200'], {});
    expect(applyAdminChangeMock).not.toHaveBeenCalled();
    expect(result.lines.map((l) => l.text).join('\n')).toContain('adm tax <0-100>');
  });

  it('tax with value <=100 keeps the value', async () => {
    const { svc, applyAdminChangeMock } = makeService();
    await svc.command.handler(makeShip(), ['tax', '50'], {});
    expect(applyAdminChangeMock).toHaveBeenCalledWith(
      expect.any(String), 'owner', { type: 'taxrate', value: 50 },
    );
  });

  it('beacon with message dispatches beacon change', async () => {
    const { svc, applyAdminChangeMock } = makeService();
    const result = await svc.command.handler(makeShip(), ['beacon', 'Hello', 'World'], {});
    expect(applyAdminChangeMock).toHaveBeenCalledWith(
      expect.any(String), 'owner', { type: 'beacon', value: 'Hello World' },
    );
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ADM_OK));
  });

  it('beacon with no message dispatches empty beacon', async () => {
    const { svc, applyAdminChangeMock } = makeService();
    await svc.command.handler(makeShip(), ['beacon'], {});
    expect(applyAdminChangeMock).toHaveBeenCalledWith(
      expect.any(String), 'owner', { type: 'beacon', value: '' },
    );
  });

  it('password dispatches password change with provided value', async () => {
    const { svc, applyAdminChangeMock } = makeService();
    await svc.command.handler(makeShip(), ['password', 'secret'], {});
    expect(applyAdminChangeMock).toHaveBeenCalledWith(
      // The owner's teamcode rides along: `none`/`team` drive the planet's
      // team lock, not just the stored word. @see planet-password.ts
      expect.any(String), 'owner', { type: 'password', value: 'secret', ownerTeamcode: null },
    );
  });

  it('password with no arg defaults to "none"', async () => {
    const { svc, applyAdminChangeMock } = makeService();
    await svc.command.handler(makeShip(), ['password'], {});
    expect(applyAdminChangeMock).toHaveBeenCalledWith(
      expect.any(String), 'owner', { type: 'password', value: 'none', ownerTeamcode: null },
    );
  });

  it('applyAdminChange returning ok:false returns ADM_INVALID', async () => {
    const { svc } = makeService({ userid: 'owner' }, { ok: false });
    const result = await svc.command.handler(makeShip(), ['rate', 'food', '10'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ADM_INVALID));
  });

  it('keyword is "admin", alias includes "adm"', async () => {
    const { svc } = makeService();
    expect(svc.command.keyword).toBe('admin');
    expect(svc.command.aliases).toContain('adm');
  });
});
