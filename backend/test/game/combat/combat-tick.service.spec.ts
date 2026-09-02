import { TDAMMAX, PENGUSE, MISSILE_CHARGE_MAX } from '../../../src/game/constants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { CombatTickService } from '../../../src/game/combat/combat-tick.service';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import { MineRepository } from '../../../src/game/combat/mine.repository';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { ShipState, shipKey } from '../../../src/game/ship/ship-state.types';
import { TickContext, TickKind } from '../../../src/game/tick/tick.types';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { PhaserHandlerService } from '../../../src/game/commands/handlers/phaser.handler';
import { CommandResult, CommandContext } from '../../../src/game/commands/command.types';
import {
  COMBAT_DECOY_INTERCEPT,
  COMBAT_HIT,
  COMBAT_SUBSYSTEM_DAMAGED,
  CombatDecoyInterceptEvent,
  CombatHitEvent,
  CombatSubsystemDamagedEvent,
} from '../../../src/game/combat/combat-events';
import {
  DECOYTIME,
  FIRETICKS,
  MISLSPED,
  PRELOAD,
  TORPSPED,
} from '../../../src/game/constants';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'T', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
    // A ship in the game holds a unique `channel` (this port's usrnum) and
    // attribution reads it, not `shipno`. These fixtures stage firer and victim
    // by giving each a distinct shipno, so mirror it into channel.
    channel: over.channel ?? over.shipno ?? 1,
  };
}

interface Harness {
  service: CombatTickService;
  shipMap: Map<string, ShipState>;
  events: EventEmitter2;
  classCache: ShipClassCacheService;
  shipState: import('../../../src/game/ship/ship-state.service').ShipStateService;
  fire(): Promise<void>;
}

async function makeHarness(ships: ShipState[] = []): Promise<Harness> {
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
  } as unknown as import('../../../src/game/ship/ship-state.service').ShipStateService;

  const subscribers: Array<(c: TickContext) => void> = [];
  const tickService = {
    subscribe: (_kind: TickKind, h: (c: TickContext) => void) => {
      subscribers.push(h);
      return () => {};
    },
    registerSnapshotProvider: jest.fn(),
  } as unknown as import('../../../src/game/tick/tick.service').TickService;

  const mineRepo = {
    findAllActive: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    delete: jest.fn(),
  } as unknown as MineRepository;

  const mineRegistry = new MineRegistry();
  const events = new EventEmitter2();
  const logger = new Logger('CombatTickServiceSpec');
  // Suppress error noise from fault-isolation case.
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);

  const classCache = new ShipClassCacheService({} as never);
  classCache.setForTest(1, {
    maxAcceleration: 1000,
    maxWarp: 10,
    maxPhaser: 1000,
    scanRange: 100000,
    maxTons: 5000,
  } as never);

  const service = new CombatTickService(
    tickService,
    shipState,
    mineRepo,
    mineRegistry,
    new Mulberry32Adapter(1),
    events,
    logger,
    classCache,
  );
  await service.onModuleInit();

  return {
    service,
    shipMap,
    events,
    classCache,
    shipState,
    fire: async () => {
      const ctx: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };
      for (const h of subscribers) h(ctx);
    },
  };
}

describe('CombatTickService', () => {
  it('does not throw on empty ship map', async () => {
    const h = await makeHarness([]);
    await expect(h.fire()).resolves.not.toThrow();
  });

  it('processes a single ship without error', async () => {
    const h = await makeHarness([makeShip()]);
    await expect(h.fire()).resolves.not.toThrow();
  });

  it('isolates faults — one ship throwing does not abort the batch', async () => {
    const h = await makeHarness([
      makeShip({ userid: 'a', shipno: 1 }),
      makeShip({ userid: 'b', shipno: 1 }),
      makeShip({ userid: 'c', shipno: 1 }),
    ]);
    let calls = 0;
    // Patch processShipCombat to throw on the middle ship.
    const proto = h.service as unknown as { processShipCombat: (s: ShipState, c: TickContext) => void };
    proto.processShipCombat = (ship: ShipState) => {
      calls += 1;
      if (ship.userid === 'b') throw new Error('boom');
    };
    await h.fire();
    expect(calls).toBe(3);
  });

  it('hydrates the mine registry from the repository on init', async () => {
    const h = await makeHarness([]);
    expect(h.service).toBeDefined();
  });
});

