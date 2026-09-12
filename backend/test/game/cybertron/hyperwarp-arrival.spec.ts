/**
 * T020b — SC-003 hyperwarp travel-time: hyperwarp arrives in < half the ticks of top-speed-only pursuit.
 *
 * @see GECYBS.C — cyb_check_lockon pursuit bands (SC-003)
 * @see specs/007-cybertron-ai/tasks.md T020b
 */
import { pickPursuitBand } from '../../../src/game/cybertron/cyb-decisions';
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';

/**
 * Simulate a Cybertron chasing a stationary target for up to maxTicks physics ticks.
 * Returns the number of ticks until within 1.0 unit (co-sector), or maxTicks if never arrived.
 *
 * useHyperwarp=true uses pickPursuitBand normally (hyperwarp fires when d >= hyperdist1).
 * useHyperwarp=false caps to topSpeed always (simulates close-band-only baseline).
 */
function simulatePursuit(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  hyperdist1: number,
  hyperdist2: number,
  classMaxShields: number,
  topSpeed: number,
  useHyperwarp: boolean,
  seed: number,
  maxTicks = 5000,
): number {
  const rand = new Mulberry32Adapter(seed);
  let cx = startX;
  let cy = startY;
  let where = 0;

  const TICK_SECONDS = 6;
  const COORD_SCALE = 10_000; // 1 coord unit ≈ 10,000 game units

  for (let tick = 0; tick < maxTicks; tick++) {
    const dx = targetX - cx;
    const dy = targetY - cy;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= 1.0) return tick;

    let desiredSpeed: number;
    let nextWhere: number;

    if (useHyperwarp) {
      const band = pickPursuitBand(distance, hyperdist1, hyperdist2, where, topSpeed, rand, { where: 0, speed2b: 0 });
      desiredSpeed = band.desiredSpeed;
      // `where` is written only when the band enters hyperwarp; anything else
      // leaves the ship where it was, and deceleration takes it out. @see #42
      nextWhere = band.where ?? where;
    } else {
      desiredSpeed = topSpeed;
      nextWhere = 0;
    }

    // Move toward target at desiredSpeed (game units per second × tick seconds ÷ coord scale)
    const moveAmount = (desiredSpeed * TICK_SECONDS) / COORD_SCALE;
    if (distance > 0) {
      cx += (dx / distance) * Math.min(moveAmount, distance);
      cy += (dy / distance) * Math.min(moveAmount, distance);
    }
    where = nextWhere;
  }

  return maxTicks; // never arrived
}

// ─── T020b: hyperwarp travel-time ────────────────────────────────────────────

describe('T020b (SC-003) — hyperwarp travel-time: arrives in < half the ticks of top-speed pursuit', () => {
  const hyperdist1 = 25;
  const hyperdist2 = 10;
  const classMaxShields = 2;
  const topSpeed = 8000;
  const seed = 42;

  it('hyperwarp mode arrives strictly before top-speed-only baseline for distant target', () => {
    // Target placed exactly hyperdist1 + 5 = 30 sectors away
    const startX = 0;
    const startY = 0;
    const targetX = 30; // hyperdist1 + 5
    const targetY = 0;

    const ticksA = simulatePursuit(startX, startY, targetX, targetY, hyperdist1, hyperdist2, classMaxShields, topSpeed, true, seed);
    const ticksB = simulatePursuit(startX, startY, targetX, targetY, hyperdist1, hyperdist2, classMaxShields, topSpeed, false, seed);

    // Hyperwarp must arrive in less than half the baseline ticks (SC-003)
    expect(ticksA).toBeLessThan(ticksB / 2);
  });

  it('very distant target (50 sectors): hyperwarp provides > 2× speedup', () => {
    const ticksA = simulatePursuit(0, 0, 50, 0, hyperdist1, hyperdist2, classMaxShields, topSpeed, true, seed);
    const ticksB = simulatePursuit(0, 0, 50, 0, hyperdist1, hyperdist2, classMaxShields, topSpeed, false, seed);
    expect(ticksA).toBeLessThan(ticksB / 2);
  });

  it('close target (within brake band): hyperwarp and top-speed arrive in similar ticks', () => {
    // Target within brake band — hyperwarp won't engage, both modes use topSpeed
    const ticksA = simulatePursuit(0, 0, 15, 0, hyperdist1, hyperdist2, classMaxShields, topSpeed, true, seed);
    const ticksB = simulatePursuit(0, 0, 15, 0, hyperdist1, hyperdist2, classMaxShields, topSpeed, false, seed);
    // Both should arrive at same time (both use topSpeed in brake band)
    expect(ticksA).toBe(ticksB);
  });
});
