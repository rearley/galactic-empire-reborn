/**
 * T046 — AdminHandlerService unit tests.
 */
import { AdminHandlerService } from '../../../src/game/commands/handlers/admin.handler';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { ITEM_NAMES, NUMITEMS } from '../../../src/game/constants/items';
import { CommandResult } from '../../../src/game/commands/command.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'owner',
    shipname: 'Ship1',
    xcoord: 5.5,
    ycoord: 3.5,
    where: 15, // plnum = 5, xsect = 5, ysect = 3
    items: Array(NUMITEMS).fill(0n),
    status: 0,
    topspeed: 0,
    ...overrides,
  });
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
  const applyAdminChangeMock = vi.fn().mockResolvedValue(adminChangeResult);
  const getMock = vi.fn().mockReturnValue(fullState);
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

/**
 * The accounting report shows every slot, and shows what has been SOLD.
 *
 *   for (i=0; i<NUMITEMS; ++i) {
 *       sprintf(gechrbuf,"%-11s %5u %5ld %5u %5u %1c %5ld",
 *               item_name[i], rate, qty, markup2a, reserve, sell, sold2a);
 *       prf("%s\r",gechrbuf);
 *   }
 *
 * @see GEMAIN.C:2999-3016, header text ADMIN02
 *      'Item          Rate Qty  Price  Resv  S Sold'
 *
 * Two omissions. `sold2a` — the running units-sold counter — was carried in
 * state, persisted, and read by nothing, so an owner could never see how much
 * of a commodity their colony had actually moved. And the port skipped any
 * slot with no stock and no rate, so an item priced and reserved but currently
 * empty vanished from the report: the owner could not check or correct its
 * settings without re-issuing the command blind. Canon's loop has no filter.
 */
describe('the accounting report is unfiltered and includes Sold (GEMAIN.C:2999)', () => {
  function planetWithStock() {
    const items = Array.from({ length: NUMITEMS }, () => ({
      qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
    }));
    // One slot priced and reserved but EMPTY — the row the port used to hide.
    items[3] = { qty: 0n, rate: 0, sell: true, reserve: 250, markup2a: 40, sold2a: 900n };
    items[5] = { qty: 1_000n, rate: 20, sell: true, reserve: 0, markup2a: 12, sold2a: 4_242n };
    return { userid: 'owner', items };
  }

  const report = async () => {
    const { svc } = makeService(planetWithStock() as never);
    const res = await svc.command.handler(makeShip({ where: 11 }), [], {}) as CommandResult;
    return res.lines.map((l) => l.text).join('\n');
  };

  it('shows the units sold for a slot that has moved stock', async () => {
    expect(await report()).toContain('4,242');
  });

  it('shows a slot that is priced and reserved but empty', async () => {
    const text = await report();
    expect(text).toContain(ITEM_NAMES[3]);
    expect(text).toContain('250');
  });

  it('prints a row for every one of the NUMITEMS slots — canon does not filter', async () => {
    const text = await report();
    for (const name of ITEM_NAMES) expect(text).toContain(name);
  });
});

/**
 * Admin menu item 4 renames the colony.
 *
 *   *margv[0] = toupper(*margv[0]);
 *   strncpy(plptr->name,margv[0],19);
 *   plptr->name[19] = 0;
 *
 * @see GEMAIN.C:2949-2981 mnu_admenu1a, reached from `case '4'` at :3041
 *
 * The owner may rename an owned colony as often as they like; the port fixed
 * the name at claim time, and `adm rename` answered "Invalid value." The two
 * canon details worth keeping are the 19-character truncation and the forced
 * capital on the first letter.
 */
describe('adm rename (GEMAIN.C:2949)', () => {
  it('renames the colony', async () => {
    const { svc, applyAdminChangeMock } = makeService();

    await svc.command.handler(makeShip({ where: 11 }), ['rename', 'Aurora'], {});

    expect(applyAdminChangeMock).toHaveBeenCalledWith(
      expect.anything(), 'owner', { type: 'name', value: 'Aurora' },
    );
  });

  it('capitalises the first letter, as toupper(*margv[0]) does', async () => {
    const { svc, applyAdminChangeMock } = makeService();

    await svc.command.handler(makeShip({ where: 11 }), ['rename', 'aurora'], {});

    expect(applyAdminChangeMock.mock.calls[0][2]).toMatchObject({ value: 'Aurora' });
  });

  it('truncates at canon 19 characters', async () => {
    const { svc, applyAdminChangeMock } = makeService();

    await svc.command.handler(makeShip({ where: 11 }), ['rename', 'A'.repeat(40)], {});

    expect((applyAdminChangeMock.mock.calls[0][2] as { value: string }).value).toHaveLength(19);
  });

  it('keeps a multi-word name together', async () => {
    const { svc, applyAdminChangeMock } = makeService();

    await svc.command.handler(makeShip({ where: 11 }), ['rename', 'New', 'Terra'], {});

    expect(applyAdminChangeMock.mock.calls[0][2]).toMatchObject({ value: 'New Terra' });
  });

  it('refuses an empty name rather than clearing the colony\'s', async () => {
    const { svc, applyAdminChangeMock } = makeService();

    await svc.command.handler(makeShip({ where: 11 }), ['rename'], {});

    expect(applyAdminChangeMock).not.toHaveBeenCalled();
  });
});
