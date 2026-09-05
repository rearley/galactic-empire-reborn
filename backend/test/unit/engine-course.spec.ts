import { resolveEngineCourse } from '../../src/game/commands/handlers/helpers/engine-course';

/**
 * `nav 4 4` answers "bearing 175", then `war 4` answers "new course 132" and
 * the ship flies 175. Both numbers came from the same two commands and only
 * one of them was true: `war`/`imp` reported `heading + delta` off the ship's
 * CURRENT heading, which the autopilot had not turned yet and would steer past
 * anyway. A pilot reading the second line concluded the autopilot had not
 * taken and re-issued the course by hand.
 *
 * Worse, `war <n> <deg>` set head2b without dropping the autopilot, so an
 * explicit turn was silently overridden on the next physics tick. `imp` had
 * already been fixed for that; `war` grew its course argument later and did
 * not inherit the fix.
 */
const AT_ORIGIN = {
  heading: 132,
  head2b: 132,
  xcoord: 4.4,
  ycoord: 3.5,
};

describe('resolveEngineCourse', () => {
  it('turns relative to current heading when the pilot names a course', () => {
    const r = resolveEngineCourse(AT_ORIGIN, true, 90);
    expect(r.deg).toBe(222);
    expect(r.setHeading).toBe(true);
  });

  it('normalises a relative turn past 360', () => {
    const r = resolveEngineCourse({ ...AT_ORIGIN, heading: 300 }, true, 120);
    expect(r.deg).toBe(60);
  });

  it('keeps a turn already ordered by `rot` on a bare speed order', () => {
    // "Point at the planet with `rot`, then engage" — writing `heading + 0`
    // over an in-progress turn froze the ship part-way round. This is the
    // surviving half of the old autopilot branch; the autopilot itself was
    // withdrawn on 2026-09-04 (canon's `nav` never steers).
    const r = resolveEngineCourse({ ...AT_ORIGIN, head2b: 200 }, false, 0);
    expect(r.deg).toBe(200);
    expect(r.setHeading).toBe(false);
  });

  it('holds the present heading when no turn is in progress', () => {
    const r = resolveEngineCourse(AT_ORIGIN, false, 0);
    expect(r.deg).toBe(132);
    expect(r.setHeading).toBe(true);
  });

  it('an explicit course is applied relative to the current heading', () => {
    // This used to assert that the course "took the helm back from the
    // autopilot" — there is no autopilot, and holdcourse is a droid-AI wander
    // timer in canon (GEDROIDS.C), never a player field.
    const r = resolveEngineCourse(AT_ORIGIN, true, 45);
    expect(r.deg).toBe(177);
    expect(r.setHeading).toBe(true);
  });

  /**
   * A bare speed order must not cancel a turn already under way.
   *
   * `rot @0` sets head2b and the ship swings round over several ticks at
   * ROTAMT degrees each. Issuing `imp 70` during that swing recomputed
   * `heading + 0` and wrote it back to head2b, freezing the ship on whatever
   * heading it had reached — so "point at the planet, then engage" silently
   * did not work, and the engine order reported a course the pilot had just
   * steered away from.
   *
   * C does the same thing (`valdegree("0")` sets degrees to 0, then
   * `head2b = normal(heading + 0)`), but it contradicts the rule this helper
   * already applies to the autopilot: naming a course is a steering order, a
   * bare speed order is not. @see docs/DECISIONS.md
   */
  it('keeps a turn already ordered when only speed is given', () => {
    const midTurn = { ...AT_ORIGIN, heading: 306, head2b: 0 };
    const r = resolveEngineCourse(midTurn, false, 0);
    expect(r.deg).toBe(0);          // report where the ship is going
    expect(r.setHeading).toBe(false); // and do not overwrite it
  });

  it('an explicit course still overrides a turn in progress', () => {
    const midTurn = { ...AT_ORIGIN, heading: 306, head2b: 0 };
    const r = resolveEngineCourse(midTurn, true, 20);
    expect(r.deg).toBe(326);
    expect(r.setHeading).toBe(true);
  });

  it('still steers straight when no turn is pending', () => {
    const r = resolveEngineCourse({ ...AT_ORIGIN, heading: 90, head2b: 90 }, false, 0);
    expect(r.deg).toBe(90);
    expect(r.setHeading).toBe(true);
  });
});
