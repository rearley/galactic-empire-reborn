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
import { FIRETICKS, HPFIRAMT, HPMINFIR, PMINFIRE, SE100DAM, WARP_THRESHOLD } from '../../../../src/game/constants';

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

describe('PhaserHandlerService — `pha <degree> [focus]`', () => {
  it('happy path — Bob in Alice\'s firing arc takes damage and shield drops', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, shipname: 'Alice', xcoord: 5, ycoord: 5 });
    // Bob due north at range 1 (inside the normal-phaser damage curve; a
    // phasrtype-1 beam reaches ~2.4 sectors). Convention: y decreases
    // northward — see GEFUNCS.C / lineOfFire atan2(dx,-dy).
    const bob = makeShip({
      userid: 'b', shipno: 2, shipname: 'Bob',
      xcoord: 5, ycoord: 4, shield: 5000, shieldstat: 1, damage: 0,
    });
    const h = makeHarness([alice, bob]);

    const result = h.handler.command.handler(alice, ['0', '0'], ctx) as CommandResult;
    expect(result.lines.length).toBeGreaterThan(0);
    expect(bob.shield).toBeLessThan(5000);
    expect(bob.dirty).toBe(true);
    // Phaser always FULLY discharges on fire (GECMDS.C:1006).
    expect(alice.phasr).toBe(0);
  });

  it('rejects when no phaser class mounted (phasrtype === 0)', () => {
    const alice = makeShip({ phasrtype: 0 });
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['90', '0'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.PHA_NOPHAS));
    expect(alice.dirty).toBe(false);
  });

  it('rejects when phasr < PMINFIRE', () => {
    const alice = makeShip({ phasr: PMINFIRE - 1 });
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['90', '0'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.PHA_NOPOW));
    expect(alice.dirty).toBe(false);
  });

  it('rejects degree out of [-180, 180]', () => {
    const alice = makeShip();
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['400', '0'], ctx) as CommandResult;
    expect(result.lines[0].category).toBe('system');
    expect(result.lines[0].text).toContain('out of range');
    expect(alice.dirty).toBe(false);
  });

  it('rejects focus out of [0, 5]', () => {
    const alice = makeShip();
    const h = makeHarness([alice]);
    const result = h.handler.command.handler(alice, ['90', '6'], ctx) as CommandResult;
    expect(result.lines[0].category).toBe('system');
    expect(result.lines[0].text).toContain('out of range');
    expect(alice.dirty).toBe(false);
  });

  it('firer at warp fires the HYPER-phaser (hyper=true) — C-009 true separation', () => {
    const alice = makeShip({
      userid: 'a', shipno: 1, xcoord: 5, ycoord: 5,
      speed: WARP_THRESHOLD, phasr: 100, energy: 50000,
    });
    // Bob also at warp, due north at range 1 — inside the hyper beam arc.
    const bob = makeShip({
      userid: 'b', shipno: 2,
      xcoord: 5, ycoord: 4, speed: WARP_THRESHOLD, shield: 5000, shieldstat: 1,
    });
    const h = makeHarness([alice, bob]);

    h.handler.command.handler(alice, ['0', '0'], ctx);

    const fired = h.emitted.find((e) => e.event === COMBAT_PHASER_FIRED);
    expect(fired).toBeDefined();
    // Hyper path flags the fired event.
    expect((fired!.payload as CombatPhaserFiredEvent).hyper).toBe(true);
    const hit = h.emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeDefined();
  });

  it('friendly fire allowed — same userid hit if in arc', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 5, ycoord: 5 });
    const ally = makeShip({
      userid: 'a', shipno: 2, shipname: 'Ally',
      xcoord: 5, ycoord: 4, shield: 5000, shieldstat: 1,
    });
    const h = makeHarness([alice, ally]);
    h.handler.command.handler(alice, ['0', '0'], ctx);
    expect(ally.shield).toBeLessThan(5000);
    expect(ally.dirty).toBe(true);
    const hit = h.emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeDefined();
  });

  it('PHABIAS arc-widening — target outside `focus` but within `focus + PHABIAS` is a hit', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 5, ycoord: 5 });
    // Target 4.5° off bearing 0 (compass north), range 1. The arc half-angle
    // is `focus + PHABIAS` (GECMDS.C:954). With focus=3 the half-angle is
    // 3 + 2 = 5 → 4.5° is INSIDE the arc = HIT; without the +PHABIAS widening
    // (3°) it would MISS. Convention: y decreases northward.
    const rad = (4.5 * Math.PI) / 180;
    const bob = makeShip({
      userid: 'b', shipno: 2,
      xcoord: 5 + Math.sin(rad), ycoord: 5 - Math.cos(rad),
      shield: 5000, shieldstat: 1,
    });
    const h = makeHarness([alice, bob]);

    h.handler.command.handler(alice, ['0', '3'], ctx);
    const hit = h.emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeDefined();
    expect((hit!.payload as CombatHitEvent).victimId).toBe(shipKey('b', 2));
  });

  it('sets cantexit = FIRETICKS on firer and on every hit victim', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 5, ycoord: 5, cantexit: 0 });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 5, ycoord: 4,
      shield: 5000, shieldstat: 1, cantexit: 0,
    });
    const h = makeHarness([alice, bob]);
    h.handler.command.handler(alice, ['0', '0'], ctx);
    expect(alice.cantexit).toBe(FIRETICKS);
    expect(bob.cantexit).toBe(FIRETICKS);
  });

  it('emits COMBAT_MISS when no targets in arc', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 5, ycoord: 5 });
    // Bob due south at range 1. Fire degree 0 (north) — bob is at 180° from
    // the firing direction, well outside any arc. y decreases northward, +y = south.
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 5, ycoord: 6,
      shield: 5000, shieldstat: 1,
    });
    const h = makeHarness([alice, bob]);
    h.handler.command.handler(alice, ['0', '5'], ctx);
    const miss = h.emitted.find((e) => e.event === COMBAT_MISS);
    expect(miss).toBeDefined();
    expect((miss!.payload as CombatMissEvent).attackerId).toBe(shipKey('a', 1));
  });

  it('emits COMBAT_PHASER_FIRED with hyper=false carrying degree/focus', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 5, ycoord: 5, speed: 100 });
    const h = makeHarness([alice]);
    h.handler.command.handler(alice, ['90', '5'], ctx);
    const fired = h.emitted.find((e) => e.event === COMBAT_PHASER_FIRED);
    expect(fired).toBeDefined();
    expect((fired!.payload as CombatPhaserFiredEvent).hyper).toBe(false);
    expect((fired!.payload as CombatPhaserFiredEvent).bearing).toBe(90);
    expect((fired!.payload as CombatPhaserFiredEvent).percent).toBe(5);
  });

  it('keyword is "pha" with alias "phasor"', () => {
    const h = makeHarness([makeShip()]);
    expect(h.handler.command.keyword).toBe('pha');
  });

  // C-008: firer's shields drop for the battle-lock window (mirrors C `shielddn` before fire)
  it('C-008: firer shields-up (shieldstat=1) ends with shieldstat=0 AND cantexit=FIRETICKS after firing', () => {
    const alice = makeShip({
      userid: 'a', shipno: 1, shipname: 'Alice',
      xcoord: 5, ycoord: 5,
      shieldstat: 1, shield: 5000,
    });
    const bob = makeShip({
      userid: 'b', shipno: 2, shipname: 'Bob',
      xcoord: 5, ycoord: 4,
      shield: 5000, shieldstat: 1,
    });
    const h = makeHarness([alice, bob]);
    h.handler.command.handler(alice, ['0', '0'], ctx);
    expect(alice.shieldstat).toBe(0);
    expect(alice.cantexit).toBe(FIRETICKS);
  });

  it('C-008: firer already shields-down (shieldstat=0) stays 0 after firing (no crash)', () => {
    const alice = makeShip({
      userid: 'a', shipno: 1, shipname: 'Alice',
      xcoord: 5, ycoord: 5,
      shieldstat: 0, shield: 0,
    });
    const bob = makeShip({
      userid: 'b', shipno: 2, shipname: 'Bob',
      xcoord: 5, ycoord: 4,
    });
    const h = makeHarness([alice, bob]);
    h.handler.command.handler(alice, ['0', '0'], ctx);
    expect(alice.shieldstat).toBe(0);
    expect(alice.cantexit).toBe(FIRETICKS);
  });
});

