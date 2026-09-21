/**
 * The galaxy with every AI house rule OFF — canon's AI — does what canon's
 * would, where ours deliberately does not. This is the other half of the
 * passive hub-idler scenario, run on the same seeds: there, with the port's
 * sanctuary, a pilot parked on the hub is never claimed. Here, as in canon, a
 * Cybertron locks them, because canon's lock-on scan has no neutral test:
 *   GECYBS.C:709 `if (ptr->cybmine == (byte)255)`
 * — though canon's firing gates still keep it from shooting a pilot inside the
 * zone, so the pilot is never hit:
 *   GECMDS.C:951 `if (othusn != usrn && !neutral(&wptr->coord))` (firep)
 *   GECMDS.C:1047 `if (othusn != usrn && !neutral(&wptr->coord))` (firehp)
 * @see src/game/ai/house-rules.ts, issue #63
 */
vi.hoisted(() => { process.env.UNIVMAX = '100'; });

import { GalaxySim } from './galaxy-sim';
import { CANON_RULES } from '../../src/game/ai/house-rules';

let current: GalaxySim | undefined;
afterEach(() => {
  current?.dispose();
  current = undefined;
  vi.useRealTimers();
});

describe.each([1, 2, 3])('seed %i, canon rules', (seed) => {
  it('a pilot parked on the hub IS claimed — and still never hit', async () => {
    GalaxySim.installClock();
    const sim = await GalaxySim.create({ seed, rules: CANON_RULES });
    current = sim;
    const pilot = sim.addPilot({ name: 'Idler', classNumber: 1, at: { x: 0.5, y: 0.5 } });
    let claimedAt: number | undefined;

    await sim.run({
      seconds: 3600,
      every: () => {
        if (claimedAt === undefined && sim.cybertrons().some((c) => c.cybmine === pilot.channel)) claimedAt = sim.elapsed;
      },
    });

    expect(claimedAt).toBeDefined();
    expect(pilot.damage).toBe(0);
  });
});
