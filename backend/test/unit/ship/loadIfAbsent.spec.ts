import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickKind } from '../../../src/game/tick/tick.types';
import type { ShipState } from '../../../src/game/ship/ship-state.types';

function makeShipState(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'user1',
    shipno: 1,
    shipname: 'USS Test',
    shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false,
    dirty: false,
    ...overrides,
  };
}

describe('ShipStateService.loadIfAbsent', () => {
  let service: ShipStateService;

  beforeEach(async () => {
    const prismaMock = {
      ship: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const tickSubscribeMock = jest.fn().mockImplementation(
      (_kind: TickKind, _handler: () => Promise<void>) => () => {},
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShipStateService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TickService, useValue: { subscribe: tickSubscribeMock } },
      ],
    })
      .setLogger(new Logger())
      .compile();

    service = module.get<ShipStateService>(ShipStateService);
    await service.onModuleInit();
  });

  it('inserts a new ship into the map when not already present', () => {
    const ship = makeShipState({ userid: 'u1', shipno: 1, shipname: 'Newcomer' });
    service.loadIfAbsent(ship);
    expect(service.size()).toBe(1);
    expect(service.get('u1', 1)?.shipname).toBe('Newcomer');
  });

  it('is idempotent — calling twice with same ship keeps map at 1 entry', () => {
    const ship = makeShipState({ userid: 'u1', shipno: 1, shipname: 'SameName' });
    service.loadIfAbsent(ship);
    service.loadIfAbsent(ship);
    expect(service.size()).toBe(1);
  });

  it('does NOT overwrite existing state when called for a ship already in the map', () => {
    const existing = makeShipState({ userid: 'u1', shipno: 1, shipname: 'Original', energy: 999 });
    service.loadShip(existing);

    const incoming = makeShipState({ userid: 'u1', shipno: 1, shipname: 'NewVersion', energy: 1 });
    service.loadIfAbsent(incoming);

    const state = service.get('u1', 1);
    expect(state?.shipname).toBe('Original');
    expect(state?.energy).toBe(999);
    expect(service.size()).toBe(1);
  });
});