describe('CombatTickService — phaser interaction (T018)', () => {
  it('after handler fires and tick runs, victim shield/damage mutate and combat.hit fires; phasr reloads on next tick', async () => {
    // Alice heading 0 (north). Bearing 0 = straight ahead = north. Bob north of Alice (y decreases northward).
    // Positioned off the neutral-zone origin (0,0) — firing in the NZ self-zaps the firer.
    const alice = makeShip({ userid: 'a', shipno: 1, shipname: 'Alice', xcoord: 0, ycoord: 7, phasr: 100, phasrtype: 1 });
    const bob = makeShip({
      userid: 'b', shipno: 2, shipname: 'Bob',
      xcoord: 0, ycoord: 6.99, shield: 5000, shieldstat: 1, damage: 0, phasr: 100, phasrtype: 1,
    });
    const h = await makeHarness([alice, bob]);

    const emitted: Array<{ event: string; payload: unknown }> = [];
    h.events.onAny((event: string | string[], payload: unknown) => {
      const ev = Array.isArray(event) ? event.join('.') : event;
      emitted.push({ event: ev, payload });
    });

    const handler = new PhaserHandlerService(
      h.shipState,
      h.classCache,
      h.events,
      new Mulberry32Adapter(7),
    );

    // `pha <degree -180..180> [focus 0-5]`: degree 0 = dead ahead (north), focus 1.
    // Bob sits 0.01 sectors dead ahead → inside the focus+PHABIAS arc and well
    // within the phasrtype-1 falloff range, so a hit lands.
    const result = handler.command.handler(alice, ['0', '1'], {} as CommandContext) as CommandResult;
    expect(result.lines.length).toBeGreaterThan(0);

    // Mutation visible after handler call
    expect(bob.shield).toBeLessThan(5000);
    const hit = emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeDefined();
    expect((hit!.payload as CombatHitEvent).victimId).toBe(shipKey('b', 2));
    expect((hit!.payload as CombatHitEvent).attackerId).toBe(shipKey('a', 1));

    // Drive a physics tick; phasr reloads only when < 100 (cap is 100, not class max)
    const phasrBefore = alice.phasr;
    await h.fire();
    expect(alice.phasr).toBe(Math.min(100, phasrBefore + PRELOAD));
    // Bob's phasr starts at 100 (full) so no reload occurs
    expect(bob.phasr).toBe(100);
  });
});

