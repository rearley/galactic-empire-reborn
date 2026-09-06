/**
 * T039 — Integration test verifying GameGateway bridges droid events to the
 * correct Socket.io rooms.
 *
 * Uses a mock socket.io Server so no network is needed. Follows the pattern
 * established by combat-broadcast.spec.ts.
 *
 * @see specs/019-physics-polish/data-model.md §DroidSpawnedEvent §DroidKilledEvent
 * @see GEDROIDS.C:98 droid_init
 * @see GEDROIDS.C:534 droid_died
 */

import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { mockRandom } from '../fixtures/mock-random';
import {
  DroidEvents,
  DroidSpawnedEvent,
  DroidKilledEvent,
} from '../../src/game/droid/droid-events';

describe('GameGateway — droid event bridge', () => {
  let gateway: GameGateway;
  let emitMock: jest.Mock;
  let toMock: jest.Mock;

  beforeEach(() => {
    emitMock = jest.fn();
    toMock = jest.fn().mockReturnValue({ emit: emitMock, to: jest.fn().mockReturnValue({ emit: emitMock }) });

    const mockWsGuard = { validate: jest.fn() } as unknown as WsAuthGuard;
    const mockPrisma = { ship: { findFirst: jest.fn() } } as unknown as PrismaService;
    const mockOnboarding = { buildClassListPayload: jest.fn().mockResolvedValue([]) } as unknown as OnboardingService;
    const mockScanHandler = { clearScantab: jest.fn() } as unknown as ScanHandlerService;

    gateway = new GameGateway(
      // DROIDNEW is a galaxy broadcast that skips filtered pilots, so the
      // bridge now reads the ship map. @see GEDROIDS.C:173
      { findAllShips: () => [] } as unknown as ShipStateService,
      {} as CommandRouterService,
      {} as ConnectedShipsRegistry,
      mockWsGuard,
      mockPrisma,
      mockOnboarding,
      mockScanHandler,
      { getTypeName: jest.fn() } as never,
      mockRandom,
      { emit: jest.fn(), on: jest.fn() } as never,
    );

    // Inject the mock socket.io Server
    // `except` is the top-level Socket.io broadcast the CYBNEW/DROIDNEW line
    // uses; the roster emit still goes through `to`.
    (gateway as unknown as { server: unknown }).server = {
      to: toMock,
      except: jest.fn().mockReturnValue({ emit: jest.fn() }),
    };
  });

  describe('handleDroidSpawned', () => {
    it('emits droid.spawned to the sector room', () => {
      const event: DroidSpawnedEvent = {
        shipId: '@Droid-1',
        shipname: 'Garbage Scow',
        shpclass: 31,
        sector: { x: 5, y: 3 },
        ephemeral: true,
        spawnedAt: Date.now(),
      };

      gateway.handleDroidSpawned(event);

      expect(toMock).toHaveBeenCalledWith('sector:5:3');
      expect(emitMock).toHaveBeenCalledWith(DroidEvents.SPAWNED, event);
    });

    it('uses the correct sector room format sector:x:y', () => {
      const event: DroidSpawnedEvent = {
        shipId: '@Droid-2',
        shipname: 'Murdonian Transport',
        shpclass: 32,
        sector: { x: 15, y: 8 },
        ephemeral: true,
        spawnedAt: 0,
      };

      gateway.handleDroidSpawned(event);

      expect(toMock).toHaveBeenCalledWith('sector:15:8');
    });
  });

  describe('handleDroidKilled', () => {
    it('emits droid.killed to the sector room', () => {
      const event: DroidKilledEvent = {
        shipId: '@Droid-3',
        shipname: 'Garbage Scow',
        shpclass: 31,
        sector: { x: 4, y: 2 },
        killedBy: 'alice',
        killedAt: Date.now(),
      };

      gateway.handleDroidKilled(event);

      expect(toMock).toHaveBeenCalledWith('sector:4:2');
      expect(emitMock).toHaveBeenCalledWith(DroidEvents.KILLED, event);
    });

    it('emits droid.killed to the global kills channel', () => {
      const event: DroidKilledEvent = {
        shipId: '@Droid-4',
        shipname: 'Vakory Survey Drone',
        shpclass: 33,
        sector: { x: 7, y: 5 },
        killedBy: 'bob',
        killedAt: Date.now(),
      };

      gateway.handleDroidKilled(event);

      expect(toMock).toHaveBeenCalledWith('kills');
    });

    it('routes mine kills (killedBy: null) to sector room and kills channel', () => {
      const event: DroidKilledEvent = {
        shipId: '@Droid-5',
        shipname: 'Murdonian Transport',
        shpclass: 32,
        sector: { x: 10, y: 6 },
        killedBy: null,
        killedAt: Date.now(),
      };

      gateway.handleDroidKilled(event);

      expect(toMock).toHaveBeenCalledWith('sector:10:6');
      expect(toMock).toHaveBeenCalledWith('kills');
      expect(emitMock).toHaveBeenCalledWith(DroidEvents.KILLED, event);
    });
  });
});
