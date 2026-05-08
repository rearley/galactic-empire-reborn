/**
 * T021 — Unit tests for decideAutoShield (pure function).
 * Covers all guard conditions and trigger logic.
 * @see backend/src/game/ship/auto-shield.ts decideAutoShield
 * @see specs/019-physics-polish/spec.md US4
 */
import { decideAutoShield } from '../../../src/game/ship/auto-shield';
import { ShipState } from '../../../src/game/ship/ship-state.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false,
    dirty: false,
    ...overrides,
  };
}

describe('decideAutoShield', () => {
  it('returns raise when recentlyWarpedExit=true, shields down, not combat-locked', () => {
    const ship = makeShip({ shieldstat: 0, cantexit: 0, recentlyWarpedExit: true });
    expect(decideAutoShield(ship)).toEqual({ action: 'raise' });
  });

  it('returns raise when recentlySelfFiredTorp=true, shields down, not combat-locked', () => {
    const ship = makeShip({ shieldstat: 0, cantexit: 0, recentlySelfFiredTorp: true });
    expect(decideAutoShield(ship)).toEqual({ action: 'raise' });
  });

  it('returns raise when both triggers are set', () => {
    const ship = makeShip({ shieldstat: 0, cantexit: 0, recentlyWarpedExit: true, recentlySelfFiredTorp: true });
    expect(decideAutoShield(ship)).toEqual({ action: 'raise' });
  });

  it('returns noop when no trigger is set', () => {
    const ship = makeShip({ shieldstat: 0, cantexit: 0, recentlyWarpedExit: false, recentlySelfFiredTorp: false });
    expect(decideAutoShield(ship)).toEqual({ action: 'noop' });
  });

  it('returns noop when shields already up (shieldstat !== 0)', () => {
    const ship = makeShip({ shieldstat: 1, cantexit: 0, recentlyWarpedExit: true });
    expect(decideAutoShield(ship)).toEqual({ action: 'noop' });
  });

  it('returns noop when combat-locked (cantexit > 0)', () => {
    const ship = makeShip({ shieldstat: 0, cantexit: 3, recentlyWarpedExit: true });
    expect(decideAutoShield(ship)).toEqual({ action: 'noop' });
  });

  it('returns noop when triggers undefined (not set on ship)', () => {
    const ship = makeShip({ shieldstat: 0, cantexit: 0 });
    // recentlyWarpedExit and recentlySelfFiredTorp are undefined (falsy)
    expect(decideAutoShield(ship)).toEqual({ action: 'noop' });
  });
});
