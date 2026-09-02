import { overspeedMessage, SHIP_OVERSPEED, WARN_LADDER } from '../../src/game/ship/overspeed-events';

/**
 * Running over your hull's rated warp silently blew the engines. The ladder
 * itself was implemented — warn four times, then break — but the handler
 * carried a TODO where the messages should go:
 *
 *   // TODO (US2): emit WARPBRK/WARPFAST/WARPSPD events to ship's socket when
 *   // GameGateway socket-routing is available for per-ship messages.
 *
 * Per-ship routing (the `user:<userid>` room) has existed for a long time, so
 * the TODO was stale and every warning was dropped. The pilot got no hint at
 * all until topspeed hit 0 and the drive was gone.
 *
 * C escalates through consecutive messages and only then breaks:
 *   if (ptr->warncntr > 4) { prfmsg(WARPBRK); topspeed = 0; ... }
 *   else { prfmsg(WARPFAST + ptr->warncntr); ptr->warncntr++; }
 *   — GEFUNCS.C:748-765
 */
describe('overspeed warnings', () => {
  it('escalates over four warnings before the drive breaks', () => {
    expect(WARN_LADDER).toHaveLength(5);
    const seen = new Set(WARN_LADDER);
    expect(seen.size).toBe(WARN_LADDER.length); // each rung says something new
  });

  it('gives a distinct message per warning count, as WARPFAST+warncntr does', () => {
    const a = overspeedMessage('warn', 0);
    const b = overspeedMessage('warn', 1);
    const c = overspeedMessage('warn', 4);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    for (const m of [a, b, c]) expect(m.length).toBeGreaterThan(0);
  });

  it('says the drive is gone when it breaks', () => {
    const m = overspeedMessage('break', 5);
    expect(m.toLowerCase()).toMatch(/warp drive|engines/);
  });

  it('clamps a warning count past the ladder rather than returning nothing', () => {
    expect(overspeedMessage('warn', 99)).toBe(WARN_LADDER[WARN_LADDER.length - 1]);
  });

  it('names an event the gateway can route per ship', () => {
    expect(SHIP_OVERSPEED).toBe('ship.overspeed');
  });
});
