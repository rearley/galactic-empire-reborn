/**
 * T026 — SellHandlerService unit tests.
 */
import { SellHandlerService } from '../../../src/game/commands/handlers/sell.handler';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS, I_FOOD, ITEM_NAMES } from '../../../src/game/constants/items';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Ship1', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0.5, ycoord: 0.5, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 11, // landed on plnum=1 in neutral zone (0,0)
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

function makeService(sellResult: Awaited<ReturnType<PlanetStateService['sell']>> = { ok: true, transferred: 10, proceeds: 19n, fee: 1n }) {
  const sellMock = jest.fn().mockResolvedValue(sellResult);
  const prismaUpdateMock = jest.fn().mockResolvedValue({});

  const planetMock = { sell: sellMock };
  const prismaMock = { user: { update: prismaUpdateMock } };

  const svc = new SellHandlerService(
    planetMock as unknown as PlanetStateService,
    prismaMock as unknown as PrismaService,
  );
  return { svc, sellMock, prismaUpdateMock };
}

describe('SellHandlerService', () => {
  it('not landed returns SELL1', async () => {
    const { svc } = makeService();
    const result = await svc.command.handler(makeShip({ where: 0 }), ['10', 'food'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SELL1));
  });

  it('not in neutral zone returns SELL1', async () => {
    const { svc } = makeService();
    // xcoord=5 → xsect=5, not neutral zone
    const result = await svc.command.handler(makeShip({ xcoord: 5.5, ycoord: 3.5 }), ['10', 'food'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SELL1));
  });

  it('INSUFFICIENT_CARGO returns SELL3', async () => {
    const { svc } = makeService({ ok: false, reason: 'INSUFFICIENT_CARGO' });
    const result = await svc.command.handler(makeShip(), ['10', 'food'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SELL3, ITEM_NAMES[I_FOOD]));
  });

  it('happy path returns SELL2 and credits user cash', async () => {
    const { svc, prismaUpdateMock } = makeService({ ok: true, transferred: 10, proceeds: 19n, fee: 1n });
    const result = await svc.command.handler(makeShip(), ['10', 'food'], {});
    expect(result.lines[0].category).toBe('success');
    // Handler credits user cash — prisma.user.update called
    expect(prismaUpdateMock).toHaveBeenCalledTimes(1);
  });

  it('handler does NOT call ShipStateService.mutate (ship-side handled by service)', async () => {
    // The SellHandlerService doesn't inject ShipStateService — it only credits user cash
    const { svc } = makeService();
    // Just verify the handler returns success without any ship mutate dependency
    const result = await svc.command.handler(makeShip(), ['10', 'food'], {});
    expect(result.lines[0].category).toBe('success');
  });

  it('keyword is "sell", alias includes "sel"', () => {
    const { svc } = makeService();
    expect(svc.command.keyword).toBe('sell');
    expect(svc.command.aliases).toContain('sel');
  });
});
