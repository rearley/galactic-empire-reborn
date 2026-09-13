import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ShipDestroyedService, DestroyedEmitter } from '../../src/gateway/ship-destroyed.service';
import { CombatShipDestroyedEvent } from '../../src/game/combat/combat-events';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { Random } from '../../src/game/combat/random.port';
import { GESTAT_AUTO } from '../../src/game/constants';
import { formatMessage, MessageId } from '../../src/game/commands/messages';

/**
 * The death path, tested without Socket.io.
 *
 * `handleCombatShipDestroyed` was 256 lines on the gateway holding a
 * `prisma.$transaction`. It now lives here, behind a narrow emitter, and this
 * file pins every side effect a ship dying has — enumerated once, one case
 * each, so a future move can be checked against a list rather than a memory.
 *
 * The five specs that already guard death (combat-death-delete,
 * ship-loss-forensics, kill-salvage-report, captured-document and
 * destroyed-payload-scoping) still drive it through the GATEWAY and are
 * untouched. This file is the unit-level complement, not their replacement.
 */

interface EmitterSpy extends DestroyedEmitter {
  roomLines: Array<{ room: string; text: string }>;
  exceptLines: Array<{ rooms: string | string[]; text: string }>;
  announced: unknown[];
  recovered: string[];
  warnings: string[];
  errors: Array<{ message: string; err?: Error }>;
  order: string[];
}

function emitterSpy(): EmitterSpy {
  const spy: EmitterSpy = {
    roomLines: [],
    exceptLines: [],
    announced: [],
    recovered: [],
    warnings: [],
    errors: [],
    order: [],
    toRoom: (room, _category, text) => { spy.order.push('toRoom'); spy.roomLines.push({ room, text }); },
    toAllExcept: (rooms, _category, text) => { spy.order.push('toAllExcept'); spy.exceptLines.push({ rooms, text }); },
    announceDestroyed: (payload) => { spy.order.push('announce'); spy.announced.push(payload); },
    recoverVictim: (userid) => { spy.order.push('recoverVictim'); spy.recovered.push(userid); return Promise.resolve(); },
  };
  return spy;
}

function destroyedEvent(over: Partial<CombatShipDestroyedEvent> = {}): CombatShipDestroyedEvent {
  return {
    victimId: 'usr_victim:2',
    attackerId: 'usr_killer:1',
    victimShipKey: 'usr_victim:2',
    attackerShipKey: 'usr_killer:1',
    victimUserid: 'usr_victim',
    attackerUserid: 'usr_killer',
    attackerName: null,
    attackerChannel: 7,
    weapon: 'phaser',
    sector: { x: -12, y: 40 },
    tickAt: new Date(),
    loot: [{ itemIndex: 12, amount: 471n }],
    scoreAwarded: 1000,
    ...over,
  } as CombatShipDestroyedEvent;
}

const VICTIM = {
  userid: 'usr_victim', shipno: 2, shipname: 'WildCat', shpclass: 8, status: 1,
  phasrtype: 6, shieldtype: 4, username: 'jo',
  items: [0n, 3n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 814n, 0n],
};
const KILLER = { userid: 'usr_killer', shipno: 1, shipname: 'Marauder', status: 1, username: 'rick', items: [] };

interface Doubles {
  ships?: Partial<ShipStateService>;
  prisma?: Record<string, unknown>;
  roll?: number;
}

/**
 * The manifest line and the two error lines go to the SERVICE's own `Logger`,
 * not through the emitter — so `build` routes that logger into the same spy
 * the emitter writes to, keeping `warnings`, `errors` and `order` intact.
 */
function build(over: Doubles = {}, spy?: EmitterSpy) {
  const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const userFindUnique = vi.fn().mockResolvedValue({ noships: 2 });
  const userUpdate = vi.fn().mockResolvedValue(undefined);
  const shipFindFirst = vi.fn().mockResolvedValue(undefined);
  const planetFindMany = vi.fn().mockResolvedValue([]);
  const tx = {
    ship: { deleteMany, findFirst: shipFindFirst },
    user: { findUnique: userFindUnique, update: userUpdate },
  };
  const $transaction = vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx));
  const removeFromGame = vi.fn();
  const clearScantab = vi.fn();

  const ships = {
    get: (userid: string, shipno: number) => {
      if (userid === VICTIM.userid && shipno === VICTIM.shipno) return VICTIM;
      if (userid === KILLER.userid && shipno === KILLER.shipno) return KILLER;
      return undefined;
    },
    findAllShips: () => [],
    removeFromGame,
    ...over.ships,
  } as unknown as ShipStateService;

  const prisma = {
    $transaction,
    planet: { findMany: planetFindMany },
    ...over.prisma,
  } as unknown as PrismaService;

  const service = new ShipDestroyedService(
    prisma,
    ships,
    { clearScantab } as unknown as ScanHandlerService,
    { getTypeName: () => 'Dreadnought' } as unknown as ShipClassCacheService,
    { next: () => over.roll ?? 0 } as unknown as Random,
  );

  const logger = (service as unknown as { logger: Logger }).logger;
  vi.spyOn(logger, 'warn').mockImplementation((message: unknown) => {
    spy?.order.push('warn');
    spy?.warnings.push(String(message));
  });
  vi.spyOn(logger, 'error').mockImplementation((message: unknown, err?: unknown) => {
    spy?.order.push('error');
    spy?.errors.push({ message: String(message), err: err as Error });
  });

  return { service, $transaction, deleteMany, userUpdate, userFindUnique, shipFindFirst, planetFindMany, removeFromGame, clearScantab };
}