describe('CombatTickService — projectile travel pass (T029)', () => {
  // We need a parameterised harness so we can control the PRNG seed for
  // deterministic decoy-intercept outcomes.
  async function makeHarnessSeeded(
    ships: ShipState[],
    seed: number,
  ): Promise<Harness> {
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
    } as unknown as import('../../../src/game/ship/ship-state.service').ShipStateService;

    const subscribers: Array<(c: TickContext) => void> = [];
    const tickService = {
      subscribe: (_kind: TickKind, h: (c: TickContext) => void) => {
        subscribers.push(h);
        return () => {};
      },
      registerSnapshotProvider: jest.fn(),
    } as unknown as import('../../../src/game/tick/tick.service').TickService;

    const mineRepo = {
      findAllActive: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      delete: jest.fn(),
    } as unknown as MineRepository;

    const mineRegistry = new MineRegistry();
    const events = new EventEmitter2();
    const logger = new Logger('CombatTickServiceProjectileSpec');
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    const classCache = new ShipClassCacheService({} as never);
    classCache.setForTest(1, {
      maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
      scanRange: 100000, maxTons: 5000,
    } as never);

    const service = new CombatTickService(
      tickService,
      shipState,
      mineRepo,
      mineRegistry,
      new Mulberry32Adapter(seed),
      events,
      logger,
      classCache,
    );
    await service.onModuleInit();

    return {
      service,
      shipMap,
      events,
      classCache,
      shipState,
      fire: async () => {
        const ctx: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };
        for (const h of subscribers) h(ctx);
      },
    };
  }

  it('torpedo travel — distance decremented by TORPSPED each tick (no hit, no decoy)', async () => {
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      ltorpsChannel: [7, 255, 255],
      ltorpsDistance: [TORPSPED * 5, 0, 0],
    });
    const h = await makeHarnessSeeded([bob], 1);
    await h.fire();
    expect(bob.ltorpsDistance[0]).toBe(TORPSPED * 4);
    expect(bob.ltorpsChannel[0]).toBe(7);
  });

  it('missile travel — distance decremented by MISLSPED each tick', async () => {
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      lmisslChannel: [9, 255, 255],
      lmisslDistance: [MISLSPED * 4, 0, 0],
      lmisslEnergy: [1500, 0, 0],
    });
    const h = await makeHarnessSeeded([bob], 1);
    await h.fire();
    expect(bob.lmisslDistance[0]).toBe(MISLSPED * 3);
    expect(bob.lmisslChannel[0]).toBe(9);
    expect(bob.lmisslEnergy[0]).toBe(1500);
  });

  it('torpedo hit at distance ≤ 0 emits COMBAT_HIT { weapon: torpedo }, applies damage, sets cantexit on victim', async () => {
    const alice = makeShip({ userid: 'a', shipno: 7, xcoord: 0, ycoord: 0 });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      shield: 5000, shieldstat: 1, damage: 0, cantexit: 0,
      ltorpsChannel: [7, 255, 255],
      ltorpsDistance: [10, 0, 0], // less than TORPSPED → goes negative → hit
    });
    const h = await makeHarnessSeeded([alice, bob], 7);

    const emitted: Array<{ event: string; payload: unknown }> = [];
    h.events.onAny((event: string | string[], payload: unknown) => {
      const ev = Array.isArray(event) ? event.join('.') : event;
      emitted.push({ event: ev, payload });
    });

    await h.fire();

    const hit = emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeDefined();
    expect((hit!.payload as CombatHitEvent).weapon).toBe('torpedo');
    expect((hit!.payload as CombatHitEvent).victimId).toBe(shipKey('b', 2));
    expect((hit!.payload as CombatHitEvent).attackerId).toBe(shipKey('a', 7));

    // Slot cleared
    expect(bob.ltorpsChannel[0]).toBe(255);
    // cantexit set on victim
    expect(bob.cantexit).toBe(FIRETICKS);
    // cantexit set on attacker
    expect(alice.cantexit).toBe(FIRETICKS);
  });

  it('missile hit at distance ≤ 0 emits COMBAT_HIT { weapon: missile } using stored energy as dmgMax', async () => {
    const alice = makeShip({ userid: 'a', shipno: 9, xcoord: 0, ycoord: 0 });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      shield: 0, shieldstat: 0, damage: 0,
    // A missile's hull damage is proportional to the charge it carried:
    // floor(MDAMMAX * (charge / MISSILE_CHARGE_MAX) * factor). This fixture
    // used a charge of 2000 against a MISSILE_CHARGE_MAX of 50_000 -- 4% of a
    // full missile -- which produced observable damage only because the port
    // ran MDAMMAX at the numopt ceiling of 100. Canon ships 25, so 4% floors
    // to zero and the assertions had nothing to measure. Firing a FULL
    // missile is both the normal case and independent of the tuning.
      lmisslChannel: [9, 255, 255],
      lmisslDistance: [10, 0, 0],
      lmisslEnergy: [MISSILE_CHARGE_MAX, 0, 0],
    });
    const h = await makeHarnessSeeded([alice, bob], 7);

    const emitted: Array<{ event: string; payload: unknown }> = [];
    h.events.onAny((event: string | string[], payload: unknown) => {
      const ev = Array.isArray(event) ? event.join('.') : event;
      emitted.push({ event: ev, payload });
    });

    await h.fire();
    const hit = emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeDefined();
    expect((hit!.payload as CombatHitEvent).weapon).toBe('missile');
    // Slot cleared
    expect(bob.lmisslChannel[0]).toBe(255);
    expect(bob.lmisslEnergy[0]).toBe(0);
    // Bob took some hull damage
    expect(bob.damage).toBeGreaterThan(0);
  });

  it('victim damageFactor 200 scales hull damage to half of neutral (Plan 2 T1 review fix)', async () => {
    // Helper: run the same missile-hit scenario (seed 99, alice→bob, shields down)
    // but with an overridden damageFactor for the victim's ship class (class 1).
    // Both runs get a fresh Mulberry32Adapter(99) so PRNG state is identical,
    // meaning rand.next() returns the same value in both calls to rollHullDamage.
    const runMissileHit = async (victimDamageFactor: number): Promise<number> => {
      const alice = makeShip({ userid: 'a', shipno: 9, xcoord: 0, ycoord: 0 });
      const bob = makeShip({
        userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
        shield: 0, shieldstat: 0, damage: 0,
      // A missile's hull damage is proportional to the charge it carried:
      // floor(MDAMMAX * (charge / MISSILE_CHARGE_MAX) * factor). This fixture
      // used a charge of 2000 against a MISSILE_CHARGE_MAX of 50_000 -- 4% of a
      // full missile -- which produced observable damage only because the port
      // ran MDAMMAX at the numopt ceiling of 100. Canon ships 25, so 4% floors
      // to zero and the assertions had nothing to measure. Firing a FULL
      // missile is both the normal case and independent of the tuning.
        lmisslChannel: [9, 255, 255],
        lmisslDistance: [10, 0, 0],
        lmisslEnergy: [MISSILE_CHARGE_MAX, 0, 0],
      });
      const h = await makeHarnessSeeded([alice, bob], 7);
      // Override the damageFactor for class 1 (bob's shpclass) to the desired value.
      h.classCache.setForTest(1, { maxAcceleration: 1000, maxWarp: 10, damageFactor: victimDamageFactor });
      await h.fire();
      return bob.damage;
    };

    const dmg100 = await runMissileHit(100); // neutral: multiplier = 1.0×
    const dmg200 = await runMissileHit(200); // double factor: multiplier = 0.5×

    // rollHullDamage = floor(rand * dmgMax * (100/factor)).
    // Since floor(floor(x) * 0.5) === floor(x * 0.5) for all x ≥ 0, this
    // identity holds regardless of the specific PRNG output.
    expect(dmg100).toBeGreaterThan(0);
    expect(dmg200).toBe(Math.floor(dmg100 * 0.5));
  });

  it('decoy intercept — when carrier has active decoy and roll succeeds, emit COMBAT_DECOY_INTERCEPT and clear slot, no COMBAT_HIT', async () => {
    // The decoy roll is C's 1-in-N form: floor(rand * DECODDS) === 0
    // (GEFUNCS.C:1585). This fixture used seed 99, whose first draw is ~0.26 --
    // chosen when the port ran DECODDS=2, where any draw below 0.5 intercepted.
    // Canon ships DECODDS=11, so an intercept needs a draw below ~0.0909 and
    // seed 99 no longer fires. Mulberry32(7) draws ~0.0117, which intercepts at
    // any DECODDS the option permits (1..20), so this fixture no longer depends
    // on the tuning.
    const alice = makeShip({ userid: 'a', shipno: 7, xcoord: 0, ycoord: 0 });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      decout: [DECOYTIME, 0, 0], // active decoy
      ltorpsChannel: [7, 255, 255],
      // Distance after decrement will be 1000 — below 5000 → decoy roll triggered.
      ltorpsDistance: [TORPSPED + 1000, 0, 0],
    });
    const h = await makeHarnessSeeded([alice, bob], 7);

    const emitted: Array<{ event: string; payload: unknown }> = [];
    h.events.onAny((event: string | string[], payload: unknown) => {
      const ev = Array.isArray(event) ? event.join('.') : event;
      emitted.push({ event: ev, payload });
    });

    await h.fire();
    const intercept = emitted.find((e) => e.event === COMBAT_DECOY_INTERCEPT);
    expect(intercept).toBeDefined();
    expect((intercept!.payload as CombatDecoyInterceptEvent).weapon).toBe('torpedo');
    expect((intercept!.payload as CombatDecoyInterceptEvent).defenderId).toBe(shipKey('b', 2));
    // Slot cleared
    expect(bob.ltorpsChannel[0]).toBe(255);
    // No hit emitted
    expect(emitted.find((e) => e.event === COMBAT_HIT)).toBeUndefined();
    // The decoy that did the work is SPENT — `dptr[j] = 0`, GEFUNCS.C:1588.
    // It used to survive and intercept everything for its full 15-tick life.
    expect(bob.decout[0]).toBe(0);
  });

  // C-010: applyRandamage wired after every projectile hit.
  //
  // Victim starts at damage=0 (was 50). rollRandamage computes
  // `floor(rand * ((101 - damagePct)/1.5))` and only fires when that is 0
  // (combat-math.ts), so once total damage passes 101 the term goes negative
  // and subsystem damage can NEVER fire. With the shields-down branch now
  // rolling [0.5,1) * TDAMMAX per GEFUNCS.C:1566, a victim starting at 50
  // overshoots that ceiling and this path silently stopped being exercised.
  // Starting from 0 keeps the post-hit total inside the 21..100 window.
  it('C-010: torpedo hit pushes damage > 20 — COMBAT_SUBSYSTEM_DAMAGED emitted and subsystem field mutated', async () => {
    const alice = makeShip({ userid: 'a', shipno: 7, xcoord: 0, ycoord: 0, phasrtype: 0 });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      shield: 0, shieldstat: 0, damage: 0,
      ltorpsChannel: [7, 255, 255],
      ltorpsDistance: [10, 0, 0],
    });
    // Subsystem damage triggers above 20. Torpedo hull damage is
    // floor(TDAMMAX * factor * damageScale) with factor in 0.5..1.0 when
    // shields are down, so the band depends directly on TDAMMAX: at the numopt
    // ceiling of 100 almost any seed cleared 20, but canon ships 35, which
    // spans roughly 15..31 -- and seed 128's draw lands under the threshold.
    // The seed has to satisfy the whole draw SEQUENCE, not just the damage:
    //   draw 1 -> hull damage, must land above the 20 threshold
    //   draw 2 -> floor(d2 * (101-dmg)/1.5) === 0, the "did a subsystem break"
    //   draw 3 -> which of the six subsystems (4 = tactical)
    //   draw 4 -> magnitude, must be non-zero for the field to visibly change
    // At the old TDAMMAX ceiling of 100 the damage step was satisfied by almost
    // any seed, so seed 128 worked; under canon's 35 the band is ~15..31 and
    // the conjunction is much narrower. Seed 300 gives dmg 28 and tactical -22.
    const h = await makeHarnessSeeded([alice, bob], 300);

    const emitted: Array<{ event: string; payload: unknown }> = [];
    h.events.onAny((event: string | string[], payload: unknown) => {
      const ev = Array.isArray(event) ? event.join('.') : event;
      emitted.push({ event: ev, payload });
    });

    await h.fire();

    const subEvt = emitted.find((e) => e.event === COMBAT_SUBSYSTEM_DAMAGED);
    expect(subEvt).toBeDefined();
    expect((subEvt!.payload as CombatSubsystemDamagedEvent).victimId).toBe('b:2');
    expect((subEvt!.payload as CombatSubsystemDamagedEvent).subsystem).toBe('tactical');
    // tactical field must be mutated (negative magnitude)
    expect(bob.tactical).not.toBe(0);
  });

  it('torpedo hit with shields UP still damages the hull and drains the shield', async () => {
    // GEFUNCS.C:1552-1562 — the shields-up branch applies hull damage
    // (`ptr->damage += damfact`) AND calls shieldhit. Shields halve the roll,
    // they are not immunity. This previously asserted "damage stays 0", which
    // described the port's incorrect behaviour rather than the original's.
    // @see test/game/combat/shield-projectile-fidelity.spec.ts
    const alice = makeShip({ userid: 'a', shipno: 7, xcoord: 0, ycoord: 0, phasrtype: 0 });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      shield: 9999, shieldstat: 1, shieldtype: 1, damage: 0,
      ltorpsChannel: [7, 255, 255],
      ltorpsDistance: [10, 0, 0],
    });
    const h = await makeHarnessSeeded([alice, bob], 93);

    await h.fire();

    expect(bob.damage).toBeGreaterThan(0);        // not immune
    expect(bob.damage).toBeLessThan(TDAMMAX / 2); // but halved vs an unshielded hit
    expect(bob.shield).toBeLessThan(9999);        // charge was spent
  });

  it('FR-027.3 — carrier not ingame mid-flight: slot silently cleared, no hit, no decoy event', async () => {
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 0,
      status: 0, // not ingame (neither 1 nor 2)
      ltorpsChannel: [7, 255, 255],
      ltorpsDistance: [TORPSPED * 3, 0, 0],
    });
    const h = await makeHarnessSeeded([bob], 1);

    const emitted: Array<{ event: string; payload: unknown }> = [];
    h.events.onAny((event: string | string[], payload: unknown) => {
      const ev = Array.isArray(event) ? event.join('.') : event;
      emitted.push({ event: ev, payload });
    });

    await h.fire();
    expect(bob.ltorpsChannel[0]).toBe(255);
    expect(emitted.find((e) => e.event === COMBAT_HIT)).toBeUndefined();
    expect(emitted.find((e) => e.event === COMBAT_DECOY_INTERCEPT)).toBeUndefined();
  });
});

