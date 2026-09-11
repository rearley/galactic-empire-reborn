/**
 * T047 — WithdrawHandlerService unit tests.
 */
import { WithdrawHandlerService } from '../../../src/game/commands/handlers/withdraw.handler';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants/items';
import { UserRepository } from '../../../src/game/player/user.repository';

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

type WithdrawResult =
  | { ok: false }
  | { ok: true; amount: bigint };

function makeService(
  planetState: { userid: string } | null = { userid: 'owner' },
  withdrawResult: WithdrawResult = { ok: true, amount: 500n },
) {
  const withdrawTaxMock = jest.fn().mockResolvedValue(withdrawResult);
  const prismaUpdateMock = jest.fn().mockResolvedValue({});

  const planetMock = {
    get: jest.fn().mockReturnValue(planetState),
    withdrawTax: withdrawTaxMock,
  };
  const prismaMock = { user: { update: prismaUpdateMock } };

  const svc = new WithdrawHandlerService(
    planetMock as unknown as PlanetStateService,
    new UserRepository(prismaMock as unknown as PrismaService),
  );
  return { svc, withdrawTaxMock, prismaUpdateMock };
}

describe('WithdrawHandlerService', () => {
  it('not landed returns WTHDR_NOT_LANDED', async () => {
    const { svc } = makeService();
    const result = await svc.command.handler(makeShip({ where: 0 }), [], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.WTHDR_NOT_LANDED));
  });

  it('no planet state returns WTHDR_NOT_OWNER', async () => {
    const { svc } = makeService(null);
    const result = await svc.command.handler(makeShip(), [], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.WTHDR_NOT_OWNER));
  });

  it('planet owned by other returns WTHDR_NOT_OWNER', async () => {
    const { svc } = makeService({ userid: 'other' });
    const result = await svc.command.handler(makeShip({ userid: 'owner' }), [], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.WTHDR_NOT_OWNER));
  });

  it('withdrawTax returning ok:false returns WTHDR_NOT_OWNER', async () => {
    const { svc } = makeService({ userid: 'owner' }, { ok: false });
    const result = await svc.command.handler(makeShip(), [], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.WTHDR_NOT_OWNER));
  });

  it('amount=0 returns WTHDR_NONE without crediting user', async () => {
    const { svc, prismaUpdateMock } = makeService({ userid: 'owner' }, { ok: true, amount: 0n });
    const result = await svc.command.handler(makeShip(), [], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.WTHDR_NONE));
    expect(prismaUpdateMock).not.toHaveBeenCalled();
  });

  it('happy path returns WTHDR_OK success line and credits user cash', async () => {
    const { svc, prismaUpdateMock } = makeService({ userid: 'owner' }, { ok: true, amount: 500n });
    const result = await svc.command.handler(makeShip(), [], {});
    expect(result.lines[0].category).toBe('success');
    expect(result.lines[0].text).toContain('500');
    expect(prismaUpdateMock).toHaveBeenCalledTimes(1);
    expect(prismaUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userid: 'owner' },
        data: { cash: { increment: 500n } },
      }),
    );
  });

  it('keyword is "withdraw", alias includes "with"', () => {
    const { svc } = makeService();
    expect(svc.command.keyword).toBe('withdraw');
    expect(svc.command.aliases).toContain('with');
  });
});
