import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { CYBERTRON_EVENT } from '../../src/game/cybertron/cybertron-events';
import { mockRandom } from '../fixtures/mock-random';

/**
 * A Cybertron's taunt is the player's ONLY warning that something is stalking
 * them, and it has to reach the pilot being stalked.
 *
 * C sends it with `outprfge(FILTER, usrn)` where `usrn` is the TARGET's
 * terminal (GECYBS.C:398-401) — the taunted pilot, wherever they are. The port
 * broadcast it to `sector:<the Cybertron's sector>` instead.
 *
 * That matters because scan ranges are asymmetric. A Sarten Obliterator sees
 * six sectors and an Interceptor sees one and a half, so the thing hunting you
 * is routinely outside your scanners — `sca sh <name>` answers "out of scanner
 * range" — and it opens fire from there. The taunt is what turns that from an
 * ambush into a warning, and it was being sent to a room the target is not in.
 */
describe('GameGateway — a Cybertron taunt reaches the pilot it is aimed at', () => {
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
    // The taunt goes out as ONE emit chained over two rooms (`.to(a).to(b)`),
    // because two separate emits double-delivered to a target standing in the
    // taunter's sector. The double must therefore model the chain, and record
    // one entry PER ROOM so these assertions keep their meaning.
    (gateway as unknown as { server: unknown }).server = {
      emit: jest.fn(),
      to: function chain(room: string) {
        const rooms = [room];
        const node = {
          to: (r: string) => { rooms.push(r); return node; },
          emit: (event: string, payload: unknown) => {
            for (const r of rooms) roomEmits.push({ room: r, event, payload });
          },
        };
        return node;
      },
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
    return { gateway, roomEmits };
  };

  const taunt = {
    attackerShipKey: 'Cybrg-222:1',
    targetShipKey: 'usr_abc:2',
    message: 'Prepare to be destroyed.',
    // The Cybertron is three sectors away from its target.
    sector: { x: 1, y: -6 },
    tickAt: 1,
  };

  it('delivers the taunt to the targeted pilot, not the attacker\'s sector', () => {
    const { gateway, roomEmits } = build();
    (gateway as unknown as { handleCybertronTaunt: (e: unknown) => void }).handleCybertronTaunt(taunt);

    const rooms = roomEmits.map((e) => e.room);
    expect(rooms).toContain('user:usr_abc');
  });

  it('carries the taunt text so the pilot can read it', () => {
    const { gateway, roomEmits } = build();
    (gateway as unknown as { handleCybertronTaunt: (e: unknown) => void }).handleCybertronTaunt(taunt);

    const toPilot = roomEmits.find((e) => e.room === 'user:usr_abc');
    expect(JSON.stringify(toPilot!.payload)).toContain('Prepare to be destroyed.');
  });

  it('handles a userid containing a colon', () => {
    const { gateway, roomEmits } = build();
    (gateway as unknown as { handleCybertronTaunt: (e: unknown) => void }).handleCybertronTaunt({
      ...taunt, targetShipKey: 'usr:weird:id:3',
    });
    expect(roomEmits.map((e) => e.room)).toContain('user:usr:weird:id');
  });

  it('sends the break-off notice to the pilot too', () => {
    const { gateway, roomEmits } = build();
    (gateway as unknown as { handleCybertronBrokeOff: (e: unknown) => void }).handleCybertronBrokeOff({
      attackerShipKey: 'Cybrg-222:1',
      targetShipKey: 'usr_abc:2',
      sector: { x: 1, y: -6 },
      tickAt: 1,
    });
    expect(roomEmits.map((e) => e.room)).toContain('user:usr_abc');
  });
});