describe('CombatTickService — mine sweep (T036)', () => {
  async function makeMineHarness(
    ships: ShipState[],
    mines: Array<{ id: number; channel: number; timer: number; xcoord: number; ycoord: number; deployedBy: string }>,
    seed = 1,
  ): Promise<{
    fire: () => Promise<void>;
    events: EventEmitter2;
    shipMap: Map<string, ShipState>;
    deleteSpy: jest.Mock;
    registry: MineRegistry;
  }> {
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
    } as unknown as import('../../../src/game/ship/ship-state.service').ShipStateService;

    const subscribers: Array<(c: TickContext) => void> = [];
    const tickService = {
      subscribe: (_kind: TickKind, h: (c: TickContext) => void) => {
        subscribers.push(h);
        return () => {};
      },
      registerSnapshotProvider: jest.fn(),
    } as unknown as import('../../../src/game/tick/tick.service').TickService;

    const deleteSpy = jest.fn().mockResolvedValue(undefined);
    const mineRepo = {
      findAllActive: jest.fn().mockResolvedValue(mines),
      create: jest.fn(),
      delete: deleteSpy,
    } as unknown as MineRepository;

    const registry = new MineRegistry();
    const events = new EventEmitter2();
    const logger = new Logger('MineSweepSpec');
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    const classCache = new ShipClassCacheService({} as never);
    classCache.setForTest(1, {
      maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
      scanRange: 100000, maxTons: 5000,
    } as never);

    const service = new CombatTickService(
      tickService,
      shipState,
      mineRepo,
      registry,
      new Mulberry32Adapter(seed),
      events,
      logger,
      classCache,
    );
    await service.onModuleInit();

    return {
      shipMap,
      events,
      deleteSpy,
      registry,
      fire: async () => {
        const ctx: TickContext = { kind: TickKind.PHYSICS, tickNumber: 1, firedAt: new Date() };
        for (const h of subscribers) h(ctx);
      },
    };
  }

  it('cadence — timer 11 → 10 (%5===0): triggers sweep tick (no damage); timer 12 → 11 does not', async () => {
    // First: timer=11 → after tickAll → 10 → 10%5===0 → sweep, but >0 → warning only.
    const bob1 = makeShip({ userid: 'b', shipno: 2, xcoord: 100, ycoord: 100, damage: 0, status: 1 });
    const h1 = await makeMineHarness(
      [bob1],
      [{ id: 1, channel: 99, timer: 11, xcoord: 100, ycoord: 100, deployedBy: 'x' }],
    );
    const emitted1: Array<{ event: string }> = [];
    h1.events.onAny((e: string | string[]) =>
      emitted1.push({ event: Array.isArray(e) ? e.join('.') : e }));
    await h1.fire();
    expect(emitted1.find((e) => e.event === 'combat.mine-warning')).toBeDefined();
    expect(bob1.damage).toBe(0);

    // Second: timer=12 → after tickAll → 11 → 11%5!==0 → no sweep at all.
    const bob2 = makeShip({ userid: 'b', shipno: 2, xcoord: 100, ycoord: 100, damage: 0, status: 1 });
    const h2 = await makeMineHarness(
      [bob2],
      [{ id: 2, channel: 99, timer: 12, xcoord: 100, ycoord: 100, deployedBy: 'x' }],
    );
    const emitted2: Array<{ event: string }> = [];
    h2.events.onAny((e: string | string[]) =>
      emitted2.push({ event: Array.isArray(e) ? e.join('.') : e }));
    await h2.fire();
    expect(emitted2.find((e) => e.event === 'combat.mine-warning')).toBeUndefined();
    expect(emitted2.find((e) => e.event === 'combat.mine-detonation')).toBeUndefined();
  });

  it('neutral zone — ship at (0,0) is skipped by mine sweep damage', async () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 0.1, ycoord: 0.1, damage: 0, shield: 0, shieldstat: 0, status: 1 });
    const h = await makeMineHarness(
      [alice],
      [{ id: 1, channel: 99, timer: 1, xcoord: 0.2, ycoord: 0.2, deployedBy: 'x' }],
    );
    await h.fire();
    expect(alice.damage).toBe(0);
  });

  it('no owner exclusion — mine deployer ship is damaged if within range', async () => {
    const alice = makeShip({
      userid: 'a', shipno: 1, xcoord: 100, ycoord: 100, damage: 0,
      shield: 0, shieldstat: 0, status: 1,
    });
    const h = await makeMineHarness(
      [alice],
      [{ id: 1, channel: 1, timer: 1, xcoord: 100, ycoord: 100, deployedBy: 'a' }],
      99,
    );
    await h.fire();
    expect(alice.damage).toBeGreaterThan(0);
  });

  it('range — a ship two sectors away is NOT damaged by the mine', async () => {
    // GEFUNCS.C:1428-1432 converts to raw units before the range test
    // (`ddist *= 10000`) and MINERANGE is 10000 raw = one sector. The port
    // compared the sector-valued cdistance directly against 10000, so the guard
    // never fired and EVERY ship in the galaxy was inside the blast. In
    // playtest a single mine destroyed all 20 Cybertrons in one tick.
    const near = makeShip({
      userid: 'near', shipno: 1, xcoord: 100.02, ycoord: 100, damage: 0,
      shield: 0, shieldstat: 0, status: 1,
    });
    const far = makeShip({
      userid: 'far', shipno: 1, xcoord: 102, ycoord: 100, damage: 0,
      shield: 0, shieldstat: 0, status: 1,
    });
    const h = await makeMineHarness(
      [near, far],
      [{ id: 1, channel: 1, timer: 1, xcoord: 100, ycoord: 100, deployedBy: 'x' }],
      99,
    );
    await h.fire();

    expect(near.damage).toBeGreaterThan(0);  // same sector — inside the blast
    expect(far.damage).toBe(0);              // two sectors away — untouched
  });

  it('detonation — timer===0 emits COMBAT_HIT { weapon:mine } and COMBAT_MINE_DETONATION, mine destroyed', async () => {
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 100, ycoord: 100, damage: 0,
      shield: 0, shieldstat: 0, lastfired: 0, status: 1,
    });
    const h = await makeMineHarness(
      [bob],
      [{ id: 42, channel: 99, timer: 1, xcoord: 100, ycoord: 100, deployedBy: 'x' }],
      99,
    );
    const emitted: Array<{ event: string; payload: unknown }> = [];
    h.events.onAny((event: string | string[], payload: unknown) =>
      emitted.push({ event: Array.isArray(event) ? event.join('.') : event, payload }));

    await h.fire();

    const hit = emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeDefined();
    expect((hit!.payload as CombatHitEvent).weapon).toBe('mine');
    expect((hit!.payload as CombatHitEvent).victimId).toBe(shipKey('b', 2));

    const det = emitted.find((e) => e.event === 'combat.mine-detonation');
    expect(det).toBeDefined();
    expect((det!.payload as { mineId: number; channel: number }).mineId).toBe(42);
    expect((det!.payload as { mineId: number; channel: number }).channel).toBe(99);

    expect(bob.lastfired).toBe(99);
    expect(h.deleteSpy).toHaveBeenCalledWith(42);
    expect(h.registry.getAll().length).toBe(0);
  });

  it('proximity — timer > 0 on sweep tick: warning only, no damage, mine persists', async () => {
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 100, ycoord: 100, damage: 0, status: 1,
    });
    const h = await makeMineHarness(
      [bob],
      [{ id: 7, channel: 99, timer: 6, xcoord: 100, ycoord: 100, deployedBy: 'x' }],
    );
    const emitted: Array<{ event: string }> = [];
    h.events.onAny((event: string | string[]) =>
      emitted.push({ event: Array.isArray(event) ? event.join('.') : event }));

    await h.fire();
    expect(bob.damage).toBe(0);
    expect(h.registry.getAll().length).toBe(1);
    expect(h.deleteSpy).not.toHaveBeenCalled();
    expect(emitted.find((e) => e.event === 'combat.mine-warning')).toBeDefined();
  });

  it('seeded PRNG — deterministic mine outcomes', async () => {
    const makeRun = async () => {
      const bob = makeShip({
        userid: 'b', shipno: 2, xcoord: 100, ycoord: 100, damage: 0,
        shield: 0, shieldstat: 0, status: 1,
      });
      const h = await makeMineHarness(
        [bob],
        [{ id: 1, channel: 99, timer: 1, xcoord: 100, ycoord: 100, deployedBy: 'x' }],
        42,
      );
      await h.fire();
      return bob.damage;
    };
    expect(await makeRun()).toBe(await makeRun());
  });
});

