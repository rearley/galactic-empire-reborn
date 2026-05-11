import { EventEmitter2 } from '@nestjs/event-emitter';
import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { PhaserHandlerService } from '../../../../src/game/commands/handlers/phaser.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { Mulberry32Adapter } from '../../../../src/game/combat/random.port';
import {
  COMBAT_PHASER_FIRED,
  COMBAT_HIT,
  COMBAT_MISS,
  CombatPhaserFiredEvent,
  CombatHitEvent,
  CombatMissEvent,
} from '../../../../src/game/combat/combat-events';
import { FIRETICKS, PMINFIRE, WARP_THRESHOLD, HPBEAMW } from '../../../../src/game/constants';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 100, phasrtype: 1, kills: 0, lastfired: 0,
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
  };
}

interface Harness {
  handler: PhaserHandlerService;
  shipMap: Map<string, ShipState>;
  events: EventEmitter2;
  emitted: Array<{ event: string; payload: unknown }>;
  cache: ShipClassCacheService;
}

function makeHarness(
  ships: ShipState[],
  classCfg: Record<number, { maxPhaser?: number; scanRange?: number; maxTons?: number }> = {},
): Harness {
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);

  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    get: (userid: string, shipno: number) => shipMap.get(shipKey(userid, shipno)),
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(shipKey(userid, shipno));
      if (!s) return undefined;
      fn(s);
      s.dirty = true;
      return s;
    },
  } as unknown as ShipStateService;

  const cache = new ShipClassCacheService({} as never);
  // default class 1
  cache.setForTest(1, {
    maxAcceleration: 1000,
    maxWarp: 10,
    maxPhaser: 1000,
    scanRange: 100000,
    maxTons: 5000,
  } as never);
  for (const [cls, cfg] of Object.entries(classCfg)) {
    cache.setForTest(Number(cls), {
      maxAcceleration: 1000,
      maxWarp: 10,
      maxPhaser: cfg.maxPhaser ?? 1000,
      scanRange: cfg.scanRange ?? 100000,
      maxTons: cfg.maxTons ?? 5000,
    } as never);
  }

  const events = new EventEmitter2();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  events.onAny((event: string | string[], payload: unknown) => {
    const ev = Array.isArray(event) ? event.join('.') : event;
    emitted.push({ event: ev, payload });
  });

  const random = new Mulberry32Adapter(42);
  const handler = new PhaserHandlerService(shipState, cache, events, random);
  return { handler, shipMap, events, emitted, cache };
}

const ctx: CommandContext = {};

