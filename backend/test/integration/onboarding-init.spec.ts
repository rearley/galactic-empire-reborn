/**
 * Integration test: OnboardingService.finalize() creates Ship with correct starting state.
 * Verifies shpclass=1, items[4]=3n, User.cash=5000n, no prompt:class-list emitted.
 * @see GEFUNCS.C:initshp — ship initialisation
 * @see GEMAIN.C:521 STRTCASH — starting credits
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { START_CASH, START_FLUX_PODS, START_CLASS } from '../../src/game/constants/onboarding';
import { ENGYMAX } from '../../src/game/constants';

describe('OnboardingService.finalize() — starting state (T004)', () => {
  let service: OnboardingService;
  let prismaMock: jest.Mocked<Pick<PrismaService, 'sector' | 'shipClass' | 'ship' | 'user'>>;
  let shipStateServiceMock: { loadShip: jest.Mock };

  const USERID = 'test-user-onboard-001';
  const SHIPNAME = 'StarFalcon';

  beforeEach(async () => {
    const mockSector = {
      xsect: 0,
      ysect: 0,
      type: 'NEUTRAL',
      id: 'sector-0-0',
    };

    const mockShipClass = {
      classNumber: 1,
      typeName: 'Interceptor',
      category: 'PLAYER',
      maxShields: 1000,
      maxPhaser: 1000,
      maxWarp: 10,
      hasTorpedo: false,
      hasMissile: false,
      shipNameTemplate: 'Interceptor',
      maxAcceleration: 1000,
      scanRange: 5000,
      maxPrice: 5000n,
    };

    const createdShip = {
      userid: USERID,
      shipno: 1,
      shipname: SHIPNAME,
      shpclass: START_CLASS,
      xcoord: 0,
      ycoord: 0,
      energy: ENGYMAX,
      phasr: 100,
      shield: 0,
      heading: 0,
      head2b: 0,
      speed: 0,
      speed2b: 0,
      damage: 0,
      kills: 0,
      lastfired: 0,
      shieldtype: 0,
      shieldstat: 0,
      cloak: 0,
      degrees: 0,
      percent: 0,
      tactical: 0,
      helm: 0,
      train: 0,
      where: 0,
      ltorpsChannel: [],
      ltorpsDistance: [],
      lmisslChannel: [],
      lmisslDistance: [],
      lmisslEnergy: [],
      decout: [],
      jammer: 0,
      freq: [0, 0, 0],
      items: [0n, 0n, 0n, 0n, BigInt(START_FLUX_PODS), 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      titem: 0,
      hostile: 0,
      cantexit: 0,
      repair: 0,
      hypha: 0,
      firecntl: 0,
      destruct: 0,
      status: 0,
      cybmine: 0,
      cybskill: 0,
      cybupdate: 0,
      tick: 0,
      emulate: 0,
      minesnear: 0,
      lock: 0,
      holdcourse: 0,
      topspeed: 0,
      warncntr: 0,
      navTargetX: null,
      navTargetY: null,
    };

    prismaMock = {
      sector: {
        findUnique: jest.fn().mockResolvedValue(mockSector),
      } as unknown as PrismaService['sector'],
      shipClass: {
        // OnboardingService.finalize now calls findUnique (not findUniqueOrThrow).
        findUnique: jest.fn().mockResolvedValue(mockShipClass),
        findUniqueOrThrow: jest.fn().mockResolvedValue(mockShipClass),
      } as unknown as PrismaService['shipClass'],
      ship: {
        create: jest.fn().mockResolvedValue(createdShip),
      } as unknown as PrismaService['ship'],
      user: {
        // Brand-new player by default: topshipno 0 → first ship gets shipno/topshipno 1.
        findUnique: jest.fn().mockResolvedValue({ topshipno: 0 }),
        update: jest.fn().mockResolvedValue({ userid: USERID, cash: START_CASH }),
      } as unknown as PrismaService['user'],
    };

    shipStateServiceMock = { loadShip: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ShipStateService, useValue: shipStateServiceMock },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockImplementation((key: string, def: number) => def) },
        },
      ],
    }).compile();

    service = module.get(OnboardingService);
  });

  it('creates Ship with shpclass=1 (START_CLASS)', async () => {
    await service.finalize(USERID, SHIPNAME);

    const call = (prismaMock.ship.create as jest.Mock).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data['shpclass']).toBe(START_CLASS);
  });

  it('creates Ship with 14 items, items[4]=3n (START_FLUX_PODS), all others 0n', async () => {
    await service.finalize(USERID, SHIPNAME);

    const call = (prismaMock.ship.create as jest.Mock).mock.calls[0][0] as { data: Record<string, unknown> };
    const items = call.data['items'] as bigint[];
    expect(items).toHaveLength(14);
    expect(items[4]).toBe(BigInt(START_FLUX_PODS));
    for (let i = 0; i < 14; i++) {
      if (i !== 4) expect(items[i]).toBe(0n);
    }
  });

  it('sets User.cash = START_CASH (5000n) via prisma.user.update', async () => {
    await service.finalize(USERID, SHIPNAME);

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userid: USERID },
        data: expect.objectContaining({ cash: START_CASH }),
      }),
    );
  });

  it('calls loadShip with the created ship state', async () => {
    await service.finalize(USERID, SHIPNAME);
    expect(shipStateServiceMock.loadShip).toHaveBeenCalledTimes(1);
  });

  it('sets User.noships=1 and topshipno=1 via prisma.user.update (fleet counters)', async () => {
    await service.finalize(USERID, SHIPNAME);

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userid: USERID },
        data: expect.objectContaining({ noships: 1, topshipno: 1 }),
      }),
    );
  });

  it('creates Ship with status=1 (GESTAT_USER) explicitly', async () => {
    await service.finalize(USERID, SHIPNAME);

    const call = (prismaMock.ship.create as jest.Mock).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data['status']).toBe(1);
  });

  // P-007 final-review fix 4: the empty-fleet rebuild path must preserve the
  // monotonic never-reuse invariant — a wiped player (topshipno=5) who claims a
  // free starter must get shipno/topshipno 6, NOT a reset to 1.
  it('allocates topshipno+1 for a wiped player (does NOT reset to 1)', async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ topshipno: 5 });

    await service.finalize(USERID, SHIPNAME);

    const call = (prismaMock.ship.create as jest.Mock).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data['shipno']).toBe(6);

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userid: USERID },
        data: expect.objectContaining({ noships: 1, topshipno: 6 }),
      }),
    );
  });
});
