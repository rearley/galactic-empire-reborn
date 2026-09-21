/**
 * The simulation harness boots a real galaxy and moves it. @see ./galaxy-sim.ts
 */
vi.hoisted(() => { process.env.UNIVMAX = '100'; });

import { GalaxySim } from './galaxy-sim';
import { SHIP_CLASSES } from '../../prisma/seed/ship-classes';
import { UNIVMAX } from '../../src/game/constants';

describe('GalaxySim', () => {
  let sim: GalaxySim;
  beforeEach(async () => {
    GalaxySim.installClock();
    sim = await GalaxySim.create({ seed: 1 });
  });
  afterEach(() => {
    sim.dispose();
    vi.useRealTimers();
  });

  it('runs at the deployed galaxy size', () => {
    expect(UNIVMAX).toBe(100);
  });

  it('boot-seeds Cybertrons exactly as createSpawn writes them', () => {
    const cybs = sim.cybertrons();
    expect(cybs.length).toBeGreaterThan(0);
    for (const c of cybs) {
      const cls = SHIP_CLASSES.find((k) => k.classNumber === c.shpclass)!;
      expect(cls.category).toBe('CPU_COMBATIVE');
      expect(c).toMatchObject({ status: 2, cybmine: 255, cybupdate: 100, holdcourse: 0, topspeed: cls.maxWarp, phasr: 100 });
    }
  });

  it('moves them: given a pilot to hunt, a Cybertron travels within ten simulated minutes', async () => {
    // With nobody in the galaxy a fresh hull holds `speed2b` 0 until its idle
    // re-roll, 100-200 activations away — canon, not a harness fault. A pilot
    // in open space gives them a reason to move.
    sim.addPilot({ name: 'Bait', classNumber: 1, at: { x: 40.5, y: 40.5 } });
    const start = new Map(sim.cybertrons().map((c) => [c.userid, { x: c.xcoord, y: c.ycoord }]));
    const t0 = process.hrtime.bigint();
    await sim.run({ seconds: 600 });
    const wall = Number(process.hrtime.bigint() - t0) / 1e6;
    const moved = sim.cybertrons().filter((c) => {
      const s = start.get(c.userid);
      return s && Math.hypot(c.xcoord - s.x, c.ycoord - s.y) > 0.1;
    });
    expect(moved.length).toBeGreaterThan(0);
    // Well under a second of wall time per ten simulated minutes is what lets
    // the scenarios live in the default run. @see the plan's Task 5
    expect(wall).toBeLessThan(5_000);
  });
});
