import 'reflect-metadata';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { COMBAT_HIT } from '../../src/game/combat/combat-events';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';

/**
 * A combat notice has to name the attacker in a way the pilot can act on.
 *
 * The client resolved names from the player roster, which deliberately
 * excludes AI ships (`who` lists players only), so every Cybertron hit fell
 * back to the userid half of the ship key: "destroyed by Cybrg-222". The
 * command that would tell you anything about it — `sca sh` — takes the SHIP
 * name, `Cybrg-49340`. The one identifier the game showed you was the one
 * identifier no command accepts.
 *
 * That matters most in exactly the situation where you need it: a Sarten
 * Obliterator sees six sectors to an Interceptor's one and a half, so it opens
 * fire from outside your scanners and the damage line is the first and only
 * thing you learn about it.
 */
describe('GameGateway — combat notices name the attacking SHIP', () => {
  const build = () => {
    const roomEmits: Array<{ room: string; event: string; payload: unknown }> = [];
    const shipStateService = {
      findAllShips: () => [],
      findByUserid: () => [],
      get: (userid: string, shipno: number) => {
        if (userid === 'Cybrg-222' && shipno === 1) return { userid, shipno, shipname: 'Cybrg-49340' } as never;
        if (userid === '@Droid-6' && shipno === 1) return { userid, shipno, shipname: 'Vakory Survey Drone136' } as never;
        return undefined;
      },
    } as unknown as ShipStateService;

    const gateway = makeGateway({
      shipStateService,
      wsAuthGuard: { validate: vi.fn() } as unknown as WsAuthGuard,
      scanHandler: { clearScantab: vi.fn(), lettersFor: vi.fn(() => []) } as unknown as ScanHandlerService,
      random: mockRandom,
    });
    (gateway as unknown as { server: unknown }).server = {
      emit: vi.fn(),
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => { roomEmits.push({ room, event, payload }); },
      }),
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
    return { gateway, roomEmits };
  };

  const hit = {
    attackerId: 'Cybrg-222:1',
    victimId: 'usr_abc:2',
    weapon: 'phaser' as const,
    damageHull: 102,
    damageShield: 0,
    sector: { x: 6, y: 9 },
    tickAt: new Date(),
  };

  it('carries the attacker\'s ship name, the one sca sh accepts', () => {
    const { gateway, roomEmits } = build();
    (gateway as unknown as { handleCombatHit: (e: unknown) => void }).handleCombatHit(hit);

    const sent = roomEmits.find((e) => e.event === COMBAT_HIT);
    expect((sent!.payload as { attackerName?: string }).attackerName).toBe('Cybrg-49340');
  });

  it('leaves the name absent when the attacker is gone, rather than inventing one', () => {
    const { gateway, roomEmits } = build();
    (gateway as unknown as { handleCombatHit: (e: unknown) => void }).handleCombatHit({
      ...hit, attackerId: 'ghost:9',
    });
    const sent = roomEmits.find((e) => e.event === COMBAT_HIT);
    expect((sent!.payload as { attackerName?: string }).attackerName).toBeUndefined();
  });

  it('names the VICTIM ship too, for the line about someone else being hit', () => {
    // The outgoing line ("Corvin-3 hits @Droid-6") had the same defect as the
    // incoming one: the roster excludes AI, so it fell back to the userid.
    const { gateway, roomEmits } = build();
    (gateway as unknown as { handleCombatHit: (e: unknown) => void }).handleCombatHit({
      ...hit, attackerId: 'usr_abc:2', victimId: '@Droid-6:1',
    });
    const sent = roomEmits.find((e) => e.event === COMBAT_HIT);
    expect((sent!.payload as { victimName?: string }).victimName).toBe('Vakory Survey Drone136');
  });

  it('does not disturb the rest of the payload', () => {
    const { gateway, roomEmits } = build();
    (gateway as unknown as { handleCombatHit: (e: unknown) => void }).handleCombatHit(hit);
    const sent = roomEmits.find((e) => e.event === COMBAT_HIT)!.payload as Record<string, unknown>;
    expect(sent.damageHull).toBe(102);
    expect(sent.victimId).toBe('usr_abc:2');
  });
});
