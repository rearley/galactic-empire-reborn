import { canEnterOrbit, ORBIT_RANGE } from '../../src/game/commands/handlers/helpers/orbit-range';

/**
 * C refuses orbit beyond 250 units — `distance = cdistance(...)*10000; if
 * (distance <= 250) { where = 10+plnum; } else prfmsg(ORBIT2)`
 * (GECMDS.C cmd_orbit). This port had no proximity check at all, so a ship
 * could orbit a planet from anywhere in its sector.
 *
 * That quietly disabled planetary defence. `checkdist` clears `hostile` once
 * the attacker is more than 1000 units out (GEFUNCS.C:907), and `fireion`
 * only fires while `hostile > 1` (GEFUNCS.C:1791). C's numbers interlock:
 * you cannot be in orbit without being deep inside the 1000-unit hostile
 * window, so an attacking ship always eats ion cannon fire. Without the orbit
 * gate an attacker sat 5,800 units out, `hostile` was cleared on the next
 * tick, and 200 ion cannons never fired a shot.
 *
 * Found in play: a raider attacked a fortified colony and took zero damage.
 */
describe('canEnterOrbit', () => {
  it('matches C: 250 units', () => {
    expect(ORBIT_RANGE).toBe(250);
  });

  it('allows orbit at or inside the limit', () => {
    // 250 units = 0.025 sector units.
    expect(canEnterOrbit({ xcoord: 1.5, ycoord: 1.5 }, { xcoord: 1.5, ycoord: 1.5 })).toBe(true);
    expect(canEnterOrbit({ xcoord: 1.5, ycoord: 1.5 }, { xcoord: 1.52, ycoord: 1.5 })).toBe(true);
  });

  it('refuses orbit from across the sector', () => {
    // The distance an attacker actually sat at during the playtest: 0.58
    // sector units from the planet, and "in orbit".
    expect(canEnterOrbit({ xcoord: 1.055, ycoord: 1.055 }, { xcoord: 1.307, ycoord: 1.578 })).toBe(false);
  });

  it('keeps the attacker inside the hostile window it grants', () => {
    // Anything close enough to orbit must be well inside checkdist's 1000
    // units, or planetary defence can never fire.
    const planet = { xcoord: 4.0, ycoord: 4.0 };
    const justInside = { xcoord: 4.0 + 249 / 10_000, ycoord: 4.0 };
    expect(canEnterOrbit(justInside, planet)).toBe(true);
    const dist = Math.hypot(justInside.xcoord - planet.xcoord, justInside.ycoord - planet.ycoord) * 10_000;
    expect(dist).toBeLessThan(1000);
  });
});
