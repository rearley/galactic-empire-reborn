/**
 * The helm answers the throttle when the ship REACHES the ordered speed.
 *
 * `accel()` prints SPEEDIS on either snap and SPEED0 when that snap is a dead
 * stop (GEFUNCS.C:487-489, :543-553), `outprfge(FILTER, usrn)` — the captain's
 * own socket. The port acknowledged the ORDER ("Accelerating to warp 5") and
 * never the arrival, so there was no way to know you were actually at warp
 * short of polling `rep nav`.
 */
import { GameGateway } from '../../src/gateway/game.gateway';
import type { ShipSpeedReportEvent } from '../../src/game/physics/speed-events';
import { mockRandom } from '../fixtures/mock-random';

function build() {
  const sent: Array<{ room: string; text: string }> = [];
  const gateway = new GameGateway(
    {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, mockRandom,
    { emit: jest.fn(), on: jest.fn() } as never,
  );
  (gateway as unknown as { server: unknown }).server = {
    to: (room: string) => ({
      emit: (_e: string, p: { text: string }) => { sent.push({ room, text: p.text }); },
    }),
  };
  const fire = (speed: number) => {
    const evt: ShipSpeedReportEvent = { shipId: 'u1:1', userid: 'u1', shipno: 1, speed };
    (gateway as unknown as { handleShipSpeedReport: (e: ShipSpeedReportEvent) => void })
      .handleShipSpeedReport(evt);
    return sent[sent.length - 1];
  };
  return { fire };
}

describe('helm speed report', () => {
  it('reports a whole warp factor', () => {
    expect(build().fire(5000).text).toBe('Helm reports speed is now warp 5 point 00, Sir!');
  });

  it('keeps the leading zero on the hundredths', () => {
    // showarp formats "%.2f" (GEFUNCS.C:2681), so 9.05 is "point 05" — the
    // reason this slot is %s and not canon's (varargs-broken) %d.
    expect(build().fire(9050).text).toBe('Helm reports speed is now warp 9 point 05, Sir!');
  });

  it('reports a dead stop with SPEED0, not warp 0', () => {
    // Canon's SPEED0 opens with its own *** banner, the same attention marker
    // MINE6 and the Cybertron taunts use. @see GE/REL/MBMGEMSG.MSG
    expect(build().fire(0).text).toBe('***\nHelm reports we are at a dead stop, Sir!');
  });

  it('goes only to the captain who gave the order', () => {
    expect(build().fire(1000).room).toBe('user:u1');
  });
});
