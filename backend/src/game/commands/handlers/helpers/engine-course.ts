/**
 * Shared course rule for the two engine orders, `imp` and `war`.
 *
 * C has no autopilot — `cmd_navigate` only reports a bearing (GECMDS.C:5120),
 * and `cmd_warp`/`cmd_impulse` unconditionally set
 * `head2b = normal(heading + degrees)` (GECMDS.C:625, :519). This port added
 * `nav`'s `holdcourse` autopilot on top, and the two rules collided in both
 * directions:
 *
 *  - A bare `war 4` recomputed `heading + 0` and reported it. With the
 *    autopilot mid-turn, or with a `rot` turn still swinging round, that is a
 *    course the ship is not flying and will not fly — and writing it back
 *    cancelled the turn, so "point at the planet, then engage" did nothing.
 *  - `war 4 90` wrote head2b but left `holdcourse` engaged, so the physics
 *    tick steered straight back to the autopilot's course and the pilot's
 *    explicit turn vanished.
 *
 * The rule: naming a course is a steering order and takes the helm back; a
 * bare speed order leaves the autopilot flying and reports its course.
 */

export interface EngineCourse {
  /** Course to report to the pilot. */
  readonly deg: number;
  /** Whether the caller should write `head2b` — false while the autopilot flies. */
  readonly setHeading: boolean;
  /** Whether the caller should disengage `holdcourse` and clear the nav target. */
  readonly releaseAutopilot: boolean;
}

export interface EngineCourseShip {
  readonly heading: number;
  /** Heading the ship is turning TOWARD — differs from `heading` mid-turn. */
  readonly head2b: number;
  readonly holdcourse: number;
  readonly navTargetX: number | null;
  readonly navTargetY: number | null;
  readonly xcoord: number;
  readonly ycoord: number;
}

/**
 * Bearing in degrees from one point to another, 0 = north, clockwise.
 * Same formula as `nav`'s, so the two commands cannot disagree.
 * @see nav.handler.ts calcBearing
 */
function bearingTo(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.round(((Math.atan2(toX - fromX, -(toY - fromY)) * 180) / Math.PI + 360) % 360);
}

export function resolveEngineCourse(
  ship: EngineCourseShip,
  courseGiven: boolean,
  courseDelta: number,
): EngineCourse {
  if (courseGiven) {
    // GECMDS.C:625 — relative to current heading, normalised.
    const deg = Math.round((ship.heading + courseDelta + 360) % 360) % 360;
    return { deg, setHeading: true, releaseAutopilot: true };
  }

  // A turn already ordered by `rot` is a steering order in progress. Writing
  // `heading + 0` over it froze the ship part-way round, so "point at the
  // planet, then engage" silently did not work.
  if (Math.round(ship.head2b) !== Math.round(ship.heading)) {
    return {
      deg: Math.round((ship.head2b + 360) % 360) % 360,
      setHeading: false,
      releaseAutopilot: false,
    };
  }

  const deg = Math.round((ship.heading + 360) % 360) % 360;
  return { deg, setHeading: true, releaseAutopilot: false };
}
