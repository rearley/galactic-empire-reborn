import { Random, Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { rollRandamage } from '../../../src/game/combat/combat-math';
import { applyRandamage } from '../../../src/game/combat/randamage.apply';
import { SHIELDDM } from '../../../src/game/constants';
import { ShipState } from '../../../src/game/ship/ship-state.types';

/** Returns a Random that yields the given sequence of values. */
function seq(...values: number[]): Random {
  let i = 0;
  return { next: () => values[i++] };
}

function makeVictim(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 50, energy: 5000,
    phasr: 100, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 1, shieldstat: 1, shield: 100, cloak: 5,
    degrees: 0, percent: 0, tactical: 5, helm: 5, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 5, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

const ALL_CAPS = { hasShields: true, hasPhasers: true, hasTorpOrMissile: true, hasCloak: true };
const NO_CAPS  = { hasShields: false, hasPhasers: false, hasTorpOrMissile: false, hasCloak: false };

describe('rollRandamage — @see GEFUNCS.C:randamage 1956', () => {
  it('returns none when damagePct <= 20 (undamaged guard)', () => {
    // roll=0 would normally trigger damage, but damage<=20 exits early
    const result = rollRandamage(seq(0, 0, 0.5), 20, ALL_CAPS);
    expect(result).toEqual({ subsystem: 'none', magnitude: 0 });
  });

  it('returns none when damagePct is 0', () => {
    expect(rollRandamage(seq(0, 0, 0.5), 0, ALL_CAPS)).toEqual({ subsystem: 'none', magnitude: 0 });
  });

  it('returns none when roll is non-zero (most ticks no sub-damage)', () => {
    // v0=0.5, damagePct=50 → roll = floor(0.5 * (51/1.5)) = floor(17) = 17 ≠ 0
    const result = rollRandamage(seq(0.5), 50, ALL_CAPS);
    expect(result).toEqual({ subsystem: 'none', magnitude: 0 });
  });

  it('case 0 with hasShields → shield subsystem with negative magnitude', () => {
    // v0=0 → roll=0; v1=0 → case = floor(0*65536)%6 = 0 (shields); v2=0.5, damage=50 → mag=-floor(0.5*60)=-30
    const result = rollRandamage(seq(0, 0, 0.5), 50, ALL_CAPS);
    expect(result.subsystem).toBe('shield');
    expect(result.magnitude).toBe(-30);
    expect(result.magnitude).toBeLessThan(0);
  });

  it('case 0 without hasShields → none (no capability, no damage)', () => {
    const result = rollRandamage(seq(0, 0, 0.5), 50, { ...ALL_CAPS, hasShields: false });
    expect(result).toEqual({ subsystem: 'none', magnitude: 0 });
  });

  it('case 1 with hasPhasers → phasor subsystem with negative magnitude', () => {
    // v1 = 1/65536 → floor(v1*65536)%6 = 1
    const v1 = 1 / 65536;
    const result = rollRandamage(seq(0, v1, 0.5), 50, ALL_CAPS);
    expect(result.subsystem).toBe('phasor');
    expect(result.magnitude).toBeLessThan(0);
  });

  it('case 1 without hasPhasers → none', () => {
    const v1 = 1 / 65536;
    const result = rollRandamage(seq(0, v1, 0.5), 50, { ...ALL_CAPS, hasPhasers: false });
    expect(result).toEqual({ subsystem: 'none', magnitude: 0 });
  });

  it('case 2 with hasTorpOrMissile → firecntl in [0,19] (positive)', () => {
    // v1 = 2/65536 → case 2; v2=0.5 → floor(0.5*65536)%20 = 32768%20 = 8
    const v1 = 2 / 65536;
    const result = rollRandamage(seq(0, v1, 0.5), 50, ALL_CAPS);
    expect(result.subsystem).toBe('firecntl');
    expect(result.magnitude).toBeGreaterThanOrEqual(0);
    expect(result.magnitude).toBeLessThanOrEqual(19);
  });

  it('case 2 firecntl magnitude is exactly floor(rand*65536)%20', () => {
    const v1 = 2 / 65536;
    const v2 = 0.5; // floor(0.5*65536)%20 = 32768%20 = 8
    const result = rollRandamage(seq(0, v1, v2), 50, ALL_CAPS);
    expect(result.magnitude).toBe(8);
  });

  it('case 2 without hasTorpOrMissile → none', () => {
    const v1 = 2 / 65536;
    const result = rollRandamage(seq(0, v1, 0.5), 50, { ...ALL_CAPS, hasTorpOrMissile: false });
    expect(result).toEqual({ subsystem: 'none', magnitude: 0 });
  });

  it('case 3 with hasCloak → cloak subsystem with negative magnitude', () => {
    const v1 = 3 / 65536;
    const result = rollRandamage(seq(0, v1, 0.5), 50, ALL_CAPS);
    expect(result.subsystem).toBe('cloak');
    expect(result.magnitude).toBeLessThan(0);
  });

  it('case 3 without hasCloak → none', () => {
    const v1 = 3 / 65536;
    const result = rollRandamage(seq(0, v1, 0.5), 50, { ...ALL_CAPS, hasCloak: false });
    expect(result).toEqual({ subsystem: 'none', magnitude: 0 });
  });

  it('case 4 → tactical subsystem with negative magnitude (no capability cap)', () => {
    const v1 = 4 / 65536;
    const result = rollRandamage(seq(0, v1, 0.5), 50, ALL_CAPS);
    expect(result.subsystem).toBe('tactical');
    expect(result.magnitude).toBeLessThan(0);
  });

  it('case 5 → helm subsystem with negative magnitude (no capability cap)', () => {
    const v1 = 5 / 65536;
    const result = rollRandamage(seq(0, v1, 0.5), 50, ALL_CAPS);
    expect(result.subsystem).toBe('helm');
    expect(result.magnitude).toBeLessThan(0);
  });

  it('is deterministic — same seed produces same result', () => {
    const r1 = new Mulberry32Adapter(999);
    const r2 = new Mulberry32Adapter(999);
    expect(rollRandamage(r1, 80, ALL_CAPS)).toEqual(rollRandamage(r2, 80, ALL_CAPS));
  });

  it('higher damagePct → larger magnitude range (shield case)', () => {
    // magnitude = -floor(rand*(damagePct+10)); higher damagePct → more negative
    const low  = rollRandamage(seq(0, 0, 0.5), 30, ALL_CAPS);  // mag = -floor(0.5*40) = -20
    const high = rollRandamage(seq(0, 0, 0.5), 80, ALL_CAPS);  // mag = -floor(0.5*90) = -45
    expect(Math.abs(high.magnitude)).toBeGreaterThan(Math.abs(low.magnitude));
  });
});

describe('applyRandamage — shieldtype 20 guard + mutation', () => {
  it('shieldtype 20 → returns skipped, victim unchanged', () => {
    const victim = makeVictim({ damage: 80, shieldtype: 20, shield: 50 });
    const result = applyRandamage(seq(0, 0, 0.5), victim, ALL_CAPS, 20);
    expect(result).toEqual({ subsystem: 'skipped', magnitude: 0 });
    expect(victim.shield).toBe(50); // no mutation
  });

  it('shield case: mutates victim.shield = magnitude AND victim.shieldstat = SHIELDDM', () => {
    const victim = makeVictim({ damage: 50, shieldtype: 1, shield: 100, shieldstat: 1 });
    // seq(0,0,0.5): roll=0, case=0(shield), magnitude=-floor(0.5*60)=-30
    const result = applyRandamage(seq(0, 0, 0.5), victim, ALL_CAPS, 1);
    expect(result.subsystem).toBe('shield');
    expect(result.magnitude).toBe(-30);
    expect(victim.shield).toBe(-30);
    expect(victim.shieldstat).toBe(SHIELDDM);
    expect(SHIELDDM).toBe(3);
  });

  it('phasor case: mutates victim.phasr = magnitude', () => {
    const victim = makeVictim({ damage: 50, phasr: 100 });
    const v1 = 1 / 65536;
    const result = applyRandamage(seq(0, v1, 0.5), victim, ALL_CAPS, 1);
    expect(result.subsystem).toBe('phasor');
    expect(victim.phasr).toBe(result.magnitude);
    expect(victim.phasr).toBeLessThan(0);
  });

  it('firecntl case: mutates victim.firecntl = magnitude (non-negative)', () => {
    const victim = makeVictim({ damage: 50, firecntl: 0 });
    const v1 = 2 / 65536;
    const result = applyRandamage(seq(0, v1, 0.5), victim, ALL_CAPS, 1);
    expect(result.subsystem).toBe('firecntl');
    expect(victim.firecntl).toBe(result.magnitude);
    expect(victim.firecntl).toBeGreaterThanOrEqual(0);
  });

  it('cloak case: mutates victim.cloak = magnitude', () => {
    const victim = makeVictim({ damage: 50, cloak: 10 });
    const v1 = 3 / 65536;
    const result = applyRandamage(seq(0, v1, 0.5), victim, ALL_CAPS, 1);
    expect(result.subsystem).toBe('cloak');
    expect(victim.cloak).toBe(result.magnitude);
    expect(victim.cloak).toBeLessThan(0);
  });

  it('tactical case: mutates victim.tactical = magnitude', () => {
    const victim = makeVictim({ damage: 50, tactical: 10 });
    const v1 = 4 / 65536;
    const result = applyRandamage(seq(0, v1, 0.5), victim, ALL_CAPS, 1);
    expect(result.subsystem).toBe('tactical');
    expect(victim.tactical).toBe(result.magnitude);
  });

  it('helm case: mutates victim.helm = magnitude', () => {
    const victim = makeVictim({ damage: 50, helm: 10 });
    const v1 = 5 / 65536;
    const result = applyRandamage(seq(0, v1, 0.5), victim, ALL_CAPS, 1);
    expect(result.subsystem).toBe('helm');
    expect(victim.helm).toBe(result.magnitude);
  });

  it('none result: no mutation to victim', () => {
    const victim = makeVictim({ damage: 50, shield: 100, phasr: 100, firecntl: 5 });
    const before = { shield: victim.shield, phasr: victim.phasr, firecntl: victim.firecntl };
    // v0=0.5 → roll≠0 → none
    applyRandamage(seq(0.5), victim, ALL_CAPS, 1);
    expect(victim.shield).toBe(before.shield);
    expect(victim.phasr).toBe(before.phasr);
    expect(victim.firecntl).toBe(before.firecntl);
  });

  it('rolled case without capability → none, no mutation', () => {
    const victim = makeVictim({ damage: 50, shield: 100 });
    // case 0 (shields) but hasShields=false
    const result = applyRandamage(seq(0, 0, 0.5), victim, { ...ALL_CAPS, hasShields: false }, 1);
    expect(result).toEqual({ subsystem: 'none', magnitude: 0 });
    expect(victim.shield).toBe(100); // untouched
  });

  it('uses victim.damage as the damagePct', () => {
    const victim = makeVictim({ damage: 15, shieldtype: 1 }); // damage <= 20
    const result = applyRandamage(seq(0, 0, 0.5), victim, ALL_CAPS, 1);
    expect(result).toEqual({ subsystem: 'none', magnitude: 0 });
  });

  describe('the damage > 101 ceiling (documented divergence from C)', () => {
    /**
     * C: `a = (int)rndm((101.0 - ptr->damage)/1.5); if (a == 0) {...}`
     *    (GEFUNCS.C:1969)
     *
     * Above 101 total damage the argument goes negative, and the two languages
     * round differently: C's `(int)` truncates TOWARD ZERO (so anything in
     * (-1, 0] becomes 0 and randamage fires), while JS `Math.floor` rounds
     * toward -Infinity (so only an exact -0 stays 0). The port therefore fires
     * in a NARROWER band above the ceiling, not never — `Math.floor(-0)` is -0
     * and `-0 === 0` is true, so a zero draw still fires.
     *
     * Left as-is deliberately: what `rndm()` returns for a negative argument is
     * not knowable from the reference source — rndm is a MajorBBS library
     * function with no source here — so matching C exactly would be guesswork.
     * The region is also effectively unreachable: ships are destroyed at
     * damage >= 100 (combat-tick.service.ts), so a victim only sits above 101
     * for the remainder of the tick in which it dies.
     */
    it('a zero draw still fires above the ceiling (Math.floor(-0) === 0)', () => {
      const victim = makeVictim({ damage: 150, shieldtype: 1 });
      const result = applyRandamage(seq(0, 0, 0.5), victim, ALL_CAPS, 1);
      expect(result.subsystem).not.toBe('none');
    });

    it('a non-zero draw does NOT fire above the ceiling, where C would', () => {
      // 0.5 * ((101-150)/1.5) = -16.3 -> Math.floor = -17 (no fire),
      // whereas C's (int) of the same magnitude band can still yield 0.
      const victim = makeVictim({ damage: 150, shieldtype: 1 });
      const result = applyRandamage(seq(0.5, 0, 0.5), victim, ALL_CAPS, 1);
      expect(result).toEqual({ subsystem: 'none', magnitude: 0 });
    });

    it('still fires just below the ceiling, where C and this port agree', () => {
      // (101-100)/1.5 = 0.667 -> rand 0 -> floor(0) === trunc(0) === 0 -> fires
      const victim = makeVictim({ damage: 100, shieldtype: 1 });
      const result = applyRandamage(seq(0, 0, 0.5), victim, ALL_CAPS, 1);
      expect(result.subsystem).not.toBe('none');
    });
  });
});
