import { GameGateway } from '../../src/gateway/game.gateway';
import { CombatShipDestroyedEvent } from '../../src/game/combat/combat-events';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { makeGateway } from '../helpers/make-gateway';

/**
 * A destroyed hull is DELETED, canon's `gepdb(GEDELETE)`, and nothing recorded
 * what was on it. The ship-loss mail carries the cause, the sector and the
 * killer's name, but hardcodes `cash: 0n` and `itemqty: []`; the server log
 * said only `ship destroyed: victim=… attacker=…`. So a sysop asked to make
 * someone whole after a bad death had no way to learn what they lost — not the
 * hull class, not the phaser or shield marks, which are the expensive part,
 * not the gold in the hold.
 *
 * Worse for the case this exists for: `client.data.disconnectReason` tells us
 * whether the pilot CLOSED THE TAB or their network dropped —
 * 'client namespace disconnect' versus 'ping timeout' / 'transport close' —
 * and all four are lumped into CLIENT_SIDE_REASONS, the cantexit kill fires,
 * and the reason is discarded one line before it would have been evidence.
 *
 * This pins the manifest, because a deploy, a flaky connection or (Rick's
 * words) call waiting should be recoverable.
 */
describe('ship-loss forensics — the log must be enough to restore from', () => {
  const VICTIM = {
    userid: 'usr_victim', shipno: 2, shipname: 'WildCat', shpclass: 8,
    phasrtype: 6, shieldtype: 4, damage: 71, energy: 52_300,
    items: [0n, 3n, 12n, 0n, 5n, 40n, 0n, 2n, 0n, 0n, 1n, 9n, 814n, 0n],
    username: 'rick', xcoord: -4.2, ycoord: 5.9,
  };

  function build() {
    const logs: string[] = [];
    const gateway = makeGateway({
      shipStateService: {
        get: (userid: string, shipno: number) =>
          userid === VICTIM.userid && shipno === VICTIM.shipno ? VICTIM : undefined,
        findAllShips: () => [VICTIM],
        removeFromGame: jest.fn(),
      } as unknown as ShipStateService,
      prisma: { ship: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        user: { update: jest.fn() },
        $transaction: jest.fn().mockResolvedValue(undefined) } as unknown as PrismaService,
      scanHandler: { clearScantab: jest.fn() } as unknown as ScanHandlerService,
      shipClassCache: { getTypeName: () => 'Dreadnought' } as unknown as ShipClassCacheService,
    });
    const logger = (gateway as unknown as { logger: { log: (m: string) => void; warn: (m: string) => void } }).logger;
    logger.log = (m: string) => { logs.push(m); };
    logger.warn = (m: string) => { logs.push(m); };
    (gateway as unknown as { server: unknown }).server = {
      to: () => ({ emit: jest.fn() }), except: () => ({ emit: jest.fn() }), emit: jest.fn(),
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
    return { gateway, logs };
  }

  function destroy(gateway: GameGateway, extra: Partial<CombatShipDestroyedEvent> = {}) {
    (gateway as unknown as {
      handleCombatShipDestroyed: (e: CombatShipDestroyedEvent) => void;
    }).handleCombatShipDestroyed({
      victimId: 'usr_victim:2', attackerId: null,
      victimShipKey: 'usr_victim:2', attackerShipKey: null,
      victimUserid: 'usr_victim', attackerUserid: null, attackerChannel: -1,
      weapon: 'gravity', sector: { x: -4, y: 5 }, tickAt: new Date(),
      loot: [], scoreAwarded: 0,
      ...extra,
    } as CombatShipDestroyedEvent);
  }

  it('records the hull and its fittings, not just that something died', () => {
    const { gateway, logs } = build();
    destroy(gateway);
    const line = logs.find((l) => l.includes('ship destroyed')) ?? '';

    expect(line).toContain('WildCat');
    expect(line).toContain('class=8');
    // The upgrades are the expensive part — a Mark-6 phaser is 253,333 credits
    // of trade-ins. Losing them silently is the costly half of a bad death.
    expect(line).toContain('phaser=6');
    expect(line).toContain('shield=4');
  });

  it('records the cargo, so gold in the hold is recoverable', () => {
    const { gateway, logs } = build();
    destroy(gateway);
    const line = logs.find((l) => l.includes('ship destroyed')) ?? '';
    // 814 gold at 1000 cr is 814,000 credits — most of a Dreadnought.
    expect(line).toMatch(/gold[=:]\s*814/i);
  });

  it('records the cause, so a collision is not mistaken for a killing', () => {
    const { gateway, logs } = build();
    destroy(gateway, { weapon: 'gravity' });
    expect(logs.find((l) => l.includes('ship destroyed')) ?? '').toContain('gravity');
  });

  it('distinguishes a closed tab from a dropped connection', () => {
    // THE point of the exercise. Same kill, opposite verdicts.
    const rage = build();
    destroy(rage.gateway, { victimDisconnectReason: 'client namespace disconnect' });
    expect(rage.logs.find((l) => l.includes('ship destroyed')) ?? '')
      .toContain('client namespace disconnect');

    const dropped = build();
    destroy(dropped.gateway, { victimDisconnectReason: 'ping timeout' });
    expect(dropped.logs.find((l) => l.includes('ship destroyed')) ?? '')
      .toContain('ping timeout');
  });

  it('still logs a usable line when the hull is already out of memory', () => {
    // Races and AI victims: never throw, and never lose the identity.
    const logs: string[] = [];
    const gateway = makeGateway({
      shipStateService: { get: () => undefined, findAllShips: () => [], removeFromGame: jest.fn() } as unknown as ShipStateService,
      prisma: { ship: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        user: { update: jest.fn() },
        $transaction: jest.fn().mockResolvedValue(undefined) } as unknown as PrismaService,
      scanHandler: { clearScantab: jest.fn() } as unknown as ScanHandlerService,
      shipClassCache: { getTypeName: () => undefined } as unknown as ShipClassCacheService,
    });
    const logger = (gateway as unknown as { logger: { log: (m: string) => void; warn: (m: string) => void } }).logger;
    logger.log = (m: string) => { logs.push(m); };
    logger.warn = (m: string) => { logs.push(m); };
    (gateway as unknown as { server: unknown }).server = {
      to: () => ({ emit: jest.fn() }), except: () => ({ emit: jest.fn() }), emit: jest.fn(),
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
    destroy(gateway);
    expect(logs.find((l) => l.includes('ship destroyed')) ?? '').toContain('usr_victim:2');
  });
});

/**
 * The hull DELETE must be awaitable, or the shutdown drain cannot wait for it.
 *
 * `handleCombatShipDestroyed` fires its transaction with `void` — right for a
 * live tick, which must not block on Postgres. But at shutdown that write is
 * racing process exit, and losing means the row survives at damage >= 100 and
 * the next boot re-kills the ship with nobody left to credit. That is the
 * production incident this exists to prevent.
 *
 * CombatTickService's drain uses `emitAsync`, which awaits whatever the
 * listeners RETURN — so the handler has to hand its write back.
 * @see combat-tick.service.ts beforeApplicationShutdown
 */
describe('handleCombatShipDestroyed — awaitable by the shutdown drain', () => {
  it('returns a promise that settles only once the hull write is done', async () => {
    let resolveTx: (() => void) | undefined;
    const txDone = new Promise<void>((r) => { resolveTx = r; });
    let finished = false;

    const prisma = {
      $transaction: jest.fn().mockImplementation(async () => {
        await txDone;
        finished = true;
      }),
      shipClass: { findFirst: jest.fn() },
    };

    const gateway = makeGateway({
      shipStateService: {
        get: () => ({ userid: 'usr_victim', shipno: 2, shipname: 'WildCat', shpclass: 8, status: 1, items: [] }),
        findAllShips: () => [],
        removeFromGame: jest.fn(),
      } as unknown as ShipStateService,
      prisma: prisma as unknown as PrismaService,
      scanHandler: { clearScantab: jest.fn() } as unknown as ScanHandlerService,
      shipClassCache: { getTypeName: () => 'Dreadnought' } as unknown as ShipClassCacheService,
    });
    (gateway as unknown as { server: unknown }).server = {
      to: () => ({ emit: jest.fn() }), except: () => ({ emit: jest.fn() }), emit: jest.fn(),
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
    const returned = (gateway as unknown as {
      handleCombatShipDestroyed: (e: unknown) => unknown;
    }).handleCombatShipDestroyed({
      victimId: 'usr_victim:2', attackerId: null,
      victimShipKey: 'usr_victim:2', attackerShipKey: null,
      victimUserid: 'usr_victim', attackerUserid: null, attackerChannel: -1,
      weapon: null, sector: { x: -4, y: 5 }, tickAt: new Date(),
      loot: [], scoreAwarded: 0,
    });

    expect(returned).toBeInstanceOf(Promise);
    expect(finished).toBe(false);
    resolveTx?.();
    await returned;
    expect(finished).toBe(true);
  });
});
