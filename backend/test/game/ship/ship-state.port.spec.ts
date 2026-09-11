import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import type { ShipStatePort } from '../../../src/game/ship/ship-state.port';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import type { PlanetStatePort } from '../../../src/game/planet/planet-state.port';
import { makeShip } from '../../helpers/make-ship';

/**
 * The two narrow seams that replaced the ship <-> planet <-> tick forwardRef
 * cycle. These are compile-time assertions first: if either real service stops
 * satisfying its port, this file fails to compile, which is the point. The
 * runtime assertions are incidental.
 */
describe('state ports', () => {
  it('ShipStatePort is satisfied by the real ShipStateService', () => {
    const port: ShipStatePort = {} as ShipStateService;
    expect(port).toBeDefined();
  });

  it('PlanetStatePort is satisfied by the real PlanetStateService', () => {
    const port: PlanetStatePort = {} as PlanetStateService;
    expect(port).toBeDefined();
  });

  // The conformance probe in the next two tests is the object LITERAL, not the
  // `expect`. Assigning a literal to the port type fires TypeScript's
  // missing-property and excess-property checks, so adding a method to either
  // port, or dropping one, fails these tests at COMPILE time. The
  // `Object.keys` assertions are incidental: they restate the shape of a
  // literal written two lines above, and prove nothing on their own.
  //
  // Do not "strengthen" them by reflecting over `ShipStateService.prototype` —
  // the port is deliberately a narrow subset of that class, so such a test
  // would fail the next time an unrelated public method is added to the
  // service, which is precisely the coupling the port exists to remove.
  it('ShipStatePort exposes only what the planet subsystem consumes', () => {
    const ship = makeShip({ userid: 'u1', shipno: 1 });
    const store = new Map([['u1:1', ship]]);
    const port: ShipStatePort = {
      get: (userid, shipno) => store.get(`${userid}:${shipno}`),
      mutate: (userid, shipno, fn) => {
        const s = store.get(`${userid}:${shipno}`);
        if (!s) return undefined;
        fn(s);
        return s;
      },
      findByUserid: (userid) => [...store.values()].filter((s) => s.userid === userid),
    };

    expect(Object.keys(port).sort()).toEqual(['findByUserid', 'get', 'mutate']);
    expect(port.get('u1', 1)).toBe(ship);
    expect(port.findByUserid('u1')).toHaveLength(1);
    port.mutate('u1', 1, (s) => { s.shipname = 'Renamed'; });
    expect(ship.shipname).toBe('Renamed');
  });

  it('PlanetStatePort exposes only the lookup the ship subsystem consumes', () => {
    const port: PlanetStatePort = { get: () => undefined };
    expect(Object.keys(port)).toEqual(['get']);
    expect(port.get(0, 0, 1)).toBeUndefined();
  });
});