describe('CombatTickService — decoy/jammer expiry (T036)', () => {
  it('decoy slots decrement each tick; jammer counter decrements each tick', async () => {
    const ship = makeShip({
      userid: 'a', shipno: 1,
      decout: [3, 1, 0],
      jammer: 5,
    });
    const h = await makeHarness([ship]);
    await h.fire();
    expect(ship.decout[0]).toBe(2);
    expect(ship.decout[1]).toBe(0);
    expect(ship.decout[2]).toBe(0);
    expect(ship.jammer).toBe(4);
  });
});

// Fix 2 — negative phasr must NOT be lifted by the 6s reload path (GEFUNCS.C:1015-1018)
describe('CombatTickService — negative phasr reload gate (Fix 2)', () => {
  it('phasr=-5: physics reload does NOT lift while negative (stays at -5)', async () => {
    const ship = makeShip({ userid: 'a', shipno: 1, phasrtype: 1, phasr: -5, energy: 50000 });
    const h = await makeHarness([ship]);
    await h.fire();
    // Must remain negative — slow recovery is handled by ship-tick (1s), not combat-tick (6s)
    expect(ship.phasr).toBe(-5);
  });

  it('phasr=0: reload begins at 0 (not blocked)', async () => {
    const ship = makeShip({ userid: 'a', shipno: 1, phasrtype: 1, phasr: 0, energy: 50000 });
    const h = await makeHarness([ship]);
    await h.fire();
    // phasr=0 is not negative, so normal reload applies
    expect(ship.phasr).toBeGreaterThan(0);
  });
});

