import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { CombatShipDestroyedEvent } from '../../src/game/combat/combat-events';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { makeGateway } from '../helpers/make-gateway';

/**
 * The galaxy-wide death announcement must carry what the client renders, and
 * nothing else.
 *
 * `handleCombatShipDestroyed` built its payload with `{ ...event }` and
 * `server.emit`-ed it to every connected socket. `CombatShipDestroyedEvent` is
 * an INTERNAL structure — it exists to drive score transfer, loot, the ship-loss
 * mail and the forensics log — so that spread put on every client:
 *
 *   sector                  the exact sector of every kill in the galaxy, live
 *   victimUserid            the internal account key: `usr_...`, or `Cybrg-NNN`
 *   victimShipKey           the same, again
 *   attackerUserid          and the killer's
 *   victimDisconnectReason  whether the victim closed the tab or dropped
 *   loot                    what was in the destroyed hull
 *   scoreAwarded, attackerChannel, tickAt
 *
 * The client (App.tsx handleShipDestroyed -> destructionLine) reads four
 * fields: victimId, attackerId, weapon, attackerName. Everything else was
 * unasked-for and three parts of it are the exact disclosures this port has
 * been closing all week — the account key `displayName()` exists to hide
 * (GEFUNCS.C:2596 username), a live position feed, and the disconnect reason
 * that was added for a SYSOP deciding whether to make someone whole.
 *
 * Found by the 2026-09-09 security review (lead, now confirmed).
 * @see docs/audits/2026-09-09-security-review.md
 */
describe('combat.ship-destroyed carries only what the client renders', () => {
  const build = () => {
    const emitted: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const gateway = makeGateway({
      shipStateService: {
        get: () => ({ userid: 'usr_victim', shipno: 2, shipname: 'WildCat', shpclass: 8, status: 1, items: [] }),
        findAllShips: () => [],
        removeFromGame: jest.fn(),
      } as unknown as ShipStateService,
      prisma: { ship: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        user: { update: jest.fn() },
        $transaction: jest.fn().mockResolvedValue(undefined) } as unknown as PrismaService,
      scanHandler: { clearScantab: jest.fn() } as unknown as ScanHandlerService,
      shipClassCache: { getTypeName: () => 'Dreadnought' } as unknown as ShipClassCacheService,
    });
    (gateway as unknown as { server: unknown }).server = {
      emit: (event: string, payload: Record<string, unknown>) => { emitted.push({ event, payload }); },
      to: () => ({ emit: jest.fn(), except: () => ({ emit: jest.fn() }) }),
      except: () => ({ emit: jest.fn() }),
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
    return { gateway, emitted };
  };

  const destroy = (gateway: GameGateway, extra: Partial<CombatShipDestroyedEvent> = {}) =>
    (gateway as unknown as {
      handleCombatShipDestroyed: (e: CombatShipDestroyedEvent) => unknown;
    }).handleCombatShipDestroyed({
      victimId: 'usr_victim:2', attackerId: 'usr_killer:1',
      victimShipKey: 'usr_victim:2', attackerShipKey: 'usr_killer:1',
      victimUserid: 'usr_victim', attackerUserid: 'usr_killer', attackerChannel: 7,
      weapon: 'phaser', sector: { x: -12, y: 40 }, tickAt: new Date(),
      loot: [{ itemIndex: 12, amount: 471n }], scoreAwarded: 1000,
      victimDisconnectReason: 'client namespace disconnect',
      ...extra,
    } as CombatShipDestroyedEvent);

  const announcement = (emitted: Array<{ event: string; payload: Record<string, unknown> }>) =>
    emitted.find((e) => e.event === 'combat.ship-destroyed')?.payload ?? {};

  it('still gives the client the four fields it renders', () => {
    const { gateway, emitted } = build();
    destroy(gateway);
    const p = announcement(emitted);

    expect(p.victimId).toBe('usr_victim:2');
    expect(p.attackerId).toBe('usr_killer:1');
    expect(p.weapon).toBe('phaser');
    expect(p).toHaveProperty('attackerName');
  });

  it('does not broadcast where the kill happened', () => {
    const { gateway, emitted } = build();
    destroy(gateway);

    expect(announcement(emitted)).not.toHaveProperty('sector');
    expect(JSON.stringify(announcement(emitted))).not.toContain('-12');
  });

  it('does not broadcast internal account keys', () => {
    const { gateway, emitted } = build();
    destroy(gateway);
    const p = announcement(emitted);

    expect(p).not.toHaveProperty('victimUserid');
    expect(p).not.toHaveProperty('attackerUserid');
    expect(p).not.toHaveProperty('victimShipKey');
    expect(p).not.toHaveProperty('attackerShipKey');
  });

  it('does not tell the galaxy whether the victim closed their tab', () => {
    // Added for a sysop deciding whether to make someone whole after a bad
    // death. It is not for the other players. @see ship-loss-forensics.spec.ts
    const { gateway, emitted } = build();
    destroy(gateway);

    expect(announcement(emitted)).not.toHaveProperty('victimDisconnectReason');
    expect(JSON.stringify(announcement(emitted))).not.toContain('namespace disconnect');
  });

  it('does not publish the destroyed hull’s cargo', () => {
    const { gateway, emitted } = build();
    destroy(gateway);

    expect(announcement(emitted)).not.toHaveProperty('loot');
    expect(JSON.stringify(announcement(emitted))).not.toContain('471');
  });
});