describe('ShipDestroyedService — every side effect of a ship dying', () => {
  // 1. scan table
  it('clears the victim’s scan table', async () => {
    const h = build();
    await h.service.handle(destroyedEvent(), emitterSpy());
    expect(h.clearScantab).toHaveBeenCalledWith('usr_victim', 2);
  });

  // 2. forensics manifest
  it('warns the loss manifest, with the hull, its fittings and its cargo', async () => {
    const emit = emitterSpy();
    const h = build({}, emit);
    await h.service.handle(destroyedEvent({ victimDisconnectReason: 'ping timeout' }), emit);
    const line = emit.warnings.join('\n');
    expect(line).toContain('ship destroyed:');
    expect(line).toContain('WildCat');
    expect(line).toContain('class=8');
    expect(line).toContain('phaser=6');
    expect(line).toContain('shield=4');
    expect(line).toMatch(/gold[=:]\s*814/i);
    expect(line).toContain('ping timeout');
  });

  // 3. the hull write
  it('deletes the hull and decrements noships inside ONE transaction', async () => {
    const h = build();
    await h.service.handle(destroyedEvent(), emitterSpy());
    expect(h.$transaction).toHaveBeenCalledTimes(1);
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { userid: 'usr_victim', shipno: 2 } });
    expect(h.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userid: 'usr_victim' }, data: { noships: { decrement: 1 } } }),
    );
  });

  // 3b. AI hulls are the AI layer's business
  it('never deletes an AI hull', async () => {
    const h = build({ ships: { get: () => ({ ...VICTIM, status: GESTAT_AUTO }) } as unknown as Partial<ShipStateService> });
    await h.service.handle(destroyedEvent(), emitterSpy());
    expect(h.deleteMany).not.toHaveBeenCalled();
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  // 3c. a failed write is logged, never thrown
  it('logs a failed hull write instead of taking the kill down with it', async () => {
    const emit = emitterSpy();
    const h = build({ prisma: { $transaction: vi.fn().mockRejectedValue(new Error('deadlock')) } }, emit);
    await h.service.handle(destroyedEvent(), emit);
    expect(emit.errors.map((e) => e.message).join('\n')).toContain('death delete/decrement failed');
  });

  // 4. memory eviction
  it('evicts the hull from the in-memory map', async () => {
    const h = build();
    await h.service.handle(destroyedEvent(), emitterSpy());
    expect(h.removeFromGame).toHaveBeenCalledWith({ userid: 'usr_victim', shipno: 2 });
  });

  // 5 + 6. the structured announcement, and planet attribution
  it('announces the kill with the four fields the client renders, and nothing else', async () => {
    const h = build();
    const emit = emitterSpy();
    await h.service.handle(destroyedEvent(), emit);
    expect(emit.announced).toHaveLength(1);
    const payload = emit.announced[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['attackerId', 'attackerName', 'victimId', 'weapon']);
    expect(payload.weapon).toBe('phaser');
    expect(payload.attackerName).toBe('Marauder');
  });

  it('names a colony’s ion cannons as the killer when nothing else fired', async () => {
    const h = build();
    const emit = emitterSpy();
    // The service owns the ion-hit ledger now; the gateway's PLANET_ION_FIRED
    // handler is what calls this on every hit.
    h.service.recordIonAttacker('usr_victim:2', 'Ceti Alpha');
    await h.service.handle(destroyedEvent({ attackerId: null, attackerUserid: null, attackerShipKey: null, weapon: null }), emit);
    const payload = emit.announced[0] as Record<string, unknown>;
    expect(payload.weapon).toBe('ion');
    expect(payload.attackerName).toBe('Ceti Alpha');
  });

  // 7. KILLEDBY / DIED
  it('announces KILLEDBY to the galaxy, excluding the victim and anyone filtering', async () => {
    const h = build({ ships: {
      findAllShips: () => ([{ userid: 'usr_quiet', msgFilter: true }]),
    } as unknown as Partial<ShipStateService> });
    const emit = emitterSpy();
    await h.service.handle(destroyedEvent(), emit);
    expect(emit.exceptLines).toHaveLength(1);
    expect(emit.exceptLines[0].text).toBe(formatMessage(MessageId.KILLEDBY, 'jo', 'rick'));
    expect(emit.exceptLines[0].rooms).toEqual(['user:usr_victim', 'user:usr_quiet']);
  });

  it('announces DIED, excluding only the victim, when no ship killed them', async () => {
    const h = build();
    const emit = emitterSpy();
    await h.service.handle(destroyedEvent({ attackerId: null, attackerUserid: null, attackerShipKey: null, weapon: 'gravity' }), emit);
    expect(emit.exceptLines).toHaveLength(1);
    expect(emit.exceptLines[0].text).toBe(formatMessage(MessageId.DIED, 'WildCat', 'jo'));
    expect(emit.exceptLines[0].rooms).toBe('user:usr_victim');
  });

  // 8. the captured document
  it('hands the victor the victim’s colony list, one kill in six', async () => {
    const h = build({ prisma: { planet: { findMany: vi.fn().mockResolvedValue([
      { name: 'Colony 1', xsect: 1, ysect: -1, plnum: 1 },
    ]) } } });
    const emit = emitterSpy();
    await h.service.handle(destroyedEvent(), emit);
    await new Promise((r) => setImmediate(r));
    const toKiller = emit.roomLines.filter((l) => l.room === 'user:usr_killer');
    expect(toKiller[0].text).toBe(formatMessage(MessageId.CAPTURED_DOC));
    expect(toKiller.map((l) => l.text).join('\n')).toContain('Colony 1');
  });

  it('says nothing about colonies on the other five kills in six', async () => {
    const h = build({ roll: 0.5 });
    const emit = emitterSpy();
    await h.service.handle(destroyedEvent(), emit);
    await new Promise((r) => setImmediate(r));
    expect(h.planetFindMany).not.toHaveBeenCalled();
    expect(emit.roomLines.filter((l) => l.room === 'user:usr_killer')).toHaveLength(0);
  });

  // 9. YOURDEAD
  it('tells the pilot who died that they survived', async () => {
    const h = build();
    const emit = emitterSpy();
    await h.service.handle(destroyedEvent(), emit);
    const toVictim = emit.roomLines.filter((l) => l.room === 'user:usr_victim');
    expect(toVictim.map((l) => l.text)).toContain(formatMessage(MessageId.YOURDEAD));
  });

  // 10. recovery
  it('asks for the victim to be re-seated, after the hull write has begun', async () => {
    const h = build();
    const emit = emitterSpy();
    await h.service.handle(destroyedEvent(), emit);
    expect(emit.recovered).toEqual(['usr_victim']);
  });

  // 1-11. the ORDER, which is wire-visible and was the thing most at risk
  it('does all of it in the order the wire already depended on', async () => {
    // Ordering is the property a 256-line move breaks silently: every case
    // above still passes if `announceDestroyed` is moved below the KILLEDBY
    // block, and clients would then get the narration before the structured
    // event. This pins the whole sequence, transaction included.
    //
    // The expected array is the sequence OBSERVED before the move, not a
    // sequence anyone thinks is nicer.
    const emit = emitterSpy();
    const h = build({ prisma: { $transaction: vi.fn(async () => { emit.order.push('transaction'); }) } }, emit);

    await h.service.handle(destroyedEvent(), emit);

    expect(emit.order).toEqual([
      'warn',          // the loss manifest, while the hull is still in memory
      'transaction',   // the hull write, started but not awaited
      'announce',      // combat.ship-destroyed, the structured announcement
      'toAllExcept',   // KILLEDBY, galaxy-wide
      'toRoom',        // YOURDEAD, to the pilot who just died
      'recoverVictim', // ...and only then re-seat them, never before
    ]);
  });

  // 11. the awaitable
  it('returns a promise that settles only once the hull write is done', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let finished = false;
    const h = build({ prisma: { $transaction: vi.fn(async () => { await gate; finished = true; }) } });

    const returned = h.service.handle(destroyedEvent(), emitterSpy());
    expect(returned).toBeInstanceOf(Promise);
    expect(finished).toBe(false);
    release?.();
    await returned;
    expect(finished).toBe(true);
  });
});
