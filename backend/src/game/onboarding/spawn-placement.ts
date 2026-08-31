/**
 * Minimum distance, in raw units, a new ship may spawn from a planet.
 * @see GEFUNCS.C:212 `if (ddistance < 1000) flag = 1;`
 */
export const SPAWN_MIN_PLANET_DISTANCE = 1000;

/** Bounded so a crowded sector cannot spin forever; C's loop is unbounded. */
const MAX_ROLLS = 50;

interface Point {
  xcoord: number;
  ycoord: number;
}

export interface SpawnPlacement extends Point {
  heading: number;
}

/**
 * Places a brand-new ship inside the spawn sector.
 *
 * C drops it at a random point in the neutral sector, re-rolling while it lands
 * within 1000 raw units of a planet, and gives it a random heading
 * (GEFUNCS.C:195-217).
 *
 * The port used to place every new pilot at exactly the sector's corner
 * (0.0, 0.0) facing 0. Heading 0 decreases y, so a fresh captain who set a
 * course for the next sector and engaged warp drifted off the bottom edge while
 * still turning, wrapped round to sector (0,14), and met a Cybertron within
 * seconds of their first command — and every new player was stacked on the same
 * point.
 */
export function rollSpawnPosition(
  sector: { x: number; y: number },
  planets: Point[],
  rand: () => number,
): SpawnPlacement {
  let xcoord = 0;
  let ycoord = 0;

  for (let attempt = 0; attempt < MAX_ROLLS; attempt++) {
    // C: NEUTRAL_X + rndm(.9999) — inside the sector, never on its edge.
    xcoord = sector.x + rand() * 0.9999;
    ycoord = sector.y + rand() * 0.9999;

    const clear = planets.every(
      (p) => Math.hypot(xcoord - p.xcoord, ycoord - p.ycoord) * 10_000 >= SPAWN_MIN_PLANET_DISTANCE,
    );
    if (clear) break;
  }

  // C: tmpshp.heading = rndm(359.99)
  return { xcoord, ycoord, heading: Math.floor(rand() * 360) % 360 };
}
