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
    navTargetX: null, navTargetY: null,
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

  it('no sub-command returns ADM_MENU', async () => {
    const { svc } = makeService();
    const result = await svc.command.handler(makeShip(), [], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ADM_MENU));
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

  it('tax with valid value dispatches taxrate change (capped at 119)', async () => {
    const { svc, applyAdminChangeMock } = makeService();
    await svc.command.handler(makeShip(), ['tax', '200'], {});
    const call = applyAdminChangeMock.mock.calls[0];
    expect(call[2]).toEqual({ type: 'taxrate', value: 119 });
  });

  it('tax with value <=119 keeps the value', async () => {
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
      expect.any(String), 'owner', { type: 'password', value: 'secret' },
    );
  });

  it('password with no arg defaults to "none"', async () => {
    const { svc, applyAdminChangeMock } = makeService();
    await svc.command.handler(makeShip(), ['password'], {});
    expect(applyAdminChangeMock).toHaveBeenCalledWith(
      expect.any(String), 'owner', { type: 'password', value: 'none' },
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
