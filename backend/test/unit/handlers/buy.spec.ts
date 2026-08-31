/**
 * T025 — BuyHandlerService unit tests.
 */
import { BuyHandlerService } from '../../../src/game/commands/handlers/buy.handler';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { PlanetState, planetKey } from '../../../src/game/planet/planet-state.types';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS, I_FOOD } from '../../../src/game/constants/items';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Ship1', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 3.5, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 15, // 10 + plnum(5)
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

function makePlanetState(overrides: Partial<PlanetState> = {}): PlanetState {
  return {
    xsect: 5, ysect: 3, plnum: 5,
    type: 2, xcoord: 5.5, ycoord: 3.5,
    userid: 'owner', name: 'TestWorld',
    enviorn: 1, resource: 1,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0,
    warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items: Array.from({ length: NUMITEMS }, () => ({ qty: 1000n, rate: 10, sell: true, reserve: 0, markup2a: 5, sold2a: 0n })),
    ...overrides,
  };
}

function makeService(planetState: PlanetState | null, buyResult: Awaited<ReturnType<PlanetStateService['buy']>> = { ok: true, transferred: 10, unitPrice: 2, totalCost: 20n }) {
  const buyMock = jest.fn().mockResolvedValue(buyResult);
  const mutateMock = jest.fn();
  const prismaUpdateMock = jest.fn().mockResolvedValue({});

  const planetMock = {
    get: jest.fn().mockReturnValue(planetState),
    buy: buyMock,
  };
  const shipMock = { mutate: mutateMock };
  const prismaMock = { user: { update: prismaUpdateMock } };

  const svc = new BuyHandlerService(
    planetMock as unknown as PlanetStateService,
    shipMock as unknown as ShipStateService,
    prismaMock as unknown as PrismaService,
  );
  return { svc, buyMock, mutateMock, prismaUpdateMock };
}

describe('BuyHandlerService', () => {
  it('not landed returns BUY1', async () => {
    const { svc } = makeService(makePlanetState());
    const result = await svc.command.handler(makeShip({ where: 0 }), ['10', 'food'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUY1));
  });

  it('happy path returns BUY2 and calls planetService.buy', async () => {
    const { svc, buyMock } = makeService(makePlanetState());
    const result = await svc.command.handler(makeShip(), ['10', 'food'], {});
    expect(result.lines[0].category).toBe('success');
    expect(buyMock).toHaveBeenCalled();
  });

  /**
   * BUY2 read '%d %s purchased for %d credits.' — three placeholders for four
   * arguments, so the second %d consumed the UNIT price and the total was
   * dropped. "100 Men purchased for 4 credits" while 400 credits left the
   * account. Found by watching the balance during a new-pilot run.
   */
  it('reports what the purchase actually cost, not the unit price', async () => {
    const { svc } = makeService(makePlanetState(), {
      ok: true, transferred: 100, unitPrice: 4, totalCost: 400n,
    });
    const text = (await svc.command.handler(makeShip(), ['100', 'men'], {})).lines[0].text;

    expect(text).toContain('400');
    // The unit price stays visible, but must not be the only number shown.
    expect(text).not.toMatch(/purchased for 4 credits/);
  });

  it('returns BUY5 when SELL_FLAG_OFF', async () => {
    const { svc } = makeService(makePlanetState(), { ok: false, reason: 'SELL_FLAG_OFF' });
    const result = await svc.command.handler(makeShip(), ['10', 'food'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUY5));
  });

  it('returns BUY3 when AT_RESERVE', async () => {
    const { svc } = makeService(makePlanetState(), { ok: false, reason: 'AT_RESERVE' });
    const result = await svc.command.handler(makeShip(), ['10', 'food'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUY3));
  });

  it('returns BUY4 when CAPACITY_FULL', async () => {
    const { svc } = makeService(makePlanetState(), { ok: false, reason: 'CAPACITY_FULL' });
    const result = await svc.command.handler(makeShip(), ['10', 'food'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUY4));
  });

  it('non-owner without password gets BUYPAS1 when planet has password', async () => {
    const { svc } = makeService(makePlanetState({ userid: 'other', password: 'secret' }));
    const result = await svc.command.handler(makeShip({ userid: 'u1' }), ['10', 'food'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUYPAS1));
  });

  it('team password with nonzero teamcode returns BUYPAS3', async () => {
    const { svc } = makeService(makePlanetState({ userid: 'other', password: 'team', teamcode: 42n }));
    const result = await svc.command.handler(makeShip({ userid: 'u1' }), ['10', 'food'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUYPAS3));
  });

  it('keyword is "buy", no aliases', () => {
    const { svc } = makeService(null);
    expect(svc.command.keyword).toBe('buy');
    expect(svc.command.aliases).toHaveLength(0);
  });
});
