/**
 * Killing a Cybertron does NOT hand you its bank account.
 *
 * CORRECTION 2026-09-06. This file used to be `T059 — gold transfer on
 * Cybertron kill` and asserted the opposite, citing
 * `GECYBS.C:104-105 — Cybertron kill gold transfer`. There is no such transfer
 * at those lines or anywhere else: 104-105 is the middle of `cyb_init`'s
 * name-building block (`strncpy(cybname,"@Cybrg-",UIDSIZ); sprintf(...)`).
 *
 * Canon has exactly three cash sites for a Cybertron, and none of them is a
 * death payout:
 *
 *   GECYBS.C:121-122  clamp to CYB_MAXCASH at init
 *   GECYBS.C:229      cash += CYB_ALLOW, the periodic allowance
 *
 * and in `killem`:
 *
 *   GEFUNCS.C:1137-1139  the flotsam cash grab — COMMENTED OUT in the original
 *   GEFUNCS.C:1200-1210  chgloser, gated on
 *                        `ptr->status == GESTAT_USER && wptr->status == GESTAT_USER`
 *                        — strictly human-versus-human
 *
 * A Cybertron's cash exists so it can BUY things. What a killer is entitled to
 * is the gold in its HOLD, looted through the ordinary flotsam loop and
 * subject to `chkweight` — which is the whole point of the tonnage limit, and
 * which the port already implements in `kill-resolution.ts`.
 *
 * Found in play: three Cybertron kills paid out ~308,000 credits, against
 * ~60,000 for selling 300 flux pods. The clamp allowed up to CYB_MAXCASH —
 * 2,000,000 — from a single kill, so combat was worth more than the entire
 * trading economy by an order of magnitude.
 *
 * @see docs/DECISIONS.md 2026-09-06 — no cash payout for killing a Cybertron
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

/**
 * The repository double records every method the tick service reaches for on a
 * kill. Asserting on the RECORD rather than on a single named spy is
 * deliberate: the defect was a cash-moving call existing at all, so a test that
 * only knew the old method's name would not catch it coming back under another.
 */
function buildHarness() {
  const calls: string[] = [];

  const shipStateService = {
    findAllShips: () => [],
    findByUserid: () => [],
    get: () => undefined,
    mutate: () => undefined,
    loadShip: () => {},
    removeFromGame: () => {},
    size: () => 0,
  } as unknown as ShipStateService;

  const repository = new Proxy({
    hydrateAll: vi.fn().mockResolvedValue(undefined),
    createSpawn: vi.fn().mockResolvedValue(undefined),
    flushShipsImmediate: vi.fn().mockResolvedValue(undefined),
    flushUsersImmediate: vi.fn().mockResolvedValue(undefined),
    clampCybertronCash: (n: bigint) => (n > 2_000_000n ? 2_000_000n : n),
  } as Record<string, unknown>, {
    get(target, prop: string) {
      if (typeof prop === 'string') calls.push(prop);
      return target[prop] ?? (() => Promise.resolve(undefined));
    },
  }) as unknown as CybertronRepository;

  const events = new EventEmitter2();
  const svc = new CybertronTickService(
    { subscribe: () => () => {} } as unknown as TickService,
    shipStateService,
    { get: () => undefined } as unknown as ShipClassCacheService,
    repository,
    events,
    new Mulberry32Adapter(42),
  );
  void svc.onModuleInit();

  return { events, calls };
}

function kill(over: Partial<CombatShipDestroyedEvent> = {}): CombatShipDestroyedEvent {
  return {
    victimId: 'Cybrg-7:7', attackerId: 'player1:1',
    victimShipKey: 'Cybrg-7:7', attackerShipKey: 'player1:1',
    victimUserid: 'Cybrg-7', attackerUserid: 'player1',
    attackerChannel: 1, weapon: 'phaser', sector: { x: 5, y: 5 },
    tickAt: new Date(), loot: [], scoreAwarded: 0,
    ...over,
  } as CombatShipDestroyedEvent;
}

describe('a Cybertron kill moves no cash (GEFUNCS.C:1137-1139, :1200)', () => {
  it('reaches for nothing that transfers the victim\'s bank balance', async () => {
    const { events, calls } = buildHarness();

    events.emit(COMBAT_SHIP_DESTROYED, kill());
    await new Promise((r) => setImmediate(r));

    expect(calls.filter((c) => /gold|cash|transfer/i.test(c))).toEqual([]);
  });

  it('still does nothing for a human victim', async () => {
    const { events, calls } = buildHarness();

    events.emit(COMBAT_SHIP_DESTROYED, kill({ victimUserid: 'player2', victimId: 'player2:2' }));
    await new Promise((r) => setImmediate(r));

    expect(calls.filter((c) => /gold|cash|transfer/i.test(c))).toEqual([]);
  });

  it('the repository exposes no cash-transfer method at all', () => {
    // The type system is the real guard — this catches a re-introduction that
    // typechecks because it was added back with the same shape.
    const names = Object.getOwnPropertyNames(CybertronRepository.prototype);
    expect(names.filter((n) => /transferGold/i.test(n))).toEqual([]);
  });
});
