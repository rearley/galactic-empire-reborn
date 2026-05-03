/**
 * T059 — Gold transfer on Cybertron kill.
 * Emit combat.ship-destroyed with Cybrg-* victim; assert transferGold called.
 *
 * @see GECYBS.C:104-105 — Cybertron kill gold transfer
 * @see specs/007-cybertron-ai/tasks.md T059
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { COMBAT_SHIP_DESTROYED } from '../../../src/game/combat/combat-events';
import type { CombatShipDestroyedEvent } from '../../../src/game/combat/combat-events';

function buildHarness() {
  const rand = new Mulberry32Adapter(42);
  const events = new EventEmitter2();

  const shipStateService = {
    findAllShips: () => [],
    findByUserid: () => [],
    get: () => undefined,
    mutate: () => undefined,
    loadShip: () => {},
    removeFromGame: () => {},
    size: () => 0,
  } as unknown as ShipStateService;

  const shipClassCache = {
    get: () => undefined,
  } as unknown as ShipClassCacheService;

  const transferGoldMock = jest.fn().mockResolvedValue(undefined);
  const repository = {
    hydrateAll: jest.fn().mockResolvedValue(undefined),
    createSpawn: jest.fn().mockResolvedValue(undefined),
    flushShipsImmediate: jest.fn().mockResolvedValue(undefined),
    flushUsersImmediate: jest.fn().mockResolvedValue(undefined),
    clampCybertronCash: (n: bigint) => n > 2_000_000n ? 2_000_000n : n,
    transferGold: transferGoldMock,
  } as unknown as CybertronRepository;

  const tickService = {
    subscribe: (_: unknown, fn: (ctx: unknown) => void) => { void fn; return () => {}; },
  } as unknown as TickService;

  const svc = new CybertronTickService(
    tickService, shipStateService, shipClassCache, repository, events, rand,
  );
  svc.onModuleInit();

  return { events, transferGoldMock };
}

describe('T059 — gold transfer on Cybertron kill', () => {
  it('transfers gold from Cybrg-* victim to attacker on combat.ship-destroyed', async () => {
    const { events, transferGoldMock } = buildHarness();

    const event: CombatShipDestroyedEvent = {
      victimId: 'Cybrg-7:7',
      attackerId: 'player1:1',
      victimShipKey: 'Cybrg-7:7',
      attackerShipKey: 'player1:1',
      victimUserid: 'Cybrg-7',
      attackerUserid: 'player1',
      attackerChannel: 1,
      weapon: 'phaser',
      sector: { x: 5, y: 5 },
      tickAt: new Date(),
    };

    events.emit(COMBAT_SHIP_DESTROYED, event);
    await new Promise((r) => setImmediate(r));

    expect(transferGoldMock).toHaveBeenCalledWith('Cybrg-7', 'player1');
  });

  it('does NOT transfer gold when victim is a human player (non-Cybrg-)', async () => {
    const { events, transferGoldMock } = buildHarness();

    const event: CombatShipDestroyedEvent = {
      victimId: 'player2:2',
      attackerId: 'player1:1',
      victimShipKey: 'player2:2',
      attackerShipKey: 'player1:1',
      victimUserid: 'player2',
      attackerUserid: 'player1',
      attackerChannel: 1,
      weapon: 'phaser',
      sector: { x: 5, y: 5 },
      tickAt: new Date(),
    };

    events.emit(COMBAT_SHIP_DESTROYED, event);
    await new Promise((r) => setImmediate(r));

    expect(transferGoldMock).not.toHaveBeenCalled();
  });

  it('handles Sartern victim (Cybrg- prefix) same as Cybertron', async () => {
    const { events, transferGoldMock } = buildHarness();

    // Sartern uses Cybrg- prefix per GECYBS.C:104-105
    const event: CombatShipDestroyedEvent = {
      victimId: 'Cybrg-250:250',
      attackerId: 'player1:1',
      victimShipKey: 'Cybrg-250:250',
      attackerShipKey: 'player1:1',
      victimUserid: 'Cybrg-250',
      attackerUserid: 'player1',
      attackerChannel: 1,
      weapon: 'torpedo',
      sector: { x: 10, y: 8 },
      tickAt: new Date(),
    };

    events.emit(COMBAT_SHIP_DESTROYED, event);
    await new Promise((r) => setImmediate(r));

    expect(transferGoldMock).toHaveBeenCalledWith('Cybrg-250', 'player1');
  });

  it('skips transfer when attacker is null (killed by mine/unknown)', async () => {
    const { events, transferGoldMock } = buildHarness();

    const event: CombatShipDestroyedEvent = {
      victimId: 'Cybrg-7:7',
      attackerId: null,
      victimShipKey: 'Cybrg-7:7',
      attackerShipKey: null,
      victimUserid: 'Cybrg-7',
      attackerUserid: null,
      attackerChannel: 255,
      weapon: 'mine',
      sector: { x: 5, y: 5 },
      tickAt: new Date(),
    };

    events.emit(COMBAT_SHIP_DESTROYED, event);
    await new Promise((r) => setImmediate(r));

    expect(transferGoldMock).not.toHaveBeenCalled();
  });
});
