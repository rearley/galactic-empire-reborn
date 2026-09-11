import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { TickKind } from '../../../src/game/tick/tick.types';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShipState(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'user1',
    shipname: 'USS Test',
    status: 0,
    topspeed: 0,
    ...overrides,
  });
}

describe('ShipStateService.loadIfAbsent', () => {
  let service: ShipStateService;

  beforeEach(async () => {
    const prismaMock = {
      ship: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
      // onModuleInit awaits Promise.all([ship.findMany, shipClass.findMany]).
      shipClass: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const tickSubscribeMock = vi.fn().mockImplementation(
      (_kind: TickKind, _handler: () => Promise<void>) => () => {},
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShipStateService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: TickService,
          useValue: {
            subscribe: tickSubscribeMock,
            registerSnapshotProvider: vi.fn(),
          },
        },
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
