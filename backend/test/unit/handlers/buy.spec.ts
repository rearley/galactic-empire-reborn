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
import { NUMITEMS, I_FOOD, ITEM_NAMES } from '../../../src/game/constants/items';
import { UserRepository } from '../../../src/game/player/user.repository';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Ship1',
    xcoord: 5.5,
    ycoord: 3.5,
    where: 15, // 10 + plnum(5)
    items: Array(NUMITEMS).fill(0n),
    status: 0,
    topspeed: 0,
    ...overrides,
  });
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
  const buyMock = vi.fn().mockResolvedValue(buyResult);
  const mutateMock = vi.fn();
  const prismaUpdateMock = vi.fn().mockResolvedValue({});
  const prismaFindMock = vi.fn().mockResolvedValue({ cash: 1_000_000n });

  const planetMock = {
    get: vi.fn().mockReturnValue(planetState),
    buy: buyMock,
  };
  const shipMock = { mutate: mutateMock };
  const prismaMock = { user: { update: prismaUpdateMock, findUnique: prismaFindMock } };

  const svc = new BuyHandlerService(
    planetMock as unknown as PlanetStateService,
    shipMock as unknown as ShipStateService,
    new UserRepository(prismaMock as unknown as PrismaService),
  );
  return { svc, buyMock, mutateMock, prismaUpdateMock, prismaFindMock };
}

describe('BuyHandlerService', () => {
  it('not landed returns BUY1', async () => {
    const { svc } = makeService(makePlanetState());
    const result = await svc.command.handler(makeShip({ where: 0 }), ['10', 'food'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUY1));
  });

  it('happy path returns BUY9 and calls planetService.buy', async () => {
    const { svc, buyMock } = makeService(makePlanetState());
    const result = await svc.command.handler(makeShip(), ['10', 'food'], {});
    expect(result.lines[0].category).toBe('success');
    expect(buyMock).toHaveBeenCalled();
  });

  /**
   * The confirmation is BUY9 — "%s %s purchased at the price of %u each for a
   * total of %s, Sir." (MBMGEMSG.MSG:3309, GECMDS.C:4353-4361). The port used
   * BUY2, which in canon is the CANNOT-AFFORD refusal, and its paraphrase read
   * '%d %s purchased for %d credits.' — three placeholders for four arguments,
   * so the second %d consumed the UNIT price and the total was dropped.
   * "100 Men purchased for 4 credits" while 400 credits left the account.
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

  // BUY3 names the count for sale, as C does (GECMDS.C:4380-4381). The
  // argument-free form printed a paraphrase that blamed the planet's reserve.
  it('returns BUY3 naming the available count when AT_RESERVE', async () => {
    const { svc } = makeService(makePlanetState(), { ok: false, reason: 'AT_RESERVE', available: 3 });
    const result = await svc.command.handler(makeShip(), ['10', 'food'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUY3, 3, ITEM_NAMES[I_FOOD]));
  });

  // Every chkweight failure is BUY8 in C (GECMDS.C:4328); BUY4 there is
  // "They are not selling their %s, Sir!", a different refusal entirely.
  it('returns BUY8 when CAPACITY_FULL', async () => {
    const { svc } = makeService(makePlanetState(), { ok: false, reason: 'CAPACITY_FULL' });
    const result = await svc.command.handler(makeShip(), ['10', 'food'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUY8));
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

  /**
   * `if ((long)waruptr->cash < 0) waruptr->cash = 0;` is the first thing
   * cmd_buy does — a player who went negative (planet debt, taxes) is zeroed
   * rather than being able to dig deeper by shopping. @see GECMDS.C:4207-4209
   */
  it('clamps a negative balance to zero before quoting', async () => {
    const { svc, buyMock, prismaUpdateMock, prismaFindMock } = makeService(makePlanetState());
    prismaFindMock.mockResolvedValue({ cash: -500n });

    await svc.command.handler(makeShip(), ['10', 'food'], {});

    expect(prismaUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { cash: 0n } }),
    );
    // and the buy is priced against 0, not -500
    // The trailing argument is the conditional debit — the check and the
    // decrement in one statement, so Postgres refuses an overdraft however many
    // commands are in flight. @see docs/audits/2026-09-09-security-review.md M1
    expect(buyMock).toHaveBeenCalledWith(expect.anything(), 'u1', expect.any(Number), 10, expect.any(Number), 0n, expect.any(Function));
  });

  it('passes the buyer balance through to the trade calculation', async () => {
    const { svc, buyMock, prismaFindMock } = makeService(makePlanetState());
    prismaFindMock.mockResolvedValue({ cash: 4_321n });

    await svc.command.handler(makeShip(), ['10', 'food'], {});

    expect(buyMock).toHaveBeenCalledWith(expect.anything(), 'u1', expect.any(Number), 10, expect.any(Number), 4_321n, expect.any(Function));
  });

  it('reports insufficient credits rather than completing the purchase', async () => {
    const { svc, mutateMock, prismaUpdateMock } = makeService(makePlanetState(), {
      ok: false,
      reason: 'INSUFFICIENT_FUNDS',
    });

    const res = await svc.command.handler(makeShip(), ['10', 'food'], {});

    expect(res.lines[0].text).toBe(formatMessage(MessageId.PRICE_NO_CASH));
    expect(mutateMock).not.toHaveBeenCalled();
    expect(prismaUpdateMock).not.toHaveBeenCalled();
  });
});
