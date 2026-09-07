/**
 * KILLEDBY honours the per-user message filter.
 *
 * Canon sends the announcement with `outwar(FILTER, usrn, 0)`
 * (GEFUNCS.C:1117). `outwar` walks every ship and calls
 * `outprfge(filter, zothusn)` (GEMAIN.C:1524-1528), and `outprfge` is where
 * FILTER actually means something:
 *
 *     else
 *     if (class == FILTER && (warusroff(shpno)->options[MSG_FILTER] == TRUE))
 *         {
 *         clrprf();
 *         return;
 *         }
 *
 * — GEMAIN.C:2562-2567. So FILTER is not "always send"; it is "send unless the
 * recipient has options[MSG_FILTER] set", and `clrprf()` throws the composed
 * message away for that user. (`ALWAYS`, by contrast, bypasses the check —
 * GEMAIN.C:2557-2561 — which is why YOURDEAD reaches everyone.)
 * MSG_FILTER is option index 3, GEMAIN.H:236; FILTER is 2, GEMAIN.H:249.
 *
 * The port carried `msgFilter` on ShipState from User.options[3] and then
 * ignored it, broadcasting the kill to every connected client.
 */
import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { CombatShipDestroyedEvent } from '../../src/game/combat/combat-events';
import { mockRandom } from '../fixtures/mock-random';
import { PresenceService } from '../../src/public/presence.service';

describe('GameGateway — KILLEDBY respects MSG_FILTER', () => {
  const build = (ships: Array<{ userid: string; msgFilter: boolean }>) => {
    const logEmits: Array<{ rooms: string[]; text: string }> = [];
    const shipStateService = {
      findAllShips: () => ships.map((s) => ({ ...s, shipno: 1 })),
      findByUserid: () => [],
      removeFromGame: jest.fn(),
      get: () => undefined,
    } as unknown as ShipStateService;

    const gateway = new GameGateway(
      shipStateService,
      { dispatch: jest.fn() } as unknown as CommandRouterService,
      new ConnectedShipsRegistry(shipStateService),
      { validate: jest.fn() } as unknown as WsAuthGuard,
      { $transaction: jest.fn().mockResolvedValue(undefined), shipClass: { findFirst: jest.fn() } } as unknown as PrismaService,
      {} as unknown as OnboardingService,
      { clearScantab: jest.fn() } as unknown as ScanHandlerService,
      { getTypeName: jest.fn() } as never,
      mockRandom,
      { emit: jest.fn(), on: jest.fn() } as never, new PresenceService(),
    );

    let pendingExcept: string[] = [];
    (gateway as unknown as { server: unknown }).server = {
      emit: () => undefined,
      except: (rooms: string | string[]) => {
        pendingExcept = Array.isArray(rooms) ? rooms : [rooms];
        return {
          emit: (event: string, payload: unknown) => {
            if (event === 'event.log') {
              logEmits.push({ rooms: pendingExcept, text: (payload as { text: string }).text });
            }
          },
        };
      },
      to: () => ({ emit: () => undefined }),
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
    return { gateway, logEmits };
  };

  const event: CombatShipDestroyedEvent = {
    victimId: 'usr_abc:2',
    attackerId: 'usr_kil:1',
    victimShipKey: 'usr_abc:2',
    attackerShipKey: 'usr_kil:1',
    victimUserid: 'usr_abc',
    attackerUserid: 'usr_kil',
    attackerName: 'Marauder',
    attackerChannel: 7,
    weapon: null,
    sector: { x: 6, y: 9 },
    tickAt: new Date(),
    loot: [],
    scoreAwarded: 500,
  };

  const fire = (ships: Array<{ userid: string; msgFilter: boolean }>) => {
    const { gateway, logEmits } = build(ships);
    (gateway as unknown as { handleCombatShipDestroyed: (e: unknown) => void })
      .handleCombatShipDestroyed(event);
    return logEmits.find((l) => l.text.includes('was destroyed by'));
  };

  it('excludes a pilot who has MSG_FILTER set', () => {
    const sent = fire([
      { userid: 'usr_quiet', msgFilter: true },
      { userid: 'usr_loud', msgFilter: false },
    ]);
    expect(sent).toBeDefined();
    expect(sent!.rooms).toContain('user:usr_quiet');
  });

  it('still delivers to a pilot who has not set it', () => {
    const sent = fire([
      { userid: 'usr_quiet', msgFilter: true },
      { userid: 'usr_loud', msgFilter: false },
    ]);
    expect(sent!.rooms).not.toContain('user:usr_loud');
  });

  it('still excludes the victim, whatever their filter setting', () => {
    // outwar's own `zothusn != exclude` guard (GEMAIN.C:1524) is independent of
    // the filter class and must survive this change.
    const sent = fire([{ userid: 'usr_abc', msgFilter: false }]);
    expect(sent!.rooms).toContain('user:usr_abc');
  });
});
