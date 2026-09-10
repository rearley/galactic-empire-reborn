/**
 * The pilot who fired is told their torpedo or missile connected.
 *
 * Canon confirms every projectile impact to the FIRER, from `acctm`:
 *
 *   if (channel != 255)
 *     {
 *     prfmsg(MTACC1+mt,shpltr(channel,usrn),ptr->shipname);
 *     outprfge(ALWAYS,channel);
 *     ptr->lastfired = channel;
 *     }
 *
 * `checktm` calls it on both weapons and on both shield branches —
 * GEFUNCS.C:1562 for a torpedo (mt 0) and GEFUNCS.C:1640 and :1659 for a
 * missile (mt 1) — so MTACC1 is "our torpedo has hit ship %c, The %s" and
 * MTACC2 the hyper-missile equivalent. `shpltr(usrn,ship)` reads the FIRST
 * argument's scan table, so the letter is the one the shooter uses for the
 * target, and the name is the target's ship name.
 *
 * The port had both strings extracted into CANON_MESSAGES and sent neither. A
 * phaser firer got PHITHIM or PDEFLECT, so a beam told you what it did, while a
 * torpedo volley told you nothing at all: you watched three tubes empty and
 * learned the result only from the target's next scan.
 *
 * Found on 2026-09-10 while checking a claim that canon's missile impact never
 * sets `lastfired`. It does — through `acctm`, which the earlier reading had
 * missed because the function is defined below the window that was searched.
 * The claim was wrong and this was underneath it.
 *
 * @see GEFUNCS.C:1741 `ptr->lastfired = channel;`
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
import { mockRandom } from '../fixtures/mock-random';
import { PresenceService } from '../../src/public/presence.service';

type Emit = { room: string; event: string; payload: unknown };

function build() {
  const roomEmits: Emit[] = [];
  const shipStateService = {
    findAllShips: () => [],
    findByUserid: () => [],
    get: (userid: string, shipno: number) => {
      if (userid === 'usr_shooter' && shipno === 1) return { userid, shipno, shipname: 'BigCat II' } as never;
      if (userid === 'usr_victim' && shipno === 2) return { userid, shipno, shipname: 'Wasp' } as never;
      return undefined;
    },
  } as unknown as ShipStateService;

  const gateway = new GameGateway(
    shipStateService,
    { dispatch: jest.fn() } as unknown as CommandRouterService,
    new ConnectedShipsRegistry(shipStateService),
    { validate: jest.fn() } as unknown as WsAuthGuard,
    {} as unknown as PrismaService,
    {} as unknown as OnboardingService,
    {
      clearScantab: jest.fn(),
      // The shooter has the victim on scan as 'C'; nobody else has anyone.
      lettersFor: jest.fn((userid: string) =>
        (userid === 'usr_shooter' ? [{ shipKey: 'usr_victim:2', letter: 'C' }] : [])),
    } as unknown as ScanHandlerService,
    { getTypeName: jest.fn() } as never,
    mockRandom,
    { emit: jest.fn(), on: jest.fn() } as never, new PresenceService(),
  );
  (gateway as unknown as { server: unknown }).server = {
    emit: jest.fn(),
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => { roomEmits.push({ room, event, payload }); },
    }),
    sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
  };
  return { gateway, roomEmits };
}

function fire(weapon: 'torpedo' | 'missile' | 'phaser', over: Record<string, unknown> = {}) {
  const { gateway, roomEmits } = build();
  (gateway as unknown as { handleCombatHit: (e: unknown) => void }).handleCombatHit({
    attackerId: 'usr_shooter:1',
    victimId: 'usr_victim:2',
    weapon,
    damageHull: 40,
    damageShield: 0,
    sector: { x: 3, y: 4 },
    tickAt: new Date(),
    ...over,
  });
  return roomEmits.filter((e) => e.room === 'user:usr_shooter' && e.event === 'event.log');
}

const textOf = (e: Emit) => (e.payload as { text: string }).text;

describe('a projectile impact is confirmed to the pilot who fired it', () => {
  it('tells a torpedo firer, by the letter THEY scan the target as', () => {
    const lines = fire('torpedo');
    expect(lines).toHaveLength(1);
    expect(textOf(lines[0])).toContain('torpedo');
    expect(textOf(lines[0])).toContain('C');
    expect(textOf(lines[0])).toContain('Wasp');
  });

  it('tells a missile firer, and calls it a hyper-missile', () => {
    const lines = fire('missile');
    expect(lines).toHaveLength(1);
    expect(textOf(lines[0])).toContain('hyper-missile');
    expect(textOf(lines[0])).toContain('Wasp');
  });

  it('says nothing extra for a phaser, which has its own PHITHIM at the handler', () => {
    expect(fire('phaser')).toHaveLength(0);
  });

  /**
   * `if (channel != 255)` — canon confirms nothing when the firer cannot be
   * resolved. The port marks that case with a `?:<channel>` attacker id, which
   * is what a mine laid by a departed captain looks like.
   */
  it('says nothing when the firer cannot be resolved to a ship', () => {
    const { gateway, roomEmits } = build();
    (gateway as unknown as { handleCombatHit: (e: unknown) => void }).handleCombatHit({
      attackerId: '?:9',
      victimId: 'usr_victim:2',
      weapon: 'torpedo',
      damageHull: 40,
      damageShield: 0,
      sector: { x: 3, y: 4 },
      tickAt: new Date(),
    });
    expect(roomEmits.filter((e) => e.event === 'event.log' && e.room.startsWith('user:?'))).toHaveLength(0);
  });
});
