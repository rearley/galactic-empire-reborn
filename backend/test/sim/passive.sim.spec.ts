/**
 * Passive pilots, a real galaxy of Cybertrons, hours of simulated play.
 *
 * The pilots never fire, so anything that goes wrong is the AI's doing. Every
 * scenario runs the per-second invariants (./sim-invariants.ts), and a failure
 * prints the offending Cybertron's `sys trace`.
 *
 * The durations and the ten-minute bound are properties of PLAY, not canon
 * values: four hours is long enough for every Cybertron to cycle through its
 * idle re-roll many times over (every 100-200 activations,
 * GECYBS.C:475 `ptr->cybupdate = 100 + gernd()%100;`).
 * @see issue #61, docs/superpowers/specs/2026-09-21-ai-galaxy-simulation-design.md
 */
vi.hoisted(() => { process.env.UNIVMAX = '100'; });

import { GalaxySim, commute } from './galaxy-sim';
import { createInvariantChecker, describeViolation } from './sim-invariants';
import { shipKey } from '../../src/game/ship/ship-state.types';

const SEEDS = [1, 2, 3] as const;
const HOURS = 3600;
const INTERCEPTOR = 1;

async function boot(seed: number): Promise<{ sim: GalaxySim; checker: ReturnType<typeof createInvariantChecker> }> {
  GalaxySim.installClock();
  const sim = await GalaxySim.create({ seed });
  return { sim, checker: createInvariantChecker(sim) };
}

function assertClean(checker: ReturnType<typeof createInvariantChecker>): void {
  expect(checker.violations.map(describeViolation).join('\n\n')).toBe('');
}

let current: GalaxySim | undefined;
afterEach(() => {
  current?.dispose();
  current = undefined;
  vi.useRealTimers();
});

describe.each(SEEDS)('seed %i', (seed) => {
  it('hub idler: a pilot parked on the hub for four hours is never claimed and never hit', async () => {
    const { sim, checker } = await boot(seed);
    current = sim;
    const pilot = sim.addPilot({ name: 'Idler', classNumber: INTERCEPTOR, at: { x: 0.5, y: 0.5 } });
    let everClaimed = false;

    await sim.run({
      seconds: 4 * HOURS,
      every: () => {
        checker.check();
        if (sim.cybertrons().some((c) => c.cybmine === pilot.channel)) everClaimed = true;
      },
    });

    assertClean(checker);
    expect(everClaimed).toBe(false);
    expect(pilot.damage).toBe(0);
  });

  it('parked out: a pilot stopped two sectors from the hub is claimed within ten minutes', async () => {
    const { sim, checker } = await boot(seed);
    current = sim;
    const pilot = sim.addPilot({ name: 'Parked', classNumber: INTERCEPTOR, at: { x: 2.5, y: 2.5 } });
    let claimedAt: number | undefined;

    await sim.run({
      seconds: 1 * HOURS,
      every: () => {
        checker.check();
        if (sim.cybertrons().some((c) => c.cybmine === pilot.channel)) {
          claimedAt = sim.elapsed;
          return false;
        }
      },
    });

    assertClean(checker);
    expect(claimedAt).toBeDefined();
    expect(claimedAt!).toBeLessThanOrEqual(600);
  });

  it('commuter: a pilot flying in and out of the hub for four hours never keeps a claim inside it', async () => {
    const { sim, checker } = await boot(seed);
    current = sim;
    sim.addPilot({
      name: 'Commuter',
      classNumber: INTERCEPTOR,
      at: { x: 0.5, y: 0.5 },
      script: commute({ x: 0.5, y: 0.5 }, { x: 3.5, y: 3.5 }, 300),
    });

    await sim.run({ seconds: 4 * HOURS, every: () => { checker.check(); } });

    assertClean(checker);
    // It must actually have been hunted, or the zone-claim rule never ran.
    const hunted = sim.events.some((e) => e.name === 'cybertron.target-acquired'
      && (e.payload as { targetShipKey?: string }).targetShipKey === shipKey('pilot_Commuter', 1));
    expect(hunted).toBe(true);
  });
});
