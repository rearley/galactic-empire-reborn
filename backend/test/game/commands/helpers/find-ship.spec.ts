import { findShip, NOLOCK_SENTINEL } from '../../../../src/game/commands/helpers/find-ship';
import { ShipState } from '../../../../src/game/ship/ship-state.types';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'me', shipno: 1, shipname: 'Self', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 0,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: NOLOCK_SENTINEL, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  };
}

const SCAN_RANGE = 100_000; // distance × 10000 ≤ this → in range; ie distance ≤ 10

describe('findShip', () => {
  it('rejects empty query', () => {
    const me = makeShip();
    const res = findShip('', me, [me], SCAN_RANGE);
    expect(res.ok).toBe(false);
  });

  describe('name-match', () => {
    it('finds a ship by case-insensitive prefix', () => {
      const me = makeShip();
      const enemy = makeShip({ userid: 'e', shipno: 1, shipname: 'Enterprise', xcoord: 1, ycoord: 0 });
      const res = findShip('ent', me, [me, enemy], SCAN_RANGE);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.ship.shipname).toBe('Enterprise');
    });

    it('skips self', () => {
      const me = makeShip({ shipname: 'Same' });
      const res = findShip('sam', me, [me], SCAN_RANGE);
      expect(res.ok).toBe(false);
    });

    it('skips out-of-range ships', () => {
      const me = makeShip();
      const far = makeShip({ userid: 'f', shipno: 1, shipname: 'Far', xcoord: 1000, ycoord: 0 });
      const res = findShip('far', me, [me, far], SCAN_RANGE);
      expect(res.ok).toBe(false);
    });

    it('skips ships not ingame', () => {
      const me = makeShip();
      const dead = makeShip({ userid: 'd', shipno: 1, shipname: 'Dead', status: 0, xcoord: 1, ycoord: 0 });
      const res = findShip('dea', me, [me, dead], SCAN_RANGE);
      expect(res.ok).toBe(false);
    });
  });

  describe('@ token', () => {
    it('returns NOLOCK when contextShip.lock < 0', () => {
      const me = makeShip({ lock: NOLOCK_SENTINEL });
      const res = findShip('@', me, [me], SCAN_RANGE);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.clearedLock).toBe(true);
    });

    it('resolves a valid lock to the locked ship', () => {
      const me = makeShip({ lock: 1 });
      const enemy = makeShip({ userid: 'e', shipno: 1, shipname: 'Locked', xcoord: 1, ycoord: 0 });
      const res = findShip('@', me, [me, enemy], SCAN_RANGE);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.ship.shipname).toBe('Locked');
    });

    it('lazy-clears the lock when target moves out of scan range', () => {
      const me = makeShip({ lock: 1 });
      const enemy = makeShip({ userid: 'e', shipno: 1, shipname: 'Far', xcoord: 1000, ycoord: 0 });
      const res = findShip('@', me, [me, enemy], SCAN_RANGE);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.clearedLock).toBe(true);
    });

    it('lazy-clears when locked target is no longer ingame', () => {
      const me = makeShip({ lock: 1 });
      const dead = makeShip({ userid: 'e', shipno: 1, shipname: 'Dead', status: 0, xcoord: 1, ycoord: 0 });
      const res = findShip('@', me, [me, dead], SCAN_RANGE);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.clearedLock).toBe(true);
    });
  });
});
