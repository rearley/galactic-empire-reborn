/**
 * T026 — SellHandlerService unit tests.
 */
import { SellHandlerService } from '../../../src/game/commands/handlers/sell.handler';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS, I_FOOD, ITEM_NAMES } from '../../../src/game/constants/items';
import { UserRepository } from '../../../src/game/player/user.repository';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Ship1',
    xcoord: 0.5,
    ycoord: 0.5,
    where: 11, // landed on plnum=1 in neutral zone (0,0)
    items: Array(NUMITEMS).fill(0n),
    status: 0,
    topspeed: 0,
    ...overrides,
  });
}

function makeService(sellResult: Awaited<ReturnType<PlanetStateService['sell']>> = { ok: true, transferred: 10, proceeds: 19n, fee: 1n }) {
  const sellMock = vi.fn().mockResolvedValue(sellResult);
  const prismaUpdateMock = vi.fn().mockResolvedValue({});

  const planetMock = { sell: sellMock };
  const prismaMock = { user: { update: prismaUpdateMock } };

  const svc = new SellHandlerService(
    planetMock as unknown as PlanetStateService,
    new UserRepository(prismaMock as unknown as PrismaService),
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