/**
 * The whole preload is wrapped in `if (useenergy(ptr,usrn,PENGUSE) == 1)`
 * (GEFUNCS.C:1028), and useenergy (GEFUNCS.C:1500-1514) refuses unless
 * `energy >= amount + 500` — spending nothing and charging nothing when it
 * refuses. The port applied the charge unconditionally and clamped energy at
 * zero, so a ship with a flat battery kept topping its phasers up for free and
 * could sit at 0 energy firing indefinitely.
 */
describe('CombatTickService — phasers charge only when there is power to spare', () => {
  it('charges the phaser and debits PENGUSE when there is headroom', async () => {
    const ship = makeShip({ userid: 'a', shipno: 1, phasrtype: 1, phasr: 0, energy: 50000 });
    const h = await makeHarness([ship]);
    await h.fire();
    expect(ship.phasr).toBeGreaterThan(0);
    expect(ship.energy).toBe(50000 - PENGUSE);
  });

  it('refuses below the 500-unit reserve, leaving BOTH phasr and energy alone', async () => {
    // useenergy needs energy >= PENGUSE + 500.
    const energy = PENGUSE + 499;
    const ship = makeShip({ userid: 'a', shipno: 1, phasrtype: 1, phasr: 0, energy });
    const h = await makeHarness([ship]);
    await h.fire();
    expect(ship.phasr).toBe(0);
    expect(ship.energy).toBe(energy);
  });

  it('a flat battery never recharges the phaser', async () => {
    const ship = makeShip({ userid: 'a', shipno: 1, phasrtype: 1, phasr: 10, energy: 0 });
    const h = await makeHarness([ship]);
    await h.fire();
    expect(ship.phasr).toBe(10);
    expect(ship.energy).toBe(0);
  });

  it('charges at exactly the reserve boundary', async () => {
    const energy = PENGUSE + 500;
    const ship = makeShip({ userid: 'a', shipno: 1, phasrtype: 1, phasr: 0, energy });
    const h = await makeHarness([ship]);
    await h.fire();
    expect(ship.phasr).toBeGreaterThan(0);
    expect(ship.energy).toBe(500);
  });
});

describe('CombatTickService — battle-lock + shield gating (T052)', () => {
  it('decrements ship.cantexit by 1 per physics tick (FR-028a)', async () => {
    const ship = makeShip({ userid: 'a', shipno: 1, cantexit: 3 });
    const h = await makeHarness([ship]);
    await h.fire();
    expect(ship.cantexit).toBe(2);
    await h.fire();
    expect(ship.cantexit).toBe(1);
    await h.fire();
    expect(ship.cantexit).toBe(0);
    // Floor at zero — no negative drift.
    await h.fire();
    expect(ship.cantexit).toBe(0);
  });

  it('does NOT auto-raise shields after they have been lowered (e.g., by torpedo fire)', async () => {
    const ship = makeShip({ userid: 'a', shipno: 1, shieldstat: 0, shield: 1000 });
    const h = await makeHarness([ship]);
    await h.fire();
    // Tick must not flip shields back up — the original game requires `shi up`.
    expect(ship.shieldstat).toBe(0);
    await h.fire();
    expect(ship.shieldstat).toBe(0);
  });
});
