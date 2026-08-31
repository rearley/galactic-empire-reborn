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
 * Crossing a sector boundary, per GEFUNCS.C:709-723:
 *
 *   prfmsg(MOVE1, from, to); outprfge(FILTER, usrn)   -> the mover, and only them
 *   prfmsg(MOVE2, shipname); outsect(FILTER, &oldsect, usrn, 0)  -> old sector, NOT the mover
 *   prfmsg(MOVE3, shipname); outsect(FILTER, &newsect, usrn, 0)  -> new sector, NOT the mover
 *
 * The port broadcast to both sector rooms with no exclusion, and the mover has
 * just joined the destination room — so a pilot was told "<their own ship> has
 * entered the sector" every time they crossed a line. It also never sent MOVE1,
 * so nothing told the pilot they had changed sector at all, in a game where the
 * sector is the primary spatial fact.
 */
describe('GameGateway — sector transition notices', () => {
  const SHIP_ID = 'u1:1';

  const makeSocket = (id: string) => ({
    id,
    connected: true,
    data: { userid: 'u1', activeShipNo: 1 } as Record<string, unknown>,
    emit: jest.fn(),
    on: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
    broadcast: { emit: jest.fn() },
  });

  const build = (speed = 100) => {
    const moverSocket = makeSocket('sock-mover');
    const roomEmits: Array<{ room: string; event: string; payload: unknown }> = [];

    const mover = {
      userid: 'u1', shipno: 1, shipname: 'Wanderer', speed,
      xcoord: 5.02, ycoord: 3.5,
    };
    const shipStateService = {
      findAllShips: () => [mover],
      findByUserid: () => [mover],
      get: jest.fn().mockReturnValue(mover),
    } as unknown as ShipStateService;

    const registry = new ConnectedShipsRegistry(shipStateService);
    jest.spyOn(registry, 'getSocketId').mockReturnValue(moverSocket.id);

    const gateway = new GameGateway(
      shipStateService,
      { dispatch: jest.fn() } as unknown as CommandRouterService,
      registry,
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
        except: (_id: string) => ({
          emit: (event: string, payload: unknown) => {
            roomEmits.push({ room: `${room}!except`, event, payload });
          },
        }),
      }),
      sockets: { sockets: new Map([[moverSocket.id, moverSocket]]), adapter: { rooms: new Map() } },
    };

    return { gateway, moverSocket, roomEmits };
  };

  const fire = (gateway: GameGateway) =>
    gateway.handleSectorTransition({
      shipId: SHIP_ID,
      fromSector: { x: 4, y: 3 },
      toSector: { x: 5, y: 3 },
      x: 5.02,
      y: 3.5,
    } as never);

  it('tells the mover they changed sector, naming both sectors', () => {
    const { gateway, moverSocket } = build();
    fire(gateway);

    const texts = moverSocket.emit.mock.calls
      .filter((c) => c[0] === 'event.log')
      .map((c) => (c[1] as { text: string }).text);
    expect(texts.join('\n')).toMatch(/\(4, ?3\).*\(5, ?3\)/);
  });

  it('does not tell the mover about their own arrival', () => {
    const { gateway, moverSocket, roomEmits } = build();
    fire(gateway);

    // Either the mover is excluded from the room emit, or the notice never
    // reaches their socket. Both are acceptable; being told about yourself is not.
    const arrivalsToMover = moverSocket.emit.mock.calls.filter(
      (c) => c[0] === 'sector:ship-entered',
    );
    expect(arrivalsToMover).toHaveLength(0);

    const unexcluded = roomEmits.filter(
      (e) => e.event === 'sector:ship-entered' && !e.room.endsWith('!except'),
    );
    expect(unexcluded).toHaveLength(0);
  });

  it('still tells the destination sector that someone arrived', () => {
    const { gateway, roomEmits } = build();
    fire(gateway);

    const arrival = roomEmits.find((e) => e.event === 'sector:ship-entered');
    expect(arrival).toBeDefined();
    expect(arrival!.room).toContain('sector:5:3');
    expect((arrival!.payload as { shipName: string }).shipName).toBe('Wanderer');
  });

  it('still tells the old sector that someone left', () => {
    const { gateway, roomEmits } = build();
    fire(gateway);

    const departure = roomEmits.find((e) => e.event === 'sector:ship-left');
    expect(departure).toBeDefined();
    expect(departure!.room).toContain('sector:4:3');
  });

  it('stays silent at high warp, for the sector and the mover alike', () => {
    // GEFUNCS.C:714 — both notices are gated on speed < 21000.
    const { gateway, moverSocket, roomEmits } = build(21_000);
    fire(gateway);

    expect(roomEmits.filter((e) => e.event.startsWith('sector:ship-'))).toHaveLength(0);
    expect(moverSocket.emit.mock.calls.filter((c) => c[0] === 'event.log')).toHaveLength(0);
  });
});
