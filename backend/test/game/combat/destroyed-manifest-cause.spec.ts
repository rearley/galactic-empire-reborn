/**
 * Every death names what ended it, or says honestly that it does not know.
 *
 * #52 gave the manifest the WEAPON that landed the killing blow. Everything
 * that kills a ship without a weapon kept printing `cause=unknown`, and several
 * of those are ordinary ways to die: flying into the galaxy's edge, a wormhole
 * transit, riding an overspeed break down to zero hull, and the neutral-zone
 * self-zap that answers a pilot who opens fire at the origin.
 *
 * Two fields were answering adjacent questions, which is how #52 happened in
 * the first place. They are now separated by meaning rather than by history:
 *
 *   `lastWeapon`  — what SHOT you. Stamped where damage lands, beside `lastfired`.
 *   `deathCause`  — what ENDED you, when it was not another captain's weapon.
 *
 * `deathCause` outranks `lastWeapon` at resolution, because it is the more
 * specific fact: a ship grazed by a torpedo and then flown into a planet was
 * killed by the planet. The emitted field is `cause`, which is what the
 * forensics manifest has printed since #52 — only the field name still said
 * `weapon`, and that mismatch is what made "what shot you" and "what ended you"
 * ambiguous every time somebody read it.
 *
 * `unknown` survives deliberately. Once every path stamps something it stops
 * meaning "nobody bothered" and starts meaning "we genuinely do not know",
 * which is the signal worth having when the disconnect-window sample in #50 is
 * re-read.
 *
 * @see https://github.com/rearley/galactic-empire-reborn/issues/54
 * @see test/game/combat/destroyed-manifest-weapon.spec.ts — the weapon half
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { CombatTickService } from '../../../src/game/combat/combat-tick.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../../../src/game/combat/combat-events';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'T',
    energy: 50000,
    topspeed: 10,
    channel: over.channel ?? over.shipno ?? 1,
    ...over,
  });
}

async function makeHarness(ships: ShipState[], seed = 99) {
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(shipKey(userid, shipno));
      if (!s) return undefined;
      fn(s);
      s.dirty = true;
      return s;
    },
    removeFromGame: (ship: { userid: string; shipno: number }) => {
      shipMap.delete(shipKey(ship.userid, ship.shipno));
    },
  } as unknown as import('../../../src/game/ship/ship-state.service').ShipStateService;

  const subscribers: Array<(c: TickContext) => void> = [];
  const tickService = {
    subscribe: (_kind: TickKind, h: (c: TickContext) => void) => {
      subscribers.push(h);
      return () => {};
    },
    registerSnapshotProvider: vi.fn(),
  } as unknown as import('../../../src/game/tick/tick.service').TickService;

  const mineRepo = {
    findAllActive: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    delete: vi.fn(),
  } as unknown as MineRepository;

  const events = new EventEmitter2();
  const logger = new Logger('DestroyedManifestCauseSpec');
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);

  const classCache = new ShipClassCacheService({} as never);
  classCache.setForTest(1, {
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange: 100000, maxTons: 5000,
  } as never);

  const service = new CombatTickService(
    tickService, shipState, mineRepo, new MineRegistry(),
    new Mulberry32Adapter(seed), events, logger, classCache,
  );
  await service.onModuleInit();

  const destroyed: CombatShipDestroyedEvent[] = [];
  events.on(COMBAT_SHIP_DESTROYED, (e: CombatShipDestroyedEvent) => destroyed.push(e));

  return {
    destroyed,
    fire: () => {
      const ctx: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };
      for (const h of subscribers) h(ctx);
    },
  };
}

/** A victim one hit from death, with an inbound projectile already resolved. */
function victimAt95(over: Partial<ShipState>): ShipState {
  return makeShip({
    userid: 'v', shipno: 2, xcoord: 0, ycoord: 0,
    shield: 0, shieldstat: 0, damage: 95,
    ...over,
  });
}

describe('the destruction manifest names a non-weapon cause', () => {
  const CAUSES = [
    { kind: 'overspeed' as const, what: 'structural failure', label: 'an overspeed break' },
    { kind: 'teleport' as const, what: 'the galactic rim', label: 'the perimeter wall' },
    { kind: 'wormhole' as const, what: 'wormhole 3', label: 'a wormhole transit' },
    { kind: 'neutral-zone' as const, what: 'neutral zone', label: 'the neutral-zone zap' },
  ];

  for (const c of CAUSES) {
    it(`${c.label} reports cause=${c.kind}`, async () => {
      const victim = victimAt95({ damage: 101, deathCause: { kind: c.kind, what: c.what } });
      const h = await makeHarness([victim]);
      h.fire();

      expect(h.destroyed).toHaveLength(1);
      expect(h.destroyed[0].cause).toBe(c.kind);
    });

    it(`${c.label} outranks a weapon that only grazed the hull`, async () => {
      // The same precedence gravity already had, for the same reason: the
      // specific fact wins over the last weapon to touch the hull.
      const victim = victimAt95({
        damage: 101,
        lastWeapon: 'torpedo',
        deathCause: { kind: c.kind, what: c.what },
      });
      const h = await makeHarness([victim]);
      h.fire();

      expect(h.destroyed[0].cause).toBe(c.kind);
    });
  }

  it('still reports null when nothing recorded anything at all', async () => {
    // `unknown` on the manifest, and now it means it.
    const victim = victimAt95({ damage: 101 });
    const h = await makeHarness([victim]);
    h.fire();

    expect(h.destroyed[0].cause).toBeNull();
  });
});
