/**
 * A Cybertron that hyperwarps to its prey leaves hyperspace to fight — and so
 * does canon's. #66 audited the 2026-09-06 entry "Cybertrons leave hyperspace
 * to fight; canon's never do", which rested on canon's AI never passing through
 * `accel()`. It does. The movement tick walks EVERY ship in the game,
 *   GEMAIN.C:2481 `accel(wptr,zothusn);`
 * and an AI hull is in the game:
 *   GEMAIN.C:2663 `if (shpno >= nterms && warshpoff(shpno)->status == GESTAT_AUTO)`
 * so when the close band drops `speed2b` under warp 1, canon's own deceleration
 * takes it out of hyperspace:
 *   GEFUNCS.C:538 `if ((ptr->speed2b < 1000) && (ptr->speed/1000 >=1) && ((ptr->speed-decelrate)/1000 <1))`
 * The port applies the same transition to every ship, AI included. There is no
 * deviation; this pins the shared behaviour end to end. @see docs/DECISIONS.md
 */
vi.hoisted(() => { process.env.UNIVMAX = '100'; });

import { GalaxySim } from './galaxy-sim';
import { shipKey } from '../../src/game/ship/ship-state.types';

let current: GalaxySim | undefined;
afterEach(() => {
  current?.dispose();
  current = undefined;
  vi.useRealTimers();
});

describe.each([1, 2, 3])('seed %i', (seed) => {
  it('a Cybertron hyperwarps to a distant pilot, then drops out of hyperspace to engage, still holding its claim', async () => {
    GalaxySim.installClock();
    const sim = await GalaxySim.create({ seed });
    current = sim;
    const pilot = sim.addPilot({ name: 'Far', classNumber: 1, at: { x: 60.5, y: 60.5 } });
    const wentIn = new Set<string>();
    let cameOut: string | undefined;

    await sim.run({
      seconds: 3600,
      every: () => {
        for (const c of sim.cybertrons()) {
          if (c.cybmine !== pilot.channel) continue;
          const key = shipKey(c.userid, c.shipno);
          if (c.where === 1) wentIn.add(key);
          else if (wentIn.has(key)) { cameOut = key; return false; }
        }
      },
    });

    expect(wentIn.size).toBeGreaterThan(0);
    expect(cameOut).toBeDefined();
  });
});