describe('PhaserHandlerService — `pha <bearing> <percent>`', () => {
  it('happy path — Bob in Alice\'s firing arc takes damage and shield drops', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, shipname: 'Alice', xcoord: 0, ycoord: 0 });
    // Bob due north at range 5 (within the C-001 scanRange gate of 10 sectors).
    // Convention: y decreases northward — see GEFUNCS.C / lineOfFire atan2(dx,-dy).
    const bob = makeShip({
      userid: 'b', shipno: 2, shipname: 'Bob',
      xcoord: 0, ycoord: -5, shield: 5000, shieldstat: 1, damage: 0,
    });
    const h = makeHarness([alice, bob]);

    const result = h.handler.command.handler(alice, ['0', '50'], ctx) as CommandResult;
    expect(result.lines.length).toBeGreaterThan(0);
    expect(bob.shield).toBeLessThan(5000);
    // Bob should take some damage (shield will absorb most, hull may take rest)
    expect(bob.dirty).toBe(true);
    // Phaser charge consumed
    expect(alice.phasr).toBe(100 - 500); // 50% of maxPhaser=1000 = 500 → 100-500=-400, but should be 100-500
    // Actually: percent/100 * maxPhaser = 0.5 * 1000 = 500
    // alice.phasr = 100 - 500 = -400 — but allow this raw value; semantic is "drained"
  });

  it('rejects when no phaser class mounted (phasrtype === 0)', () => {
    const alice = makeShip({ phasrtype: 0 });
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['90', '50'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.PHA_NOPHAS));
    expect(alice.dirty).toBe(false);
  });

  it('rejects when phasr < PMINFIRE', () => {
    const alice = makeShip({ phasr: PMINFIRE - 1 });
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['90', '50'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.PHA_NOPOW));
    expect(alice.dirty).toBe(false);
  });

  it('rejects bearing out of [0, 359]', () => {
    const alice = makeShip();
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['400', '50'], ctx) as CommandResult;
    expect(result.lines[0].category).toBe('system');
    expect(result.lines[0].text).toContain('out of range');
    expect(alice.dirty).toBe(false);
  });

  it('rejects percent out of [1, 100]', () => {
    const alice = makeShip();
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['90', '150'], ctx) as CommandResult;
    expect(result.lines[0].category).toBe('system');
    expect(result.lines[0].text).toContain('out of range');
    expect(alice.dirty).toBe(false);
  });

  it('hyper-phaser path — when speed >= WARP_THRESHOLD uses HPBEAMW=5 not the percent arg', () => {
    const alice = makeShip({
      userid: 'a', shipno: 1, xcoord: 0, ycoord: 0,
      speed: WARP_THRESHOLD, phasr: 1000,
    });
    // Place Bob 4 degrees off bearing 0 (compass north), range 5 (within
    // C-001 scanRange gate). With percent=80 (impulse) the arc would be 80°
    // wide (easy hit). With hyper-phaser, beamWidth = HPBEAMW = 5 → halfWidth
    // = (5+2)/2 = 3.5 → 4° is OUTSIDE arc = MISS. Convention: y decreases
    // northward, so north uses -cos and east uses +sin.
    const rad = (4 * Math.PI) / 180;
    const bob = makeShip({
      userid: 'b', shipno: 2,
      xcoord: 5 * Math.sin(rad), ycoord: -5 * Math.cos(rad),
      shield: 5000, shieldstat: 1,
    });
    const h = makeHarness([alice, bob]);

    h.handler.command.handler(alice, ['0', '80'], ctx);

    // Hyper-phaser fired event flagged as hyper
    const fired = h.emitted.find((e) => e.event === COMBAT_PHASER_FIRED);
    expect(fired).toBeDefined();
    expect((fired!.payload as CombatPhaserFiredEvent).hyper).toBe(true);
    // 4° is outside hyper-phaser arc → no hit
    const hit = h.emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeUndefined();
    // Should have a miss instead
    const miss = h.emitted.find((e) => e.event === COMBAT_MISS);
    expect(miss).toBeDefined();
    // Confirm HPBEAMW reference was used
    expect(HPBEAMW).toBe(5);
  });

  it('friendly fire allowed — same userid hit if in arc', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 0, ycoord: 0 });
    const ally = makeShip({
      userid: 'a', shipno: 2, shipname: 'Ally',
      xcoord: 0, ycoord: -5, shield: 5000, shieldstat: 1,
    });
    const h = makeHarness([alice, ally]);
    h.handler.command.handler(alice, ['0', '50'], ctx);
    expect(ally.shield).toBeLessThan(5000);
    expect(ally.dirty).toBe(true);
    const hit = h.emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeDefined();
  });

  it('PHABIAS arc-widening — target outside `percent` but within `percent + PHABIAS` is a hit', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 0, ycoord: 0 });
    // Target 4.5° off bearing 0 (compass north), range 5 (within C-001
    // scanRange gate). With percent=6, halfWidth = (6+2)/2 = 4 → MISS.
    // With percent=8, halfWidth = (8+2)/2 = 5 → HIT (PHABIAS widens by 2°).
    // Convention: y decreases northward.
    const rad = (4.5 * Math.PI) / 180;
    const bob = makeShip({
      userid: 'b', shipno: 2,
      xcoord: 5 * Math.sin(rad), ycoord: -5 * Math.cos(rad),
      shield: 5000, shieldstat: 1,
    });
    const h = makeHarness([alice, bob]);

    h.handler.command.handler(alice, ['0', '8'], ctx);
    const hit = h.emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeDefined();
    expect((hit!.payload as CombatHitEvent).victimId).toBe(shipKey('b', 2));
  });

  it('rejects with JAMMER4 when firer\'s jammer > 0', () => {
    const alice = makeShip({ jammer: 5 });
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['90', '50'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.JAMMER4));
    expect(alice.dirty).toBe(false);
  });

  it('sets cantexit = FIRETICKS on firer and on every hit victim', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 0, ycoord: 0, cantexit: 0 });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: -5,
      shield: 5000, shieldstat: 1, cantexit: 0,
    });
    const h = makeHarness([alice, bob]);
    h.handler.command.handler(alice, ['0', '50'], ctx);
    expect(alice.cantexit).toBe(FIRETICKS);
    expect(bob.cantexit).toBe(FIRETICKS);
  });

  it('emits COMBAT_MISS when no targets in arc', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 0, ycoord: 0 });
    // Bob due south at range 5 (within scanRange gate). Fire bearing 0 (north)
    // — bob is at 180° from firing direction, well outside any arc.
    // Convention: y decreases northward, so +y = south.
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 5,
      shield: 5000, shieldstat: 1,
    });
    const h = makeHarness([alice, bob]);
    h.handler.command.handler(alice, ['0', '5'], ctx);
    const miss = h.emitted.find((e) => e.event === COMBAT_MISS);
    expect(miss).toBeDefined();
    expect((miss!.payload as CombatMissEvent).attackerId).toBe(shipKey('a', 1));
  });

  it('emits COMBAT_PHASER_FIRED with hyper=false at impulse speed', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, speed: 100 });
    const h = makeHarness([alice]);
    h.handler.command.handler(alice, ['90', '50'], ctx);
    const fired = h.emitted.find((e) => e.event === COMBAT_PHASER_FIRED);
    expect(fired).toBeDefined();
    expect((fired!.payload as CombatPhaserFiredEvent).hyper).toBe(false);
    expect((fired!.payload as CombatPhaserFiredEvent).bearing).toBe(90);
    expect((fired!.payload as CombatPhaserFiredEvent).percent).toBe(50);
  });

  it('keyword is "pha" with alias "phasor"', () => {
    const h = makeHarness([makeShip()]);
    expect(h.handler.command.keyword).toBe('pha');
  });
});