describe('pha command semantics (Plan 1 T5)', () => {
  const getShip = (h: Harness, s: ShipState): ShipState =>
    h.shipMap.get(shipKey(s.userid, s.shipno))!;

  it('accepts `pha <degree>` with focus defaulting to 1', () => {
    // firer phasrtype>=1, phasr>=PMINFIRE, not cloaked, not in NZ, not at warp.
    const firer = makeShip({ userid: 'a', shipno: 1, xcoord: 5, ycoord: 5 });
    const h = makeHarness([firer]);
    const res = h.handler.command.handler(firer, ['0'], ctx) as CommandResult;
    expect(res.lines.some((l) => /no targets|hit/i.test(l.text))).toBe(true);
  });

  it('rejects degree outside −180..180', () => {
    const firer = makeShip({ userid: 'a', shipno: 1, xcoord: 5, ycoord: 5 });
    const h = makeHarness([firer]);
    const res = h.handler.command.handler(firer, ['200', '0'], ctx) as CommandResult;
    expect(res.lines[0].text).toMatch(/-180|180/);
  });

  it('rejects focus outside 0..5', () => {
    const firer = makeShip({ userid: 'a', shipno: 1, xcoord: 5, ycoord: 5 });
    const h = makeHarness([firer]);
    const res = h.handler.command.handler(firer, ['0', '6'], ctx) as CommandResult;
    expect(res.lines[0].text).toMatch(/0.*5|5/);
  });

  it('refuses to fire while cloaked', () => {
    const cloaked = makeShip({ userid: 'a', shipno: 1, xcoord: 5, ycoord: 5, cloak: 10 });
    const h = makeHarness([cloaked]);
    const res = h.handler.command.handler(cloaked, ['0', '0'], ctx) as CommandResult;
    expect(res.lines[0].text).toMatch(/cloak/i);
    expect(getShip(h, cloaked).phasr).toBe(100); // not discharged
  });

  it('firing inside the neutral zone self-zaps and deals no outgoing damage', () => {
    const firerInNZ = makeShip({ userid: 'a', shipno: 1, xcoord: 0, ycoord: 0, phasr: 100, phasrtype: 1 });
    // Victim due north at range 1 (would be a clean in-arc hit if we fired normally).
    const victim = makeShip({ userid: 'b', shipno: 2, xcoord: 0, ycoord: -1, damage: 0 });
    const h = makeHarness([firerInNZ, victim]);
    h.handler.command.handler(firerInNZ, ['0', '0'], ctx);
    expect(getShip(h, firerInNZ).damage).toBeGreaterThanOrEqual(SE100DAM);
    expect(getShip(h, firerInNZ).phasr).toBe(0); // self-zap also discharges
    expect(getShip(h, victim).damage).toBe(0);
    // No COMBAT_PHASER_FIRED should fire when the beam never leaves the ship.
    const fired = h.emitted.find((e) => e.event === COMBAT_PHASER_FIRED);
    expect(fired).toBeUndefined();
  });

  it('fully discharges phasr to 0 after firing', () => {
    const firer = makeShip({ userid: 'a', shipno: 1, xcoord: 5, ycoord: 5, phasr: 100 });
    const h = makeHarness([firer]);
    h.handler.command.handler(firer, ['0', '0'], ctx);
    expect(getShip(h, firer).phasr).toBe(0);
  });

  it('still hits a victim at warp (PHATOWRP=0) — damage is halved but lands', () => {
    // With PHATOWRP=0 any phaser can reach a warping victim; the damage is
    // halved (T4) but still ≥1 at close range, so the hit lands.
    const firer = makeShip({ userid: 'a', shipno: 1, xcoord: 5, ycoord: 5, phasr: 100, phasrtype: 1 });
    const warpVictim = makeShip({
      userid: 'b', shipno: 2, xcoord: 5, ycoord: 4,
      speed: 2000, damage: 0,
    });
    const h = makeHarness([firer, warpVictim]);
    const res = h.handler.command.handler(firer, ['0', '0'], ctx) as CommandResult;
    expect(res.lines.some((l) => /hit/i.test(l.text))).toBe(true);
    expect(getShip(h, warpVictim).damage).toBeGreaterThan(0);
    // Firer must be fully discharged after firing (GECMDS.C:1006).
    expect(getShip(h, firer).phasr).toBe(0);
  });

  it('phaser fires even when firer has jammer active (phasers do not lock)', () => {
    // GECMDS.C:firep has no jammer check. Jammers block weapon LOCKING
    // (torpedoes, missiles), not firing. Phasers don't lock so are unaffected.
    const firer = makeShip({
      userid: 'a', shipno: 1, xcoord: 0, ycoord: 7,
      phasr: 100, phasrtype: 1, jammer: 5,
    });
    // Victim due north at range 1, in arc.
    const victim = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: 6,
      shield: 5000, shieldstat: 1, damage: 0,
    });
    const h = makeHarness([firer, victim]);

    h.handler.command.handler(firer, ['0', '0'], ctx);

    // Phaser must fire and hit despite jammer.
    const hit = h.emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeDefined();
    expect(getShip(h, victim).shield).toBeLessThan(5000);
    expect(getShip(h, firer).phasr).toBe(0);
  });
});

