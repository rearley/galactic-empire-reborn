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
 * Gravity wells and the neutral-zone self-destruct cancel both APPLY their
 * effect inline in the physics tick, but the pilot only learns about them if
 * the notice reaches a socket.
 *
 * C prints GRAVITY1/2/3 (planets) and GRAVWRM1/2/3 (wormholes) as you close on
 * a body (GEFUNCS.C:855-885), and SELFD4 when reaching neutral space cancels an
 * armed countdown (GEFUNCS.C:725-730). Emitting the events onto the internal
 * bus with no listener repeats exactly the mistake that made hyperspace a
 * no-op for the whole life of the port.
 */
describe('GameGateway — gravity and destruct notices reach the pilot', () => {
  const USERID = 'u-grav';

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

  it('warns on the outer gravity band, naming the body', () => {
    const { gateway, roomEmits } = build();
    (gateway as unknown as { handleGravity: (e: unknown) => void }).handleGravity({
      shipId: `${USERID}:1`, plnum: 3, isWormhole: false, band: 1, tickAt: new Date(),
    });
    const notice = roomEmits.find((e) => e.event === 'event.log');
    expect(notice).toBeDefined();
    expect(notice!.room).toBe(`user:${USERID}`);
    expect((notice!.payload as { text: string }).text).toMatch(/3/);
  });

  it('distinguishes a wormhole from a planet', () => {
    const { gateway, roomEmits } = build();
    const g = gateway as unknown as { handleGravity: (e: unknown) => void };
    g.handleGravity({ shipId: `${USERID}:1`, plnum: 1, isWormhole: true, band: 2, tickAt: new Date() });
    g.handleGravity({ shipId: `${USERID}:1`, plnum: 1, isWormhole: false, band: 2, tickAt: new Date() });
    const texts = roomEmits.map((e) => (e.payload as { text: string }).text);
    expect(texts[0]).not.toBe(texts[1]);
    expect(texts[0].toLowerCase()).toContain('wormhole');
  });

  it('escalates through the three bands', () => {
    const { gateway, roomEmits } = build();
    const g = gateway as unknown as { handleGravity: (e: unknown) => void };
    for (const band of [1, 2, 3]) {
      g.handleGravity({ shipId: `${USERID}:1`, plnum: 1, isWormhole: false, band, tickAt: new Date() });
    }
    const texts = roomEmits.map((e) => (e.payload as { text: string }).text);
    expect(new Set(texts).size).toBe(3);
  });

  it('tells the captain which planet is shooting at them', () => {
    const { gateway, roomEmits } = build();
    (gateway as unknown as { handlePlanetIonFired: (e: unknown) => void }).handlePlanetIonFired({
      shipId: `${USERID}:1`, plnum: 2, planetName: 'Wayfarer',
      hullDamage: 70, shieldKnock: 0, shieldsUp: false,
    });
    const notice = roomEmits.find((e) => e.event === 'event.log');
    expect(notice!.room).toBe(`user:${USERID}`);
    expect((notice!.payload as { text: string }).text).toContain('Wayfarer');
    expect((notice!.payload as { text: string }).text).toContain('ION CANNON');
  });

  it('says the shields held when they did', () => {
    const { gateway, roomEmits } = build();
    (gateway as unknown as { handlePlanetIonFired: (e: unknown) => void }).handlePlanetIonFired({
      shipId: `${USERID}:1`, plnum: 2, planetName: 'Wayfarer',
      hullDamage: 3, shieldKnock: 60, shieldsUp: true,
    });
    expect((roomEmits[0].payload as { text: string }).text).toMatch(/Shields absorb/i);
  });

  it('falls back to the planet number when it has no name', () => {
    const { gateway, roomEmits } = build();
    (gateway as unknown as { handlePlanetIonFired: (e: unknown) => void }).handlePlanetIonFired({
      shipId: `${USERID}:1`, plnum: 4, planetName: '',
      hullDamage: 70, shieldKnock: 0, shieldsUp: false,
    });
    expect((roomEmits[0].payload as { text: string }).text).toContain('planet 4');
  });

  it('tells the captain their self-destruct was cancelled by neutral space', () => {
    const { gateway, roomEmits } = build();
    (gateway as unknown as { handleDestructCancelled: (e: unknown) => void }).handleDestructCancelled({
      shipId: `${USERID}:1`, tickAt: new Date(),
    });
    const notice = roomEmits.find((e) => e.event === 'event.log');
    expect(notice).toBeDefined();
    expect(notice!.room).toBe(`user:${USERID}`);
    expect((notice!.payload as { text: string }).text.toLowerCase()).toContain('destruct');
  });
});
