import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TickService } from '../../src/game/tick/tick.service';
import { TickKind } from '../../src/game/tick/tick.types';
import { shipKey } from '../../src/game/ship/ship-state.types';

function makeShipRow(overrides: Partial<{
  userid: string;
  shipno: number;
  shipname: string;
  shpclass: number;
}> = {}) {
  return {
    userid: overrides.userid ?? 'user1',
    shipno: overrides.shipno ?? 1,
    shipname: overrides.shipname ?? 'USS Test',
    shpclass: overrides.shpclass ?? 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 1000,
    // phasrtype/shieldtype default to 1, not 0 — ShipStateService.onModuleInit
    // self-heals 0 → 1 and marks dirty, which would falsify "dirty=false after
    // hydration" and "zero writes when nothing is dirty" assertions below.
    phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
  };
}

describe('ShipStateService', () => {
  let service: ShipStateService;
  let prismaMock: {
    ship: { findMany: jest.Mock; update: jest.Mock };
    shipClass: { findMany: jest.Mock };
  };
  let tickSubscribeMock: jest.Mock;
  let registerSnapshotProviderMock: jest.Mock;
  let flushTick: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    prismaMock = {
      ship: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      // onModuleInit now awaits Promise.all([ship.findMany, shipClass.findMany]).
      shipClass: { findMany: jest.fn().mockResolvedValue([]) },
    };
    tickSubscribeMock = jest.fn().mockImplementation(
      (_kind: TickKind, handler: () => Promise<void>) => {
        flushTick = handler;
        return () => {};
      },
    );
    registerSnapshotProviderMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShipStateService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: TickService,
          useValue: {
            subscribe: tickSubscribeMock,
            registerSnapshotProvider: registerSnapshotProviderMock,
          },
        },
      ],
    })
      .setLogger(new Logger())
      .compile();

    service = module.get<ShipStateService>(ShipStateService);
  });

  describe('hydration (SC-006)', () => {
    it('loads N rows into Map; size() equals N before any tick', async () => {
      prismaMock.ship.findMany.mockResolvedValue([
        makeShipRow({ userid: 'u1', shipno: 1 }),
        makeShipRow({ userid: 'u1', shipno: 2 }),
        makeShipRow({ userid: 'u2', shipno: 1 }),
      ]);
      await service.onModuleInit();
      expect(service.size()).toBe(3);
    });

    it('ships start with dirty=false after hydration', async () => {
      prismaMock.ship.findMany.mockResolvedValue([makeShipRow()]);
      await service.onModuleInit();
      const state = service.get('user1', 1);
      expect(state).toBeDefined();
      expect(state!.dirty).toBe(false);
    });

    it('registers SHIP_UPDATE flush subscriber on init', async () => {
      await service.onModuleInit();
      expect(tickSubscribeMock).toHaveBeenCalledWith(TickKind.SHIP_UPDATE, expect.any(Function));
    });
  });

  describe('mutate', () => {
    beforeEach(async () => {
      prismaMock.ship.findMany.mockResolvedValue([makeShipRow()]);
      await service.onModuleInit();
    });

    it('applies mutation and sets dirty=true', () => {
      const result = service.mutate('user1', 1, (s) => { s.degrees = 90; });
      expect(result).toBeDefined();
      expect(result!.degrees).toBe(90);
      expect(result!.dirty).toBe(true);
    });

    it('returns undefined for unknown ship', () => {
      expect(service.mutate('nobody', 99, () => {})).toBeUndefined();
    });
  });

  describe('flush (SC-003)', () => {
    beforeEach(async () => {
      prismaMock.ship.findMany.mockResolvedValue([
        makeShipRow({ userid: 'u1', shipno: 1 }),
        makeShipRow({ userid: 'u1', shipno: 2 }),
      ]);
      await service.onModuleInit();
    });

    it('zero writes when nothing is dirty (SC-003)', async () => {
      await flushTick!();
      expect(prismaMock.ship.update).not.toHaveBeenCalled();
    });

    it('writes only dirty entries', async () => {
      service.mutate('u1', 1, (s) => { s.degrees = 45; });
      await flushTick!();
      expect(prismaMock.ship.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.ship.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userid_shipno: { userid: 'u1', shipno: 1 } },
        }),
      );
    });

    it('clears dirty after successful flush', async () => {
      service.mutate('u1', 1, (s) => { s.degrees = 45; });
      await flushTick!();
      expect(service.get('u1', 1)!.dirty).toBe(false);
    });

    it('one flush failure does not stop sibling flush (FR-006)', async () => {
      service.mutate('u1', 1, (s) => { s.degrees = 45; });
      service.mutate('u1', 2, (s) => { s.degrees = 90; });
      prismaMock.ship.update.mockImplementationOnce(() => Promise.reject(new Error('DB error')));
      prismaMock.ship.update.mockResolvedValueOnce({});
      await flushTick!();
      expect(prismaMock.ship.update).toHaveBeenCalledTimes(2);
      // The second ship should be clean after successful flush
      expect(service.get('u1', 2)!.dirty).toBe(false);
    });

    it('two rapid mutations produce one write reflecting latest state', async () => {
      service.mutate('u1', 1, (s) => { s.degrees = 45; });
      service.mutate('u1', 1, (s) => { s.degrees = 90; });
      await flushTick!();
      expect(prismaMock.ship.update).toHaveBeenCalledTimes(1);
      const callArg = prismaMock.ship.update.mock.calls[0][0] as { data: { degrees: number } };
      expect(callArg.data).toMatchObject({ degrees: 90 });
    });
  });

  describe('findByUserid', () => {
    beforeEach(async () => {
      prismaMock.ship.findMany.mockResolvedValue([
        makeShipRow({ userid: 'u1', shipno: 3 }),
        makeShipRow({ userid: 'u1', shipno: 1 }),
        makeShipRow({ userid: 'u2', shipno: 1 }),
      ]);
      await service.onModuleInit();
    });

    it('returns ships sorted ascending by shipno', () => {
      const ships = service.findByUserid('u1');
      expect(ships.map((s) => s.shipno)).toEqual([1, 3]);
    });

    it('returns empty array for unknown userid', () => {
      expect(service.findByUserid('nobody')).toEqual([]);
    });

    it('does not return ships belonging to other users', () => {
      const ships = service.findByUserid('u2');
      expect(ships).toHaveLength(1);
      expect(ships[0].userid).toBe('u2');
    });
  });
});

// Suppress unused import warning — shipKey is used to document the key format
void shipKey;
