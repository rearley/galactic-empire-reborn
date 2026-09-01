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
 *    autopilot mid-turn that is a course the ship is not flying and will not
 *    fly, directly contradicting the bearing `nav` had just printed.
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

  const flying =
    ship.holdcourse > 0 && ship.navTargetX !== null && ship.navTargetY !== null;

  if (flying) {
    // Sector centre, matching what `nav` steers toward.
    const deg = bearingTo(
      ship.xcoord,
      ship.ycoord,
      (ship.navTargetX as number) + 0.5,
      (ship.navTargetY as number) + 0.5,
    );
    return { deg, setHeading: false, releaseAutopilot: false };
  }

  const deg = Math.round((ship.heading + 360) % 360) % 360;
  return { deg, setHeading: true, releaseAutopilot: false };
}
