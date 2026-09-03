import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { mockRandom } from '../fixtures/mock-random';

/**
 * The autopilot disengages on arrival and emits `physics.nav-arrived` — on the
 * internal event bus only. Nothing forwarded it to a socket, so a pilot who set
 * a course simply stopped being steered, with no word that they had got there
 * and no reason to cut their engines. They keep flying straight out the far side.
 */
describe('GameGateway — autopilot arrival reaches the pilot', () => {
  const USERID = 'u-nav';

  const build = () => {
    const roomEmits: Array<{ room: string; event: string; payload: unknown }> = [];
    const shipStateService = {
      findAllShips: () => [],
      findByUserid: () => [],
      get: jest.fn(),
    } as unknown as ShipStateService;

    const gateway = new GameGateway(
      shipStateService,
      { dispatch: jest.fn() } as unknown as CommandRouterService,
      new ConnectedShipsRegistry(shipStateService),
      { validate: jest.fn() } as unknown as WsAuthGuard,
      {} as unknown as PrismaService,
      {} as unknown as OnboardingService,
      { clearScantab: jest.fn() } as unknown as ScanHandlerService,
      { getTypeName: jest.fn() } as never,
      mockRandom,
      { emit: jest.fn(), on: jest.fn() } as never,
    );
    (gateway as unknown as { server: unknown }).server = {
      emit: jest.fn(),
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => { roomEmits.push({ room, event, payload }); },
      }),
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
    return { gateway, roomEmits };
  };

  it('tells the captain they have arrived, naming the sector', () => {
    const { gateway, roomEmits } = build();

    (gateway as unknown as { handleNavArrived: (e: unknown) => void }).handleNavArrived({
      userid: USERID, shipno: 1, x: 7, y: 12,
    });

    const notice = roomEmits.find((e) => e.event === 'event.log');
    expect(notice).toBeDefined();
    expect((notice!.payload as { text: string }).text).toMatch(/\(7, ?12\)/);
  });

  it('sends it to that captain only, not the whole sector', () => {
    const { gateway, roomEmits } = build();

    (gateway as unknown as { handleNavArrived: (e: unknown) => void }).handleNavArrived({
      userid: USERID, shipno: 1, x: 7, y: 12,
    });

    expect(roomEmits[0].room).toBe(`user:${USERID}`);
  });

  it('tells the pilot the engines have stopped, not to stop them', () => {
    // The notice used to read "Cut speed with war 0 / imp 0" — an instruction,
    // because arrival disengaged the helm and left the throttle open. At warp 9
    // a sector takes 43 seconds to cross, so reading that and then reacting
    // meant overshooting. The autopilot now answers stop itself.
    // @see docs/DECISIONS.md — autopilot stops on arrival
    const { gateway, roomEmits } = build();

    (gateway as unknown as { handleNavArrived: (e: unknown) => void }).handleNavArrived({
      userid: USERID, shipno: 1, x: 0, y: 0,
    });

    const text = (roomEmits[0].payload as { text: string }).text;
    expect(text).toMatch(/stop/i);
    expect(text).not.toMatch(/war 0|imp 0/i);
  });
});