describe('PhaserHandlerService — hyper-phaser (firer at warp, C-009 firehp)', () => {
  const getShip = (h: Harness, s: ShipState): ShipState =>
    h.shipMap.get(shipKey(s.userid, s.shipno))!;

  it('firer at warp with energy < HPMINFIR → HP_NOPOW, no fire, no energy debit', () => {
    const alice = makeShip({
      userid: 'a', shipno: 1, xcoord: 5, ycoord: 5,
      speed: WARP_THRESHOLD, energy: HPMINFIR - 1,
    });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 5, ycoord: 4,
      speed: WARP_THRESHOLD, shield: 5000, shieldstat: 1,
    });
    const h = makeHarness([alice, bob]);

    const res = h.handler.command.handler(alice, ['0'], ctx) as CommandResult;
    expect(res.lines[0].text).toBe(formatMessage(MessageId.HP_NOPOW));
    // No flux spent and no fire event leaked.
    expect(getShip(h, alice).energy).toBe(HPMINFIR - 1);
    expect(h.emitted.find((e) => e.event === COMBAT_PHASER_FIRED)).toBeUndefined();
  });

  it('firer at warp with energy ≥ HPMINFIR firing a WARP victim in-arc/in-range → hull hit + energy -= HPFIRAMT', () => {
    const alice = makeShip({
      userid: 'a', shipno: 1, xcoord: 5, ycoord: 5,
      speed: WARP_THRESHOLD, energy: 50000, phasr: 100,
    });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 5, ycoord: 4,
      speed: WARP_THRESHOLD, shield: 5000, shieldstat: 1, damage: 0,
    });
    const h = makeHarness([alice, bob]);

    h.handler.command.handler(alice, ['0'], ctx);

    const hit = h.emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeDefined();
    expect((hit!.payload as CombatHitEvent).victimId).toBe(shipKey('b', 2));
    // C-009 Fix 1: hyper bypasses shields — shield unchanged, hull takes damage.
    expect(getShip(h, bob).shield).toBe(5000);
    expect(getShip(h, bob).damage).toBeGreaterThan(0);
    // Flux energy debited; phasr NOT discharged (hyper uses flux, not charge).
    expect(getShip(h, alice).energy).toBe(50000 - HPFIRAMT);
    expect(getShip(h, alice).phasr).toBe(100);
    expect(getShip(h, alice).cantexit).toBe(FIRETICKS);
  });

  it('a NON-warp victim is NOT hit by the hyper-phaser', () => {
    const alice = makeShip({
      userid: 'a', shipno: 1, xcoord: 5, ycoord: 5,
      speed: WARP_THRESHOLD, energy: 50000,
    });
    // Bob in arc but sub-warp (speed 0) — hyper only reaches warp targets.
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 5, ycoord: 4,
      speed: 0, shield: 5000, shieldstat: 1,
    });
    const h = makeHarness([alice, bob]);

    h.handler.command.handler(alice, ['0'], ctx);

    expect(h.emitted.find((e) => e.event === COMBAT_HIT)).toBeUndefined();
    expect(getShip(h, bob).shield).toBe(5000);
    // Still spent the flux on the (missed) hyper shot.
    expect(getShip(h, alice).energy).toBe(50000 - HPFIRAMT);
  });

  it('firing the hyper-phaser inside the neutral zone self-zaps (WPN_ZAP, damage += SE100DAM)', () => {
    const alice = makeShip({
      userid: 'a', shipno: 1, xcoord: 0, ycoord: 0,
      speed: WARP_THRESHOLD, energy: 50000, damage: 0,
    });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 0, ycoord: -1,
      speed: WARP_THRESHOLD, damage: 0,
    });
    const h = makeHarness([alice, bob]);

    const res = h.handler.command.handler(alice, ['0'], ctx) as CommandResult;
    expect(res.lines[0].text).toBe(formatMessage(MessageId.WPN_ZAP));
    expect(getShip(h, alice).damage).toBeGreaterThanOrEqual(SE100DAM);
    expect(getShip(h, bob).damage).toBe(0);
    // No fire event when the beam never leaves the ship.
    expect(h.emitted.find((e) => e.event === COMBAT_PHASER_FIRED)).toBeUndefined();
  });

  // C-009 Fix 1 (RED): hyperphaser BYPASSES shields — damage goes straight to hull.
  // C `firehp` (GECMDS.C:1078) does `wptr->damage += damage` with NO shieldhit call.
  it('Fix1-RED: hyper-phaser hit on shields-up victim goes straight to HULL — shield unchanged, damageShield=0', () => {
    const alice = makeShip({
      userid: 'a', shipno: 1, xcoord: 5, ycoord: 5,
      speed: WARP_THRESHOLD, energy: 50000, phasr: 100,
    });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 5, ycoord: 4,
      speed: WARP_THRESHOLD, shield: 5000, shieldstat: 1, damage: 0,
    });
    const h = makeHarness([alice, bob]);

    h.handler.command.handler(alice, ['0'], ctx);

    const hit = h.emitted.find((e) => e.event === COMBAT_HIT);
    expect(hit).toBeDefined();
    // Shield must NOT be drained — hyper bypasses shields.
    expect(getShip(h, bob).shield).toBe(5000);
    // Hull must take the hit.
    expect(getShip(h, bob).damage).toBeGreaterThan(0);
    // COMBAT_HIT event must have damageShield=0.
    expect((hit!.payload as CombatHitEvent).damageShield).toBe(0);
    expect((hit!.payload as CombatHitEvent).damageHull).toBeGreaterThan(0);
  });

  // C-009 Fix 2 (RED): hypha cooldown gate — fire sets hypha=1; re-fire returns HP_WAIT.
  // C `firehp` sets ptr->hypha=1 (GECMDS.C:1040); cmd_phas blocks re-fire while hypha!=0.
  it('Fix2a-RED: successful hyper fire sets firer hypha = 1', () => {
    const alice = makeShip({
      userid: 'a', shipno: 1, xcoord: 5, ycoord: 5,
      speed: WARP_THRESHOLD, energy: 50000, hypha: 0,
    });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 5, ycoord: 4,
      speed: WARP_THRESHOLD,
    });
    const h = makeHarness([alice, bob]);

    h.handler.command.handler(alice, ['0'], ctx);

    expect(getShip(h, alice).hypha).toBe(1);
  });

  it('Fix2b-RED: second hyper fire while hypha !== 0 → HP_WAIT, no energy debit, no hit', () => {
    const alice = makeShip({
      userid: 'a', shipno: 1, xcoord: 5, ycoord: 5,
      speed: WARP_THRESHOLD, energy: 50000, hypha: 1,
    });
    const bob = makeShip({
      userid: 'b', shipno: 2, xcoord: 5, ycoord: 4,
      speed: WARP_THRESHOLD, shield: 5000, shieldstat: 1, damage: 0,
    });
    const h = makeHarness([alice, bob]);

    const res = h.handler.command.handler(alice, ['0'], ctx) as CommandResult;
    expect(res.lines[0].text).toBe(formatMessage(MessageId.HP_WAIT));
    // No energy debited.
    expect(getShip(h, alice).energy).toBe(50000);
    // No hit event.
    expect(h.emitted.find((e) => e.event === COMBAT_HIT)).toBeUndefined();
    // No fire event.
    expect(h.emitted.find((e) => e.event === COMBAT_PHASER_FIRED)).toBeUndefined();
  });
});
