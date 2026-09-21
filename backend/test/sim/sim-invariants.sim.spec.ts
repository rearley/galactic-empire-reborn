/**
 * The simulation's invariants fire on exactly what they describe, and explain
 * themselves with the offending Cybertron's `sys trace`. Driven with a
 * hand-built world rather than a sim, so each rule's trigger is deterministic.
 * @see ./sim-invariants.ts
 */
import { createInvariantChecker, describeViolation, HUB_TRAP_SECONDS, type SimWorld } from './sim-invariants';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { makeShip } from '../helpers/make-ship';

function world(ships: ShipState[]): SimWorld & { ships: ShipState[]; tickOn(): void } {
  const w = {
    elapsed: 0,
    ships,
    events: [] as SimWorld['events'],
    cybertrons: () => w.ships.filter((s) => s.status === 2),
    pilots: () => w.ships.filter((s) => s.status === 1),
    trace: (key: string) => [`TRACE ${key}`],
    tickOn: () => { w.elapsed++; },
  };
  return w;
}

const cyb = (over: Partial<ShipState>): ShipState =>
  makeShip({ userid: 'Cybrg-205', shipno: 205, shipname: 'Obliterator', status: 2, cybmine: 255, tick: 5, holdcourse: 0, ...over });
const pilot = (over: Partial<ShipState>): ShipState =>
  makeShip({ userid: 'pilot_Wasp', shipno: 1, shipname: 'Wasp', username: 'Wasp', status: 1, channel: 18, ...over });

/** One activation: the countdown resets upward, as cybLives does. */
function activate(s: ShipState): void { s.tick += 40; }
function second(w: ReturnType<typeof world>, c: ReturnType<typeof createInvariantChecker>, s?: ShipState): void {
  w.tickOn();
  if (s && s.tick > 0) s.tick--;
  c.check();
}

describe('hub trap', () => {
  it(`fires once a Cybertron has sat in sector (0,0) for more than ${HUB_TRAP_SECONDS} s`, () => {
    const c1 = cyb({ xcoord: 0.5, ycoord: 0.5 });
    const w = world([c1]);
    const checker = createInvariantChecker(w);
    for (let i = 0; i < HUB_TRAP_SECONDS; i++) second(w, checker);
    expect(checker.violations).toEqual([]);
    second(w, checker);
    expect(checker.violations.map((v) => [v.rule, v.shipKey])).toEqual([['hub-trap', 'Cybrg-205:205']]);
  });

  it('resets the clock when the ship leaves the sector', () => {
    const c1 = cyb({ xcoord: 0.5, ycoord: 0.5 });
    const w = world([c1]);
    const checker = createInvariantChecker(w);
    for (let i = 0; i < HUB_TRAP_SECONDS - 1; i++) second(w, checker);
    c1.xcoord = 1.5;
    second(w, checker);
    c1.xcoord = 0.5;
    for (let i = 0; i < HUB_TRAP_SECONDS - 1; i++) second(w, checker);
    expect(checker.violations).toEqual([]);
  });

  it('reports a trapped ship once, not every second after', () => {
    const w = world([cyb({ xcoord: 0.5, ycoord: 0.5 })]);
    const checker = createInvariantChecker(w);
    for (let i = 0; i < HUB_TRAP_SECONDS + 50; i++) second(w, checker);
    expect(checker.violations).toHaveLength(1);
  });
});

describe('a claim that must go', () => {
  it('allows the holder its held course plus one activation to drop a claim on a pilot who left', () => {
    const c1 = cyb({ cybmine: 18, holdcourse: 2, xcoord: 9, ycoord: 9 });
    const w = world([c1]); // no pilot on channel 18
    const checker = createInvariantChecker(w);
    second(w, checker, c1);
    activate(c1); second(w, checker, c1); // spends holdcourse
    activate(c1); second(w, checker, c1);
    activate(c1); second(w, checker, c1); // the one activation it is owed
    expect(checker.violations).toEqual([]);
    activate(c1); second(w, checker, c1);
    expect(checker.violations.map((v) => v.rule)).toEqual(['stale-claim']);
  });

  it('is satisfied the moment the claim is released', () => {
    const c1 = cyb({ cybmine: 18, xcoord: 9, ycoord: 9 });
    const w = world([c1]);
    const checker = createInvariantChecker(w);
    second(w, checker, c1);
    activate(c1); c1.cybmine = 255; second(w, checker, c1);
    for (let i = 0; i < 5; i++) { activate(c1); second(w, checker, c1); }
    expect(checker.violations).toEqual([]);
  });

  it('treats a claim on a pilot inside the zone the same way', () => {
    const c1 = cyb({ cybmine: 18, xcoord: 3, ycoord: 3 });
    const w = world([c1, pilot({ xcoord: 0.5, ycoord: 0.5 })]);
    const checker = createInvariantChecker(w);
    for (let i = 0; i < 3; i++) { activate(c1); second(w, checker, c1); }
    expect(checker.violations.map((v) => v.rule)).toEqual(['zone-claim']);
  });

  it('leaves a live claim on a pilot in open space alone', () => {
    const c1 = cyb({ cybmine: 18, xcoord: 3, ycoord: 3 });
    const w = world([c1, pilot({ xcoord: 4.5, ycoord: 4.5 })]);
    const checker = createInvariantChecker(w);
    for (let i = 0; i < 10; i++) { activate(c1); second(w, checker, c1); }
    expect(checker.violations).toEqual([]);
  });
});

describe('fire into the zone', () => {
  it('fires on a Cybertron hit landing on a pilot in sector (0,0)', () => {
    const p = pilot({ xcoord: 0.5, ycoord: 0.5 });
    const w = world([cyb({ xcoord: 1.2, ycoord: 0.5 }), p]);
    const checker = createInvariantChecker(w);
    w.events.push({ at: 1, name: 'combat.hit', payload: { attackerId: 'Cybrg-205:205', victimId: 'pilot_Wasp:1' } });
    second(w, checker);
    expect(checker.violations.map((v) => v.rule)).toEqual(['fire-into-zone']);
  });

  it('ignores a player\'s hit, and a hit in open space', () => {
    const w = world([cyb({ xcoord: 5, ycoord: 5 }), pilot({ xcoord: 5.1, ycoord: 5 })]);
    const checker = createInvariantChecker(w);
    w.events.push({ at: 1, name: 'combat.hit', payload: { attackerId: 'Cybrg-205:205', victimId: 'pilot_Wasp:1' } });
    w.events.push({ at: 1, name: 'combat.hit', payload: { attackerId: 'pilot_Wasp:1', victimId: 'Cybrg-205:205' } });
    second(w, checker);
    expect(checker.violations).toEqual([]);
  });
});

describe('describeViolation', () => {
  it('says what broke, when, and ends with the ship\'s sys trace', () => {
    const w = world([cyb({ xcoord: 0.5, ycoord: 0.5 })]);
    const checker = createInvariantChecker(w);
    for (let i = 0; i <= HUB_TRAP_SECONDS; i++) second(w, checker);
    const text = describeViolation(checker.violations[0]);
    expect(text).toMatch(/^hub-trap at t=601s: Cybrg-205:205/);
    expect(text.split('\n').at(-1)).toBe('  TRACE Cybrg-205:205');
  });
});
